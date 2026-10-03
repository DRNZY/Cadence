#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cc -O2 -Wall -Wextra -o "$PROJECT_DIR/native/cadence-bin" \
  "$PROJECT_DIR/native/cadence.c" \
  $(pkg-config --cflags --libs gtk+-3.0 webkit2gtk-4.1 libsoup-3.0 json-glib-1.0)
