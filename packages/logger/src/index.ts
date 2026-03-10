import { trace } from '@opentelemetry/api'
import {
  createLogger as createWinstonLogger,
  format,
  type Logger,
  transports,
} from 'winston'

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

export interface LoggerMeta {
  [key: string]: unknown
}

export interface CreateServiceLoggerOptions {
  service: string
  component?: string
  level?: string
  silent?: boolean
  defaultMeta?: LoggerMeta
}

export function buildLogScope(service: string, component?: string): string {
  return component ? `${service}:${component}` : service
}

function getPrintableMeta(info: Record<string, unknown>): LoggerMeta {
  const result: LoggerMeta = {}

  for (const [key, value] of Object.entries(info)) {
    if (RESERVED_META_KEYS.has(key)) {
      continue
    }
    if (value === undefined) {
      continue
    }
    result[key] = value
  }

  return result
}

/**
 * Extracts traceId and spanId from the active OpenTelemetry span (if any).
 * Returns empty strings when tracing is disabled or no span is active.
 */
function getTraceContext(): { traceId: string; spanId: string } {
  const span = trace.getActiveSpan()
  if (!span) {
    return { traceId: '', spanId: '' }
  }
  const ctx = span.spanContext()
  return { traceId: ctx.traceId, spanId: ctx.spanId }
}

function createDevelopmentFormat() {
  return format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.colorize({ all: false }),
    format.printf((rawInfo: unknown) => {
      const info = rawInfo as Record<string, unknown>
      const service = String(info.service ?? 'unknown-service')
      const component =
        typeof info.component === 'string' ? info.component : undefined
      const scope = buildLogScope(service, component)
      const timestamp = String(info.timestamp ?? new Date().toISOString())
      const level = String(info.level ?? 'info').padEnd(7, ' ')
      const message = String(info.message ?? '')
      const printableMeta = getPrintableMeta(info)

      // Inject trace context if available
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

export function createServiceLogger(
  options: CreateServiceLoggerOptions,
): Logger {
  const defaultMeta: LoggerMeta = {
    service: options.service,
    ...(options.component ? { component: options.component } : {}),
    ...options.defaultMeta,
  }

  const isProduction = process.env.NODE_ENV === 'production'

  return createWinstonLogger({
    level: options.level ?? (isProduction ? 'info' : 'debug'),
    defaultMeta,
    silent: options.silent ?? false,
    exitOnError: false,
    format: isProduction ? createProductionFormat() : createDevelopmentFormat(),
    transports: [new transports.Console()],
  })
}

export function withContext(logger: Logger, context: LoggerMeta): Logger {
  return logger.child(context)
}
