import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateAdjustedStandup } from './adjust.js'
import { MAX_STANDUP_CONTENT_CHARS } from './prompt/prompt.js'

vi.mock('@ai-sdk/groq', () => ({
  createGroq: vi.fn(() => (_model: string) => ({ modelId: _model })),
}))

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    output: {
      content:
        '**Standup (06/03/2026)**\n\n**📌 agrotrace-web**\n\n**✅ Done:**\n➜ Item ajustado\n',
      summary: 'Ajustei o standup conforme solicitado',
    },
  }),
  Output: {
    json: vi.fn(() => ({})),
  },
}))

vi.stubGlobal('setTimeout', (fn: () => void) => {
  fn()
  return 0
})

const baseConfig = {
  aiProviderApiKey: 'test-token',
  azure: {
    orgUrl: 'https://dev.azure.com/test',
    pat: 'test-pat',
    defaultProject: 'AGROTRACE',
  },
}

describe('generateAdjustedStandup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ajusta standup existente sem coletar git novamente', async () => {
    const { generateText } = await import('ai')

    const result = await generateAdjustedStandup(
      {
        previousContent: '**Standup base**\n- item antigo',
        instruction: 'Remover item antigo e adicionar item novo',
      },
      baseConfig,
    )

    expect(result.status).toBe('ok')
    expect(generateText).toHaveBeenCalledTimes(1)

    const prompt = vi.mocked(generateText).mock.calls[0]?.[0] as {
      prompt?: string
    }
    expect(prompt.prompt).toContain('Remover item antigo e adicionar item novo')
    expect(prompt.prompt).toContain('Standup base')
  })

  it('prompt de ajuste contém instruções cirúrgicas e standup original', async () => {
    const { generateText } = await import('ai')

    await generateAdjustedStandup(
      {
        previousContent: '**Standup (06/03/2026)**\n- item original',
        instruction: 'Remover item antigo',
      },
      baseConfig,
    )

    const call = vi.mocked(generateText).mock.calls[0]?.[0] as {
      prompt?: string
    }
    const prompt = call.prompt ?? ''

    // Instrução cirúrgica está no prompt
    expect(prompt).toContain('edição cirúrgica')
    expect(prompt).toContain('somente-leitura')
    expect(prompt).toContain('NÃO reescreva')
    expect(prompt).toContain('Aplique apenas a mudança')
    // Regras vêm ANTES do standup original
    const ruleIdx = prompt.indexOf('Regras OBRIGATÓRIAS')
    const contentIdx = prompt.indexOf('Standup original')
    expect(ruleIdx).toBeGreaterThanOrEqual(0)
    expect(contentIdx).toBeGreaterThan(ruleIdx)
    // Standup original está presente
    expect(prompt).toContain('item original')
    // Instrução do usuário está presente
    expect(prompt).toContain('Remover item antigo')
  })

  it('inclui extraContext opcional no prompt de ajuste', async () => {
    const { generateText } = await import('ai')

    await generateAdjustedStandup(
      {
        previousContent: '**Standup base**\n- item antigo',
        instruction: 'Destacar mais impacto de negócio',
        extraContext: 'Enfatizar resultado para time de produto',
      },
      baseConfig,
    )

    const prompt = vi.mocked(generateText).mock.calls[0]?.[0] as {
      prompt?: string
    }
    expect(prompt.prompt).toContain('Enfatizar resultado para time de produto')
  })

  it('retorna erro quando não há API key', async () => {
    const { generateText } = await import('ai')

    const result = await generateAdjustedStandup(
      {
        previousContent: '**Standup base**',
        instruction: 'Ajustar texto',
      },
      {
        ...baseConfig,
        aiProviderApiKey: undefined,
      },
    )

    expect(result.status).toBe('error')
    expect(generateText).not.toHaveBeenCalled()
  })

  it('retenta ajuste quando LLM falha em todas tentativas', async () => {
    const { generateText } = await import('ai')
    vi.mocked(generateText)
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockRejectedValueOnce(new Error('rate limited'))

    const result = await generateAdjustedStandup(
      {
        previousContent: '**Standup base**',
        instruction: 'Ajustar texto',
      },
      baseConfig,
    )

    expect(result.status).toBe('error')
    expect(generateText).toHaveBeenCalledTimes(3)
  })

  it('reescreve quando ajuste excede limite de caracteres', async () => {
    const { generateText } = await import('ai')

    vi.mocked(generateText)
      .mockResolvedValueOnce({
        output: {
          content: 'X'.repeat(MAX_STANDUP_CONTENT_CHARS + 5),
          summary: 'Resumo inicial muito longo',
        },
      } as never)
      .mockResolvedValueOnce({
        output: {
          content: 'Conteudo ajustado final',
          summary: 'Resumo final',
        },
      } as never)

    const result = await generateAdjustedStandup(
      {
        previousContent: '**Standup base**',
        instruction: 'Ajustar texto',
      },
      baseConfig,
    )

    expect(result.status).toBe('ok')
    expect(generateText).toHaveBeenCalledTimes(2)
  })
})
