#!/usr/bin/env bash
set -e

# 1. Resolve project directory (supports symlinks and AUR /usr/lib packaging)
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
PROJECT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"

# 2. Locate Electron binary
find_electron() {
  if [ -x "$PROJECT_DIR/node_modules/.bin/electron" ]; then
    echo "$PROJECT_DIR/node_modules/.bin/electron"
    return 0
  fi
  for e in electron44 electron43 electron42 electron; do
    if command -v "$e" >/dev/null 2>&1; then
      echo "$(command -v "$e")"
      return 0
    fi
  done
  for p in /usr/bin/electron44 /usr/bin/electron43 /usr/bin/electron42 /usr/bin/electron; do
    if [ -x "$p" ]; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

ELECTRON_BIN="$(find_electron || true)"

if [ -z "$ELECTRON_BIN" ]; then
  echo "[!] Error: Electron not found. Please install electron ('sudo pacman -S electron' or 'npm install')." >&2
  exit 1
fi

cd "$PROJECT_DIR"

# 3. Launch Cadence Native Desktop Application cleanly
exec "$ELECTRON_BIN" \
  "$PROJECT_DIR/electron/main.cjs" \
  "$@"
