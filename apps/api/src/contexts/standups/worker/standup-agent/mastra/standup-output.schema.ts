import { z } from 'zod'

export const standupOutputSchema = z.object({
  content: z
    .string()
    .describe('Standup formatado em portugues, max 2000 chars'),
  summary: z.string().describe('Resumo de 1 linha do standup'),
})

export type StandupOutput = z.infer<typeof standupOutputSchema>
