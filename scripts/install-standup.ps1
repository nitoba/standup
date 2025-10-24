<#
.SYNOPSIS
  Instala a ferramenta Standup em Windows, Linux ou macOS.
  Detecta o SO, baixa o binário certo da release do GitHub,
  cria package.json, .env, instala Bun e configura alias.
#>

# ==========================
# CORES E FUNÇÕES AUXILIARES
# ==========================
$Colors = @{
    Red    = "Red"
    Green  = "Green"
    Yellow = "Yellow"
    Blue   = "Blue"
    Cyan   = "Cyan"
    Magenta= "Magenta"
}

function Write-Color {
    param($Text, $Color)
    Write-Host $Text -ForegroundColor $Color
}

function Show-Progress {
    param($Activity, $Status, $PercentComplete)
    Write-Progress -Activity $Activity -Status $Status -PercentComplete $PercentComplete
}

# Variáveis para progresso
$TotalSteps = 7
$CurrentStep = 0

function Next-Step {
    param($Message)
    $global:CurrentStep++
    $Percent = [math]::Round(($global:CurrentStep / $TotalSteps) * 100)
    Show-Progress -Activity "Instalando Standup" -Status "$Message (Passo $global:CurrentStep de $TotalSteps)" -PercentComplete $Percent
}

# ==========================
# CONFIGURAÇÕES DO PROJETO
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
    if ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)) {
        Set-Variable -Name IsWindows -Value $true -Scope Global
        Set-Variable -Name IsMacOS -Value $false -Scope Global
        Set-Variable -Name IsLinux -Value $false -Scope Global
        Write-Color "✅ Sistema detectado: Windows" $Colors.Green
        return "win"
    }
    elseif ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::OSX)) {
        Set-Variable -Name IsWindows -Value $false -Scope Global
        Set-Variable -Name IsMacOS -Value $true -Scope Global
        Set-Variable -Name IsLinux -Value $false -Scope Global
        Write-Color "✅ Sistema detectado: macOS" $Colors.Green
        return "mac"
    }
    elseif ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Linux)) {
        Set-Variable -Name IsWindows -Value $false -Scope Global
        Set-Variable -Name IsMacOS -Value $false -Scope Global
        Set-Variable -Name IsLinux -Value $true -Scope Global
        Write-Color "✅ Sistema detectado: Linux" $Colors.Green
        return "linux"
    }
    else {
        Write-Color "❌ Sistema operacional não suportado." $Colors.Red
        exit 1
    }
}



function Download-Executable {
    param($OS)
    Write-Color "🔽 Baixando executável para $OS..." $Colors.Blue
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

    switch ($OS) {
        "linux" { $FileName = "standup-linux" }
        "mac"   { $FileName = "standup-mac" }
        "win"   { $FileName = "standup-win.exe" }
    }

    $DownloadUrl = "https://github.com/$RepoOwner/$RepoName/releases/latest/download/$FileName"
    $TargetFile = Join-Path $InstallDir $FileName

    try {
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $TargetFile -UseBasicParsing
        Write-Color "✅ Download concluído: $FileName" $Colors.Green
        if ($OS -ne "win") {
            & chmod +x $TargetFile
        }
    } catch {
        Write-Color "❌ Falha no download." $Colors.Red
        exit 1
    }
}

function Create-PackageJson {
    Write-Color "📦 Criando package.json..." $Colors.Blue
    $PackageJson | Out-File -FilePath (Join-Path $InstallDir "package.json") -Encoding utf8
    Write-Color "✅ package.json criado em $InstallDir" $Colors.Green
}

function Create-EnvFile {
    $EnvPath = Join-Path $InstallDir ".env"
    if (-Not (Test-Path $EnvPath)) {
        Write-Color "🧩 Criando .env padrão..." $Colors.Blue
        $EnvFile | Out-File -FilePath $EnvPath -Encoding utf8
        Write-Color "✅ .env criado em $InstallDir" $Colors.Green
        $EditEnv = Read-Host "Deseja editar o .env agora? (y/N)"
        if ($EditEnv -match "^[Yy]$") {
            if (Get-Command code -ErrorAction SilentlyContinue) {
                code $EnvPath
            } elseif (Get-Command notepad -ErrorAction SilentlyContinue) {
                notepad $EnvPath
            } else {
                Write-Color "Editor não encontrado. Edite manualmente: $EnvPath" $Colors.Yellow
            }
            Write-Color "✅ .env editado." $Colors.Cyan
        }
    } else {
        Write-Color "⚙️  .env já existe — pulando criação." $Colors.Yellow
    }
}

function Install-BunIfNeeded {
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        Write-Color "🍞 Bun não encontrado, instalando..." $Colors.Blue
        try {
            if ($IsWindows) {
                irm bun.sh/install.ps1 | iex
            } else {
                curl -fsSL https://bun.sh/install | bash
                $env:BUN_INSTALL = "$HOME/.bun"
                $env:PATH = "$env:BUN_INSTALL/bin;$env:PATH"
            }
            Write-Color "✅ Bun instalado com sucesso." $Colors.Green
        } catch {
            Write-Color "❌ Falha na instalação do Bun." $Colors.Red
            exit 1
        }
    } else {
        Write-Color "✅ Bun já instalado." $Colors.Green
    }
}

function Install-Dependencies {
    Write-Color "📦 Instalando dependências..." $Colors.Blue
    Push-Location $InstallDir
    try {
        bun install
        Write-Color "✅ Dependências instaladas." $Colors.Green
    } catch {
        Write-Color "❌ Falha na instalação das dependências." $Colors.Red
        exit 1
    }
    Pop-Location
}

function Create-Alias {
    Write-Color "🔗 Criando alias 'standup'..." $Colors.Blue
    $AliasFile = "$PROFILE"
    if (-not (Test-Path $AliasFile)) {
        New-Item -Path $AliasFile -ItemType File -Force | Out-Null
    }

    $OSAlias = switch -Wildcard ($true) {
        $IsWindows { "standup-win.exe" }
        $IsMacOS { "standup-mac" }
        $IsLinux { "standup-linux" }
    }

    $FunctionCommand = @"

function standup {
    Push-Location `"$InstallDir`"
    & `".\$OSAlias`"
    Pop-Location
}
"@

    if (-not (Select-String -Path $AliasFile -Pattern "function standup" -Quiet)) {
        Add-Content -Path $AliasFile -Value $FunctionCommand
        Write-Color "✅ Função 'standup' adicionada ao perfil PowerShell ($AliasFile)" $Colors.Green
    } else {
        Write-Color "⚙️ Função 'standup' já existe no perfil ($AliasFile)" $Colors.Yellow
    }
}

function Reload-PowerShellProfile {
    Write-Color "🔁 Recarregando perfil PowerShell..." $Colors.Blue

    try {
        if (Test-Path $PROFILE) {
            . $PROFILE
            Write-Color "✅ Perfil recarregado — o comando 'standup' já está disponível imediatamente!" $Colors.Green
        } else {
            Write-Color "⚠️ Perfil PowerShell não encontrado. Reinicie o terminal para aplicar o alias." $Colors.Yellow
        }
    }
    catch {
        Write-Color "⚠️ Não foi possível recarregar o perfil automaticamente. Reinicie o PowerShell." $Colors.Yellow
    }
}


# ==========================
# EXECUÇÃO PRINCIPAL
# ==========================
Write-Color "🚀 Iniciando instalação do Standup..." $Colors.Cyan
Write-Host ""

# Confirmação inicial
$Confirm = Read-Host "Deseja prosseguir com a instalação? (y/N)"
if ($Confirm -notmatch "^[Yy]$") {
    Write-Color "Instalação cancelada pelo usuário." $Colors.Red
    exit 1
}

Next-Step "Detectando sistema operacional"
$OS = Detect-OS

Next-Step "Baixando executável"
Download-Executable -OS $OS

Next-Step "Criando package.json"
Create-PackageJson

Next-Step "Configurando .env"
Create-EnvFile

Next-Step "Verificando e instalando Bun"
Install-BunIfNeeded

Next-Step "Instalando dependências"
Install-Dependencies

Next-Step "Criando alias e recarregando perfil"
Create-Alias
Reload-PowerShellProfile

Write-Host ""
Write-Color "🎉 Instalação concluída com sucesso!" $Colors.Green
Write-Color "➡️ Agora você pode executar: standup" $Colors.Cyan
