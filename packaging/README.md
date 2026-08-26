# AuraDeck Standalone Desktop Packaging Guide

AuraDeck is now a **100% standalone native Linux desktop application** powered by Electron, Web Audio API, and an Express PipeWire/ALSA backend. It does not launch or touch external web browsers.

---

## 1. Arch Linux / AUR (Arch User Repository)

Installable via standard AUR helpers:
```bash
paru -S auradeck
# or
yay -S auradeck
```

### Steps to Submit & Publish to AUR:
1. **Create an account** on [aur.archlinux.org](https://aur.archlinux.org) and register your SSH key (`~/.ssh/id_ed25519.pub`).
2. **Clone the official AUR repo namespace**:
   ```bash
   git clone ssh://aur@aur.archlinux.org/auradeck.git /tmp/auradeck-aur
   ```
3. **Copy the pre-configured packaging files**:
   ```bash
   cp /home/darnell/Projects/auradeck/packaging/PKGBUILD /tmp/auradeck-aur/
   cp /home/darnell/Projects/auradeck/packaging/.SRCINFO /tmp/auradeck-aur/
   cp /home/darnell/Projects/auradeck/packaging/auradeck.desktop /tmp/auradeck-aur/
   cp /home/darnell/Projects/auradeck/packaging/auradeck.png /tmp/auradeck-aur/
   ```
4. **Push to AUR**:
   ```bash
   cd /tmp/auradeck-aur
   git add PKGBUILD .SRCINFO auradeck.desktop auradeck.png
   git commit -m "feat: initial standalone release v1.0.0"
   git push origin master
   ```
5. AuraDeck is immediately live on the AUR for all Arch Linux, CachyOS, and Manjaro users.

---

## 2. Debian / Ubuntu / Pop!_OS (APT / .deb)

### Build `.deb` Package:
```bash
./packaging/build-deb.sh
```
Installs with:
```bash
sudo apt install ./packaging/auradeck_1.0.0_all.deb
```

---

## 3. Responsive Screen Adaptability

AuraDeck dynamically auto-detects and adapts to screen aspect ratios:
- **🎛️ Studio 16:9 (Default):** Balanced 3-column layout (`[Library]` | `[Vinyl Deck]` | `[Lyrics & Visualizer]`) tailored for 1080p, 1440p, 4K standard monitors and laptops.
- **🌟 Ultrawide 32:9:** 4-column panoramic studio for super ultrawide and multi-monitor setups.
- **🎵 Vinyl Stage:** Centered hero turntable with split FFT visualizer.
- **📚 Library Focus:** Expanded discography album grid.
