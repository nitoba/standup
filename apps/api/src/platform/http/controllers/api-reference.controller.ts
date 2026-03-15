import { Controller, Get, Header } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { AllowAnonymous } from '@thallesp/nestjs-better-auth'
import { SCALAR_DOCUMENTATION_PATH } from '../../../shared/openapi/openapi.constants'
import { renderScalarApiReference } from '../../../shared/openapi/render-scalar-api-reference'

@AllowAnonymous()
@ApiExcludeController()
@Controller()
export class ApiReferenceController {
  @Get(SCALAR_DOCUMENTATION_PATH)
  @Header('content-type', 'text/html; charset=utf-8')
  getApiReference(): string {
    return renderScalarApiReference()
  }
}
