# Prepara o agente do feedback-kit neste Windows e o põe para iniciar com o sistema.
#
#   powershell -ExecutionPolicy Bypass -File agent\install-windows.ps1
#
# Confere o que ele precisa (Node, Git, Claude Code logado, o código de administração),
# instala a skill, cria ~/.feedback-kit/agent.json, cria o atalho na pasta Inicializar
# e o do menu Iniciar (que abre o painel), e liga o ícone da bandeja agora. Rodar de novo
# é seguro.

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot
$kitHome = Join-Path $env:USERPROFILE '.feedback-kit'
New-Item -ItemType Directory -Force -Path $kitHome | Out-Null

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Falta $cmd. $hint" }
  Write-Host "ok  $cmd"
}
Need node 'Instale o Node.js 22 ou mais novo.'
Need git 'Instale o Git for Windows.'
Need claude 'Instale o Claude Code (https://claude.com/claude-code) e rode `claude` uma vez para entrar na conta.'

if (-not (Test-Path (Join-Path $kitHome 'admin-code.txt'))) {
  throw "Falta $kitHome\admin-code.txt (o código de administração; ver o README do feedback-kit)."
}
Write-Host 'ok  código de administração'

Push-Location $repo
try {
  # The panel's window (Electron) comes with the packages.
  if (-not (Test-Path (Join-Path $repo 'node_modules\electron\dist\electron.exe'))) {
    Write-Host 'Instalando os pacotes (a janela do painel)…'
    & npm install --no-audit --no-fund
    & node node_modules/electron/install.js
  }
  & node cli/install-skill.mjs
  & node agent/agent.mjs init
  Write-Host ''
  Write-Host 'Projetos encontrados:'
  & node agent/agent.mjs projects
} finally { Pop-Location }

# The Startup shortcut: PowerShell, hidden, running the tray.
$startup = [Environment]::GetFolderPath('Startup')
$link = Join-Path $startup 'feedback-kit agent.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = (Get-Command powershell.exe).Source
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSScriptRoot\tray.ps1`""
$shortcut.WorkingDirectory = $repo
$shortcut.WindowStyle = 7
$shortcut.Description = 'feedback-kit: executa as notas de feedback pedidas pelo painel'
$shortcut.IconLocation = "$PSScriptRoot\iconspp.ico,0"
$shortcut.Save()
Write-Host ''
Write-Host "Atalho criado: $link"

# The Start menu entry: opens the panel of this computer (and starts the agent if it is off).
$programs = [Environment]::GetFolderPath('Programs')
$menuLink = Join-Path $programs 'feedback-kit.lnk'
$entry = $shell.CreateShortcut($menuLink)
$entry.TargetPath = (Get-Command powershell.exe).Source
$entry.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSScriptRoot	ray.ps1`" -Open"
$entry.WorkingDirectory = $repo
$entry.WindowStyle = 7
$entry.IconLocation = "$PSScriptRoot\iconspp.ico,0"
$entry.Description = 'feedback-kit: o painel do agente neste computador'
$entry.Save()
Write-Host "No menu Iniciar: $menuLink"

Start-Process powershell.exe -ArgumentList $shortcut.Arguments -WindowStyle Hidden
Write-Host 'Ícone ligado na bandeja. Ajuste roots/projects em' (Join-Path $kitHome 'agent.json')
