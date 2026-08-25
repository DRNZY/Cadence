#!/usr/bin/env bash
set -e

# Dynamically resolve project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/auradeck/profile"
LOG_FILE="/tmp/auradeck.log"
APP_URL="http://localhost:5173"
API_URL="http://localhost:3001/api/tracks"

mkdir -p "$PROFILE_DIR"

# 1. Check if backend & frontend are responsive
check_running() {
  curl -s --connect-timeout 1 "$APP_URL" > /dev/null 2>&1
}

# 2. If not running, start background dev server
if ! check_running; then
  echo "[AuraDeck Launcher] Starting AuraDeck Engine in background..."
  cd "$PROJECT_DIR"
  npm run dev > "$LOG_FILE" 2>&1 &
  
  # Wait for server to become responsive
  for i in {1..30}; do
    if check_running; then
      break
    fi
    sleep 0.2
  done
fi

# 3. Launch App Window in standalone Frameless App Mode
if command -v brave-origin >/dev/null 2>&1; then
  exec brave-origin \
    --app="$APP_URL" \
    --class="auradeck" \
    --name="auradeck" \
    --user-data-dir="$PROFILE_DIR" \
    --enable-features=UseOzonePlatform,VaapiVideoDecoder \
    --ozone-platform-hint=auto \
    --enable-gpu-rasterization \
    --enable-zero-copy \
    --autoplay-policy=no-user-gesture-required \
    "$@"
elif command -v chromium >/dev/null 2>&1; then
  exec chromium \
    --app="$APP_URL" \
    --class="auradeck" \
    --name="auradeck" \
    --user-data-dir="$PROFILE_DIR" \
    --autoplay-policy=no-user-gesture-required \
    "$@"
elif command -v google-chrome-stable >/dev/null 2>&1; then
  exec google-chrome-stable \
    --app="$APP_URL" \
    --class="auradeck" \
    --user-data-dir="$PROFILE_DIR" \
    "$@"
elif command -v firefox >/dev/null 2>&1; then
  exec firefox --new-window "$APP_URL" "$@"
else
  exec xdg-open "$APP_URL"
fi
