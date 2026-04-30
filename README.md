# OpenCode Sidebar Plugins

OpenCode TUI sidebar plugins and notification helpers.

This repository currently contains:

- `pepper-dashboard.tsx` — TUI sidebar task dashboard and `Activity Feed` command.
- `hermes-sidebar.tsx` — Hermes conversation sidebar integration.
- `cmux-notify.ts` — CMUX notification plugin.

## pepper-dashboard

`pepper-dashboard` adds a `Tasks` panel to the OpenCode session sidebar. It tracks OpenCode `task` tool calls, which are commonly produced by delegated/subagent work.

It also registers an `Activity Feed` command:

- Command: `Activity Feed`
- Keybind: `Ctrl+Shift+A`

### Current behavior

The sidebar `Tasks` panel shows tasks for the **current user turn only**.

When you send a new prompt in the same session, the sidebar task list resets instead of keeping all historical completed tasks forever. The full historical tool/task log is still available through `Activity Feed`.

Session changes are also isolated: switching sessions or starting a new session remounts the dashboard so stale rows, timers, collapsed state, and timeout notifications do not leak across sessions.

## Requirements

- OpenCode with TUI plugin support.
- `git`.
- `node` plus `npm`, or `bun`.

The installer adds these dependencies to the OpenCode config directory:

- `@opencode-ai/plugin`
- `@opentui/solid`
- `solid-js`

## Install pepper-dashboard

### macOS / Linux

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/EvanDbg/opencode-sidebar-plugins/main/scripts/install-pepper-dashboard-macos.sh)
```

Or from a local checkout:

```bash
git clone https://github.com/EvanDbg/opencode-sidebar-plugins.git
cd opencode-sidebar-plugins
bash scripts/install-pepper-dashboard-macos.sh
```

By default, the script installs into:

```text
~/.config/opencode/
```

To use a custom OpenCode config directory:

```bash
OPENCODE_CONFIG_DIR=/path/to/opencode-config bash scripts/install-pepper-dashboard-macos.sh
```

### Windows PowerShell

From a local checkout:

```powershell
git clone https://github.com/EvanDbg/opencode-sidebar-plugins.git
cd opencode-sidebar-plugins
Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\install-pepper-dashboard-windows.ps1
```

By default, the script installs into:

```text
%USERPROFILE%\.config\opencode\
```

If your OpenCode build uses `%APPDATA%\opencode`, pass `-ConfigDir`:

```powershell
.\scripts\install-pepper-dashboard-windows.ps1 -ConfigDir "$env:APPDATA\opencode"
```

## What the installer does

The installer:

1. Clones this repository into a temporary directory.
2. Copies `pepper-dashboard.tsx` to the OpenCode plugin directory.
3. Ensures `package.json` in the OpenCode config directory includes the required dependencies.
4. Runs `npm install` if available, otherwise `bun install` if available.
5. Adds the absolute `pepper-dashboard.tsx` path to `tui.json` under the `plugin` array.

The important config is `tui.json`, not `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "/absolute/path/to/pepper-dashboard.tsx"
  ]
}
```

For TUI plugins, simply placing the file in `~/.config/opencode/plugins/` is not enough. The plugin must be referenced by `tui.json`.

## Manual install pepper-dashboard

Use this section if you do not want to run the installer script.

### 1. Clone the repository

```bash
git clone https://github.com/EvanDbg/opencode-sidebar-plugins.git
cd opencode-sidebar-plugins
```

### 2. Create the OpenCode plugin directory

macOS / Linux:

```bash
mkdir -p ~/.config/opencode/plugins
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.config\opencode\plugins"
```

### 3. Copy `pepper-dashboard.tsx`

macOS / Linux:

```bash
cp pepper-dashboard.tsx ~/.config/opencode/plugins/pepper-dashboard.tsx
```

Windows PowerShell:

```powershell
Copy-Item .\pepper-dashboard.tsx "$HOME\.config\opencode\plugins\pepper-dashboard.tsx" -Force
```

If your Windows OpenCode build uses `%APPDATA%\opencode`, copy to:

```powershell
Copy-Item .\pepper-dashboard.tsx "$env:APPDATA\opencode\plugins\pepper-dashboard.tsx" -Force
```

### 4. Install required dependencies

Create or update `package.json` in the OpenCode config directory.

macOS / Linux path:

```text
~/.config/opencode/package.json
```

Windows default path:

```text
%USERPROFILE%\.config\opencode\package.json
```

Minimal content:

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "1.4.10",
    "@opentui/solid": "^0.2.1",
    "solid-js": "^1.9.12"
  }
}
```

Then install dependencies from that directory.

macOS / Linux:

```bash
cd ~/.config/opencode
npm install
```

Windows PowerShell:

```powershell
cd "$HOME\.config\opencode"
npm install
```

If you use `%APPDATA%\opencode` on Windows:

```powershell
cd "$env:APPDATA\opencode"
npm install
```

If you do not have `npm` but have `bun`, run `bun install` instead.

### 5. Add the plugin to `tui.json`

Create or update the TUI config file.

macOS / Linux path:

```text
~/.config/opencode/tui.json
```

Windows default path:

```text
%USERPROFILE%\.config\opencode\tui.json
```

Minimal content on macOS / Linux:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "/Users/YOUR_USER/.config/opencode/plugins/pepper-dashboard.tsx"
  ]
}
```

Replace `YOUR_USER` with your real username. The path must be absolute.

Minimal content on Windows:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "C:\\Users\\YOUR_USER\\.config\\opencode\\plugins\\pepper-dashboard.tsx"
  ]
}
```

If your Windows OpenCode config is under `%APPDATA%\opencode`, use the absolute expanded path, for example:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "C:\\Users\\YOUR_USER\\AppData\\Roaming\\opencode\\plugins\\pepper-dashboard.tsx"
  ]
}
```

If `tui.json` already has a `plugin` array, append the `pepper-dashboard.tsx` absolute path instead of replacing existing entries.

### 6. Restart OpenCode

Fully quit any running OpenCode TUI, then start it again:

```bash
opencode
```

Search for `Activity Feed` or press `Ctrl+Shift+A`.

## Manual uninstall pepper-dashboard

1. Remove the `pepper-dashboard.tsx` entry from `tui.json`.
2. Delete the copied plugin file.

macOS / Linux:

```bash
rm ~/.config/opencode/plugins/pepper-dashboard.tsx
```

Windows PowerShell:

```powershell
Remove-Item "$HOME\.config\opencode\plugins\pepper-dashboard.tsx" -Force
```

If you use `%APPDATA%\opencode` on Windows:

```powershell
Remove-Item "$env:APPDATA\opencode\plugins\pepper-dashboard.tsx" -Force
```

Shared dependencies in `package.json` can usually remain because other TUI plugins may use them.

## Verify installation

Fully quit and restart OpenCode:

```bash
opencode
```

Then search for:

```text
Activity Feed
```

Or press:

```text
Ctrl+Shift+A
```

You should also see a `Tasks` section in the session sidebar.

## Uninstall pepper-dashboard

### macOS / Linux

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/EvanDbg/opencode-sidebar-plugins/main/scripts/uninstall-pepper-dashboard-macos.sh)
```

Or from a local checkout:

```bash
bash scripts/uninstall-pepper-dashboard-macos.sh
```

For a custom config directory:

```bash
OPENCODE_CONFIG_DIR=/path/to/opencode-config bash scripts/uninstall-pepper-dashboard-macos.sh
```

### Windows PowerShell

```powershell
.\scripts\uninstall-pepper-dashboard-windows.ps1
```

For a custom config directory:

```powershell
.\scripts\uninstall-pepper-dashboard-windows.ps1 -ConfigDir "$env:APPDATA\opencode"
```

The uninstall script removes:

- `pepper-dashboard.tsx` from the OpenCode plugin directory.
- Matching `pepper-dashboard.tsx` entries from `tui.json`.

It does not remove shared npm dependencies because other OpenCode plugins may use them.

## Troubleshooting

### `Activity Feed` does not appear

Check that `tui.json` contains an absolute path to `pepper-dashboard.tsx`:

```bash
cat ~/.config/opencode/tui.json
```

Then fully quit and restart OpenCode.

### Sidebar tasks keep old rows

Make sure you are using this fork's latest `pepper-dashboard.tsx`. The latest version resets sidebar Tasks on each new user turn and remounts on session changes.

### Native OpenTUI package errors on macOS

If you mix x64/Rosetta Node with arm64 Bun, direct Bun import tests may complain about a missing platform package such as `@opentui/core-darwin-arm64`. This is an environment architecture issue, not necessarily a plugin source error. OpenCode's own runtime normally resolves the TUI plugin at startup.

## Development check

From an OpenCode config directory with dependencies installed, you can type-check the plugin with:

```bash
npx tsc --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --jsx preserve --allowImportingTsExtensions /path/to/pepper-dashboard.tsx
```
