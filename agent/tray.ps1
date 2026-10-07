# O ícone do agente do feedback-kit na bandeja do Windows.
#
# Liga o agente (node agent\agent.mjs) escondido, religa se ele cair, e mostra o estado
# que ele escreve em ~/.feedback-kit/agent-status.json: o balão do feedback-kit em
# branco (ou grafite, com a barra de tarefas clara) com um ponto de cor (sem ponto pronto,
# azul rodando, amarelo pausado, laranja no limite, cinza sem conexão), a dica com o
# limite do Claude e um aviso quando uma execução começa ou termina. Clique duplo abre o
# painel deste computador.
#
#   tray.ps1          liga (o atalho de Inicializar)
#   tray.ps1 -Open    liga se precisar e abre o painel (o atalho do menu Iniciar)
#
# Não precisa instalar nada: só o PowerShell e o .NET que vêm com o Windows. Para iniciar
# com o Windows, rode agent\install-windows.ps1 uma vez.

param([switch]$Open)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$kitHome = Join-Path $env:USERPROFILE '.feedback-kit'
$statusFile = Join-Path $kitHome 'agent-status.json'
$pausedFile = Join-Path $kitHome 'agent.paused'
$logFile = Join-Path $kitHome 'agent.log'
$configFile = Join-Path $kitHome 'agent.json'
$agentScript = Join-Path $PSScriptRoot 'agent.mjs'
New-Item -ItemType Directory -Force -Path $kitHome | Out-Null

function Get-PanelUrl {
  $port = 47820
  try {
    $cfg = Get-Content $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($cfg.dashboardPort) { $port = [int]$cfg.dashboardPort }
  } catch {}
  "http://127.0.0.1:$port/"
}
function Open-Panel {
  # Its own window, like VS Code's (agent\window.cjs); Edge in app mode if Electron is missing.
  $electron = Join-Path (Split-Path $PSScriptRoot) 'node_modules\electron\dist\electron.exe'
  if (Test-Path $electron) {
    Start-Process $electron -ArgumentList "`"$(Join-Path $PSScriptRoot 'window.cjs')`""
    return
  }
  $url = Get-PanelUrl
  try { Start-Process msedge.exe -ArgumentList "--app=$url", '--window-size=1480,980' }
  catch { Start-Process $url }
}

# Uma instância só: a segunda (o atalho do Iniciar com o ícone já ligado) só abre o painel.
$mutex = New-Object System.Threading.Mutex($false, 'feedback-kit-agent-tray')
if (-not $mutex.WaitOne(0)) {
  if ($Open) { Open-Panel }
  exit
}

# The icons drawn by scripts/build-icons.mjs: white for a dark taskbar, graphite for a
# light one, picked again when the theme changes.
$iconDir = Join-Path $PSScriptRoot 'icons'
function Test-LightTaskbar {
  try {
    (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -ErrorAction Stop).SystemUsesLightTheme -eq 1
  } catch { $false }
}
function Get-TrayIcons {
  $light = Test-LightTaskbar
  $suffix = $(if ($light) { '-dark' } else { '' })
  $set = @{ light = $light }
  foreach ($name in 'idle', 'running', 'paused', 'limited', 'offline') {
    $set[$name] = New-Object System.Drawing.Icon((Join-Path $iconDir "tray-$name$suffix.ico"), 16, 16)
  }
  $set
}
$script:icons = Get-TrayIcons

# ---------------------------------------------------------------- the agent process
$script:agent = $null
function Start-Agent {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { throw 'Node.js não encontrado no PATH.' }
  $script:agent = Start-Process -FilePath $node -ArgumentList "`"$agentScript`"" `
    -WorkingDirectory (Split-Path $PSScriptRoot) -WindowStyle Hidden -PassThru
}
function Stop-Agent {
  if ($script:agent -and -not $script:agent.HasExited) {
    # /T: Claude Code too, if a run is going.
    & taskkill /PID $script:agent.Id /T /F | Out-Null
  }
}

# ------------------------------------------------------------------------ the icon
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $script:icons.offline
$tray.Text = 'feedback-kit: ligando…'
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$itemPanel = $menu.Items.Add('Abrir o painel')
$itemPanel.Font = New-Object System.Drawing.Font($itemPanel.Font, [System.Drawing.FontStyle]::Bold)
$menu.Items.Add('-') | Out-Null
$itemState = $menu.Items.Add('Ligando…'); $itemState.Enabled = $false
$itemUsage = $menu.Items.Add('Limite do Claude: ainda sem leitura'); $itemUsage.Enabled = $false
$menu.Items.Add('-') | Out-Null
$itemProjects = New-Object System.Windows.Forms.ToolStripMenuItem 'Projetos'
$menu.Items.Add($itemProjects) | Out-Null
$itemPause = $menu.Items.Add('Pausar')
$menu.Items.Add('-') | Out-Null
$itemLog = $menu.Items.Add('Abrir o log')
$itemRuns = $menu.Items.Add('Abrir as execuções (transcrições)')
$itemConfig = $menu.Items.Add('Abrir a configuração')
$itemRestart = $menu.Items.Add('Reiniciar o agente')
$menu.Items.Add('-') | Out-Null
$itemQuit = $menu.Items.Add('Sair')
$tray.ContextMenuStrip = $menu

$itemPanel.add_Click({ Open-Panel })
$tray.add_DoubleClick({ Open-Panel })
$tray.add_BalloonTipClicked({ Open-Panel })
$itemPause.add_Click({
  if (Test-Path $pausedFile) { Remove-Item $pausedFile } else { New-Item -ItemType File -Path $pausedFile | Out-Null }
})
$itemLog.add_Click({ if (Test-Path $logFile) { Start-Process notepad.exe $logFile } })
$itemRuns.add_Click({ Start-Process explorer.exe (Join-Path $kitHome 'runs') })
$itemConfig.add_Click({
  if (-not (Test-Path $configFile)) { & node $agentScript init | Out-Null }
  Start-Process notepad.exe $configFile
})
$itemRestart.add_Click({ Stop-Agent; Start-Agent })
$itemQuit.add_Click({
  Stop-Agent
  $tray.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

function Format-Window($w, $label) {
  if (-not $w) { return $null }
  $pct = [math]::Round(($w.utilization) * 100)
  $when = ''
  if ($w.resetsAt -and -not $w.reset) {
    $when = ' (volta ' + [DateTimeOffset]::FromUnixTimeSeconds([int64]$w.resetsAt).LocalDateTime.ToString('ddd HH:mm') + ')'
  }
  "$label $pct%$when"
}

$script:lastState = ''
$script:lastRun = $null
$script:projectsKey = ''

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.add_Tick({
  try {
    if (-not $script:agent -or $script:agent.HasExited) { Start-Agent }
    # The taskbar theme changed: the other set of icons.
    if ((Test-LightTaskbar) -ne $script:icons.light) { $script:icons = Get-TrayIcons }
    if (-not (Test-Path $statusFile)) { return }
    $s = Get-Content $statusFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $state = $s.state
    $paused = Test-Path $pausedFile
    $itemPause.Text = $(if ($paused) { 'Retomar' } else { 'Pausar' })

    $label = switch ($state) {
      'running' { "Rodando a execução #$($s.run) ($($s.app))" }
      'paused'  { 'Pausado' }
      'limited' { "Esperando: $($s.limitedBy)" }
      'offline' { 'Sem conexão com o Worker' }
      default   { 'Pronto, esperando pedidos' }
    }
    $itemState.Text = $label
    $usage = @((Format-Window $s.usage.fiveHour '5 h'), (Format-Window $s.usage.sevenDay 'semana')) | Where-Object { $_ }
    if ($usage) { $itemUsage.Text = 'Claude: ' + ($usage -join ' · ') }
    $tip = "feedback-kit: $label"
    if ($tip.Length -gt 63) { $tip = $tip.Substring(0, 63) }
    $tray.Text = $tip

    $set = $script:icons
    $tray.Icon = $(switch ($state) {
      'running' { $set.running }
      'paused'  { $set.paused }
      'limited' { $set.limited }
      'offline' { $set.offline }
      default   { $set.idle }
    })

    # A notice when a run starts and when it ends (a click opens the panel).
    if ($state -eq 'running' -and $script:lastRun -ne $s.run) {
      $script:lastRun = $s.run
      $tray.ShowBalloonTip(4000, 'feedback-kit', "Execução #$($s.run) começou ($($s.app)).", 'Info')
    } elseif ($state -ne 'running' -and $script:lastState -eq 'running' -and $script:lastRun) {
      $tray.ShowBalloonTip(4000, 'feedback-kit', "Execução #$($script:lastRun) terminou. Clique para ver no painel.", 'Info')
      $script:lastRun = $null
    }
    $script:lastState = $state

    # The projects submenu, rebuilt only when the list changes.
    if ($s.apps) {
      $key = ($s.apps.PSObject.Properties | ForEach-Object { "$($_.Name)=$($_.Value.dir)" }) -join ';'
      if ($key -ne $script:projectsKey) {
        $script:projectsKey = $key
        $itemProjects.DropDownItems.Clear()
        foreach ($p in $s.apps.PSObject.Properties) {
          $dir = $p.Value.dir
          $item = $itemProjects.DropDownItems.Add("$($p.Name)  —  $dir")
          $item.Tag = $dir
          $item.add_Click({ param($sender) Start-Process explorer.exe $sender.Tag })
        }
        if (-not $itemProjects.DropDownItems.Count) {
          ($itemProjects.DropDownItems.Add('Nenhum: crie um feedback-kit.json no projeto')).Enabled = $false
        }
      }
    }
  } catch {
    $tray.Text = 'feedback-kit: erro no ícone'
  }
})

Start-Agent
$timer.Start()
if ($Open) {
  # The agent serves the panel a moment after it starts.
  $opener = New-Object System.Windows.Forms.Timer
  $opener.Interval = 2500
  $opener.add_Tick({ $opener.Stop(); Open-Panel })
  $opener.Start()
}
[System.Windows.Forms.Application]::Run()
$timer.Stop()
$tray.Dispose()
$mutex.ReleaseMutex()
