import { UnauthorizedException } from '@nestjs/common'
import type { AuthSession } from './auth-session'

export function requireSessionUserId(session: AuthSession | null): string {
  const userId = session?.user.id

  if (!userId) {
    throw new UnauthorizedException()
  }

  return userId
}
