import { defineConfig } from 'drizzle-kit'

console.log(Bun.env.DATABASE_URL)

export default defineConfig({
  schema: './src/schema.ts',
  out: './src/migrations',
  dialect: 'turso',

  dbCredentials: {
    url: Bun.env.DATABASE_URL!,
    authToken: Bun.env.DATABASE_AUTH_TOKEN,
  },
})
