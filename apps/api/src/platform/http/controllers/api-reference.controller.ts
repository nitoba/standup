import { Controller, ForbiddenException, Get, Header } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { AllowAnonymous } from '@thallesp/nestjs-better-auth'
import { SCALAR_DOCUMENTATION_PATH } from '../../../shared/openapi/openapi.constants'
import { renderScalarApiReference } from '../../../shared/openapi/render-scalar-api-reference'
import { EnvService } from '../../env/env.service'

@AllowAnonymous()
@ApiExcludeController()
@Controller()
export class ApiReferenceController {
  constructor(private readonly env: EnvService) {}

  @Get(SCALAR_DOCUMENTATION_PATH)
  @Header('content-type', 'text/html; charset=utf-8')
  getApiReference(): string {
    if (this.env.app.nodeEnv === 'production') {
      throw new ForbiddenException('API docs not available in production')
    }
    return renderScalarApiReference()
  }
}
