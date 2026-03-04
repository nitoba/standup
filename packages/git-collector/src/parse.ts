/**
 * Pure parsing utilities for git output — no I/O, fully testable.
 */

export interface CommitBlock {
  hash: string
  subject: string
  body: string
}

export interface CommitStats {
  filesChanged: number
  insertions: number
  deletions: number
  files: string[]
}

/**
 * Parses raw `git log --pretty=format:"%h%n%s%n%b%n---"` output into commit blocks.
 */
export function parseCommitBlocks(raw: string): CommitBlock[] {
  const trimmed = raw
    .trim()
    .replace(/\n?---\s*$/, '')
    .trim()
  if (!trimmed) return []

  const blocks = trimmed.split('\n---\n').filter((b) => b.trim())
  return blocks.map((block) => {
    const lines = block.trim().split('\n')
    const hash = lines[0] ?? ''
    const subject = lines[1] ?? ''
    const body = lines.slice(2).join('\n').trim()
    return { hash, subject, body }
  })
}

/**
 * Parses raw `git show --stat --format=""` output into file stats.
 */
export function parseShowStat(raw: string): CommitStats {
  const lines = raw.split('\n')
  const files: string[] = []
  let filesChanged = 0
  let insertions = 0
  let deletions = 0

  const fileRegex = /^\s+(.+?)\s+\|\s+\d+/
  const summaryRegex =
    /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/

  for (const line of lines) {
    const fileMatch = line.match(fileRegex)
    if (fileMatch?.[1]) {
      files.push(fileMatch[1].trim())
      continue
    }
    const summaryMatch = line.match(summaryRegex)
    if (summaryMatch) {
      filesChanged = Number.parseInt(summaryMatch[1] ?? '0', 10) || 0
      insertions = Number.parseInt(summaryMatch[2] ?? '0', 10) || 0
      deletions = Number.parseInt(summaryMatch[3] ?? '0', 10) || 0
    }
  }

  return { filesChanged, insertions, deletions, files }
}

/**
 * Extracts Azure DevOps card numbers (#12345) from free text.
 */
export function extractCardNumbers(text: string): string[] {
  const matches = text.match(/#(\d{3,7})/g)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.replace('#', '')))]
}

/**
 * Extracts a card number from a branch name that follows conventional naming:
 * e.g. feat/12345, fix/54321, task/12345-description
 */
export function extractBranchCardNumber(branch: string): string | null {
  const match = branch.match(
    /(?:fix|feat|feature|bug|hotfix|refactor|task|chore|improvement)\/(\d{3,7})/,
  )
  return match ? (match[1] ?? null) : null
}
