import type {
  AssistantMessage,
  ToolCall,
  ToolResultMessage,
} from '@mariozechner/pi-ai'
import { describe, expect, it } from 'vitest'
import { buildSeedMessages } from './build-seed-messages'

describe('buildSeedMessages', () => {
  it('returns user, assistant, and toolResult messages', () => {
    const messages = buildSeedMessages({
      content: '## Standup\n- item 1',
      summary: 'Did item 1',
    })
    expect(messages).toHaveLength(3)
    expect(messages[0]?.role).toBe('user')
    expect(messages[1]?.role).toBe('assistant')
    expect(messages[2]?.role).toBe('toolResult')
  })

  it('assistant message contains submit_standup tool call with correct args', () => {
    const messages = buildSeedMessages({
      content: 'my content',
      summary: 'my summary',
    })
    const assistant = messages[1] as AssistantMessage
    expect(assistant.role).toBe('assistant')
    const toolCall = assistant.content.find(
      (b): b is ToolCall => b.type === 'toolCall',
    )
    expect(toolCall).toBeDefined()
    expect(toolCall?.name).toBe('submit_standup')
    expect(toolCall?.arguments).toEqual({
      content: 'my content',
      summary: 'my summary',
    })
  })

  it('toolResult references the tool call id', () => {
    const messages = buildSeedMessages({ content: 'c', summary: 's' })
    const assistant = messages[1] as AssistantMessage
    const toolResult = messages[2] as ToolResultMessage
    const toolCall = assistant.content.find(
      (b): b is ToolCall => b.type === 'toolCall',
    )
    expect(toolResult.toolCallId).toBe(toolCall?.id)
  })

  it('uses empty string for summary when not provided', () => {
    const messages = buildSeedMessages({ content: 'c' })
    const assistant = messages[1] as AssistantMessage
    const toolCall = assistant.content.find(
      (b): b is ToolCall => b.type === 'toolCall',
    )
    expect(toolCall?.arguments.summary).toBe('')
  })
})
