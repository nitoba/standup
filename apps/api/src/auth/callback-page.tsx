import type { Context } from 'hono'
import { css, Style } from 'hono/css'
import type { FC } from 'hono/jsx'

const containerClass = css`
  font-family: system-ui, -apple-system, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  margin: 0;
`

const cardClass = css`
  background: #16213e;
  border-radius: 12px;
  padding: 2.5rem;
  text-align: center;
  max-width: 420px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
`

const checkClass = css`
  font-size: 3.5rem;
  margin-bottom: 1rem;
  color: #2ecc71;
`

const titleClass = css`
  font-size: 1.4rem;
  margin: 0 0 0.75rem;
  font-weight: 600;
`

const subtitleClass = css`
  color: #a0a0a0;
  margin: 0;
  line-height: 1.5;
`

const hintClass = css`
  margin-top: 1.5rem;
  font-size: 0.85rem;
  color: #666;
`

const AuthCallbackPage: FC = () => {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Login - Standup Bot</title>
        <Style />
      </head>
      <body class={containerClass}>
        <div class={cardClass}>
          <div class={checkClass}>&#10003;</div>
          <h1 class={titleClass}>Login realizado com sucesso!</h1>
          <p class={subtitleClass}>
            Voce ja pode usar os comandos <strong>/standup</strong> no Discord.
          </p>
          <p class={hintClass}>Pode fechar esta aba.</p>
        </div>
      </body>
    </html>
  )
}

/**
 * Pagina de callback apos OAuth bem-sucedido.
 * Renderiza componente JSX via hono/jsx com CSS-in-JS (hono/css).
 */
export function handleAuthCallback(c: Context): Response | Promise<Response> {
  return c.html(<AuthCallbackPage />)
}
