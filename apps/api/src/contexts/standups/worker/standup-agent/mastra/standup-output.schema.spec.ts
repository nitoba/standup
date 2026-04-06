import { describe, expect, it } from 'vitest'
import { standupOutputSchema } from './standup-output.schema'

describe('standupOutputSchema', () => {
  it('should accept valid standup output', () => {
    const result = standupOutputSchema.safeParse({
      content: 'Standup content here',
      summary: 'Brief summary',
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      content: 'Standup content here',
      summary: 'Brief summary',
    })
  })

  it('should reject missing content', () => {
    const result = standupOutputSchema.safeParse({
      summary: 'Brief summary',
    })

    expect(result.success).toBe(false)
  })

  it('should default summary to empty string when missing', () => {
    const result = standupOutputSchema.safeParse({
      content: 'Standup content here',
    })

    expect(result.success).toBe(true)
    expect(result.data?.summary).toBe('')
  })
})
