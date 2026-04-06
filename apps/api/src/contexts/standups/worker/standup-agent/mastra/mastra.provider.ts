import { Mastra } from '@mastra/core'
import type { Agent } from '@mastra/core/agent'
import type { Provider } from '@nestjs/common'
import { EnvService } from '../../../../../platform/env/env.service'
import { createStandupAgent, STANDUP_AGENT_ID } from './standup-agent.def'

export const MASTRA_INSTANCE = 'MASTRA_INSTANCE'
export const MASTRA_STANDUP_AGENT = 'MASTRA_STANDUP_AGENT'

export const mastraProviders: Provider[] = [
  {
    provide: MASTRA_INSTANCE,
    useFactory: (env: EnvService) => {
      // Ensure API keys are available in process.env for Mastra model router
      const { googleApiKey, groqApiKey, openrouterApiKey } = env.worker
      if (googleApiKey) {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = googleApiKey
      }
      if (groqApiKey) {
        process.env.GROQ_API_KEY = groqApiKey
      }
      if (openrouterApiKey) {
        process.env.OPENROUTER_API_KEY = openrouterApiKey
      }

      const standupAgent = createStandupAgent()

      return new Mastra({
        agents: { [STANDUP_AGENT_ID]: standupAgent },
      })
    },
    inject: [EnvService],
  },
  {
    provide: MASTRA_STANDUP_AGENT,
    useFactory: (mastra: InstanceType<typeof Mastra>): Agent => {
      return mastra.getAgent(STANDUP_AGENT_ID)
    },
    inject: [MASTRA_INSTANCE],
  },
]
