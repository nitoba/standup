import { defineConfig } from 'drizzle-kit'

function normalizeDatabaseUrl(url: string): string {
  if (
    url === ':memory:' ||
    url.startsWith('file:') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('ws://') ||
    url.startsWith('wss://') ||
    url.startsWith('libsql://') ||
    url.startsWith('turso://')
  ) {
    return url
  }

  return `file:${url}`
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './src/migrations',
  dialect: 'turso',

  dbCredentials: {
    url: normalizeDatabaseUrl(Bun.env.DATABASE_URL!),
    authToken: Bun.env.DATABASE_AUTH_TOKEN,
  },
})
