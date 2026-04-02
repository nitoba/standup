import type { Message } from '@mariozechner/pi-ai'

export function buildSeedMessages(standup: {
  content: string
  summary?: string
}): Message[] {
  const toolCallId = 'seed-tool-call'
  const now = Date.now()

  const userMessage: Message = {
    role: 'user',
    content: 'Generate the standup report based on the activity data provided.',
    timestamp: now,
  }

  const assistantMessage: Message = {
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: toolCallId,
        name: 'submit_standup',
        arguments: {
          content: standup.content,
          summary: standup.summary ?? '',
        },
      },
    ],
    // Metadata — placeholder values for seed messages (not used by LLM, bookkeeping only)
    api: 'openai-completions' as never,
    provider: 'seed' as never,
    model: 'seed',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'toolUse',
    timestamp: now,
  }

  const toolResultMessage: Message = {
    role: 'toolResult',
    toolCallId,
    toolName: 'submit_standup',
    content: [{ type: 'text', text: 'Standup submitted successfully.' }],
    isError: false,
    timestamp: now,
  }

  return [userMessage, assistantMessage, toolResultMessage]
}
