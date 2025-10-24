# Standup

![Status](https://img.shields.io/badge/status-beta-yellow)
![Bun](https://img.shields.io/badge/runtime-bun-blue)

## Descrição

Standup é uma ferramenta que ajuda a organizar e automatizar tarefas de desenvolvimento, integrando repositórios, commits e interações do projeto. Ela fornece um executável multiplataforma fácil de instalar e usar.

---

## Requisitos

- Linux, macOS ou Windows
- Bash ou PowerShell
- Git (opcional, se desejar integração com repositórios)

---

## Instalação

### **(Linux, macOS)**

Execute o comando abaixo no terminal (Linux/macOS):

```bash
bash -c "$(curl -fsSL https://gist.githubusercontent.com/<username>/3gEhj/raw/install-standup.sh)"
```

### **(Windows)**

```bash
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://cdn.jsdelivr.net/gh/nitoba/standup@latest/scripts/install-standup.ps1 | iex"
```

O script faz automaticamente:

- Detecta o sistema operacional e baixa o executável correto (`standup-linux`, `standup-mac` ou `standup-win.exe`)
- Cria `package.json` e `.env` na pasta de instalação (`~/.standup`) se não existirem
- Instala o Bun se necessário (Linux/macOS)
- Cria o alias `standup` no seu shell (bash, zsh, fish ou PowerShell)
- Recarrega o shell automaticamente para que o comando `standup` esteja disponível imediatamente

> ⚠️ No Windows, se o alias não for recarregado automaticamente, execute manualmente no PowerShell:
>
> ```powershell
> . $PROFILE
> ```

---

## Uso

Após a instalação, basta executar:

```bash
standup
```

O comando estará disponível imediatamente no terminal.

---

## Configuração

O script cria automaticamente um arquivo `.env` com as configurações padrão. Você pode editar o arquivo para adicionar:

```env
# User Configuration (Optional)
GIT_AUTHOR_NAME=
GIT_AUTHOR_EMAIL=
AZURE_DEVOPS_USER_EMAIL=
AZURE_DEVOPS_USER_DISPLAY_NAME=
AZURE_DEVOPS_PAT=

# Repository Configuration
REPOSITORIES_FOLDER=
GOOGLE_GENERATIVE_AI_API_KEY=
```

---

## Suporte a Shells

- **Linux/macOS:** bash, zsh, fish
- **Windows:** PowerShell

O alias `standup` será configurado automaticamente para o shell detectado.

---

## Contribuição

Sinta-se à vontade para abrir issues, enviar pull requests ou sugerir melhorias.

---
