import { Controller, Get } from '@nestjs/common'
import { Session } from '@thallesp/nestjs-better-auth'

@Controller('auth')
export class AuthController {
  @Get('session')
  getSession(@Session() session: unknown) {
    return {
      authenticated: session !== null,
      session,
    }
  }
}
