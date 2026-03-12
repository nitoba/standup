import { readFileSync } from "node:fs";
import type { Context } from "hono";
import type { FC } from "hono/jsx";

// `import ... with { type: "file" }` makes bun bundle the asset into the
// compiled binary (bun build --compile).  At runtime the import resolves to
// the embedded file path, so readFileSync works both locally and in the
// standalone executable without any external file dependency.
import avatarFilePath from "../../../public/avatar.webp" with { type: "file" };

const AVATAR_DATA_URI = `data:image/webp;base64,${readFileSync(avatarFilePath).toString("base64")}`;

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes checkDraw {
  from { stroke-dashoffset: 60; opacity: 0; }
  to   { stroke-dashoffset: 0;  opacity: 1; }
}

@keyframes ringPulse {
  0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.35); }
  70%  { box-shadow: 0 0 0 14px rgba(34, 197, 94, 0); }
  100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

body {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, 'Courier New', monospace;
  background: #0a0e1a;
  color: #c9d1d9;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 1.5rem;
  position: relative;
  overflow: hidden;
}

.bg-grid {
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(34, 197, 94, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(34, 197, 94, 0.03) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
  z-index: 0;
}

.bg-glow {
  position: fixed;
  top: -20%;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 400px;
  background: radial-gradient(ellipse, rgba(34, 197, 94, 0.07) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

.card {
  position: relative;
  z-index: 1;
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 8px;
  padding: 2.5rem 2.25rem 2.25rem;
  text-align: center;
  width: 100%;
  max-width: 440px;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.03),
    0 8px 32px rgba(0, 0, 0, 0.6),
    0 0 60px rgba(34, 197, 94, 0.04);
  animation: fadeIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 1.75rem;
  padding-bottom: 0.875rem;
  border-bottom: 1px solid #21262d;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.avatar {
  display: block;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #21262d;
  margin: 0 auto 1.25rem;
  opacity: 0.92;
}

.check-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 1.5rem;
}

.check-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.1);
  border: 2px solid rgba(34, 197, 94, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ringPulse 1.8s ease-out 0.3s both;
}

.prompt-line {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 0.625rem;
}

.prompt-symbol {
  color: #22c55e;
  font-size: 0.95rem;
  font-weight: 700;
  user-select: none;
}

.title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #f0f6fc;
  letter-spacing: -0.01em;
}

.subtitle {
  color: #8b949e;
  font-size: 0.85rem;
  line-height: 1.65;
  margin-bottom: 1.5rem;
}

.command-badge {
  display: inline-block;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.25);
  border-radius: 4px;
  padding: 0.1rem 0.45rem;
  vertical-align: baseline;
}

.divider {
  border: none;
  border-top: 1px solid #21262d;
  margin: 0 0 1.25rem;
}

.hint {
  font-size: 0.775rem;
  color: #484f58;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
}

.cursor {
  display: inline-block;
  width: 7px;
  height: 0.875em;
  background: #484f58;
  border-radius: 1px;
  vertical-align: middle;
  animation: blink 1.1s step-end infinite;
}
`;

const AuthCallbackPage: FC = () => {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Login - Standup Bot</title>
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      </head>
      <body>
        {/* background decoration */}
        <div class="bg-grid" aria-hidden="true" />
        <div class="bg-glow" aria-hidden="true" />

        <main class="card">
          {/* faux window chrome */}
          <div class="card-header" aria-hidden="true">
            <span class="dot" style="background:#ff5f57;" />
            <span class="dot" style="background:#febc2e;" />
            <span class="dot" style="background:#28c840;" />
          </div>

          {/* bot avatar */}
          <img src={AVATAR_DATA_URI} alt="Standup Bot" class="avatar" />

          {/* animated checkmark */}
          <div class="check-wrap">
            <div class="check-circle">
              <svg
                width="30"
                height="30"
                viewBox="0 0 30 30"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-label="Login bem-sucedido"
                role="img"
              >
                <title>Login bem-sucedido</title>
                <path
                  d="M6 15.5L12.5 22L24 9"
                  stroke="#22c55e"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-dasharray="60"
                  stroke-dashoffset="60"
                  style="animation: checkDraw 0.55s cubic-bezier(0.16,1,0.3,1) 0.25s forwards;"
                />
              </svg>
            </div>
          </div>

          {/* title */}
          <div class="prompt-line">
            <span class="prompt-symbol" aria-hidden="true">
              $
            </span>
            <h1 class="title">auth.login --status=success</h1>
          </div>

          {/* description */}
          <p class="subtitle">
            Autenticação concluída. Você já pode usar o comando{" "}
            <code class="command-badge">/standup</code> no Discord.
          </p>

          <hr class="divider" />

          {/* close hint */}
          <p class="hint">
            <span>esta aba pode ser fechada</span>
            <span class="cursor" />
          </p>
        </main>
      </body>
    </html>
  );
};

/**
 * Página de callback após OAuth bem-sucedido.
 * Renderiza componente JSX via hono/jsx com CSS inline (sem hono/css para evitar
 * "document is not defined" no SSR do Bun).
 */
export function handleAuthCallback(c: Context): Response | Promise<Response> {
  return c.html(<AuthCallbackPage />);
}
