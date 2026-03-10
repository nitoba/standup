import { provideHttpClient } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  type RepoOption,
  type SettingsRecord,
  SettingsService,
} from './settings-service'

describe('SettingsService', () => {
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })

    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('loads current user settings from /settings/me', async () => {
    const service = TestBed.inject(SettingsService)
    const settings: SettingsRecord = {
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
      gitAuthor: 'nitoba@example.com',
      selectedRepos: ['agrotrace-web', 'agrotrace-api'],
      active: true,
      snoozedUntil: null,
      cancelledDate: null,
    }

    const loadPromise = service.loadSettings()

    const request = httpMock.expectOne('/settings/me')
    expect(request.request.method).toBe('GET')
    request.flush({ data: settings })

    await expect(loadPromise).resolves.toEqual(settings)
    expect(service.settings()).toEqual(settings)
  })

  it('loads available repositories from /repos', async () => {
    const service = TestBed.inject(SettingsService)
    const repos: RepoOption[] = [
      { id: 'repo-1', name: 'agrotrace-web', project: 'AGROTRACE' },
      { id: 'repo-2', name: 'agrotrace-api', project: 'AGROTRACE' },
    ]

    const loadPromise = service.loadRepos()

    const request = httpMock.expectOne('/repos')
    expect(request.request.method).toBe('GET')
    request.flush({ data: repos })

    await expect(loadPromise).resolves.toEqual(repos)
    expect(service.repos()).toEqual(repos)
  })

  it('saves settings to /settings/me and updates cached state', async () => {
    const service = TestBed.inject(SettingsService)
    const payload = {
      standupCron: '0 9 * * 1-5',
      reminderCron: '50 8 * * 1-5',
      recoveryCron: '30 9 * * 1-5',
      timezone: 'Europe/London',
      gitAuthor: 'dev@example.com',
      gitSincePeriod: '24 hours ago',
      selectedRepos: ['repo-a', 'repo-b'],
      active: false,
    }
    const saved: SettingsRecord = {
      ...payload,
      snoozedUntil: 1741543200000,
      cancelledDate: '2026-03-09',
    }

    const savePromise = service.saveSettings(payload)

    const request = httpMock.expectOne('/settings/me')
    expect(request.request.method).toBe('PUT')
    expect(request.request.body).toEqual(payload)
    request.flush({ data: saved })

    await expect(savePromise).resolves.toEqual(saved)
    expect(service.settings()).toEqual(saved)
  })
})
