import z from 'zod'

export const aggregatedGitAnalysisSchema = z.object({
	repositories: z.array(
		z.object({
			repositoryPath: z.string(),
			projectName: z.string(),
			branches: z.array(
				z.object({
					branchName: z.string(),
					cardNumber: z.string(),
					commitMessages: z.array(z.string()),
				})
			),
		})
	),
})

export type GitAnalysisResult = z.infer<typeof aggregatedGitAnalysisSchema>
