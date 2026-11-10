#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
export HOME="$ROOT/.runtime/home"
export XDG_DATA_HOME="$ROOT/.runtime/data"
export XDG_STATE_HOME="$ROOT/.runtime/state"
export XDG_CONFIG_HOME="$ROOT/.runtime/config"
export XDG_CACHE_HOME="$ROOT/.runtime/cache"
export OPENCODE_CONFIG="$ROOT/.runtime/config/opencode/opencode.json"
export OPENCODE_DISABLE_AUTOUPDATE=1
export OPENCODE_DISABLE_MODELS_FETCH=1
mkdir -p "$HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME" "$XDG_CONFIG_HOME/opencode" "$XDG_CACHE_HOME"
exec "$ROOT/node_modules/.bin/opencode" "$@"
