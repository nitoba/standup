import type { INestApplication } from '@nestjs/common'
import type { OpenAPIObject } from '@nestjs/swagger'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import type { BetterAuthFactory } from '../../modules/auth/better-auth.factory'
import type { EnvService } from '../module/env/env.service'
import { mergeBetterAuthOpenApi } from './merge-better-auth-openapi'

export function createOpenApiDocument(
  app: INestApplication,
  env: EnvService,
  betterAuthFactory: BetterAuthFactory,
): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Standup API')
    .setDescription(
      'API do serviço de geração, revisão e publicação de standups.',
    )
    .setVersion('0.0.1')
    .addServer(env.auth.baseUrl, 'API')
    .build()

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
    autoTagControllers: false,
  })

  return mergeBetterAuthOpenApi(
    document,
    betterAuthFactory.create() as Parameters<typeof mergeBetterAuthOpenApi>[1],
  )
}
