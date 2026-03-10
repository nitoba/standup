import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { $ } from 'bun'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { collectGitActivity } from './collector.js'

// ---------------------------------------------------------------------------
// Helpers: build real git repos in a temp directory — no mocks needed
// ---------------------------------------------------------------------------

async function initRepo(
  basePath: string,
  name: string,
  author: string,
): Promise<string> {
  const repoPath = join(basePath, name)
  await mkdir(repoPath, { recursive: true })

  await $`git -C ${repoPath} init -q`.quiet()
  await $`git -C ${repoPath} config user.email ${author}`.quiet()
  await $`git -C ${repoPath} config user.name Test`.quiet()
  await $`git -C ${repoPath} config commit.gpgsign false`.quiet()

  return repoPath
}

async function addCommit(
  repoPath: string,
  message: string,
  fileName = 'file.txt',
  content = 'hello',
  body?: string,
): Promise<void> {
  await writeFile(join(repoPath, fileName), content)
  await $`git -C ${repoPath} add .`.quiet()
  if (body) {
    await $`git -C ${repoPath} commit -m ${message} -m ${body}`.quiet()
    return
  }
  await $`git -C ${repoPath} commit -m ${message}`.quiet()
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const AUTHOR = 'test@example.com'
const OTHER_AUTHOR = 'other@example.com'

let tmpBase: string

beforeAll(async () => {
  tmpBase = await mkdtemp(join(tmpdir(), 'standup-collector-test-'))
})

afterAll(async () => {
  await rm(tmpBase, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('collectGitActivity', () => {
  describe('Ok path', () => {
    it('returns empty repos list when selectedRepos is empty', async () => {
      const base = join(tmpBase, 'empty')
      await mkdir(base)

      const result = await collectGitActivity({
        reposRootPath: base,
        selectedRepos: [],
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.repos).toHaveLength(0)
      expect(result.value.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('skips repos that have no commits from the given author', async () => {
      const base = join(tmpBase, 'skip-other-author')
      await mkdir(base)

      const repoPath = await initRepo(base, 'repo-other', OTHER_AUTHOR)
      await $`git -C ${repoPath} config user.email ${OTHER_AUTHOR}`.quiet()
      await addCommit(repoPath, 'feat: other person commit')

      const result = await collectGitActivity({
        reposRootPath: base,
        selectedRepos: ['repo-other'],
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.repos).toHaveLength(0)
    })

    it('returns repos with commits from the author', async () => {
      const base = join(tmpBase, 'with-commits')
      await mkdir(base)

      const repoPath = await initRepo(base, 'my-project', AUTHOR)
      await addCommit(repoPath, 'feat: initial setup', 'index.ts', 'export {}')
      await addCommit(repoPath, 'fix: null check', 'utils.ts', 'const x = null')

      const result = await collectGitActivity({
        reposRootPath: base,
        selectedRepos: ['my-project'],
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.repos).toHaveLength(1)

      const repo = result.value.repos[0]
      expect(repo).toBeDefined()
      if (!repo) return

      expect(repo.repoName).toBe('my-project')
      // git log is newest-first
      expect(repo.commits).toHaveLength(2)
      expect(repo.commits[0]?.subject).toBe('fix: null check')
      expect(repo.commits[1]?.subject).toBe('feat: initial setup')
    })

    it('populates commit stats: files, insertions, deletions', async () => {
      const base = join(tmpBase, 'commit-stats')
      await mkdir(base)

      const repoPath = await initRepo(base, 'stats-repo', AUTHOR)
      await addCommit(repoPath, 'feat: add file a', 'a.ts', 'const a = 1')
      await writeFile(join(repoPath, 'b.ts'), 'const b = 2')
      await $`git -C ${repoPath} add .`.quiet()
      await $`git -C ${repoPath} commit -m 'feat: add file b'`.quiet()

      const result = await collectGitActivity({
        reposRootPath: base,
        selectedRepos: ['stats-repo'],
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      const repo = result.value.repos[0]
      expect(repo).toBeDefined()
      if (!repo) return

      for (const commit of repo.commits) {
        expect(commit.filesChanged).toBeGreaterThan(0)
        expect(commit.files.length).toBeGreaterThan(0)
        expect(commit.insertions).toBeGreaterThan(0)
      }
    })

    it('extracts card numbers from commit messages', async () => {
      const base = join(tmpBase, 'card-numbers')
      await mkdir(base)

      const repoPath = await initRepo(base, 'card-repo', AUTHOR)
      await addCommit(
        repoPath,
        'feat: implement feature #12345',
        'card.ts',
        'x',
      )
      await addCommit(repoPath, 'fix: resolve bug #67890', 'fix.ts', 'y')

      const result = await collectGitActivity({
        reposRootPath: base,
        selectedRepos: ['card-repo'],
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      const repo = result.value.repos[0]
      expect(repo).toBeDefined()
      if (!repo) return

      expect(repo.cardNumbers).toContain('12345')
      expect(repo.cardNumbers).toContain('67890')
    })

    it('extracts branchCardNumber from conventional branch name', async () => {
      const base = join(tmpBase, 'branch-card')
      await mkdir(base)

      const repoPath = await initRepo(base, 'branch-repo', AUTHOR)
      await addCommit(repoPath, 'chore: initial commit', 'init.ts', 'x')
      await $`git -C ${repoPath} checkout -b feat/99999`.quiet()
      await addCommit(repoPath, 'feat: work on card', 'feature.ts', 'y')

      const result = await collectGitActivity({
        reposRootPath: base,
        selectedRepos: ['branch-repo'],
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      const repo = result.value.repos[0]
      expect(repo).toBeDefined()
      if (!repo) return

      expect(repo.currentBranch).toBe('feat/99999')
      expect(repo.branchCardNumber).toBe('99999')
    })

    it('returns null branchCardNumber for main/master branches', async () => {
      const base = join(tmpBase, 'main-branch')
      await mkdir(base)

      const repoPath = await initRepo(base, 'main-repo', AUTHOR)
      await addCommit(repoPath, 'feat: some work', 'src.ts', 'code')

      const result = await collectGitActivity({
        reposRootPath: base,
        selectedRepos: ['main-repo'],
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      const repo = result.value.repos[0]
      expect(repo).toBeDefined()
      if (!repo) return

      expect(repo.branchCardNumber).toBeNull()
    })

    it('collects from multiple selected repos', async () => {
      const base = join(tmpBase, 'multi-repos')
      await mkdir(base)

      const repoA = await initRepo(base, 'repo-a', AUTHOR)
      const repoB = await initRepo(base, 'repo-b', AUTHOR)

      await addCommit(repoA, 'feat: work in a', 'a.ts', 'a')
      await addCommit(repoB, 'feat: work in b', 'b.ts', 'b')

      const result = await collectGitActivity({
        reposRootPath: base,
        selectedRepos: ['repo-a', 'repo-b'],
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.repos).toHaveLength(2)

      const names = result.value.repos.map((r) => r.repoName).sort()
      expect(names).toEqual(['repo-a', 'repo-b'])
    })

    it('only collects repos in selectedRepos, ignoring others in the root', async () => {
      const base = join(tmpBase, 'selective')
      await mkdir(base)

      const repoA = await initRepo(base, 'repo-selected', AUTHOR)
      const repoB = await initRepo(base, 'repo-ignored', AUTHOR)

      await addCommit(repoA, 'feat: selected work', 'a.ts', 'a')
      await addCommit(repoB, 'feat: ignored work', 'b.ts', 'b')

      const result = await collectGitActivity({
        reposRootPath: base,
        selectedRepos: ['repo-selected'],
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.repos).toHaveLength(1)
      expect(result.value.repos[0]?.repoName).toBe('repo-selected')
    })

    it('finds commits on remote branches after fetching', async () => {
      const base = join(tmpBase, 'remote-branch')
      await mkdir(base)

      // 1. Create an "origin" repo with a commit on a feature branch
      const originPath = await initRepo(base, 'origin-repo', AUTHOR)
      await addCommit(originPath, 'feat: initial on main', 'init.ts', 'x')

      // Detect default branch name (master or main depending on git config)
      const defaultBranch = (
        await $`git -C ${originPath} branch --show-current`.quiet()
      ).stdout
        .toString()
        .trim()

      await $`git -C ${originPath} checkout -b feat/remote-work`.quiet()
      await addCommit(
        originPath,
        'feat: work on remote branch',
        'remote.ts',
        'y',
      )
      await $`git -C ${originPath} checkout ${defaultBranch}`.quiet()

      // 2. Clone it into a separate directory (simulates deployed repos)
      const cloneBase = join(tmpBase, 'remote-branch-clones')
      await mkdir(cloneBase)
      await $`git clone ${originPath} ${join(cloneBase, 'cloned-repo')}`.quiet()

      // The clone has the remote branch as origin/feat/remote-work
      // Without fetch+--all, only the default branch commits would appear
      const result = await collectGitActivity({
        reposRootPath: cloneBase,
        selectedRepos: ['cloned-repo'],
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      const repo = result.value.repos[0]
      expect(repo).toBeDefined()
      if (!repo) return

      const subjects = repo.commits.map((c) => c.subject)
      expect(subjects).toContain('feat: work on remote branch')
      expect(subjects).toContain('feat: initial on main')
    })

    it('continues gracefully when fetch fails (no remote)', async () => {
      const base = join(tmpBase, 'no-remote')
      await mkdir(base)

      // A repo with no remote — fetch will fail, but collection should still work
      const repoPath = await initRepo(base, 'local-only', AUTHOR)
      await addCommit(repoPath, 'feat: local work', 'local.ts', 'code')

      const result = await collectGitActivity({
        reposRootPath: base,
        selectedRepos: ['local-only'],
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.repos).toHaveLength(1)
      expect(result.value.repos[0]?.commits[0]?.subject).toBe(
        'feat: local work',
      )
    })

    it('ignores merged PR commits and malformed commit fragments when building standup activity', async () => {
      const base = join(tmpBase, 'ignore-merged-pr-noise')
      await mkdir(base)

      const repoPath = await initRepo(base, 'noise-repo', AUTHOR)
      await addCommit(
        repoPath,
        'feat: implementar abas do dashboard #12345',
        'feature.ts',
        'export const feature = true',
      )
      await addCommit(
        repoPath,
        'Merged PR 10313: fix(db): resolve erro de coluna duplicada',
        'merge-noise.md',
        'merge noise',
        'Related work items: #99999\n---\n**Work Item Relacionado**: #88888',
      )

      const result = await collectGitActivity({
        reposRootPath: base,
        selectedRepos: ['noise-repo'],
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      const repo = result.value.repos[0]
      expect(repo).toBeDefined()
      if (!repo) return

      expect(repo.commits).toHaveLength(1)
      expect(repo.commits[0]?.subject).toBe(
        'feat: implementar abas do dashboard #12345',
      )
      expect(repo.cardNumbers).toEqual(['12345'])
    })
  })

  describe('Err path', () => {
    it('returns ok with empty repos when reposRootPath does not exist (graceful degradation)', async () => {
      const result = await collectGitActivity({
        reposRootPath: '/tmp/this-path-does-not-exist-standup-test-99999',
        selectedRepos: ['some-repo'],
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      // The new collector gracefully skips repos whose paths cannot be read
      // (git fetch fails and git log returns empty) rather than hard-failing.
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.repos).toEqual([])
    })
  })
})
