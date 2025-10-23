import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { userIdentifierSchema } from '@/lib/user'
import { azureDevOpsStep } from './steps/azure-devops.step'
import { gitAnalysisStep } from './steps/git-analysis.step'
import { reportFormattingStep } from './steps/report-formatting.step'
import { repositoryDiscoveryStep } from './steps/repository-discovery.step'
import { statusDeterminationStep } from './steps/status-determination.step'

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
	.then(azureDevOpsStep)
	.then(statusDeterminationStep)
	.then(reportFormattingStep)
	.commit()
