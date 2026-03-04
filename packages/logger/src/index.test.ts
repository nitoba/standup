import { describe, expect, it } from 'vitest'
import { buildLogScope } from './index'

describe('buildLogScope', () => {
  it('returns service only when component is undefined', () => {
    expect(buildLogScope('worker')).toBe('worker')
  })

  it('returns service and component when component exists', () => {
    expect(buildLogScope('worker', 'scheduler')).toBe('worker:scheduler')
  })
})
