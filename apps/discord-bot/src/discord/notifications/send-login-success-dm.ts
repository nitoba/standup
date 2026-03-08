import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'send-login-success-dm',
})

export interface SendLoginSuccessDmDeps {
  client: Client
  discordUserId: string
}

/**
 * Envia DM ao usuário confirmando que o login OAuth foi concluído com sucesso.
 * Mensagem simples sem embed — feedback imediato após o OAuth callback.
 */
export async function sendLoginSuccessDm(
  deps: SendLoginSuccessDmDeps,
): Promise<Result<{ messageId: string }, ExternalServiceError>> {
  const { client, discordUserId } = deps

  return Result.tryPromise({
    try: async () => {
      const user = await client.users.fetch(discordUserId)

      const message = await user.send({
        content:
          'Login concluído com sucesso! Agora você pode usar todos os comandos do Standup Bot.',
      })

      logger.info('Login success DM sent', {
        discordUserId,
        messageId: message.id,
      })

      return { messageId: message.id }
    },
    catch: (err) =>
      new ExternalServiceError({
        service: 'discord',
        message: `Failed to send login success DM: ${err instanceof Error ? err.message : String(err)}`,
      }),
  })
}
