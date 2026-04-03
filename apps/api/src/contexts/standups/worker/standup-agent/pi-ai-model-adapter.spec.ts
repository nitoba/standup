import { getModel } from '@mariozechner/pi-ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toPiAiModel } from './pi-ai-model-adapter'

vi.mock('@mariozechner/pi-ai', () => ({
  getModel: vi.fn(
    (provider: string, model: string) => `mock-${provider}:${model}`,
  ),
}))

describe('toPiAiModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps google provider correctly', () => {
    const result = toPiAiModel({
      provider: 'google',
      modelKey: 'google:gemini-2.0-flash',
    })

    expect(getModel).toHaveBeenCalledWith('google', 'gemini-2.0-flash')
    expect(result).toBe('mock-google:gemini-2.0-flash')
  })

  it('maps groq provider correctly', () => {
    const result = toPiAiModel({
      provider: 'groq',
      modelKey: 'groq:llama-3.3-70b-versatile',
    })

    expect(getModel).toHaveBeenCalledWith('groq', 'llama-3.3-70b-versatile')
    expect(result).toBe('mock-groq:llama-3.3-70b-versatile')
  })

  it('maps openrouter provider correctly', () => {
    const result = toPiAiModel({
      provider: 'openrouter',
      modelKey: 'openrouter:anthropic/claude-3.5-sonnet',
    })

    expect(getModel).toHaveBeenCalledWith(
      'openrouter',
      'anthropic/claude-3.5-sonnet',
    )
    expect(result).toBe('mock-openrouter:anthropic/claude-3.5-sonnet')
  })

  it('extracts model name from "provider:model" format with multiple colons correctly', () => {
    const result = toPiAiModel({
      provider: 'openrouter',
      modelKey: 'openrouter:meta-llama/llama-3:latest',
    })

    expect(getModel).toHaveBeenCalledWith(
      'openrouter',
      'meta-llama/llama-3:latest',
    )
    expect(result).toBe('mock-openrouter:meta-llama/llama-3:latest')
  })
})
