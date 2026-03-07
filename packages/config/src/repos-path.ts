import { isAbsolute, normalize, relative, resolve } from 'node:path'
import { Result, ValidationError } from '@standup/domain'

function normalizeForComparison(path: string): string {
  return normalize(path).replace(/[\\/]+$/, '')
}

function isRelativePathSafe(path: string): boolean {
  return !path
    .split(/[\\/]+/)
    .some((segment) => segment === '..' || segment.length === 0)
}

export function normalizeReposSubpath(
  input: string,
): Result<string, ValidationError> {
  const trimmed = input.trim()
  if (!trimmed) {
    return Result.ok('')
  }

  if (isAbsolute(trimmed)) {
    return Result.err(
      new ValidationError({
        field: 'reposBasePath',
        message: 'reposBasePath must be relative to REPOS_ROOT_PATH',
      }),
    )
  }

  if (trimmed.split(/[\\/]+/).some((segment) => segment === '..')) {
    return Result.err(
      new ValidationError({
        field: 'reposBasePath',
        message: 'reposBasePath must not contain parent directory segments',
      }),
    )
  }

  const normalized = normalize(trimmed)
    .replace(/^[./\\]+/, '')
    .replace(/[\\]+/g, '/')

  if (!normalized || normalized === '.') {
    return Result.ok('')
  }

  if (!isRelativePathSafe(normalized)) {
    return Result.err(
      new ValidationError({
        field: 'reposBasePath',
        message: 'reposBasePath must not contain parent directory segments',
      }),
    )
  }

  return Result.ok(normalized)
}

export interface ResolvedReposScanPath {
  absolutePath: string
  normalizedSubpath: string
}

export function resolveReposScanPath(
  userSetting: string,
  reposRootPath: string,
): Result<ResolvedReposScanPath, ValidationError> {
  const root = resolve(reposRootPath)
  const raw = userSetting.trim()

  if (!raw) {
    return Result.ok({
      absolutePath: root,
      normalizedSubpath: '',
    })
  }

  if (!isAbsolute(raw)) {
    const normalizedSubpath = normalizeReposSubpath(raw)
    if (Result.isError(normalizedSubpath)) {
      return normalizedSubpath
    }

    return Result.ok({
      absolutePath: resolve(root, normalizedSubpath.value),
      normalizedSubpath: normalizedSubpath.value,
    })
  }

  const normalizedRaw = resolve(raw)
  const relativeToRoot = relative(root, normalizedRaw).replace(/[\\]+/g, '/')

  if (
    relativeToRoot === '' ||
    relativeToRoot === '.' ||
    isRelativePathSafe(relativeToRoot)
  ) {
    const normalizedSubpath =
      relativeToRoot === '.' ? '' : relativeToRoot === '' ? '' : relativeToRoot

    return Result.ok({
      absolutePath: normalizedRaw,
      normalizedSubpath,
    })
  }

  return Result.err(
    new ValidationError({
      field: 'reposBasePath',
      message: `reposBasePath must stay inside REPOS_ROOT_PATH (${normalizeForComparison(root)})`,
    }),
  )
}
