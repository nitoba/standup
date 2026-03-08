import { describe, expect, it } from 'vitest'
import { resolveRepoPaths } from './repos-path.js'

describe('resolveRepoPaths', () => {
  it('returns empty array for empty selectedRepos', () => {
    const result = resolveRepoPaths('/repos', [])
    expect(result).toEqual([])
  })

  it('resolves single repo name to absolute path', () => {
    const result = resolveRepoPaths('/repos', ['agrotrace-web'])
    expect(result).toEqual(['/repos/agrotrace-web'])
  })

  it('resolves multiple repo names', () => {
    const result = resolveRepoPaths('/repos', ['repo-a', 'repo-b', 'repo-c'])
    expect(result).toEqual(['/repos/repo-a', '/repos/repo-b', '/repos/repo-c'])
  })

  it('normalizes trailing slashes in reposRootPath', () => {
    const result = resolveRepoPaths('/repos/', ['my-repo'])
    expect(result).toEqual(['/repos/my-repo'])
  })

  it('resolves relative reposRootPath to absolute', () => {
    const result = resolveRepoPaths('./data/repos', ['repo-x'])
    expect(result[0]).toMatch(/repo-x$/)
    expect(result[0]).toMatch(/^\//)
  })
})
