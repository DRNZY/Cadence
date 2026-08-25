# 🎧 AuraDeck — Studio Hi-Fi Linux Audio Engine

A high-fidelity local music player designed for Linux (CachyOS / Arch / Ubuntu / Fedora) with a 32:9 Super Ultrawide Panoramic turntable UI, combining Apple physical design (liquid materials, dynamic spring physics, depth-of-field focus) with Material 3 (expressive palette extraction, pill containers).

---

## ✨ Features

- **32:9 Ultrawide Panoramic Layout:** 4-zone responsive studio dashboard:
  1. **Spatial Library Browser:** Instant crawler with tag indexing, album art cards, format chips (`ALL`, `FLAC`, `MP3`, `LYRICS`), and live search.
  2. **Analog Vinyl Turntable:** Photorealistic spinning vinyl record with micro-grooves, dynamic tone-arm tracking, 33/45 RPM speed selector, and interactive vinyl scratching.
  3. **Synced Karaoke Lyrics:** Apple-style time-synced `.lrc` lyrics with active line glow, depth-of-field blur, and click-to-seek.
  4. **128-Band FFT Spectrum Visualizer:** Real-time Web Audio API frequency visualizer with 4 switchable modes (*Neon Bars, Harmonic Waves, Radial Starburst, CRT Oscilloscope*) + Up Next queue.
- **10-Band Graphic Equalizer:** High-fidelity parametric DSP chain with 8 studio presets (*Flat, Bass Boost, Vinyl Warmth, Vocal Clarity, Electronic, Hip-Hop 808, Acoustic, Club Punch*).
- **Format Support:** FLAC (Lossless 24-bit / 96kHz), MP3, WAV, M4A, OGG, OPUS, AAC.
- **Linux Native App Mode:** Standalone frameless window with Wayland hardware acceleration and MediaSession integration for Linux media keys.

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have `ffmpeg` / `ffprobe` and `Node.js` (v18+) installed:

**Arch / CachyOS:**
```bash
sudo pacman -S nodejs npm ffmpeg
```

**Ubuntu / Debian:**
```bash
sudo apt update && sudo apt install nodejs npm ffmpeg
```

**Fedora:**
```bash
sudo dnf install nodejs npm ffmpeg
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run the App
```bash
npm run dev
```
Open **`http://localhost:5173`** in your browser, or run `./auradeck.sh` to launch in standalone App mode.

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
| **Media Keys** | System Play/Pause, Next, Previous |
