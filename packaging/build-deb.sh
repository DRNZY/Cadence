#!/usr/bin/env bash
set -euo pipefail

# Build script for Debian/Ubuntu (.deb) package
VERSION="1.0.0"
PKGNAME="auradeck"
ARCH="all"
OUTPUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$OUTPUT_DIR/.." && pwd)"
STAGING="/tmp/${PKGNAME}_${VERSION}_${ARCH}"

echo "==> Building AuraDeck frontend..."
cd "$PROJECT_ROOT"
npm ci
npm run build

echo "==> Preparing .deb staging directory: $STAGING"
rm -rf "$STAGING"
mkdir -p "$STAGING/DEBIAN"
mkdir -p "$STAGING/usr/lib/$PKGNAME"
mkdir -p "$STAGING/usr/bin"
mkdir -p "$STAGING/usr/share/applications"
mkdir -p "$STAGING/usr/share/icons/hicolor/512x512/apps"

# Copy application files
cp -r "$PROJECT_ROOT/dist" "$STAGING/usr/lib/$PKGNAME/"
cp -r "$PROJECT_ROOT/dist-server" "$STAGING/usr/lib/$PKGNAME/"
cp -r "$PROJECT_ROOT/electron" "$STAGING/usr/lib/$PKGNAME/"
cp -r "$PROJECT_ROOT/server" "$STAGING/usr/lib/$PKGNAME/"
cp -r "$PROJECT_ROOT/node_modules" "$STAGING/usr/lib/$PKGNAME/"
cp "$PROJECT_ROOT/package.json" "$STAGING/usr/lib/$PKGNAME/"
cp "$PROJECT_ROOT/package-lock.json" "$STAGING/usr/lib/$PKGNAME/"
cp "$PROJECT_ROOT/auradeck.sh" "$STAGING/usr/lib/$PKGNAME/auradeck.sh"
chmod +x "$STAGING/usr/lib/$PKGNAME/auradeck.sh"

# Create symlink wrapper
ln -sf "/usr/lib/$PKGNAME/auradeck.sh" "$STAGING/usr/bin/$PKGNAME"

# Copy desktop entry & icon
cp "$OUTPUT_DIR/auradeck.desktop" "$STAGING/usr/share/applications/"
cp "$OUTPUT_DIR/auradeck.png" "$STAGING/usr/share/icons/hicolor/512x512/apps/"

# Create DEBIAN/control file
cat << CONTROL_EOF > "$STAGING/DEBIAN/control"
Package: $PKGNAME
Version: $VERSION
Section: sound
Priority: optional
Architecture: $ARCH
Depends: electron | nodejs (>= 18), ffmpeg
Maintainer: Darnell
Description: High-Fidelity Studio Linux Audio Player & Synced Karaoke Lyrics Engine
 Standalone native Linux audio engine with 32:9 and 16:9 Turntable UI,
 real-time 128-band FFT spectrum visualizer, analog vinyl deck,
 and lossless FLAC/MP3/WAV streaming.

CONTROL_EOF

# Build package
if command -v dpkg-deb >/dev/null 2>&1; then
  dpkg-deb --build --root-owner-group "$STAGING" "$OUTPUT_DIR/${PKGNAME}_${VERSION}_${ARCH}.deb"
  echo "✔ Successfully created deb package: $OUTPUT_DIR/${PKGNAME}_${VERSION}_${ARCH}.deb"
else
  echo "[!] Note: 'dpkg-deb' not installed locally. Staging files are prepared at: $STAGING"
  echo "    On Debian/Ubuntu or CI/CD, run: dpkg-deb --build $STAGING ${PKGNAME}_${VERSION}_${ARCH}.deb"
fi
