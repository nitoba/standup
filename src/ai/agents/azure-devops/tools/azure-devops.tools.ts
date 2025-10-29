import { mcpClient } from '@/ai/lib/mcp'

export const tools = await mcpClient
	.getClient('azureDevops')
	.then((mcp) => mcp?.getAgentTools())
	.then((t) => (t ? Object.values(t) : []))
