<#
.SYNOPSIS
  Instala a ferramenta Standup em Windows, Linux ou macOS.
  Detecta o SO, baixa o binário certo da release do GitHub,
  cria package.json, .env, instala Bun e configura alias.
#>

# ==========================
# CONFIGURAÇÕES DO PROJETO
# ==========================
$RepoOwner = "nitoba"
$RepoName  = "standup"
$InstallDir = "$HOME/.standup"

$PackageJson = @'
{
  "name": "standup",
  "module": "src/index.tsx",
  "type": "module",
  "private": true,
  "dependencies": {
    "@opentui/core": "^0.1.27"
  }
}
'@

$EnvFile = @'
# User Configuration (Optional - auto-detected from git config if not provided)
GIT_AUTHOR_NAME=
GIT_AUTHOR_EMAIL=
AZURE_DEVOPS_USER_EMAIL=
AZURE_DEVOPS_USER_DISPLAY_NAME=
AZURE_DEVOPS_PAT=

# Repository Configuration
REPOSITORIES_FOLDER=
GOOGLE_GENERATIVE_AI_API_KEY=
'@

# ==========================
# FUNÇÕES AUXILIARES
# ==========================
function Detect-OS {
    if ($IsWindows) {
        return "win"
    } elseif ($IsMacOS) {
        return "mac"
    } elseif ($IsLinux) {
        return "linux"
    } else {
        Write-Error "Sistema operacional não suportado."
        exit 1
    }
}

function Download-Executable {
    param($OS)
    Write-Host "🔽 Baixando executável para $OS..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

    switch ($OS) {
        "linux" { $FileName = "standup-linux" }
        "mac"   { $FileName = "standup-mac" }
        "win"   { $FileName = "standup-win.exe" }
    }

    $DownloadUrl = "https://github.com/$RepoOwner/$RepoName/releases/latest/download/$FileName"
    $TargetFile = Join-Path $InstallDir $FileName

    Invoke-WebRequest -Uri $DownloadUrl -OutFile $TargetFile -UseBasicParsing
    if ($OS -ne "win") {
        chmod +x $TargetFile
    }
}

function Create-PackageJson {
    Write-Host "📦 Criando package.json..." -ForegroundColor Cyan
    $PackageJson | Out-File -FilePath (Join-Path $InstallDir "package.json") -Encoding utf8
}

function Create-EnvFile {
    $EnvPath = Join-Path $InstallDir ".env"
    if (-Not (Test-Path $EnvPath)) {
        Write-Host "🧩 Criando .env padrão..." -ForegroundColor Cyan
        $EnvFile | Out-File -FilePath $EnvPath -Encoding utf8
    } else {
        Write-Host "⚙️  .env já existe — pulando criação." -ForegroundColor Yellow
    }
}

function Install-BunIfNeeded {
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        Write-Host "🍞 Bun não encontrado, instalando..." -ForegroundColor Cyan
        if ($IsWindows) {
            irm bun.sh/install.ps1 | iex
        } else {
            curl -fsSL https://bun.sh/install | bash
            $env:BUN_INSTALL = "$HOME/.bun"
            $env:PATH = "$env:BUN_INSTALL/bin;$env:PATH"
        }
    } else {
        Write-Host "✅ Bun já instalado." -ForegroundColor Green
    }
}

function Install-Dependencies {
    Write-Host "📦 Instalando dependências..." -ForegroundColor Cyan
    Push-Location $InstallDir
    bun install
    Pop-Location
}

function Create-Alias {
    Write-Host "🔗 Criando alias 'standup'..." -ForegroundColor Cyan
    $AliasFile = "$PROFILE"
    if (-not (Test-Path $AliasFile)) {
        New-Item -Path $AliasFile -ItemType File -Force | Out-Null
    }

    $OSAlias = switch -Wildcard ($true) {
        $IsWindows { "standup-win.exe" }
        $IsMacOS { "standup-mac" }
        $IsLinux { "standup-linux" }
    }

    $ExecPath = Join-Path $InstallDir $OSAlias
    $AliasCommand = "Set-Alias standup `"$ExecPath`""

    if (-not (Select-String -Path $AliasFile -Pattern "Set-Alias standup" -Quiet)) {
        Add-Content -Path $AliasFile -Value "`n$AliasCommand"
        Write-Host "✅ Alias adicionado ao perfil PowerShell ($AliasFile)" -ForegroundColor Green
    } else {
        Write-Host "⚙️ Alias já existe no perfil ($AliasFile)" -ForegroundColor Yellow
    }
}

function Reload-PowerShellProfile {
    Write-Host "`n🔁 Recarregando perfil PowerShell..." -ForegroundColor Cyan

    try {
        if (Test-Path $PROFILE) {
            . $PROFILE
            Write-Host "✅ Perfil recarregado — o comando 'standup' já está disponível imediatamente!" -ForegroundColor Green
        } else {
            Write-Host "⚠️ Perfil PowerShell não encontrado. Reinicie o terminal para aplicar o alias." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "⚠️ Não foi possível recarregar o perfil automaticamente. Reinicie o PowerShell." -ForegroundColor Yellow
    }
}


# ==========================
# EXECUÇÃO PRINCIPAL
# ==========================
Write-Host "🚀 Iniciando instalação do Standup..." -ForegroundColor Cyan

$OS = Detect-OS
Download-Executable -OS $OS
Create-PackageJson
Create-EnvFile
Install-BunIfNeeded
Install-Dependencies
Create-Alias
Reload-PowerShellProfile

Write-Host "`n🎉 Instalação concluída com sucesso!" -ForegroundColor Green
Write-Host "➡️ Agora você pode executar: standup"
