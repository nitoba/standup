import { join, resolve } from 'node:path'

/**
 * Resolves a list of repo names to absolute paths.
 *
 * Given REPOS_ROOT_PATH and an array of repo names, returns
 * the absolute path for each one as `join(reposRootPath, name)`.
 */
export function resolveRepoPaths(
  reposRootPath: string,
  selectedRepos: string[],
): string[] {
  const root = resolve(reposRootPath)
  return selectedRepos.map((name) => join(root, name))
}
