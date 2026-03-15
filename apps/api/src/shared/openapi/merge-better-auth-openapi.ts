import type { OpenAPIObject } from '@nestjs/swagger'

type BetterAuthEndpointOptions = {
  method?: string | string[]
  metadata?: Record<string, unknown>
}

type BetterAuthEndpoint = {
  path?: string
  options?: BetterAuthEndpointOptions
}

type BetterAuthInstance = {
  api?: Record<string, BetterAuthEndpoint>
  options?: {
    basePath?: string
  }
}

const AUTH_TAG = {
  name: 'auth',
  description:
    'Endpoints internos expostos pelo Better Auth e pelo módulo de autenticação.',
}

const DEFAULT_BETTER_AUTH_BASE_PATH = '/api/auth'

export function mergeBetterAuthOpenApi(
  document: OpenAPIObject,
  auth: BetterAuthInstance,
): OpenAPIObject {
  const basePath = normalizePath(
    auth.options?.basePath ?? DEFAULT_BETTER_AUTH_BASE_PATH,
  )
  const endpoints = Object.values(auth.api ?? {})

  document.tags = mergeTags(document.tags, AUTH_TAG)
  document.components = {
    ...document.components,
    schemas: {
      ...document.components?.schemas,
      User: document.components?.schemas?.User ?? buildUserSchema(),
      Session: document.components?.schemas?.Session ?? buildSessionSchema(),
    },
  }

  for (const endpoint of endpoints) {
    if (!endpoint.path || !endpoint.options?.method) {
      continue
    }

    const path = joinPaths(basePath, endpoint.path)
    const openApiPath = convertPathParams(path)
    const methods = Array.isArray(endpoint.options.method)
      ? endpoint.options.method
      : [endpoint.options.method]

    for (const method of methods) {
      const normalizedMethod = method.toLowerCase()

      if (!isOpenApiHttpMethod(normalizedMethod)) {
        continue
      }

      const existingPathItem = document.paths[openApiPath] ?? {}
      const existingOperation = existingPathItem[normalizedMethod]
      const openapiMetadata =
        getOpenApiMetadata(endpoint.options.metadata) ??
        ({} as Record<string, unknown>)
      const parameters = mergePathParameters(
        openApiPath,
        openapiMetadata.parameters,
      )

      existingPathItem[normalizedMethod] = {
        ...existingOperation,
        ...openapiMetadata,
        operationId:
          (openapiMetadata.operationId as string | undefined) ??
          buildOperationId(normalizedMethod, openApiPath),
        summary:
          (openapiMetadata.summary as string | undefined) ??
          (openapiMetadata.description as string | undefined) ??
          buildSummary(normalizedMethod, openApiPath),
        responses:
          (openapiMetadata.responses as never) ??
          ({
            200: {
              description: 'Success',
            },
          } as never),
        parameters,
        tags: mergeOperationTags(openapiMetadata.tags),
      }

      document.paths[openApiPath] = existingPathItem
    }
  }

  return document
}

function getOpenApiMetadata(
  metadata: unknown,
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined
  }

  if (!('openapi' in metadata)) {
    return undefined
  }

  const openapi = metadata.openapi

  if (!openapi || typeof openapi !== 'object') {
    return undefined
  }

  return openapi as Record<string, unknown>
}

function buildUserSchema() {
  return {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      emailVerified: { type: 'boolean' },
      image: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
    required: [
      'id',
      'name',
      'email',
      'emailVerified',
      'createdAt',
      'updatedAt',
    ],
  }
}

function buildSessionSchema() {
  return {
    type: 'object',
    properties: {
      id: { type: 'string' },
      userId: { type: 'string' },
      token: { type: 'string' },
      expiresAt: { type: 'string', format: 'date-time' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      ipAddress: { type: 'string', nullable: true },
      userAgent: { type: 'string', nullable: true },
    },
    required: ['id', 'userId', 'token', 'expiresAt', 'createdAt', 'updatedAt'],
  }
}

function buildOperationId(method: string, path: string): string {
  return `${method}${path
    .replaceAll('/', '_')
    .replaceAll('{', '')
    .replaceAll('}', '')
    .replaceAll('-', '_')
    .replace(/^_+/, '')}`
}

function buildSummary(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`
}

function convertPathParams(path: string): string {
  return path.replaceAll(/:([a-zA-Z0-9_]+)/g, '{$1}')
}

function isOpenApiHttpMethod(
  method: string,
): method is
  | 'delete'
  | 'get'
  | 'head'
  | 'options'
  | 'patch'
  | 'post'
  | 'put'
  | 'trace' {
  return [
    'delete',
    'get',
    'head',
    'options',
    'patch',
    'post',
    'put',
    'trace',
  ].includes(method)
}

function joinPaths(basePath: string, path: string): string {
  return normalizePath(`${basePath}/${path}`)
}

function normalizePath(path: string): string {
  const normalized = path.replaceAll(/\/+/g, '/')

  if (normalized === '/') {
    return normalized
  }

  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

function mergeTags(
  tags: OpenAPIObject['tags'],
  tag: { name: string; description?: string },
) {
  const currentTags = tags ?? []

  if (currentTags.some((currentTag) => currentTag.name === tag.name)) {
    return currentTags
  }

  return [...currentTags, tag]
}

function mergeOperationTags(tags: unknown): string[] {
  const currentTags = Array.isArray(tags)
    ? tags.filter((value): value is string => typeof value === 'string')
    : []

  return currentTags.includes('auth') ? currentTags : ['auth', ...currentTags]
}

function mergePathParameters(path: string, parameters: unknown) {
  const currentParameters = Array.isArray(parameters) ? parameters : []
  const pathParameters = Array.from(path.matchAll(/\{([a-zA-Z0-9_]+)\}/g)).map(
    (match) => match[1],
  )

  const missingParameters = pathParameters
    .filter((parameterName) => {
      return !currentParameters.some((parameter) => {
        if (!parameter || typeof parameter !== 'object') {
          return false
        }

        const name =
          'name' in parameter && typeof parameter.name === 'string'
            ? parameter.name
            : undefined
        const location =
          'in' in parameter && typeof parameter.in === 'string'
            ? parameter.in
            : undefined

        return name === parameterName && location === 'path'
      })
    })
    .map((parameterName) => ({
      name: parameterName,
      in: 'path',
      required: true,
      schema: {
        type: 'string',
      },
    }))

  return [...currentParameters, ...missingParameters]
}
