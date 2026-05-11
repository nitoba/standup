import type { APIEmbed } from 'discord.js'
import { LIMITS, truncate } from './internal'

export function buildUserDmEmbed(
  title: string,
  message: string,
  color: number,
): APIEmbed {
  return {
    title: truncate(title, LIMITS.TITLE),
    color,
    description: truncate(message, LIMITS.DESCRIPTION),
    footer: {
      text: truncate('standup-bot', LIMITS.FOOTER),
    },
    timestamp: new Date().toISOString(),
  }
}
