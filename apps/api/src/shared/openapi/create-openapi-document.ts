import type { INestApplication } from '@nestjs/common'
import type { OpenAPIObject } from '@nestjs/swagger'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import type { EnvService } from '../env/env.service'

export function createOpenApiDocument(
  app: INestApplication,
  env: EnvService,
): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Standup API')
    .setDescription(
      'API do serviço de geração, revisão e publicação de standups.',
    )
    .setVersion('0.0.1')
    .addServer(env.auth.baseUrl, 'API')
    .build()

  return SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
    autoTagControllers: false,
  })
}
