import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common'
import { Session } from '@thallesp/nestjs-better-auth'
import { WeeklyDigestDispatchService } from './weekly-digest-dispatch.service'

type AuthSession = {
  user: {
    id: string
  }
}

@Controller('digests')
export class DigestsController {
  constructor(
    private readonly weeklyDigestDispatch: WeeklyDigestDispatchService,
  ) {}

  @Post('trigger')
  @HttpCode(202)
  trigger(
    @Session() session: AuthSession | null,
    @Body('userId') bodyUserId?: string,
  ) {
    const userId = bodyUserId ?? session?.user.id

    if (!userId) {
      throw new BadRequestException('Could not resolve userId')
    }

    this.weeklyDigestDispatch.dispatchWeeklyDigestJob({ userId })

    return { ok: true, accepted: true }
  }
}
