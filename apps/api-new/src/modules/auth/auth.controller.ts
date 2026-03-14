import { Controller, Get, Header } from '@nestjs/common'
import { Session } from '@thallesp/nestjs-better-auth'
import { UserRepository } from '../../shared/database/repositories/user.repository'
import { EventBusService } from '../events/event-bus.service'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly eventBus: EventBusService,
  ) {}

  @Get('session')
  getSession(@Session() session: unknown) {
    return {
      authenticated: session !== null,
      session,
    }
  }

  @Get('login/discord')
  @Header('content-type', 'text/html; charset=utf-8')
  getDiscordLoginPage(): string {
    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Conectando ao Standup Bot</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        background: #0f172a;
        color: #e2e8f0;
      }
      main {
        width: min(480px, calc(100vw - 32px));
        padding: 32px 28px;
        border: 1px solid #1e293b;
        background: #111827;
        border-radius: 16px;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
      }
      h1 { margin: 0 0 12px; font-size: 20px; }
      p { margin: 0; line-height: 1.6; color: #94a3b8; }
      code { color: #38bdf8; }
    </style>
  </head>
  <body>
    <main>
      <h1>Conectando sua conta</h1>
      <p>Você será redirecionado automaticamente para o login do Discord. Se nada acontecer, feche esta janela e tente o comando <code>/login</code> novamente.</p>
    </main>
    <script>
      void (async () => {
        try {
          const response = await fetch('/api/auth/sign-in/social', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              provider: 'discord',
              callbackURL: '/auth/callback',
            }),
          })
          const payload = await response.json()
          if (response.ok && payload?.url) {
            window.location.assign(payload.url)
            return
          }
        } catch {}
        document.body.innerHTML = '<main><h1>Falha ao iniciar login</h1><p>Não foi possível iniciar o fluxo OAuth agora. Tente novamente em alguns instantes.</p></main>'
      })()
    </script>
  </body>
</html>`
  }

  @Get('callback')
  @Header('content-type', 'text/html; charset=utf-8')
  async getAuthCallback(@Session() session: unknown): Promise<string> {
    const userId =
      typeof session === 'object' &&
      session !== null &&
      'user' in session &&
      typeof session.user === 'object' &&
      session.user !== null &&
      'id' in session.user &&
      typeof session.user.id === 'string'
        ? session.user.id
        : null

    if (userId) {
      const discordResult =
        await this.userRepository.findDiscordIdByUserId(userId)
      if (discordResult.isOk() && discordResult.value) {
        this.eventBus.requestDiscordLoginSuccess({
          discordUserId: discordResult.value,
        })
      }
    }

    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Login concluído</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        background: #08111f;
        color: #e2e8f0;
      }
      main {
        width: min(520px, calc(100vw - 32px));
        padding: 32px 28px;
        border: 1px solid #1e293b;
        background: #0f172a;
        border-radius: 16px;
        text-align: center;
      }
      h1 { margin: 0 0 12px; font-size: 22px; }
      p { margin: 0 0 20px; line-height: 1.6; color: #94a3b8; }
      button {
        border: none;
        border-radius: 10px;
        padding: 12px 16px;
        background: #22c55e;
        color: #052e16;
        font: inherit;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Login concluído com sucesso</h1>
      <p>Você já pode voltar ao Discord e usar os comandos do Standup Bot.</p>
      <button onclick="window.close()">Fechar janela</button>
    </main>
  </body>
</html>`
  }
}
