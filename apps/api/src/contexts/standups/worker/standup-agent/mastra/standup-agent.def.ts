import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'

export const STANDUP_AGENT_ID = 'standup-agent'

export function createStandupAgent(memory: Memory): Agent {
  return new Agent({
    id: STANDUP_AGENT_ID,
    name: 'Standup Agent',
    instructions: '', // overridden per-call via generate/stream options
    model: 'google/gemini-3.1-flash-lite-preview', // overridden per-call via LlmProviderRegistry
    memory,
  })
}
