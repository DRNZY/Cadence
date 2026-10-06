#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_LIB="$HOME/.local/lib/cadence"
INSTALL_BIN="$HOME/.local/bin"
INSTALL_APPS="$HOME/.local/share/applications"
INSTALL_ICONS="$HOME/.local/share/icons/hicolor/512x512/apps"

cd "$PROJECT_DIR"
if [ "${CADENCE_SKIP_BUILD:-0}" != "1" ]; then
  npm run build:native
fi

mkdir -p "$(dirname "$INSTALL_LIB")" "$INSTALL_BIN" "$INSTALL_APPS" "$INSTALL_ICONS"
STAGE="$(mktemp -d "$HOME/.local/lib/cadence.stage.XXXXXX")"
BACKUP=""
trap 'if [ -n "$STAGE" ]; then rm -rf "$STAGE"; fi; if [ -n "$BACKUP" ] && [ -d "$BACKUP" ] && [ ! -d "$INSTALL_LIB" ]; then mv "$BACKUP" "$INSTALL_LIB"; fi' EXIT

cp -a dist "$STAGE/"
mkdir -p "$STAGE/dist-server" "$STAGE/native"
cp dist-server/standalone.mjs "$STAGE/dist-server/"
cp native/cadence-bin "$STAGE/native/"
if [ -d "$INSTALL_LIB" ]; then
  BACKUP="$(mktemp -d "$HOME/.local/lib/cadence.backup.XXXXXX")"
  rmdir "$BACKUP"
  mv "$INSTALL_LIB" "$BACKUP"
fi
mv "$STAGE" "$INSTALL_LIB"
STAGE=""

cat > "$INSTALL_BIN/cadence" <<'EOF'
#!/usr/bin/env bash
export WEBKIT_DISABLE_DMABUF_RENDERER=1
exec "$HOME/.local/lib/cadence/native/cadence-bin" "$@"
EOF
chmod +x "$INSTALL_BIN/cadence"

cat > "$INSTALL_APPS/cadence.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Cadence
GenericName=Music Player
Comment=Local music player with synced lyrics and audio controls
Exec=$INSTALL_BIN/cadence %U
Icon=cadence
Terminal=false
Categories=AudioVideo;Audio;Player;Music;
StartupWMClass=io.github.drnzy.cadence
Keywords=Music;Audio;Player;FLAC;Lyrics;Vinyl;Equalizer;Turntable;Cadence;
MimeType=audio/flac;audio/mpeg;audio/wav;audio/x-wav;audio/ogg;audio/aac;audio/mp4;
EOF

if [ -f "$PROJECT_DIR/packaging/cadence.png" ]; then
  cp "$PROJECT_DIR/packaging/cadence.png" "$INSTALL_ICONS/cadence.png"
fi

update-desktop-database "$INSTALL_APPS" 2>/dev/null || true
if [ -n "$BACKUP" ]; then
  rm -rf "$BACKUP"
  BACKUP=""
fi
echo "Cadence native desktop installed at $INSTALL_BIN/cadence"
