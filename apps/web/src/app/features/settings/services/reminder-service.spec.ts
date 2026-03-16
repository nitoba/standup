import { provideHttpClient } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ReminderService } from './reminder-service'

describe('ReminderService', () => {
  let httpMock: HttpTestingController

  async function advanceUntilRequestStarts() {
    await Promise.resolve()
    await Promise.resolve()
    TestBed.tick()
  }

  beforeEach(() => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
      ],
    })

    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('triggers run-now through the public reminders API', async () => {
    const service = TestBed.inject(ReminderService)

    const runNowPromise = service.runNow()

    await advanceUntilRequestStarts()
    const request = httpMock.expectOne('/reminders/run-now')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toBeNull()
    request.flush(
      { ok: true, accepted: true },
      { status: 202, statusText: 'Accepted' },
    )

    await expect(runNowPromise).resolves.toEqual({ ok: true, accepted: true })
  })

  it('snoozes reminders through the public reminders API', async () => {
    const service = TestBed.inject(ReminderService)

    const snoozePromise = service.snooze()

    await advanceUntilRequestStarts()
    const request = httpMock.expectOne('/reminders/snooze')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toBeNull()
    request.flush({
      data: {
        ok: true,
        snoozedUntil: '2026-03-09T18:00:00.000Z',
      },
    })

    await expect(snoozePromise).resolves.toEqual({
      data: {
        ok: true,
        snoozedUntil: '2026-03-09T18:00:00.000Z',
      },
    })
  })

  it('cancels reminders for today through the public reminders API', async () => {
    const service = TestBed.inject(ReminderService)

    const cancelPromise = service.cancelToday()

    await advanceUntilRequestStarts()
    const request = httpMock.expectOne('/reminders/cancel-today')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toBeNull()
    request.flush({
      data: {
        ok: true,
        cancelledDate: '09/03/2026',
      },
    })

    await expect(cancelPromise).resolves.toEqual({
      data: {
        ok: true,
        cancelledDate: '09/03/2026',
      },
    })
  })
})
