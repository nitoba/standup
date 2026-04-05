import { Mastra } from '@mastra/core'
import type { Agent } from '@mastra/core/agent'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import type { Provider } from '@nestjs/common'
import { EnvService } from '../../../../../platform/env/env.service'
import { createStandupAgent, STANDUP_AGENT_ID } from './standup-agent.def'

export const MASTRA_INSTANCE = 'MASTRA_INSTANCE'
export const MASTRA_STANDUP_AGENT = 'MASTRA_STANDUP_AGENT'
export const MASTRA_MEMORY = 'MASTRA_MEMORY'

export const mastraProviders: Provider[] = [
  {
    provide: MASTRA_INSTANCE,
    useFactory: (env: EnvService) => {
      const { url: databaseUrl, authToken } = env.database

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

      const storage = new LibSQLStore({
        id: 'standup-mastra-storage',
        url: databaseUrl,
        ...(authToken ? { authToken } : {}),
      })

      const memory = new Memory({
        storage,
        options: {
          lastMessages: 20,
        },
      })

      const standupAgent = createStandupAgent(memory)

      const mastra = new Mastra({
        agents: { [STANDUP_AGENT_ID]: standupAgent },
        storage,
      })

      return { mastra, memory }
    },
    inject: [EnvService],
  },
  {
    provide: MASTRA_STANDUP_AGENT,
    useFactory: ({
      mastra,
    }: {
      mastra: InstanceType<typeof Mastra>
    }): Agent => {
      return mastra.getAgent(STANDUP_AGENT_ID)
    },
    inject: [MASTRA_INSTANCE],
  },
  {
    provide: MASTRA_MEMORY,
    useFactory: ({ memory }: { memory: Memory }): Memory => memory,
    inject: [MASTRA_INSTANCE],
  },
]
