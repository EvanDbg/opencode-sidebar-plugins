param(
  [string]$ConfigDir = (Join-Path $HOME ".config\opencode"),
  [string]$RepoUrl = "https://github.com/EvanDbg/opencode-sidebar-plugins.git"
)

$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name. Please install it and re-run this script."
  }
}

function Read-JsonObject {
  param([string]$Path, [hashtable]$Default)
  if (Test-Path $Path) {
    $raw = Get-Content -LiteralPath $Path -Raw
    if ($raw.Trim().Length -gt 0) {
      return $raw | ConvertFrom-Json
    }
  }
  return [pscustomobject]$Default
}

function Ensure-PropertyObject {
  param([object]$Object, [string]$Name)
  if (-not ($Object.PSObject.Properties.Name -contains $Name) -or $null -eq $Object.$Name) {
    $Object | Add-Member -NotePropertyName $Name -NotePropertyValue ([pscustomobject]@{}) -Force
  }
}

Require-Command git

$PluginDir = Join-Path $ConfigDir "plugins"
$PluginFile = Join-Path $PluginDir "pepper-dashboard.tsx"
$TuiConfig = Join-Path $ConfigDir "tui.json"
$PackageJson = Join-Path $ConfigDir "package.json"

New-Item -ItemType Directory -Force -Path $PluginDir | Out-Null

$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("opencode-sidebar-plugins-" + [System.Guid]::NewGuid().ToString("N"))
try {
  Write-Host "Cloning $RepoUrl ..."
  git clone --depth 1 $RepoUrl $TempRoot | Out-Null
  $SourceFile = Join-Path $TempRoot "pepper-dashboard.tsx"
  if (-not (Test-Path $SourceFile)) {
    throw "pepper-dashboard.tsx not found in repository."
  }

  Copy-Item -LiteralPath $SourceFile -Destination $PluginFile -Force
  Write-Host "Installed plugin file: $PluginFile"
}
finally {
  if (Test-Path $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force
  }
}

$pkg = Read-JsonObject -Path $PackageJson -Default @{}
Ensure-PropertyObject -Object $pkg -Name "dependencies"
$pkg.dependencies | Add-Member -NotePropertyName "@opencode-ai/plugin" -NotePropertyValue "1.4.10" -Force
$pkg.dependencies | Add-Member -NotePropertyName "@opentui/solid" -NotePropertyValue "^0.2.1" -Force
$pkg.dependencies | Add-Member -NotePropertyName "solid-js" -NotePropertyValue "^1.9.12" -Force

foreach ($prop in @($pkg.dependencies.PSObject.Properties)) {
  if ($prop.Name -like "@opentui/core-*") {
    $pkg.dependencies.PSObject.Properties.Remove($prop.Name)
  }
}

$pkg | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $PackageJson -Encoding UTF8

if (Get-Command npm -ErrorAction SilentlyContinue) {
  Write-Host "Installing dependencies in $ConfigDir ..."
  Push-Location $ConfigDir
  try { npm install }
  finally { Pop-Location }
}
elseif (Get-Command bun -ErrorAction SilentlyContinue) {
  Write-Host "npm not found; installing dependencies with bun in $ConfigDir ..."
  Push-Location $ConfigDir
  try { bun install }
  finally { Pop-Location }
}
else {
  Write-Warning "Neither npm nor bun was found. Dependencies were written to package.json but not installed."
}

$tui = Read-JsonObject -Path $TuiConfig -Default @{ '$schema' = 'https://opencode.ai/tui.json' }
if (-not ($tui.PSObject.Properties.Name -contains "plugin") -or $null -eq $tui.plugin) {
  $tui | Add-Member -NotePropertyName "plugin" -NotePropertyValue @() -Force
}

$plugins = @($tui.plugin | Where-Object { $_ -ne $PluginFile })
$plugins += $PluginFile
$tui.plugin = $plugins
$tui | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $TuiConfig -Encoding UTF8

Write-Host ""
Write-Host "pepper-dashboard installed."
Write-Host "TUI config: $TuiConfig"
Write-Host "Restart opencode, then search for 'Activity Feed' or press Ctrl+Shift+A."
