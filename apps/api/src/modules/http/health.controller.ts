import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

@ApiTags('infra')
@Controller()
export class HealthController {
  @Get('health')
  @ApiOperation({ summary: 'Verifica se a API está saudável' })
  @ApiOkResponse({ description: 'Estado básico da aplicação.' })
  getHealth() {
    return {
      status: 'ok',
      service: 'standup-api',
      uptimeSeconds: Math.floor(process.uptime()),
    }
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Verifica se a API está pronta para receber tráfego',
  })
  @ApiOkResponse({ description: 'Prontidão da aplicação.' })
  getReady() {
    return { status: 'ready' }
  }
}
