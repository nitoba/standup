import { describe, expect, it } from 'vitest'
import { buildAuthHeader, buildCloneUrl } from './azure-devops-git-auth'

describe('buildAuthHeader', () => {
  it('builds Basic auth header from PAT', () => {
    const header = buildAuthHeader('my-pat-token')
    const expectedBase64 = Buffer.from(':my-pat-token').toString('base64')
    expect(header).toBe(`AUTHORIZATION: Basic ${expectedBase64}`)
  })

  it('handles empty PAT', () => {
    const header = buildAuthHeader('')
    const expectedBase64 = Buffer.from(':').toString('base64')
    expect(header).toBe(`AUTHORIZATION: Basic ${expectedBase64}`)
  })
})

describe('buildCloneUrl', () => {
  it('builds Azure DevOps HTTPS clone URL', () => {
    expect(buildCloneUrl('myorg', 'AGROTRACE', 'my-repo')).toBe(
      'https://dev.azure.com/myorg/AGROTRACE/_git/my-repo',
    )
  })

  it('handles repo names with hyphens and dots', () => {
    expect(buildCloneUrl('org', 'PROJ', 'my-repo.api')).toBe(
      'https://dev.azure.com/org/PROJ/_git/my-repo.api',
    )
  })
})
