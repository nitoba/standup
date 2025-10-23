#!/usr/bin/env bash
set -e
# ==========================
# CONFIGURAÇÕES DO PROJETO
# ==========================
REPO_OWNER="nitoba"
REPO_NAME="standup"
INSTALL_DIR="$HOME/.standup"      # Pasta de instalação

PACKAGE_JSON_CONTENT='{
  "name": "standup",
  "module": "src/index.tsx",
  "type": "module",
  "private": true,
  "dependencies": {
    "@opentui/core": "^0.1.27"
  }
}'

ENV_CONTENT='# User Configuration (Optional - auto-detected from git config if not provided)
GIT_AUTHOR_NAME=
GIT_AUTHOR_EMAIL=
AZURE_DEVOPS_USER_EMAIL=
AZURE_DEVOPS_USER_DISPLAY_NAME=
AZURE_DEVOPS_PAT=

# Repository Configuration
REPOSITORIES_FOLDER=
GOOGLE_GENERATIVE_AI_API_KEY=
'

# ==========================
# FUNÇÕES AUXILIARES
# ==========================
detect_os() {
  case "$(uname -s)" in
    Linux*)   OS="linux" ;;
    Darwin*)  OS="mac" ;;
    *) echo "❌ Sistema operacional não suportado: $(uname -s)"; exit 1 ;;
  esac
}

download_executable() {
  echo "🔽 Baixando executável para $OS..."
  mkdir -p "$INSTALL_DIR"
  cd "$INSTALL_DIR"

  case "$OS" in
    linux) FILE_NAME="standup-linux" ;;
    mac) FILE_NAME="standup-mac" ;;
  esac

  DOWNLOAD_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/${FILE_NAME}"
  curl -L -o "$FILE_NAME" "$DOWNLOAD_URL"
  chmod +x "$FILE_NAME"
}

create_package_json() {
  echo "📦 Criando package.json..."
  echo "$PACKAGE_JSON_CONTENT" > "$INSTALL_DIR/package.json"
}

create_env_file() {
  if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo "🧩 Criando .env padrão..."
    echo "$ENV_CONTENT" > "$INSTALL_DIR/.env"
  else
    echo "⚙️  .env já existe — pulando criação."
  fi
}

install_bun_if_needed() {
  if ! command -v bun >/dev/null 2>&1; then
    echo "🍞 Bun não encontrado, instalando..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
  else
    echo "✅ Bun já instalado."
  fi
}

create_alias() {
  echo "🔗 Criando alias 'standup'..."
  local EXEC_NAME="standup-$OS"

  # Detecta o shell em uso
  local SHELL_NAME
  SHELL_NAME=$(basename "$SHELL")

  case "$SHELL_NAME" in
    fish)
      local FISH_CONFIG="$HOME/.config/fish/config.fish"
      local ALIAS_CMD="alias standup \"cd $INSTALL_DIR; ./$EXEC_NAME\""
      mkdir -p "$(dirname "$FISH_CONFIG")"
      # adiciona 2 linhas em branco antes do alias para evitar 'endalias'
      if ! grep -q "alias standup" "$FISH_CONFIG" 2>/dev/null; then
        echo -e "\n\n$ALIAS_CMD" >> "$FISH_CONFIG"
        echo "✅ Alias adicionado ao $FISH_CONFIG"
      else
        echo "⚙️ Alias já existe em $FISH_CONFIG"
      fi
      ;;
    zsh)
      local SHELL_RC="$HOME/.zshrc"
      local ALIAS_CMD="alias standup='(cd $INSTALL_DIR && ./$EXEC_NAME)'"
      if ! grep -q "alias standup=" "$SHELL_RC" 2>/dev/null; then
        echo "$ALIAS_CMD" >> "$SHELL_RC"
        echo "✅ Alias adicionado ao $SHELL_RC"
      else
        echo "⚙️ Alias já existe em $SHELL_RC"
      fi
      ;;
    bash|*)
      local SHELL_RC="$HOME/.bashrc"
      local ALIAS_CMD="alias standup='(cd $INSTALL_DIR && ./$EXEC_NAME)'"
      if ! grep -q "alias standup=" "$SHELL_RC" 2>/dev/null; then
        echo "$ALIAS_CMD" >> "$SHELL_RC"
        echo "✅ Alias adicionado ao $SHELL_RC"
      else
        echo "⚙️ Alias já existe em $SHELL_RC"
      fi
      ;;
  esac
}


reload_shell() {
  echo ""
  echo "🔁 Recarregando shell para aplicar o alias..."
  local SHELL_NAME
  SHELL_NAME=$(basename "$SHELL")

  case "$SHELL_NAME" in
    fish)
      local FISH_CONFIG="$HOME/.config/fish/config.fish"
      if [ -f "$FISH_CONFIG" ]; then
        fish -c "source $FISH_CONFIG"
      fi
      ;;
    zsh)
      local ZSHRC="$HOME/.zshrc"
      if [ -f "$ZSHRC" ]; then
        source "$ZSHRC"
      fi
      ;;
    bash|*)
      local BASHRC="$HOME/.bashrc"
      if [ -f "$BASHRC" ]; then
        source "$BASHRC"
      fi
      ;;
  esac

  echo "✅ Alias recarregado — o comando 'standup' já está disponível!"
}


# ==========================
# EXECUÇÃO
# ==========================
echo "🚀 Iniciando instalação do Standup..."
detect_os
download_executable
create_package_json
create_env_file
install_bun_if_needed
create_alias
reload_shell

echo ""
echo "🎉 Instalação concluída com sucesso!"
echo "➡️ Agora você pode executar: standup"
