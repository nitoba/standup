import { MCPClient } from '@mastra/mcp'

export const azureDevops = new MCPClient({
	servers: {
		azureDevops: {
			command: 'bunx',
			args: ['-y', '@tiberriver256/mcp-server-azure-devops'],
			env: {
				AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/ibsbiosistemico',
				AZURE_DEVOPS_AUTH_METHOD: 'pat',
				// biome-ignore lint/style/noNonNullAssertion: this envs exists
				AZURE_DEVOPS_PAT: Bun.env.AZURE_DEVOPS_PAT!,
				AZURE_DEVOPS_DEFAULT_PROJECT: 'AGROTRACE',
				LOG_LEVEL: 'error',
			},
		},
	},
})
