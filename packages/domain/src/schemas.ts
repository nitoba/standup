import { z } from 'zod'

export const StandupStatusSchema = z.enum([
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'published',
])

export const StandupSchema = z.object({
  id: z.string().uuid(),
  date: z.string().min(10),
  meetingType: z.string().min(1),
  content: z.string().min(1),
  sourceData: z.string().min(2),
  status: StandupStatusSchema,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

export const GenerateStandupInputSchema = z.object({
  date: z.string().min(10),
  meetingType: z.string().min(1),
  gitActivity: z.object({
    timestamp: z.string().datetime(),
    repos: z.array(
      z.object({
        repoName: z.string().min(1),
        repoPath: z.string().min(1),
        currentBranch: z.string(),
        commits: z.array(
          z.object({
            hash: z.string().min(1),
            subject: z.string().min(1),
            body: z.string(),
            filesChanged: z.number().int(),
            insertions: z.number().int(),
            deletions: z.number().int(),
            files: z.array(z.string()),
          }),
        ),
        cardNumbers: z.array(z.string()),
        branchCardNumber: z.string().nullable(),
      }),
    ),
  }),
  extraContext: z.string().optional(),
})
