import { createStep } from '@mastra/core/workflows'
import z from 'zod'
import { userIdentifierSchema } from '@/lib/user'
import {
	aggregatedGitAnalysisSchema,
	gitAnalysisStep,
} from './git-analysis.step'
import { repositoryDiscoveryStep } from './repository-discovery.step'

export const mapperStep = createStep({
	id: 'mapper',
	description: '',
	inputSchema: aggregatedGitAnalysisSchema,
	outputSchema: z.object({
		user: userIdentifierSchema,
		gitResult: aggregatedGitAnalysisSchema,
	}),
	execute: async ({ getStepResult }) => {
		const { user } = getStepResult(repositoryDiscoveryStep)
		const gitResult = getStepResult(gitAnalysisStep)

		return {
			user,
			gitResult,
		}
	},
})
