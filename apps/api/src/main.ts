import 'reflect-metadata'
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response'
import { HonoAdapter, type NestHonoApplication } from '@kiyasov/platform-hono'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { toNodeHandler } from 'better-auth/node'
import { cors } from 'hono/cors'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { AppModule } from './app.module'
import { BetterAuthFactory } from './contexts/identity/better-auth.factory'
import { formatSseEvent } from './contexts/standups/events/standup-events.controller'
import { StandupSseBusService } from './contexts/standups/events/standup-sse-bus.service'
import { EnvService } from './platform/env/env.service'
import { startOpenTelemetry } from './platform/observability/tracing'
import { createOpenApiDocument } from './shared/openapi/create-openapi-document'
import { OPENAPI_JSON_PATH } from './shared/openapi/openapi.constants'

async function bootstrap() {
  await startOpenTelemetry()

  const adapter = new HonoAdapter()

  // CORS origin is read from env after DI is ready; default to localhost:4200
  // for the early Hono routes registered before NestFactory.create().
  let corsOrigin = 'http://localhost:4200'

  // Mount Better Auth routes BEFORE NestFactory.create() so the handler runs
  // before the Hono adapter's body-parsing middleware consumes the request stream.
  // The @thallesp/nestjs-better-auth library's httpAdapter.use() is incompatible
  // with the Hono adapter (empty path never matches, HonoRequest != IncomingMessage).
  // We use a deferred handler that is assigned once the DI container is ready.
  // biome-ignore lint/suspicious/noExplicitAny: deferred handler typed at assignment
  let authHandler: ((req: any, res: any) => Promise<void>) | null = null
  // biome-ignore lint/suspicious/noExplicitAny: Hono ctx.env types from @hono/node-server
  adapter.getInstance().all('/api/auth/*', async (ctx: any) => {
    if (!authHandler) {
      return ctx.text('Auth not initialized', 503)
    }
    // CORS headers must be set on the raw Node.js ServerResponse because
    // toNodeHandler writes directly to it, bypassing Hono's response pipeline.
    const origin = ctx.req.header('origin')
    const res = ctx.env.outgoing
    if (origin === corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader('Vary', 'Origin')
    }
    if (ctx.req.method === 'OPTIONS') {
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      )
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type,Authorization',
      )
      res.setHeader('Access-Control-Max-Age', '86400')
      res.writeHead(204)
      res.end()
      return RESPONSE_ALREADY_SENT
    }
    await authHandler(ctx.env.incoming, res)
    return RESPONSE_ALREADY_SENT
  })

  const app = await NestFactory.create<NestHonoApplication>(
    AppModule,
    adapter,
    { bufferLogs: true },
  )
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER))
  const env = app.get(EnvService)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  )

  corsOrigin = env.app.corsOrigin
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  })
  app.enableShutdownHooks()

  // Now that DI is ready, wire up the auth handler
  const betterAuthFactory = app.get(BetterAuthFactory)
  authHandler = toNodeHandler(betterAuthFactory.create())

  // Mount SSE endpoint directly on the Hono instance.
  // NestJS's @Sse() / res.write() is incompatible with the Hono adapter, and
  // writing to env.outgoing then returning from a NestJS controller causes
  // @hono/node-server to attempt a second writeHead. By handling it here we
  // return RESPONSE_ALREADY_SENT cleanly.
  const standupSseBus = app.get(StandupSseBusService)
  // biome-ignore lint/suspicious/noExplicitAny: Hono ctx.env from @hono/node-server
  adapter.getInstance().get('/standups/events', async (ctx: any) => {
    // Validate session via Better Auth cookie
    const sessionRes = await betterAuthFactory
      .create()
      .api.getSession({ headers: ctx.req.raw.headers })
    const userId = sessionRes?.user?.id
    if (!userId) {
      return ctx.json({ statusCode: 401, message: 'Unauthorized' }, 401)
    }

    const nodeRes = ctx.env.outgoing
    // CORS for EventSource (browser sends Origin header)
    const origin = ctx.req.header('origin')
    if (origin === corsOrigin) {
      nodeRes.setHeader('Access-Control-Allow-Origin', origin)
      nodeRes.setHeader('Access-Control-Allow-Credentials', 'true')
      nodeRes.setHeader('Vary', 'Origin')
    }

    nodeRes.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const subscription = standupSseBus.subscribe(userId).subscribe({
      next: (event) => nodeRes.write(formatSseEvent(event)),
      error: () => nodeRes.end(),
      complete: () => nodeRes.end(),
    })

    nodeRes.on('close', () => subscription.unsubscribe())

    return RESPONSE_ALREADY_SENT
  })

  // Build the OpenAPI document and serve it from a Hono route.
  // SwaggerModule.setup() uses Express-style res.type() which is incompatible
  // with the Hono adapter, so we serve the JSON directly.
  const openApiDocument = createOpenApiDocument(app, env, betterAuthFactory)
  // biome-ignore lint/suspicious/noExplicitAny: Hono context type
  adapter.getInstance().get(OPENAPI_JSON_PATH, (ctx: any) => {
    return ctx.json(openApiDocument)
  })

  await app.listen(env.app.port)
}

void bootstrap()
