#!/usr/bin/env bash
set -euo pipefail

AUR_REPO="ssh://aur@aur.archlinux.org/auradeck.git"
PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="/tmp/auradeck-aur-push"

echo "==> Testing SSH connection to aur.archlinux.org..."
if ! ssh -o StrictHostKeyChecking=accept-new -T aur@aur.archlinux.org 2>&1 | grep -q "Interactive shell is disabled"; then
  echo ""
  echo "⚠️  AUR SSH Authentication Error: Permission denied."
  echo "👉 Please ensure your SSH public key is added to your AUR account at: https://aur.archlinux.org/account"
  echo ""
  echo "Your SSH Public Key to paste:"
  echo "----------------------------------------------------------------------"
  cat ~/.ssh/id_ed25519.pub 2>/dev/null || cat ~/.ssh/id_rsa.pub 2>/dev/null
  echo "----------------------------------------------------------------------"
  exit 1
fi

echo "==> Cloning AUR repository..."
rm -rf "$WORK_DIR"
git clone "$AUR_REPO" "$WORK_DIR"

echo "==> Copying validated package assets..."
cp "$PKG_DIR/PKGBUILD" "$WORK_DIR/"
cp "$PKG_DIR/.SRCINFO" "$WORK_DIR/"
cp "$PKG_DIR/auradeck.desktop" "$WORK_DIR/"
cp "$PKG_DIR/auradeck.png" "$WORK_DIR/"

cd "$WORK_DIR"
git add PKGBUILD .SRCINFO auradeck.desktop auradeck.png

if git diff-index --quiet HEAD --; then
  echo "✔ AUR package is already up to date."
else
  echo "==> Committing and pushing to AUR..."
  git commit -m "feat: release standalone v1.0.0"
  git push origin master
  echo "🎉 Successfully pushed AuraDeck to AUR! It is now live at: https://aur.archlinux.org/packages/auradeck"
fi
