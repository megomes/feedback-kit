# Prepara o agente do feedback-kit neste Windows e o põe para iniciar com o sistema.
#
#   powershell -ExecutionPolicy Bypass -File agent\install-windows.ps1
#
# Confere o que ele precisa (Node, Git, Claude Code logado, o código de administração),
# instala a skill, cria ~/.feedback-kit/agent.json, cria o atalho na pasta Inicializar
# e liga o ícone da bandeja agora. Rodar de novo é seguro.

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
$shortcut.Save()
Write-Host ''
Write-Host "Atalho criado: $link"

Start-Process powershell.exe -ArgumentList $shortcut.Arguments -WindowStyle Hidden
Write-Host 'Ícone ligado na bandeja. Ajuste roots/projects em' (Join-Path $kitHome 'agent.json')
