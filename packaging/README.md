# Cadence Linux packaging guide

Cadence runs as a standalone desktop application using Electron, Web Audio, and an Express PipeWire/ALSA backend.

---

## 1. Arch Linux / AUR (Arch User Repository)

Installable via AUR helpers:

```bash
paru -S cadence-player
# or
yay -S cadence-player
```

---

## 2. Debian / Ubuntu (APT / .deb)

### Build .deb package

```bash
./packaging/build-deb.sh
```

Install:

```bash
sudo apt install ./packaging/cadence_1.0.0_all.deb
```

---

## 3. Flatpak

```bash
flatpak-builder --user --install --force-clean build-dir packaging/flatpak/io.github.DRNZY.Cadence.yml
flatpak run io.github.DRNZY.Cadence
```
