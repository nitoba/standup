import { createStep } from '@mastra/core/workflows'
import { aggregatedGitAnalysisSchema } from './git-analysis.step'
import { statusDeterminationSchema } from './status-determination.step'

// Schema for the no results handler
export const noResultsHandlerSchema = statusDeterminationSchema

// Step to handle the case when no git results are found
export const noResultsHandlerStep = createStep({
	id: 'no-results-handler',
	description: 'Handle the case when no git results are found',
	inputSchema: aggregatedGitAnalysisSchema,
	outputSchema: noResultsHandlerSchema,
	execute: async ({ inputData }) => {
		// Return empty tasks when no git results are found
		// We don't need to use the inputData, but it's required for schema compatibility
		console.log('No git results found, returning empty tasks')
		return {
			tasks: [],
		}
	},
})
