import type z from 'zod'
import type { aggregatedGitAnalysisSchema } from '@/ai/workflows/standup-report/steps/git-analysis.step'

// Schema for the check results
export function hasResults({
	repositories,
}: z.infer<typeof aggregatedGitAnalysisSchema>) {
	const hasResults =
		repositories.length > 0 &&
		repositories.some((repo) => repo.branches.length > 0)

	return hasResults
}
