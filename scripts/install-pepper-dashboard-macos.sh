#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/EvanDbg/opencode-sidebar-plugins.git"
CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
PLUGIN_DIR="$CONFIG_DIR/plugins"
PLUGIN_FILE="$PLUGIN_DIR/pepper-dashboard.tsx"
TUI_CONFIG="$CONFIG_DIR/tui.json"
PACKAGE_JSON="$CONFIG_DIR/package.json"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    echo "Please install it and re-run this script." >&2
    exit 1
  fi
}

json_update_script='const fs = require("fs");
const path = require("path");
const file = process.argv[2];
const pluginPath = process.argv[3];
const data = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, "utf8"))
  : { "$schema": "https://opencode.ai/tui.json" };
if (!Array.isArray(data.plugin)) data.plugin = [];
data.plugin = data.plugin.filter((x) => x !== pluginPath);
data.plugin.push(pluginPath);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");'

package_update_script='const fs = require("fs");
const path = require("path");
const file = process.argv[2];
const data = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, "utf8"))
  : {};
data.dependencies ||= {};
data.dependencies["@opencode-ai/plugin"] ||= "1.4.10";
data.dependencies["@opentui/solid"] ||= "^0.2.1";
data.dependencies["solid-js"] ||= "^1.9.12";
for (const key of Object.keys(data.dependencies)) {
  if (/^@opentui\/core-/.test(key)) delete data.dependencies[key];
}
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");'

need_cmd git
need_cmd node

mkdir -p "$PLUGIN_DIR"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

echo "Cloning $REPO_URL ..."
git clone --depth 1 "$REPO_URL" "$tmpdir/repo" >/dev/null

if [ ! -f "$tmpdir/repo/pepper-dashboard.tsx" ]; then
  echo "pepper-dashboard.tsx not found in repository." >&2
  exit 1
fi

cp "$tmpdir/repo/pepper-dashboard.tsx" "$PLUGIN_FILE"
echo "Installed plugin file: $PLUGIN_FILE"

node -e "$package_update_script" "$PACKAGE_JSON"

if command -v npm >/dev/null 2>&1; then
  echo "Installing dependencies in $CONFIG_DIR ..."
  (cd "$CONFIG_DIR" && npm install)
elif command -v bun >/dev/null 2>&1; then
  echo "npm not found; installing dependencies with bun in $CONFIG_DIR ..."
  (cd "$CONFIG_DIR" && bun install)
else
  echo "Neither npm nor bun was found. Dependencies were written to package.json but not installed." >&2
fi

node -e "$json_update_script" "$TUI_CONFIG" "$PLUGIN_FILE"

echo
echo "pepper-dashboard installed."
echo "TUI config: $TUI_CONFIG"
echo "Restart opencode, then search for 'Activity Feed' or press Ctrl+Shift+A."
