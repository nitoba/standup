import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { StandupDatabase } from "../../shared/database/database.service";
import type { EnvService } from "../../shared/env/env.service";

type CreateBetterAuthOptions = {
  env: EnvService;
  db: StandupDatabase;
};

export function createBetterAuth({ env, db }: CreateBetterAuthOptions) {
  const socialProviders =
    env.auth.discordClientId && env.auth.discordClientSecret
      ? {
          discord: {
            clientId: env.auth.discordClientId,
            clientSecret: env.auth.discordClientSecret,
            permissions: 2048 | 16384,
          },
        }
      : {};

  return betterAuth({
    appName: "Standup",
    database: drizzleAdapter(db, { provider: "sqlite" }),
    secret: env.auth.secret,
    baseURL: env.auth.baseUrl,
    trustedOrigins: [env.app.corsOrigin],
    socialProviders,
    advanced: {
      cookiePrefix: "standup",
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    hooks: {},
  });
}
