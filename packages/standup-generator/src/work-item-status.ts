import type { EnrichedWorkItem, PullRequestDetail } from './types.js'

/**
 * Determines if a work item is "Done" or "In Progress".
 *
 * Done if:
 *   - workItem.state === 'Done', OR
 *   - workItem.state === 'In Progress' AND all associated PRs are 'completed' or 'active'
 *
 * In Progress otherwise.
 */
export function determineWorkItemStatus(
  item: EnrichedWorkItem,
): 'done' | 'in_progress' {
  const state = item.workItem?.state ?? ''

  if (state === 'Done') return 'done'

  if (state === 'In Progress' && item.pullRequests.length > 0) {
    const allDoneOrActive = item.pullRequests.every(
      (pr: PullRequestDetail) =>
        pr.status === 'completed' || pr.status === 'active',
    )
    if (allDoneOrActive) return 'done'
  }

  return 'in_progress'
}
