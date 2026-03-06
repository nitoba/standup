export type RemoteServiceName = 'api' | 'worker'

export interface RemoteServiceHealth {
  service: RemoteServiceName
  ok: boolean
  latencyMs: number
  statusCode?: number
  uptimeSeconds?: number
  error?: string
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

export async function checkRemoteServiceHealth(
  service: RemoteServiceName,
  baseUrl: string,
  timeoutMs = 3000,
): Promise<RemoteServiceHealth> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const url = `${normalizeBaseUrl(baseUrl)}/health`

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    const latencyMs = Date.now() - startedAt

    if (!response.ok) {
      return {
        service,
        ok: false,
        latencyMs,
        statusCode: response.status,
        error: `HTTP ${response.status}`,
      }
    }

    const payload = (await response.json()) as {
      status?: string
      uptimeSeconds?: number
    }

    if (payload.status !== 'ok') {
      return {
        service,
        ok: false,
        latencyMs,
        statusCode: response.status,
        error: 'Invalid health response payload',
      }
    }

    return {
      service,
      ok: true,
      latencyMs,
      statusCode: response.status,
      uptimeSeconds:
        typeof payload.uptimeSeconds === 'number'
          ? payload.uptimeSeconds
          : undefined,
    }
  } catch (error) {
    const latencyMs = Date.now() - startedAt
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `timeout after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error)

    return {
      service,
      ok: false,
      latencyMs,
      error: message,
    }
  } finally {
    clearTimeout(timeout)
  }
}
