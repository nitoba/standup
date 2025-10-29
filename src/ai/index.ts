import 'dotenv/config'
import { VoltAgent } from '@voltagent/core'
import { createPinoLogger } from '@voltagent/logger'
import { honoServer } from '@voltagent/server-hono'
import { standupReportWorkflow } from './workflows/standup-report/workflow'

// Create a logger instance
const logger = createPinoLogger({
	name: 'standup-volt',
	level: 'info',
})

new VoltAgent({
	workflows: {
		standupReportWorkflow,
	},
	server: honoServer({ port: 3333 }),
	logger,
})
