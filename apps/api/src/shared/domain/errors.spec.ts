import { describe, expect, it } from 'vitest'
import { AllProvidersUnavailableError } from './errors'

describe('AllProvidersUnavailableError', () => {
  it('creates error with tag and message', () => {
    const error = new AllProvidersUnavailableError({
      message: 'All 6 models exhausted',
      modelsAttempted: 6,
    })

    expect(error._tag).toBe('AllProvidersUnavailableError')
    expect(error.message).toBe('All 6 models exhausted')
    expect(error.modelsAttempted).toBe(6)
  })
})
