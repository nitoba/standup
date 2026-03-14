import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/shared/database/schema.ts',
  out: './src/shared/database/migrations',
  dialect: 'turso',
  dbCredentials: {
    url: Bun.env.DATABASE_URL!,
    authToken: Bun.env.DATABASE_AUTH_TOKEN,
  },
})
