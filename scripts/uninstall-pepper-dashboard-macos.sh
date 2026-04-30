#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
PLUGIN_FILE="$CONFIG_DIR/plugins/pepper-dashboard.tsx"
TUI_CONFIG="$CONFIG_DIR/tui.json"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

json_remove_script='const fs = require("fs");
const file = process.argv[2];
const pluginPath = process.argv[3];
if (!fs.existsSync(file)) process.exit(0);
const data = JSON.parse(fs.readFileSync(file, "utf8"));
if (Array.isArray(data.plugin)) {
  data.plugin = data.plugin.filter((x) => x !== pluginPath && !String(x).endsWith("/pepper-dashboard.tsx"));
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");'

need_cmd node

node -e "$json_remove_script" "$TUI_CONFIG" "$PLUGIN_FILE"

if [ -f "$PLUGIN_FILE" ]; then
  rm "$PLUGIN_FILE"
  echo "Removed plugin file: $PLUGIN_FILE"
else
  echo "Plugin file already absent: $PLUGIN_FILE"
fi

echo "Removed pepper-dashboard from TUI config: $TUI_CONFIG"
echo "Restart opencode to finish unloading the plugin."
