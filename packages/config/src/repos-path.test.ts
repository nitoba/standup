import { describe, expect, it } from 'vitest'
import { normalizeReposSubpath, resolveReposScanPath } from './repos-path.js'

describe('repos-path helpers', () => {
  describe('normalizeReposSubpath', () => {
    it('returns empty string for blank input', () => {
      const result = normalizeReposSubpath('   ')

      expect(result.isOk()).toBe(true)
      if (result.isErr()) return

      expect(result.value).toBe('')
    })

    it('normalizes a relative path', () => {
      const result = normalizeReposSubpath('./ibs/repos')

      expect(result.isOk()).toBe(true)
      if (result.isErr()) return

      expect(result.value).toBe('ibs/repos')
    })

    it('rejects parent directory traversal', () => {
      const result = normalizeReposSubpath('../outside')

      expect(result.isErr()).toBe(true)
    })

    it('rejects parent directory traversal in the middle of the path', () => {
      const result = normalizeReposSubpath('team-a/../outside')

      expect(result.isErr()).toBe(true)
    })
  })

  describe('resolveReposScanPath', () => {
    it('resolves empty input to the root path', () => {
      const result = resolveReposScanPath('', '/repos')

      expect(result.isOk()).toBe(true)
      if (result.isErr()) return

      expect(result.value.absolutePath).toBe('/repos')
      expect(result.value.normalizedSubpath).toBe('')
    })

    it('resolves a relative path inside the root', () => {
      const result = resolveReposScanPath('ibs/repos', '/repos')

      expect(result.isOk()).toBe(true)
      if (result.isErr()) return

      expect(result.value.absolutePath).toBe('/repos/ibs/repos')
      expect(result.value.normalizedSubpath).toBe('ibs/repos')
    })

    it('accepts absolute paths already inside the root and normalizes them', () => {
      const result = resolveReposScanPath('/repos/ibs/repos', '/repos')

      expect(result.isOk()).toBe(true)
      if (result.isErr()) return

      expect(result.value.absolutePath).toBe('/repos/ibs/repos')
      expect(result.value.normalizedSubpath).toBe('ibs/repos')
    })

    it('rejects absolute paths outside the root', () => {
      const result = resolveReposScanPath('/tmp/repos', '/repos')

      expect(result.isErr()).toBe(true)
    })
  })
})
