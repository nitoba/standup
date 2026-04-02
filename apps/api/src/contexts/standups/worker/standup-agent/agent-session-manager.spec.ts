import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentSessionManager } from './agent-session-manager'

describe('AgentSessionManager', () => {
  let manager: AgentSessionManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new AgentSessionManager()
  })

  afterEach(() => {
    manager.onModuleDestroy()
    vi.useRealTimers()
  })

  it('creates and retrieves a session', () => {
    const fakeAgent = { state: { messages: [] } } as never
    manager.create('standup-1', fakeAgent)
    expect(manager.get('standup-1')).toBe(fakeAgent)
  })

  it('returns null for nonexistent session', () => {
    expect(manager.get('nonexistent')).toBeNull()
  })

  it('returns null and removes session after TTL expires', () => {
    const fakeAgent = { state: { messages: [] } } as never
    manager.create('standup-1', fakeAgent)
    vi.advanceTimersByTime(31 * 60 * 1000)
    expect(manager.get('standup-1')).toBeNull()
    expect(manager.has('standup-1')).toBe(false)
  })

  it('resets TTL on get()', () => {
    const fakeAgent = { state: { messages: [] } } as never
    manager.create('standup-1', fakeAgent)
    vi.advanceTimersByTime(20 * 60 * 1000)
    manager.get('standup-1') // reset TTL
    vi.advanceTimersByTime(20 * 60 * 1000)
    expect(manager.get('standup-1')).toBe(fakeAgent) // still alive
  })

  it('destroys a session', () => {
    const fakeAgent = { state: { messages: [] } } as never
    manager.create('standup-1', fakeAgent)
    manager.destroy('standup-1')
    expect(manager.get('standup-1')).toBeNull()
  })

  it('destroy is idempotent for nonexistent session', () => {
    expect(() => manager.destroy('nonexistent')).not.toThrow()
  })

  it('has() returns true for active session', () => {
    const fakeAgent = { state: { messages: [] } } as never
    manager.create('standup-1', fakeAgent)
    expect(manager.has('standup-1')).toBe(true)
  })

  it('has() returns false for expired session', () => {
    const fakeAgent = { state: { messages: [] } } as never
    manager.create('standup-1', fakeAgent)
    vi.advanceTimersByTime(31 * 60 * 1000)
    expect(manager.has('standup-1')).toBe(false)
  })

  it('cleanup interval removes expired sessions', () => {
    const fakeAgent = { state: { messages: [] } } as never
    manager.create('standup-1', fakeAgent)
    manager.create('standup-2', fakeAgent)
    manager.onModuleInit()
    vi.advanceTimersByTime(31 * 60 * 1000) // expire both
    vi.advanceTimersByTime(5 * 60 * 1000) // trigger cleanup
    expect(manager.has('standup-1')).toBe(false)
    expect(manager.has('standup-2')).toBe(false)
  })

  it('create overwrites existing session for same standupId', () => {
    const agent1 = { id: 1 } as never
    const agent2 = { id: 2 } as never
    manager.create('standup-1', agent1)
    manager.create('standup-1', agent2)
    expect(manager.get('standup-1')).toBe(agent2)
  })
})
