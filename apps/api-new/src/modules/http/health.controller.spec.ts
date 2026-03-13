import { describe, expect, it } from 'vitest'
import { HealthController } from './health.controller'

describe('HealthController', () => {
  it('retorna health', () => {
    const controller = new HealthController()
    const result = controller.getHealth()

    expect(result.status).toBe('ok')
    expect(result.service).toBe('standup-api-new')
  })
})
