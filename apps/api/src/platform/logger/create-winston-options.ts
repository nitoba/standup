import { trace } from '@opentelemetry/api'
import { format, type LoggerOptions, transports } from 'winston'
import type { LoggerMeta } from './logger.types'

export interface CreateWinstonOptionsInput {
  service: string
  component?: string
  level?: string
  silent?: boolean
  defaultMeta?: LoggerMeta
  nodeEnv?: string
}

const RESERVED_META_KEYS = new Set([
  'level',
  'message',
  'timestamp',
  'service',
  'component',
  'stack',
  'traceId',
  'spanId',
])

function buildLogScope(service: string, component?: string): string {
  return component ? `${service}:${component}` : service
}

function getPrintableMeta(info: Record<string, unknown>): LoggerMeta {
  const result: LoggerMeta = {}

  for (const [key, value] of Object.entries(info)) {
    if (RESERVED_META_KEYS.has(key) || value === undefined) {
      continue
    }
    result[key] = value
  }

  return result
}

function getTraceContext(): { traceId: string; spanId: string } {
  const span = trace.getActiveSpan()
  if (!span) {
    return { traceId: '', spanId: '' }
  }

  const spanContext = span.spanContext()

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  }
}

function createDevelopmentFormat() {
  return format.combine(
    format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.colorize({ all: false }),
    format.printf((rawInfo: unknown) => {
      const info = rawInfo as Record<string, unknown>
      const service = String(info.service ?? 'unknown-service')
      const component =
        typeof info.component === 'string' ? info.component : undefined
      const timestamp = String(info.timestamp ?? new Date().toISOString())
      const level = String(info.level ?? 'info').padEnd(7, ' ')
      const message = String(info.message ?? '')
      const scope = buildLogScope(service, component)
      const printableMeta = getPrintableMeta(info)
      const { traceId, spanId } = getTraceContext()

      if (traceId) {
        printableMeta.traceId = traceId
        printableMeta.spanId = spanId
      }

      const metaSuffix =
        Object.keys(printableMeta).length === 0
          ? ''
          : ` ${JSON.stringify(printableMeta)}`
      const stack = typeof info.stack === 'string' ? `\n${info.stack}` : ''

      return `${timestamp} ${level} [${scope}] ${message}${metaSuffix}${stack}`
    }),
  )
}

function createProductionFormat() {
  const injectTraceContext = format((info) => {
    const { traceId, spanId } = getTraceContext()
    if (traceId) {
      info.traceId = traceId
      info.spanId = spanId
    }

    return info
  })

  return format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    injectTraceContext(),
    format.json(),
  )
}

export function createWinstonOptions(
  options: CreateWinstonOptionsInput,
): LoggerOptions {
  const isProduction =
    (options.nodeEnv ?? process.env.NODE_ENV) === 'production'

  return {
    level: options.level ?? (isProduction ? 'info' : 'debug'),
    defaultMeta: {
      service: options.service,
      ...(options.component ? { component: options.component } : {}),
      ...options.defaultMeta,
    },
    silent: options.silent ?? false,
    exitOnError: false,
    format: isProduction ? createProductionFormat() : createDevelopmentFormat(),
    transports: [new transports.Console()],
  }
}
