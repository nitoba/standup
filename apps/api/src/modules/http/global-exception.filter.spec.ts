import { BadRequestException, ConflictException } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../../shared/domain'
import { GlobalExceptionFilter } from './global-exception.filter'

describe('GlobalExceptionFilter', () => {
  function createFilter() {
    const reply = vi.fn()
    const getRequestUrl = vi.fn().mockReturnValue('/standups/trigger')
    const loggerFactory = {
      create: vi.fn().mockReturnValue({
        error: vi.fn(),
        warn: vi.fn(),
      }),
    }
    const filter = new GlobalExceptionFilter(
      {
        httpAdapter: {
          getRequestUrl,
          reply,
        },
      } as unknown as HttpAdapterHost,
      loggerFactory as never,
    )
    const response = {}
    const request = { method: 'POST' }
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    }

    return {
      filter,
      getRequestUrl,
      host: host as never,
      loggerFactory,
      reply,
      request,
      response,
    }
  }

  it('normalizes validation-style HttpException payloads', () => {
    const { filter, host, reply, response } = createFilter()

    filter.catch(
      new BadRequestException(['standupCron must be a cron expression']),
      host,
    )

    expect(reply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: 'standupCron must be a cron expression',
        path: '/standups/trigger',
        details: {
          issues: ['standupCron must be a cron expression'],
        },
      }),
      400,
    )
  })

  it('preserves custom conflict details while exposing a stable message', () => {
    const { filter, host, reply, response } = createFilter()

    filter.catch(
      new ConflictException({
        ok: false,
        accepted: false,
        reason: 'pending_review_exists',
        standupId: 'standup-1',
        message: 'Standup pendente de revisão para hoje.',
      }),
      host,
    )

    expect(reply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({
        statusCode: 409,
        error: 'Conflict',
        message: 'Standup pendente de revisão para hoje.',
        details: {
          ok: false,
          accepted: false,
          reason: 'pending_review_exists',
          standupId: 'standup-1',
        },
      }),
      409,
    )
  })

  it('maps domain TaggedErrors without requiring a Nest HttpException', () => {
    const { filter, host, reply, response } = createFilter()

    filter.catch(
      new ValidationError({
        field: 'gitAuthor',
        message: 'git author is required',
      }),
      host,
    )

    expect(reply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: 'git author is required',
        details: {
          _tag: 'ValidationError',
          field: 'gitAuthor',
        },
      }),
      400,
    )
  })

  it('falls back to 500 for unexpected exceptions', () => {
    const { filter, host, reply, response } = createFilter()

    filter.catch(new Error('db exploded'), host)

    expect(reply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal server error',
      }),
      500,
    )
  })
})
