import z from 'zod'

export const statusDeterminationSchema = z.object({
	tasks: z.array(
		z.object({
			projectName: z.string(),
			cardNumber: z.string().nullable(),
			cardTitle: z.string(),
			finalStatus: z.enum(['Done', 'In Progress']),
			reasoning: z.string(),
			progressDetails: z.string().optional(),
		})
	),
})

export type StatusDeterminationAnalysisResult = z.infer<
	typeof statusDeterminationSchema
>
