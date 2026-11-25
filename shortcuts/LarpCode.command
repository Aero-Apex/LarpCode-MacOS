#!/bin/bash
# LarpCode macOS desktop launcher. Double-click this .command file to start
# the installed desktop app.
set -euo pipefail

# Resolve this script's own directory. pwd -P resolves symlinked parent
# directories so APP_ROOT points at the real install location.
SCRIPT_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd -P)"

# shortcuts/ sits directly under the install root.
APP_ROOT="$(dirname "$SCRIPT_DIR")"

# Keep the sidecar's state out of a generic OpenCode profile. These must be
# quoted because the app name contains a space.
XDG_DATA_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/data"
XDG_CONFIG_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/config"
XDG_CACHE_HOME="$HOME/Library/Caches/LarpCode macOS/xdg/cache"
XDG_STATE_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/state"
export XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME XDG_STATE_HOME

mkdir -p "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME"

# Default to the installed app bundle; allow a custom location via env var.
# The override may be either the executable itself or a .app bundle.
DEFAULT_APP_PATH="$APP_ROOT/LarpCode macOS.app/Contents/MacOS/LarpCode macOS"
APP_PATH="${LARPCODE_APP_PATH:-$DEFAULT_APP_PATH}"
if [ -d "$APP_PATH" ]; then
  APP_PATH="$APP_PATH/Contents/MacOS/LarpCode macOS"
fi

if [ -x "$APP_PATH" ]; then
  exec "$APP_PATH"
fi

if [ -e "$APP_PATH" ]; then
  echo "LarpCode macOS binary is not executable at:" >&2
  echo "  $APP_PATH" >&2
  echo "Run 'chmod +x \"$APP_PATH\"' and try again." >&2
  exit 1
fi

echo "LarpCode macOS app was not found at:" >&2
echo "  $APP_PATH" >&2
echo "Install LarpCode macOS and try again." >&2
exit 1
