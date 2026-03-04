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
  return format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
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
