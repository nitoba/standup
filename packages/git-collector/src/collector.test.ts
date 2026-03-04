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

  return repoPath
}

async function addCommit(
  repoPath: string,
  message: string,
  fileName = 'file.txt',
  content = 'hello',
): Promise<void> {
  await writeFile(join(repoPath, fileName), content)
  await $`git -C ${repoPath} add .`.quiet()
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
    it('returns empty repos list when basePath has no git repos', async () => {
      const base = join(tmpBase, 'empty')
      await mkdir(base)

      const result = await collectGitActivity({
        reposBasePath: base,
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
        reposBasePath: base,
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
        reposBasePath: base,
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
        reposBasePath: base,
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
        reposBasePath: base,
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
        reposBasePath: base,
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
        reposBasePath: base,
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

    it('collects from multiple repos in the same base path', async () => {
      const base = join(tmpBase, 'multi-repos')
      await mkdir(base)

      const repoA = await initRepo(base, 'repo-a', AUTHOR)
      const repoB = await initRepo(base, 'repo-b', AUTHOR)

      await addCommit(repoA, 'feat: work in a', 'a.ts', 'a')
      await addCommit(repoB, 'feat: work in b', 'b.ts', 'b')

      const result = await collectGitActivity({
        reposBasePath: base,
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.repos).toHaveLength(2)

      const names = result.value.repos.map((r) => r.repoName).sort()
      expect(names).toEqual(['repo-a', 'repo-b'])
    })

    it('ignores plain directories that are not git repos', async () => {
      const base = join(tmpBase, 'mixed-dirs')
      await mkdir(base)

      // plain directory — not a git repo
      await mkdir(join(base, 'not-a-repo'))
      await writeFile(join(base, 'not-a-repo', 'file.txt'), 'hello')

      const repoPath = await initRepo(base, 'real-repo', AUTHOR)
      await addCommit(repoPath, 'feat: real work', 'src.ts', 'code')

      const result = await collectGitActivity({
        reposBasePath: base,
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.repos).toHaveLength(1)
      expect(result.value.repos[0]?.repoName).toBe('real-repo')
    })
  })

  describe('Err path', () => {
    it('returns Err when basePath does not exist', async () => {
      const result = await collectGitActivity({
        reposBasePath: '/tmp/this-path-does-not-exist-standup-test-99999',
        author: AUTHOR,
        sincePeriod: '1 hour ago',
      })

      expect(result.status).toBe('error')
      if (result.status !== 'error') return

      expect(result.error._tag).toBe('ExternalServiceError')
      expect(result.error.message).toMatch(/git collection failed/)
    })
  })
})
