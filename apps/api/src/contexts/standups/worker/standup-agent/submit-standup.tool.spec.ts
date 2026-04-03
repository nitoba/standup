import type { AgentMessage } from '@mariozechner/pi-agent-core'
import { describe, expect, it } from 'vitest'
import {
  extractSubmitStandupResult,
  submitStandupTool,
} from './submit-standup.tool'

describe('submitStandupTool', () => {
  it('has the correct name', () => {
    expect(submitStandupTool.name).toBe('submit_standup')
  })

  it('has the correct label', () => {
    expect(submitStandupTool.label).toBe('Submit Standup')
  })

  it('has a description that mentions the tool must be called', () => {
    expect(submitStandupTool.description).toContain('submit_standup')
  })

  it('execute returns confirmation text', async () => {
    const result = await submitStandupTool.execute('call-1', {
      content: 'standup content',
      summary: 'standup summary',
    })

    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('submitted'),
    })
  })
})

describe('extractSubmitStandupResult', () => {
  function makeAssistantMessage(
    toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>,
  ): AgentMessage {
    return {
      role: 'assistant',
      content: toolCalls.map((tc) => ({
        type: 'toolCall' as const,
        id: `tc-${tc.name}`,
        name: tc.name,
        arguments: tc.arguments,
      })),
      api: 'anthropic-messages',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'toolUse',
      timestamp: Date.now(),
    }
  }

  function makeUserMessage(text: string): AgentMessage {
    return {
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
  }

  it('returns null when there are no messages', () => {
    expect(extractSubmitStandupResult([])).toBeNull()
  })

  it('returns null when no submit_standup tool call exists', () => {
    const messages: AgentMessage[] = [
      makeUserMessage('generate standup'),
      makeAssistantMessage([
        {
          name: 'other_tool',
          arguments: { content: 'x', summary: 'y' },
        },
      ]),
    ]
    expect(extractSubmitStandupResult(messages)).toBeNull()
  })

  it('extracts content and summary from a submit_standup tool call', () => {
    const messages: AgentMessage[] = [
      makeUserMessage('generate standup'),
      makeAssistantMessage([
        {
          name: 'submit_standup',
          arguments: {
            content: '## Standup\n- Did stuff',
            summary: 'Completed feature X',
          },
        },
      ]),
    ]

    const result = extractSubmitStandupResult(messages)
    expect(result).toEqual({
      content: '## Standup\n- Did stuff',
      summary: 'Completed feature X',
    })
  })

  it('returns the LAST submit_standup tool call when multiple exist', () => {
    const messages: AgentMessage[] = [
      makeAssistantMessage([
        {
          name: 'submit_standup',
          arguments: { content: 'first content', summary: 'first summary' },
        },
      ]),
      makeUserMessage('try again'),
      makeAssistantMessage([
        {
          name: 'submit_standup',
          arguments: { content: 'last content', summary: 'last summary' },
        },
      ]),
    ]

    const result = extractSubmitStandupResult(messages)
    expect(result).toEqual({
      content: 'last content',
      summary: 'last summary',
    })
  })

  it('ignores non-assistant messages when searching for tool calls', () => {
    const messages: AgentMessage[] = [
      makeUserMessage('submit_standup'),
      {
        role: 'toolResult',
        toolCallId: 'tc-1',
        toolName: 'submit_standup',
        content: [{ type: 'text', text: 'done' }],
        isError: false,
        timestamp: Date.now(),
      } as AgentMessage,
    ]
    expect(extractSubmitStandupResult(messages)).toBeNull()
  })
})
