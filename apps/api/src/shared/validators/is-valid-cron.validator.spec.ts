import { IsString, MinLength, validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { IsValidCron } from './is-valid-cron.validator'

class TestDto {
  @IsString()
  @MinLength(1)
  @IsValidCron()
  cron!: string
}

describe('IsValidCron', () => {
  it('deve aceitar cron válido (horário diário)', async () => {
    const dto = Object.assign(new TestDto(), { cron: '0 17 * * 1-5' })
    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('deve aceitar cron de execução por minuto', async () => {
    const dto = Object.assign(new TestDto(), { cron: '*/5 * * * *' })
    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('deve rejeitar string completamente inválida', async () => {
    const dto = Object.assign(new TestDto(), { cron: 'foobar' })
    const errors = await validate(dto)
    expect(errors.some((e) => e.constraints?.isValidCron)).toBe(true)
  })

  it('deve rejeitar string com campos a menos', async () => {
    const dto = Object.assign(new TestDto(), { cron: '* * *' })
    const errors = await validate(dto)
    expect(errors.some((e) => e.constraints?.isValidCron)).toBe(true)
  })

  it('deve rejeitar string vazia (MinLength pega primeiro)', async () => {
    const dto = Object.assign(new TestDto(), { cron: '' })
    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
  })
})
