import { describe, expect, it } from 'vitest'

describe('API structure', () => {
  it('exposes the new top-level Nest entrypoints', async () => {
    const modules = await Promise.all([
      import('../contexts/identity/identity.module'),
      import('../contexts/preferences/preferences.module'),
      import('../contexts/standups/standups.module'),
      import('../interfaces/discord/discord.module'),
      import('../interfaces/email/email.module'),
      import('../platform/database/database.module'),
      import('../platform/env/env.module'),
      import('../platform/events/events.module'),
      import('../platform/http/http.module'),
      import('../platform/logger/logger.module'),
      import('../platform/observability/observability.module'),
      import('../platform/time/time.module'),
    ])

    expect(modules).toHaveLength(12)
  })
})
