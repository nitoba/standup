import { describe, expect, it } from 'vitest'
import { loadPromptTemplate } from './prompt-template-loader'

describe('loadPromptTemplate', () => {
  it('loads the git-only system prompt from a colocated markdown asset', () => {
    const template = loadPromptTemplate('git-only-system.md')

    expect(template).toContain(
      'Você é um assistente especializado em gerar relatórios de standup diário',
    )
    expect(template).toContain('## Regras de Formatação')
  })

  it('returns the same cached content on repeated calls', () => {
    const first = loadPromptTemplate('git-only-system.md')
    const second = loadPromptTemplate('git-only-system.md')

    expect(second).toBe(first)
  })
})
