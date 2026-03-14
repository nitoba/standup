import { Controller, Get } from '@nestjs/common'

@Controller()
export class HealthController {
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'standup-api',
      uptimeSeconds: Math.floor(process.uptime()),
    }
  }

  @Get('ready')
  getReady() {
    return { status: 'ready' }
  }
}
