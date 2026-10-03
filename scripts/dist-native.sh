#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
npm run build:native
mkdir -p release
VERSION="$(node -p "require('./package.json').version")"
tar -czf "release/Cadence-${VERSION}-linux-native.tar.gz" \
  dist dist-server/standalone.mjs native/cadence-bin packaging/cadence.png \
  cadence.sh scripts/install-local.sh package.json
echo "release/Cadence-${VERSION}-linux-native.tar.gz"
