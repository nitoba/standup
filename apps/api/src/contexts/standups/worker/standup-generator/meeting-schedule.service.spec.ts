import { describe, expect, it } from 'vitest'
import type { EnvService } from '../../../../platform/env/env.service'
import { LocalDateService } from '../../../../platform/time/local-date.service'
import { MeetingScheduleService } from './meeting-schedule.service'

type MeetingConfig = EnvService['meetings']

const defaultMeetingConfig: MeetingConfig = {
  planningWebCycleStartDate: '2026-04-22',
  spotlightRotationStartDate: '2026-04-29',
  spotlightRotationStartTeam: 'Web',
}

function createService(
  meetingConfig: Partial<MeetingConfig> = {},
): MeetingScheduleService {
  const env = {
    meetings: {
      ...defaultMeetingConfig,
      ...meetingConfig,
    },
  }

  return new MeetingScheduleService(
    new LocalDateService(),
    env as unknown as EnvService,
  )
}

describe('MeetingScheduleService', () => {
  it.each([
    ['2026-04-27', '📆 (Start of week meeting)'],
    ['2026-04-28', ''],
    ['2026-04-22', '📆 (Planning Web)'],
    ['2026-04-29', ''],
    ['2026-05-06', '📆 (Planning Web)'],
    ['2026-05-13', ''],
    ['2026-05-20', '📆 (Planning Web)'],
    ['2026-04-24', '📆 (Spotlight - Mobile)'],
    ['2026-05-01', '📆 (Spotlight - Web)'],
    ['2026-05-08', '📆 (Spotlight - Devops)'],
    ['2026-05-15', '📆 (Spotlight - Mobile)'],
  ])('returns "%s" meeting tag for %s', (date, expectedMeetingType) => {
    const service = createService()

    expect(service.getMeetingType(date)).toBe(expectedMeetingType)
  })

  it('uses the configured Planning Web cycle start date', () => {
    const service = createService({
      planningWebCycleStartDate: '2026-05-06',
    })

    expect(service.getMeetingType('2026-04-29')).toBe('')
    expect(service.getMeetingType('2026-05-06')).toBe('📆 (Planning Web)')
    expect(service.getMeetingType('2026-05-20')).toBe('📆 (Planning Web)')
  })

  it('uses the configured Spotlight rotation phase for the whole week', () => {
    const service = createService({
      spotlightRotationStartDate: '2026-04-29',
      spotlightRotationStartTeam: 'Mobile',
    })

    expect(service.getMeetingType('2026-05-01')).toBe('📆 (Spotlight - Mobile)')
    expect(service.getMeetingType('2026-05-08')).toBe('📆 (Spotlight - Web)')
    expect(service.getMeetingType('2026-05-15')).toBe('📆 (Spotlight - Devops)')
  })
})
