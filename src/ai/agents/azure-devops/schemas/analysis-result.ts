import z from 'zod'

export const azureDevOpsSchema = z.object({
	workItems: z.array(
		z.object({
			cardNumber: z.string().nullable(),
			title: z.string().nullable(),
			status: z.string().nullable(),
			type: z.string().nullable(),
		})
	),
	pullRequests: z.array(
		z.object({
			branchName: z.string(),
			cardNumber: z.string().nullable(),
			prStatus: z.enum(['Open', 'Completed', 'Abandoned', 'None']),
			isMerged: z.boolean(),
		})
	),
})

export type AzureDataAnalysis = z.infer<typeof azureDevOpsSchema>
