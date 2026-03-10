import { describe, expect, it } from 'vitest'
import {
  extractBranchCardNumber,
  extractCardNumbers,
  parseCommitBlocks,
  parseShowStat,
} from './parse.js'

describe('parseCommitBlocks', () => {
  it('parses the collector log format with control-character separators', () => {
    const raw =
      '\x1eabc1234\x1ffeat: add login screen\x1fBody line 1\n---\nBody line 2'

    const result = parseCommitBlocks(raw)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      hash: 'abc1234',
      subject: 'feat: add login screen',
      body: 'Body line 1\n---\nBody line 2',
    })
  })

  it('parses a single commit block', () => {
    const raw = 'abc1234\nfeat: add login screen\nCloses #12345\n---'
    const result = parseCommitBlocks(raw)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      hash: 'abc1234',
      subject: 'feat: add login screen',
      body: 'Closes #12345',
    })
  })

  it('parses multiple commit blocks', () => {
    const raw = [
      'abc1234\nfeat: add login\nbody1\n---',
      'def5678\nfix: null check\n\n---',
    ].join('\n')

    const result = parseCommitBlocks(raw)
    expect(result).toHaveLength(2)
    expect(result[0]?.hash).toBe('abc1234')
    expect(result[1]?.hash).toBe('def5678')
  })

  it('returns empty array for empty input', () => {
    expect(parseCommitBlocks('')).toEqual([])
    expect(parseCommitBlocks('   ')).toEqual([])
  })

  it('handles commit with no body', () => {
    const raw = 'abc1234\nchore: bump deps\n\n---'
    const result = parseCommitBlocks(raw)

    expect(result).toHaveLength(1)
    expect(result[0]?.body).toBe('')
  })

  it('trims trailing separator correctly', () => {
    const raw = 'abc1234\nfeat: something\n\n---\n'
    const result = parseCommitBlocks(raw)
    expect(result).toHaveLength(1)
  })
})

describe('parseShowStat', () => {
  it('parses file stats correctly', () => {
    const raw = [
      ' src/auth/login.ts | 42 +++++++++++++++++++++',
      ' src/auth/types.ts |  8 ++++----',
      ' 2 files changed, 30 insertions(+), 8 deletions(-)',
    ].join('\n')

    const result = parseShowStat(raw)

    expect(result.filesChanged).toBe(2)
    expect(result.insertions).toBe(30)
    expect(result.deletions).toBe(8)
    expect(result.files).toEqual(['src/auth/login.ts', 'src/auth/types.ts'])
  })

  it('parses single file with only insertions', () => {
    const raw = [
      ' src/index.ts | 10 ++++++++++',
      ' 1 file changed, 10 insertions(+)',
    ].join('\n')

    const result = parseShowStat(raw)

    expect(result.filesChanged).toBe(1)
    expect(result.insertions).toBe(10)
    expect(result.deletions).toBe(0)
    expect(result.files).toEqual(['src/index.ts'])
  })

  it('returns zeros for empty input', () => {
    const result = parseShowStat('')
    expect(result).toEqual({
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      files: [],
    })
  })

  it('handles binary file changes', () => {
    const raw = [
      ' assets/logo.png | Bin 0 -> 1234 bytes',
      ' 1 file changed',
    ].join('\n')

    const result = parseShowStat(raw)
    // Binary files don't match file stat regex but summary should still work
    expect(result.filesChanged).toBe(1)
  })
})

describe('extractCardNumbers', () => {
  it('extracts card numbers from commit messages', () => {
    const text = 'feat: implement feature #12345 and also #67890'
    expect(extractCardNumbers(text)).toEqual(['12345', '67890'])
  })

  it('deduplicates card numbers', () => {
    const text = '#12345 refs #12345 and #12345'
    expect(extractCardNumbers(text)).toEqual(['12345'])
  })

  it('returns empty array when no cards found', () => {
    expect(extractCardNumbers('chore: bump deps')).toEqual([])
    expect(extractCardNumbers('')).toEqual([])
  })

  it('ignores numbers shorter than 3 digits', () => {
    expect(extractCardNumbers('#12 #99')).toEqual([])
  })

  it('captures 3 to 7 digit card numbers', () => {
    expect(extractCardNumbers('#123')).toEqual(['123'])
    expect(extractCardNumbers('#1234567')).toEqual(['1234567'])
    // regex matches first 7 of an 8-digit number greedily
    expect(extractCardNumbers('#12345678')).toEqual(['1234567'])
  })
})

describe('extractBranchCardNumber', () => {
  it('extracts card number from feat branch', () => {
    expect(extractBranchCardNumber('feat/12345')).toBe('12345')
    expect(extractBranchCardNumber('feat/12345-some-description')).toBe('12345')
  })

  it('extracts card number from fix branch', () => {
    expect(extractBranchCardNumber('fix/54321')).toBe('54321')
  })

  it('extracts from various conventional prefixes', () => {
    expect(extractBranchCardNumber('feature/11111')).toBe('11111')
    expect(extractBranchCardNumber('bug/22222')).toBe('22222')
    expect(extractBranchCardNumber('hotfix/33333')).toBe('33333')
    expect(extractBranchCardNumber('refactor/44444')).toBe('44444')
    expect(extractBranchCardNumber('task/55555')).toBe('55555')
    expect(extractBranchCardNumber('chore/66666')).toBe('66666')
    expect(extractBranchCardNumber('improvement/77777')).toBe('77777')
  })

  it('returns null for main/master branches', () => {
    expect(extractBranchCardNumber('main')).toBeNull()
    expect(extractBranchCardNumber('master')).toBeNull()
    expect(extractBranchCardNumber('develop')).toBeNull()
  })

  it('returns null when no card number in branch', () => {
    expect(extractBranchCardNumber('feat/my-feature-no-card')).toBeNull()
  })
})
