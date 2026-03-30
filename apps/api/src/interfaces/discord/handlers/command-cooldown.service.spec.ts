import { describe, expect, it, vi } from 'vitest'
import { CommandCooldownService } from './command-cooldown.service'

describe('CommandCooldownService', () => {
  it('permite o primeiro uso (sem cooldown)', () => {
    const svc = new CommandCooldownService()
    expect(svc.check('user1', 'trigger')).toBeNull()
  })

  it('bloqueia segundo uso dentro do cooldown', () => {
    const svc = new CommandCooldownService()
    svc.record('user1', 'trigger')
    const remaining = svc.check('user1', 'trigger')
    expect(remaining).not.toBeNull()
    expect(remaining).toBeGreaterThan(0)
  })

  it('retorna segundos restantes aproximados', () => {
    const svc = new CommandCooldownService()
    svc.record('user1', 'trigger')
    const remaining = svc.check('user1', 'trigger')
    // 5 minutos - execução quase imediata = ~300s
    expect(remaining).toBeLessThanOrEqual(300)
    expect(remaining).toBeGreaterThan(290)
  })

  it('permite uso após cooldown expirar', () => {
    vi.useFakeTimers()
    const svc = new CommandCooldownService()
    svc.record('user1', 'trigger')
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    expect(svc.check('user1', 'trigger')).toBeNull()
    vi.useRealTimers()
  })

  it('cooldown é por usuário+comando — não afeta outros usuários', () => {
    const svc = new CommandCooldownService()
    svc.record('user1', 'trigger')
    expect(svc.check('user2', 'trigger')).toBeNull()
  })

  it('cooldown é por comando — não afeta outros comandos do mesmo usuário', () => {
    const svc = new CommandCooldownService()
    svc.record('user1', 'trigger')
    expect(svc.check('user1', 'list')).toBeNull()
  })
})
