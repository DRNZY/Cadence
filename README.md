# 🎧 AuraDeck — Studio Hi-Fi Audio Engine

A high-fidelity standalone music player and real-time synchronized karaoke lyrics engine for **Windows** and **Linux** (CachyOS / Arch / Ubuntu / Fedora / Pop!_OS) with an adaptive **Studio 16:9** and **32:9 Super Ultrawide Panoramic** turntable UI, combining Apple physical design (liquid materials, dynamic spring physics, depth-of-field focus) with high-end DSP studio engineering.

---

## ⚡ Quick Download & Install

### 🪟 Windows
- **[Download Windows Installer (.exe)](https://github.com/DRNZY/Auradeck/releases/download/v1.1.0/AuraDeck-Setup-1.1.0.exe)** — Standard NSIS setup with Desktop & Start Menu shortcuts.
- **[Download Windows Portable (.exe)](https://github.com/DRNZY/Auradeck/releases/download/v1.1.0/AuraDeck-Portable-1.1.0.exe)** — Standalone single executable (zero installation required).

### 📦 Arch Linux / CachyOS / Manjaro
```bash
sudo pacman -U https://github.com/DRNZY/Auradeck/releases/download/v1.1.0/auradeck-1.0.0-1-any.pkg.tar.zst
```

### 🛠️ Build & Install from Source via Makepkg
```bash
git clone https://github.com/DRNZY/Auradeck.git
cd Auradeck/packaging
makepkg -si
```

### 🚀 Portable Archive (Any Linux Distro)
Download [`auradeck.tar.gz`](https://github.com/DRNZY/Auradeck/releases/download/v1.1.0/auradeck.tar.gz) from [Releases](https://github.com/DRNZY/Auradeck/releases/tag/v1.1.0), extract, and run `./auradeck.sh`.

---

## ✨ Features

- **100% Standalone Desktop App:** Runs via native Electron with hardware-accelerated rendering and in-process backend management — zero external browser dependency.
- **🎤 Online Synced Karaoke Lyrics (LRCLIB):** Automatic cloud lookup for millisecond-accurate synchronized lyrics with active line scaling, ambient text glow, depth-of-field blur, and click-to-seek.
- **Adaptive Responsive Layouts:**
  - **🎛️ Studio 16:9 Mode:** 3-column layout (`[Library (33%)]` | `[Vinyl Turntable (42%)]` | `[Lyrics & Visualizer/Queue (25%)]`) tailored for 1080p, 1440p, 4K monitors and laptops.
  - **🌟 Ultrawide 32:9 Mode:** 4-column panoramic studio for super ultrawide and multi-monitor setups.
  - **🎵 Vinyl Stage Mode:** Hero centerpiece turntable with dual FFT spectrum visualizers.
  - **📚 Library Focus Mode:** Expanded discography album card grid.
- **Analog Turntable Vinyl Deck:** Photorealistic spinning vinyl record with micro-grooves, dynamic tone-arm tracking, 33/45 RPM speed selector, Holo CD & Glass Minimal modes, and interactive vinyl scratching.
- **128-Band FFT Spectrum Visualizer:** Real-time Web Audio API frequency visualizer with 4 switchable modes (*Neon Bars, Harmonic Waves, Radial Starburst, CRT Oscilloscope*) + Up Next queue.
- **10-Band Graphic Equalizer:** High-fidelity parametric DSP chain with 8 studio presets (*Flat, Bass Boost, Vinyl Warmth, Vocal Clarity, Electronic, Hip-Hop 808, Acoustic, Club Punch*).
- **Format Support:** FLAC (Lossless 24-bit / 96kHz), MP3, WAV, M4A, OGG, OPUS, AAC.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **`Space`** | Play / Pause |
| **`→` / `←`** | Next Track / Previous Track |
| **`Shift + →` / `Shift + ←`** | Seek 10s Forward / Backward |
| **`↑` / `↓`** | Master Volume Up / Down |
| **`M`** | Toggle Mute |
| **`E`** | Open / Close 10-Band Equalizer |
| **`F` / `F11`** | Toggle Fullscreen |
| **Media Keys** | System Play/Pause, Next, Previous |
