#!/usr/bin/env bash

# ==========================
# CORES ANSI PARA OUTPUT
# ==========================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Função para imprimir com cor
print_color() {
    printf "${1}${2}${NC}\n"
}

# Função para barra de progresso simples
show_progress() {
    local step=$1
    local total=$2
    local message=$3
    local percent=$(( (step * 100) / total ))
    printf "\r${BLUE}[Progress: %d/%d] %s${NC}" "$step" "$total" "$message"
}

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
     *) print_color $RED "❌ Sistema operacional não suportado: $(uname -s)"; exit 1 ;;
   esac
   print_color $GREEN "✅ Sistema detectado: $OS"
}

download_executable() {
   print_color $BLUE "🔽 Baixando executável para $OS..."
   mkdir -p "$INSTALL_DIR"
   cd "$INSTALL_DIR"

   case "$OS" in
     linux) FILE_NAME="standup-linux" ;;
     mac) FILE_NAME="standup-mac" ;;
   esac

   DOWNLOAD_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/${FILE_NAME}"
   if curl -L -o "$FILE_NAME" "$DOWNLOAD_URL"; then
       print_color $GREEN "✅ Download concluído: $FILE_NAME"
       chmod +x "$FILE_NAME"
   else
       print_color $RED "❌ Falha no download."
       exit 1
   fi
}

create_package_json() {
   print_color $BLUE "📦 Criando package.json..."
   echo "$PACKAGE_JSON_CONTENT" > "$INSTALL_DIR/package.json"
   print_color $GREEN "✅ package.json criado em $INSTALL_DIR"
}

create_env_file() {
   if [ ! -f "$INSTALL_DIR/.env" ]; then
     print_color $BLUE "🧩 Criando .env padrão..."
     echo "$ENV_CONTENT" > "$INSTALL_DIR/.env"
     print_color $GREEN "✅ .env criado em $INSTALL_DIR"
			printf "${CYAN}Deseja editar o .env agora? ${NC} ${YELLOW}(y/N): ${NC}"
			read -n 1 -r REPLY
      if [[ $REPLY == "y" || $REPLY == "Y" ]]; then
         ${EDITOR:-nano} "$INSTALL_DIR/.env"
         print_color $CYAN "✅ .env editado."
     fi
   else
     print_color $YELLOW "⚙️  .env já existe — pulando criação."
   fi
}

install_bun_if_needed() {
   if ! command -v bun >/dev/null 2>&1; then
     print_color $BLUE "🍞 Bun não encontrado, instalando..."
     if curl -fsSL https://bun.sh/install | bash; then
         export BUN_INSTALL="$HOME/.bun"
         export PATH="$BUN_INSTALL/bin:$PATH"
         print_color $GREEN "✅ Bun instalado com sucesso."
     else
         print_color $RED "❌ Falha na instalação do Bun."
         exit 1
     fi
   else
     print_color $GREEN "✅ Bun já instalado."
   fi
}

install_dependencies() {
   print_color $BLUE "📦 Instalando dependências..."
   cd "$INSTALL_DIR"
   if bun install; then
       print_color $GREEN "✅ Dependências instaladas."
   else
       print_color $RED "❌ Falha na instalação das dependências."
       exit 1
   fi
}

create_alias() {
   print_color $BLUE "🔗 Criando alias 'standup'..."
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
         print_color $GREEN "✅ Alias adicionado ao $FISH_CONFIG"
       else
         print_color $YELLOW "⚙️ Alias já existe em $FISH_CONFIG"
       fi
       ;;
     zsh)
       local SHELL_RC="$HOME/.zshrc"
       local ALIAS_CMD="alias standup='(cd $INSTALL_DIR && ./$EXEC_NAME)'"
       if ! grep -q "alias standup=" "$SHELL_RC" 2>/dev/null; then
         echo "$ALIAS_CMD" >> "$SHELL_RC"
         print_color $GREEN "✅ Alias adicionado ao $SHELL_RC"
       else
         print_color $YELLOW "⚙️ Alias já existe em $SHELL_RC"
       fi
       ;;
     bash|*)
       local SHELL_RC="$HOME/.bashrc"
       local ALIAS_CMD="alias standup='(cd $INSTALL_DIR && ./$EXEC_NAME)'"
       if ! grep -q "alias standup=" "$SHELL_RC" 2>/dev/null; then
         echo "$ALIAS_CMD" >> "$SHELL_RC"
         print_color $GREEN "✅ Alias adicionado ao $SHELL_RC"
       else
         print_color $YELLOW "⚙️ Alias já existe em $SHELL_RC"
       fi
       ;;
   esac
}


reload_shell() {
   print_color $BLUE "🔁 Recarregando shell para aplicar o alias..."
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

   print_color $GREEN "✅ Alias recarregado — o comando 'standup' já está disponível!"
}


# ==========================
# EXECUÇÃO
# ==========================
TOTAL_STEPS=7
CURRENT_STEP=0

print_color $GREEN "🚀 Iniciando instalação do Standup..."
echo ""

# Função para avançar passo
next_step() {
    ((CURRENT_STEP++))
    show_progress $CURRENT_STEP $TOTAL_STEPS "$1"
    echo ""
}

# Confirmação inicial

# imprime a pergunta colorida SEM pular linha
printf "${CYAN}Deseja prosseguir com a instalação?${NC} ${YELLOW}(y/N): ${NC}"
# lê a resposta na MESMA linha
read -n 1 -r REPLY
echo  # só pula linha depois da leitura

if [[ $REPLY != "y" && $REPLY != "Y" ]]; then
    print_color $RED "Instalação cancelada pelo usuário."
    exit 1
fi


next_step "Detectando sistema operacional..."
detect_os

next_step "Baixando executável..."
download_executable

next_step "Criando package.json..."
create_package_json

next_step "Configurando .env..."
create_env_file

next_step "Verificando e instalando Bun..."
install_bun_if_needed

next_step "Instalando dependências..."
install_dependencies

next_step "Criando alias e recarregando shell..."
create_alias
reload_shell

echo ""
print_color $GREEN "🎉 Instalação concluída com sucesso!"
print_color $CYAN "➡️ Agora você pode executar: standup"
