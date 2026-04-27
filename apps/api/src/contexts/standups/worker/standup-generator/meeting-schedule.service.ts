import { Injectable } from '@nestjs/common'
import { EnvService } from '../../../../platform/env/env.service'
import { shiftIsoDate } from '../../../../platform/time/date-only'
import { LocalDateService } from '../../../../platform/time/local-date.service'

const BIWEEKLY_INTERVAL_DAYS = 14
const WEEK_INTERVAL_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000
const SPOTLIGHT_TEAMS = ['Mobile', 'Web', 'Devops'] as const

type SpotlightTeam = (typeof SPOTLIGHT_TEAMS)[number]

function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`)
  const end = Date.parse(`${endDate}T00:00:00.000Z`)

  return Math.floor((end - start) / MS_PER_DAY)
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo
}

@Injectable()
export class MeetingScheduleService {
  constructor(
    private readonly localDateService: LocalDateService,
    private readonly env: EnvService,
  ) {}

  getMeetingType(dateString: string): string {
    const weekDay = this.localDateService.getDayOfWeek(dateString)

    if (weekDay === 1) return '📆 (Start of week meeting)'
    if (weekDay === 3 && this.isPlanningWebDate(dateString)) {
      return '📆 (Planning Web)'
    }
    if (weekDay === 5) {
      return `📆 (Spotlight - ${this.getSpotlightTeam(dateString)})`
    }

    return ''
  }

  private isPlanningWebDate(dateString: string): boolean {
    return (
      positiveModulo(
        daysBetween(this.env.meetings.planningWebCycleStartDate, dateString),
        BIWEEKLY_INTERVAL_DAYS,
      ) === 0
    )
  }

  private getSpotlightTeam(dateString: string): SpotlightTeam {
    const dateWeekStart = this.getWeekStartDate(dateString)
    const rotationWeekStart = this.getWeekStartDate(
      this.env.meetings.spotlightRotationStartDate,
    )
    const weekOffset = Math.floor(
      daysBetween(rotationWeekStart, dateWeekStart) / WEEK_INTERVAL_DAYS,
    )
    const startTeamIndex = SPOTLIGHT_TEAMS.indexOf(
      this.env.meetings.spotlightRotationStartTeam,
    )
    const teamIndex = positiveModulo(
      startTeamIndex + weekOffset,
      SPOTLIGHT_TEAMS.length,
    )

    return SPOTLIGHT_TEAMS[teamIndex] ?? SPOTLIGHT_TEAMS[0]
  }

  private getWeekStartDate(dateString: string): string {
    const weekDay = this.localDateService.getDayOfWeek(dateString)
    const daysSinceMonday = weekDay === 0 ? 6 : weekDay - 1

    return shiftIsoDate(dateString, -daysSinceMonday)
  }
}
