import { describe, expect, it } from 'vitest'
import { parseSourceData } from './parse-source-data'

const validGitActivity = {
  timestamp: '2026-03-16T17:30:00.000Z',
  repos: [
    {
      repoName: 'my-repo',
      repoPath: '/home/user/repos/my-repo',
      commits: [
        {
          hash: 'abc12345',
          subject: 'fix: resolve login issue',
          body: '',
          sourceBranch: 'fix/login',
          filesChanged: 2,
          insertions: 10,
          deletions: 3,
          files: ['src/auth.ts', 'src/login.ts'],
        },
      ],
      cardNumbers: ['1234'],
    },
  ],
}

const validBoardActivity = {
  timestamp: '2026-03-16T17:30:00.000Z',
  workItems: [
    {
      id: 1234,
      title: 'Fix login page',
      type: 'Bug',
      state: 'Done',
      assignedTo: 'user@example.com',
      project: 'MyProject',
      actions: [
        {
          type: 'state_change' as const,
          timestamp: '2026-03-16T10:00:00.000Z',
          details: 'New -> Active',
        },
      ],
    },
  ],
}

describe('parseSourceData', () => {
  describe('old format (raw GatheredGitActivity)', () => {
    it('parses old format into { git: ..., board: null }', () => {
      const raw = JSON.stringify(validGitActivity)
      const result = parseSourceData(raw)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.git).toEqual(validGitActivity)
        expect(result.value.board).toBeNull()
      }
    })
  })

  describe('new format ({ git, board })', () => {
    it('parses new format with both git and board', () => {
      const raw = JSON.stringify({
        git: validGitActivity,
        board: validBoardActivity,
      })
      const result = parseSourceData(raw)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.git).toEqual(validGitActivity)
        expect(result.value.board).toEqual(validBoardActivity)
      }
    })

    it('parses new format with git only (board null)', () => {
      const raw = JSON.stringify({
        git: validGitActivity,
        board: null,
      })
      const result = parseSourceData(raw)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.git).toEqual(validGitActivity)
        expect(result.value.board).toBeNull()
      }
    })
  })

  describe('board-only format', () => {
    it('parses board-only format { git: null, board: ... }', () => {
      const raw = JSON.stringify({
        git: null,
        board: validBoardActivity,
      })
      const result = parseSourceData(raw)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.git).toBeNull()
        expect(result.value.board).toEqual(validBoardActivity)
      }
    })
  })

  describe('error cases', () => {
    it('returns error for invalid JSON', () => {
      const result = parseSourceData('not-valid-json{{{')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error._tag).toBe('ValidationError')
        expect(result.error.field).toBe('sourceData')
        expect(result.error.message).toContain('invalid JSON')
      }
    })

    it('returns error for empty object {}', () => {
      const result = parseSourceData('{}')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error._tag).toBe('ValidationError')
        expect(result.error.field).toBe('sourceData')
      }
    })
  })
})
