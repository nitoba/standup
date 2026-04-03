/**
 * Exports the OpenAPI document as a static JSON file.
 *
 * Usage:
 *   bun run ./scripts/export-openapi.ts
 *
 * The generated file is consumed by Orval in apps/web to generate
 * typed Angular Query hooks and models.
 */
import 'reflect-metadata'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HonoAdapter, type NestHonoApplication } from '@kiyasov/platform-hono'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { BetterAuthFactory } from '../src/contexts/identity/better-auth.factory'
import { EnvService } from '../src/platform/env/env.service'
import { createOpenApiDocument } from '../src/shared/openapi/create-openapi-document'

async function main() {
  const adapter = new HonoAdapter()
  const app = await NestFactory.create<NestHonoApplication>(
    AppModule,
    adapter,
    { logger: false },
  )

  const env = app.get(EnvService)
  const betterAuthFactory = app.get(BetterAuthFactory)
  const document = createOpenApiDocument(app, env, betterAuthFactory)

  const outPath = resolve(import.meta.dirname, '..', 'openapi.json')
  writeFileSync(outPath, JSON.stringify(document, null, 2), 'utf-8')

  console.log(`OpenAPI spec written to ${outPath}`)

  await app.close()
}

void main()
