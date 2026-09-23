#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_LIB="$HOME/.local/lib/cadence"
INSTALL_BIN="$HOME/.local/bin"
INSTALL_APPS="$HOME/.local/share/applications"
INSTALL_ICONS="$HOME/.local/share/icons/hicolor/512x512/apps"

echo "[Cadence Installer] Building and installing Cadence locally..."

cd "$PROJECT_DIR"
npm run build
npx electron-builder --linux --dir

mkdir -p "$INSTALL_LIB" "$INSTALL_BIN" "$INSTALL_APPS" "$INSTALL_ICONS"

# Copy unpacked Linux Electron bundle
echo "[Cadence Installer] Syncing binaries to $INSTALL_LIB..."
rm -rf "$INSTALL_LIB"/*
cp -a "$PROJECT_DIR/release/linux-unpacked/"* "$INSTALL_LIB/"

# Ensure desktop entry exists and points to local launcher
cat << 'EOF' > "$INSTALL_APPS/cadence.desktop"
[Desktop Entry]
Version=1.0
Type=Application
Name=Cadence
GenericName=Music Player
Comment=Audiophile turntable music player with synced lyrics and dynamic visualizers
Exec=/home/darnell/.local/bin/cadence %U
Icon=cadence
Terminal=false
Categories=AudioVideo;Audio;Player;Music;
StartupWMClass=Cadence
Keywords=Music;Audio;Player;FLAC;Lyrics;Vinyl;Equalizer;Turntable;Cadence;
MimeType=audio/flac;audio/mpeg;audio/wav;audio/x-wav;audio/ogg;audio/aac;audio/mp4;
EOF

# Copy desktop icon
if [ -f "$PROJECT_DIR/packaging/cadence.png" ]; then
  cp "$PROJECT_DIR/packaging/cadence.png" "$INSTALL_ICONS/cadence.png"
  mkdir -p "$HOME/.local/share/icons/hicolor/scalable/apps"
  cp "$PROJECT_DIR/packaging/cadence.png" "$HOME/.local/share/icons/hicolor/scalable/apps/cadence.png"
fi

# Ensure /home/darnell/.local/bin/cadence launcher script exists and is executable
cat << 'EOF' > "$INSTALL_BIN/cadence"
#!/usr/bin/env bash
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}"
exec /home/darnell/.local/lib/cadence/cadence --ozone-platform-hint=auto "$@"
EOF
chmod +x "$INSTALL_BIN/cadence"

# Update desktop database
update-desktop-database "$INSTALL_APPS" 2>/dev/null || true
gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

VERSION="$(node -p "require('./package.json').version")"
echo "[Cadence Installer] Successfully installed Cadence v${VERSION} to $INSTALL_LIB and $INSTALL_BIN/cadence."
