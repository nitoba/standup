import 'reflect-metadata'
import { HonoAdapter, type NestHonoApplication } from '@kiyasov/platform-hono'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { AppModule } from './app.module'
import { EnvService } from './shared/env/env.service'

async function bootstrap() {
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

  await app.listen(env.app.port)
}

void bootstrap()
