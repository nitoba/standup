import 'reflect-metadata'
import { HonoAdapter, type NestHonoApplication } from '@kiyasov/platform-hono'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { EnvService } from './shared/env/env.service'

async function bootstrap() {
  const app = await NestFactory.create<NestHonoApplication>(
    AppModule,
    new HonoAdapter(),
  )
  const env = app.get(EnvService)

  app.enableCors({
    origin: env.app.corsOrigin,
    credentials: true,
  })
  app.enableShutdownHooks()

  await app.listen(env.app.port)
}

void bootstrap()
