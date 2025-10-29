import type z from 'zod'
import type { aggregatedGitAnalysisSchema } from './schemas/aggregated-git-analysis-schema'

// Schema for the check results
export function hasGitResults({
	repositories,
}: z.infer<typeof aggregatedGitAnalysisSchema>) {
	const hasResults =
		repositories.length > 0 &&
		repositories.some((repo) => repo.branches.length > 0)

	return hasResults
}
