import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { userIdentifierSchema } from '@/lib/user'
import { hasResults } from '@/mastra/agents/git-analysis/utils/git-results-check'
import { azureDevOpsStep } from './steps/azure-devops.step'
import {
	aggregatedGitAnalysisSchema,
	gitAnalysisStep,
} from './steps/git-analysis.step'
import { mapperStep } from './steps/mapper.step'
import { noResultsHandlerStep } from './steps/no-results-handler.step'
import { reportFormattingStep } from './steps/report-formatting.step'
import { repositoryDiscoveryStep } from './steps/repository-discovery.step'
import {
	statusDeterminationSchema,
	statusDeterminationStep,
} from './steps/status-determination.step'

// Create a workflow for the path with results
const withResultsWorkflow = createWorkflow({
	id: 'with-results-workflow',
	inputSchema: z.object({
		gitResult: aggregatedGitAnalysisSchema,
		user: userIdentifierSchema,
	}),
	outputSchema: statusDeterminationSchema,
})
	.then(azureDevOpsStep)
	.then(statusDeterminationStep)
	.commit()

// Create and export the workflow
export const standupReportWorkflow = createWorkflow({
	id: 'standup-report',
	description:
		'Generates a complete standup report by analyzing Git repositories, querying Azure DevOps, determining status, and formatting the output',
	inputSchema: z.object({
		user: userIdentifierSchema.optional(),
		repositoriesFolder: z.string().optional(),
	}),
	outputSchema: z.object({
		report: z.string(),
	}),
})
	.then(repositoryDiscoveryStep)
	.then(gitAnalysisStep)
	.then(mapperStep)
	.branch([
		// If git analysis returned results, continue with Azure DevOps and status determination
		[
			async ({ getStepResult }) => {
				const gitResults = getStepResult(gitAnalysisStep)
				return hasResults(gitResults)
			},
			withResultsWorkflow,
		],
		// If no results, use the no results handler which already formats the report
		[
			async ({ getStepResult }) => {
				const gitResults = getStepResult(gitAnalysisStep)
				return !hasResults(gitResults)
			},
			noResultsHandlerStep,
		],
	])
	.then(reportFormattingStep)
	.commit()
