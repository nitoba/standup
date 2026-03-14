import 'reflect-metadata'
import { HonoAdapter, type NestHonoApplication } from '@kiyasov/platform-hono'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { SwaggerModule } from '@nestjs/swagger'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { AppModule } from './app.module'
import { EnvService } from './shared/env/env.service'
import { startOpenTelemetry } from './shared/observability/tracing'
import { createOpenApiDocument } from './shared/openapi/create-openapi-document'
import {
  OPENAPI_JSON_PATH,
  OPENAPI_SETUP_PATH,
} from './shared/openapi/openapi.constants'

async function bootstrap() {
  await startOpenTelemetry()

  const app = await NestFactory.create<NestHonoApplication>(
    AppModule,
    new HonoAdapter(),
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

  app.enableCors({
    origin: env.app.corsOrigin,
    credentials: true,
  })
  app.enableShutdownHooks()

  const openApiDocument = createOpenApiDocument(app, env)
  SwaggerModule.setup(OPENAPI_SETUP_PATH, app, openApiDocument, {
    ui: false,
    raw: ['json'],
    jsonDocumentUrl: OPENAPI_JSON_PATH,
  })

  await app.listen(env.app.port)
}

void bootstrap()
