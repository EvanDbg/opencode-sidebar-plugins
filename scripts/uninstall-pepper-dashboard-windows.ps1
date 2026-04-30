param(
  [string]$ConfigDir = (Join-Path $HOME ".config\opencode")
)

$ErrorActionPreference = "Stop"

$PluginFile = Join-Path $ConfigDir "plugins\pepper-dashboard.tsx"
$TuiConfig = Join-Path $ConfigDir "tui.json"

if (Test-Path $TuiConfig) {
  $raw = Get-Content -LiteralPath $TuiConfig -Raw
  if ($raw.Trim().Length -gt 0) {
    $tui = $raw | ConvertFrom-Json
    if ($tui.PSObject.Properties.Name -contains "plugin" -and $null -ne $tui.plugin) {
      $tui.plugin = @($tui.plugin | Where-Object {
        ($_ -ne $PluginFile) -and (-not ([string]$_).EndsWith("\pepper-dashboard.tsx")) -and (-not ([string]$_).EndsWith("/pepper-dashboard.tsx"))
      })
      $tui | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $TuiConfig -Encoding UTF8
      Write-Host "Removed pepper-dashboard from TUI config: $TuiConfig"
    }
  }
}
else {
  Write-Host "TUI config not found: $TuiConfig"
}

if (Test-Path $PluginFile) {
  Remove-Item -LiteralPath $PluginFile -Force
  Write-Host "Removed plugin file: $PluginFile"
}
else {
  Write-Host "Plugin file already absent: $PluginFile"
}

Write-Host "Restart opencode to finish unloading the plugin."
