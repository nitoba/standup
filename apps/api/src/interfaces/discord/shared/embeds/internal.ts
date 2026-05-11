import {
  isIsoDate,
  toDisplayDateFromIso,
} from '../../../../platform/time/date-only'

export const LIMITS = {
  TITLE: 256,
  DESCRIPTION: 4096,
  FIELD_VALUE: 1024,
  FOOTER: 2048,
} as const

export function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value
  }

  return `${value.slice(0, max - 3)}...`
}

export function displayDate(value: string): string {
  return isIsoDate(value) ? toDisplayDateFromIso(value) : value
}
