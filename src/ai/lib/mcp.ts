import { MCPConfiguration } from '@voltagent/core'
import { env } from '@/lib/env'

export const mcpClient = new MCPConfiguration({
	servers: {
		azureDevops: {
			type: 'stdio',
			command: 'bunx',
			args: ['-y', '@tiberriver256/mcp-server-azure-devops'],
			env: {
				AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/ibsbiosistemico',
				AZURE_DEVOPS_AUTH_METHOD: 'pat',
				AZURE_DEVOPS_PAT: env.AZURE_DEVOPS_PAT,
				AZURE_DEVOPS_DEFAULT_PROJECT: 'AGROTRACE',
				LOG_LEVEL: 'error',
			},
		},
	},
})
