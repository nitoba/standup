import { describe, expect, it } from 'vitest'
import { parseRepoIdentifier, parseSelectedRepos } from './parse-selected-repos'

describe('parseSelectedRepos', () => {
  it('parses valid JSON array of strings', () => {
    expect(parseSelectedRepos('["a","b"]')).toEqual(['a', 'b'])
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseSelectedRepos('invalid')).toEqual([])
  })

  it('filters non-string values', () => {
    expect(parseSelectedRepos('[1,"a",null]')).toEqual(['a'])
  })

  it('returns empty array for empty string', () => {
    expect(parseSelectedRepos('')).toEqual([])
  })
})

describe('parseRepoIdentifier', () => {
  it('parses project/name format', () => {
    expect(parseRepoIdentifier('AGROTRACE/my-repo', 'DEFAULT')).toEqual({
      project: 'AGROTRACE',
      name: 'my-repo',
    })
  })

  it('uses defaultProject when no slash present', () => {
    expect(parseRepoIdentifier('my-repo', 'AGROTRACE')).toEqual({
      project: 'AGROTRACE',
      name: 'my-repo',
    })
  })

  it('treats multiple slashes as error — returns defaultProject with full identifier as name', () => {
    expect(parseRepoIdentifier('ORG/PROJ/EXTRA/repo', 'DEFAULT')).toEqual({
      project: 'DEFAULT',
      name: 'ORG/PROJ/EXTRA/repo',
    })
  })

  it('handles empty string — returns defaultProject with empty name', () => {
    expect(parseRepoIdentifier('', 'DEFAULT')).toEqual({
      project: 'DEFAULT',
      name: '',
    })
  })
})
