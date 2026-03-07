import type { Context } from 'hono'

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - Standup Bot</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #16213e; border-radius: 12px; padding: 2rem; text-align: center; max-width: 400px; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    .check { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
    p { color: #a0a0a0; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">&#10003;</div>
    <h1>Login realizado com sucesso!</h1>
    <p>Voce ja pode usar os comandos /standup no Discord.</p>
    <p style="margin-top: 1rem; font-size: 0.85rem; color: #666;">Pode fechar esta aba.</p>
  </div>
</body>
</html>`

/**
 * Página de callback após OAuth bem-sucedido.
 * Mostra mensagem simples indicando que o usuário pode voltar ao Discord.
 */
export function handleAuthCallback(c: Context): Response {
  return c.html(SUCCESS_HTML)
}
