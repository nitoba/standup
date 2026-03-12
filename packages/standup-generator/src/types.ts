import type { AzureMcpClient, AzureMcpConfig } from '@standup/azure-devops'

export type { AzureMcpConfig }

export type GeneratorStage = 'enriching_data' | 'generating_standup'

export interface GeneratorConfig {
  aiProviderApiKey?: string
  azure?: AzureMcpConfig
  /**
   * Optional shared MCP client (singleton, already connected at startup).
   * When provided, the generator reuses this client instead of creating
   * a new connection per enrichment attempt.
   */
  mcpClient?: AzureMcpClient
  onStageChange?: (stage: GeneratorStage) => Promise<void> | void
}
