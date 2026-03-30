import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { IsValidTimezone } from './is-valid-timezone.validator'

class TestDto {
  @IsValidTimezone()
  timezone!: string
}

describe('IsValidTimezone', () => {
  it('aceita timezone IANA válido', async () => {
    const dto = Object.assign(new TestDto(), { timezone: 'America/Sao_Paulo' })
    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('aceita UTC', async () => {
    const dto = Object.assign(new TestDto(), { timezone: 'UTC' })
    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('rejeita string completamente inválida', async () => {
    const dto = Object.assign(new TestDto(), { timezone: 'foobar/timezone' })
    const errors = await validate(dto)
    expect(errors.some((e) => e.constraints?.isValidTimezone)).toBe(true)
  })

  it('rejeita string com espaço', async () => {
    const dto = Object.assign(new TestDto(), { timezone: 'America/ Sao_Paulo' })
    const errors = await validate(dto)
    expect(errors.some((e) => e.constraints?.isValidTimezone)).toBe(true)
  })
})
