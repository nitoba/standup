import type { AgentMessage, AgentTool } from '@mariozechner/pi-agent-core'
import { Type } from '@sinclair/typebox'

export const SubmitStandupParams = Type.Object({
  content: Type.String({
    description:
      'The standup content in markdown format. Must be under 2000 characters.',
  }),
  summary: Type.String({
    description: 'A single-line summary of the standup.',
  }),
})

export const submitStandupTool: AgentTool<typeof SubmitStandupParams> = {
  name: 'submit_standup',
  label: 'Submit Standup',
  description:
    'Call submit_standup to submit the final standup report. You MUST call this tool exactly once with the generated standup content and summary. Do not respond with text — always use this tool.',
  parameters: SubmitStandupParams,
  execute: async (
    _toolCallId: string,
    _params: { content: string; summary: string },
  ) => {
    return {
      content: [
        { type: 'text' as const, text: 'Standup submitted successfully.' },
      ],
      details: undefined,
    }
  },
}

export interface SubmitStandupResult {
  content: string
  summary: string
}

export function extractSubmitStandupResult(
  messages: AgentMessage[],
): SubmitStandupResult | null {
  let last: SubmitStandupResult | null = null

  for (const message of messages) {
    if (message.role !== 'assistant') continue

    for (const block of message.content) {
      if (block.type === 'toolCall' && block.name === 'submit_standup') {
        const args = block.arguments as Record<string, unknown>
        if (
          typeof args.content === 'string' &&
          typeof args.summary === 'string'
        ) {
          last = { content: args.content, summary: args.summary }
        }
      }
    }
  }

  return last
}
