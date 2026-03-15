import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/platform/database/schema.ts",
  out: "./src/platform/database/migrations",
  dialect: "turso",
  dbCredentials: {
    url: Bun.env.DATABASE_URL!,
    authToken: Bun.env.DATABASE_AUTH_TOKEN,
  },
});
