import { STATUS_CODES } from 'node:http'
import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import {
  DbError,
  ExternalServiceError,
  InvalidStateTransitionError,
  JobAlreadyCompletedError,
  LlmTemporaryError,
  LockAlreadyHeldError,
  McpConnectionError,
  matchError,
  NotFoundError,
  StandupTriggerConflictError,
  ValidationError,
} from '../../../shared/domain'
import { AppLoggerFactory } from '../../logger'

type ErrorResponseBody = {
  statusCode: number
  error: string
  message: string
  details?: Record<string, unknown>
  path: string
  timestamp: string
}

type DomainException =
  | ValidationError
  | NotFoundError
  | InvalidStateTransitionError
  | ExternalServiceError
  | LlmTemporaryError
  | McpConnectionError
  | LockAlreadyHeldError
  | JobAlreadyCompletedError
  | StandupTriggerConflictError
  | DbError

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    loggerFactory: AppLoggerFactory,
  ) {
    this.logger = loggerFactory.create('global-exception-filter')
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost
    const ctx = host.switchToHttp()
    const request = ctx.getRequest()
    const normalized = this.normalizeException(exception)
    const responseBody: ErrorResponseBody = {
      ...normalized,
      path: httpAdapter.getRequestUrl(request),
      timestamp: new Date().toISOString(),
    }

    this.logException(exception, request, responseBody)
    httpAdapter.reply(ctx.getResponse(), responseBody, responseBody.statusCode)
  }

  private normalizeException(
    exception: unknown,
  ): Omit<ErrorResponseBody, 'path' | 'timestamp'> {
    if (exception instanceof HttpException) {
      return this.normalizeHttpException(exception)
    }

    if (this.isDomainException(exception)) {
      return this.normalizeDomainException(exception)
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: this.getStatusLabel(HttpStatus.INTERNAL_SERVER_ERROR),
      message: 'Internal server error',
    }
  }

  private normalizeHttpException(
    exception: HttpException,
  ): Omit<ErrorResponseBody, 'path' | 'timestamp'> {
    const statusCode = exception.getStatus()
    const response = exception.getResponse()
    const fallbackError = this.getStatusLabel(statusCode)

    if (typeof response === 'string') {
      return {
        statusCode,
        error: fallbackError,
        message: response,
      }
    }

    if (!this.isRecord(response)) {
      return {
        statusCode,
        error: fallbackError,
        message: fallbackError,
      }
    }

    const issues = this.extractIssues(response.message)
    const message =
      this.extractMessage(response.message) ??
      (typeof response.message === 'string' ? response.message : fallbackError)
    const details = this.buildHttpExceptionDetails(response, issues)

    return {
      statusCode,
      error: this.extractErrorLabel(response.error, fallbackError),
      message,
      ...(details ? { details } : {}),
    }
  }

  private normalizeDomainException(
    exception: DomainException,
  ): Omit<ErrorResponseBody, 'path' | 'timestamp'> {
    const statusCode = this.getDomainStatus(exception)
    const details = this.extractExceptionDetails(exception)

    return {
      statusCode,
      error: this.getStatusLabel(statusCode),
      message: exception.message,
      ...(details ? { details } : {}),
    }
  }

  private buildHttpExceptionDetails(
    response: Record<string, unknown>,
    issues: string[] | undefined,
  ): Record<string, unknown> | undefined {
    const details = Object.fromEntries(
      Object.entries(response).filter(
        ([key]) => key !== 'statusCode' && key !== 'error' && key !== 'message',
      ),
    )

    if (issues && issues.length > 0) {
      details.issues = issues
    }

    return Object.keys(details).length > 0 ? details : undefined
  }

  private extractIssues(message: unknown): string[] | undefined {
    if (!Array.isArray(message)) {
      return undefined
    }

    const issues = message.filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    )

    return issues.length > 0 ? issues : undefined
  }

  private extractMessage(message: unknown): string | undefined {
    if (typeof message === 'string' && message.length > 0) {
      return message
    }

    if (Array.isArray(message)) {
      return message.find(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      )
    }

    return undefined
  }

  private extractErrorLabel(error: unknown, fallback: string): string {
    return typeof error === 'string' && error.length > 0 ? error : fallback
  }

  private extractExceptionDetails(
    exception: object,
  ): Record<string, unknown> | undefined {
    /** Campos permitidos em detalhes públicos de erro — sem vazar internals */
    const PUBLIC_DETAIL_KEYS = new Set([
      'field',
      'resource',
      'code',
      'param',
      'id',
      'reason',
      'standupId',
      'accepted',
      'ok',
    ])

    const source = exception as Record<string, unknown>
    const detailEntries = Object.getOwnPropertyNames(exception)
      .filter((key) => PUBLIC_DETAIL_KEYS.has(key))
      .map((key) => [key, source[key]])
      .filter(([, value]) => value !== undefined)

    if (detailEntries.length === 0) {
      return undefined
    }

    return Object.fromEntries(detailEntries)
  }

  private getDomainStatus(exception: DomainException): number {
    return matchError(exception, {
      ValidationError: () => HttpStatus.BAD_REQUEST,
      NotFoundError: () => HttpStatus.NOT_FOUND,
      InvalidStateTransitionError: () => HttpStatus.CONFLICT,
      LockAlreadyHeldError: () => HttpStatus.CONFLICT,
      JobAlreadyCompletedError: () => HttpStatus.CONFLICT,
      StandupTriggerConflictError: () => HttpStatus.CONFLICT,
      ExternalServiceError: () => HttpStatus.SERVICE_UNAVAILABLE,
      LlmTemporaryError: () => HttpStatus.SERVICE_UNAVAILABLE,
      McpConnectionError: () => HttpStatus.SERVICE_UNAVAILABLE,
      DbError: () => HttpStatus.INTERNAL_SERVER_ERROR,
    })
  }

  private isDomainException(exception: unknown): exception is DomainException {
    return (
      ValidationError.is(exception) ||
      NotFoundError.is(exception) ||
      InvalidStateTransitionError.is(exception) ||
      ExternalServiceError.is(exception) ||
      LlmTemporaryError.is(exception) ||
      McpConnectionError.is(exception) ||
      LockAlreadyHeldError.is(exception) ||
      JobAlreadyCompletedError.is(exception) ||
      StandupTriggerConflictError.is(exception) ||
      DbError.is(exception)
    )
  }

  private getStatusLabel(statusCode: number): string {
    return STATUS_CODES[statusCode] ?? 'Error'
  }

  private logException(
    exception: unknown,
    request: { method?: string } | undefined,
    responseBody: ErrorResponseBody,
  ) {
    const logPayload = {
      error: responseBody.error,
      message: responseBody.message,
      method: request?.method,
      path: responseBody.path,
      statusCode: responseBody.statusCode,
      ...(responseBody.details ? { details: responseBody.details } : {}),
      ...(exception instanceof Error ? { stack: exception.stack } : {}),
    }

    if (responseBody.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error('Unhandled HTTP exception', logPayload)
      return
    }

    this.logger.warn('Handled HTTP exception', logPayload)
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
  }
}
