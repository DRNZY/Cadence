# Cadence 2.1

A high-fidelity studio desktop audio player, DSP acoustic engine, and synchronized lyrics canvas for Linux, macOS, and Windows.

## Overview

Cadence indexes local audio libraries, provides bit-perfect WebAudio 32-bit floating point DSP signal processing, and renders responsive deck interfaces with precision synchronized lyrics and living hardware spectrum analysis.

## What's New in v2.1
* **Welcome Launchpad**: Engaging quick-start hub with one-click library shuffle, collection explorer, and ambient living waveforms even when idle.
* **Centered Synced Lyrics Engine**: Sub-millisecond synchronized lyrics calculated with dynamic viewport bounding box math, automatically centering the active lyric across any screen resolution with zero manual adjustment.
* **Edge-to-Edge Integrated Pro Dock**: Sleek, full-width docked transport controls eliminating dead void space on ultrawide and standard displays.
* **Adaptive Fluid Resizing**: Unrestricted panel resizing up to 55% of viewport width, proportional auto-scaling for ultrawide monitors, and double-click to auto-balance layout.
* **Dedicated Studio Light & Dark Themes**: Comprehensive frosted daylight and obsidian neon glass styles configurable directly from Studio Settings.
* **Persistent User Configurations**: Automatic disk-backed settings and playlist preservation across app updates.

## Features

### Audio Engine and DSP
* Format support: FLAC (up to 24-bit / 192kHz), ALAC, WAV, AIFF, MP3, AAC, OGG, and OPUS.
* 10-band graphic equalizer with presets (Flat, Bass Boost, Vocal Clarity, Vinyl Warmth, Electronic, Hip-Hop).
* WebAudio DSP chain: binaural 3D spatialization, dynamic bass boost, analog tube saturation, and mastering limiter.
* ReplayGain loudness normalization, gapless playback, and configurable crossfade.

### Interface and Decks
* Three primary layout modes: **Studio** (fluid 3-panel modular workspace), **Stage** (hero visual focus + full lyrics canvas), and **Library** (full-collection catalog browser).
* Four deck presentation styles: Square Album Cover (with 3D perspective tilt), Analog Vinyl Turntable (with real-time DJ scratch physics), Holographic CD, and Zen Minimal.
* Real-time spectrum visualizer with living idle waveforms across four modes: Bars, Wave, Oscilloscope, and Radial.
* Synced karaoke lyrics with active timestamp auto-scrolling, click-to-seek, and manual search.
* Modular widgets: reorderable spectrum, lyrics, queue, and audio specs with live drag & drop reordering.

### System Integration
* Last.fm 2.0 integration: real-time Scrobbling, Now Playing updates, and track favorites.
* Linux desktop integration: D-Bus MPRIS2 protocol, hardware media keys, and PipeWire support.
* Local CLI controller: `cadence-ctl` for terminal playback, search, and headless downloads via Nicotine+.

## Getting Started

### Prerequisites
* Node.js 18 or newer
* npm or bun

### Installation and Development
```bash
# Clone repository
git clone https://github.com/DRNZY/Cadence.git
cd Cadence

# Install dependencies
npm install

# Start local server and client
npm run dev
```

### Building Application
```bash
# Compile client and backend server
npm run build
npm run build:server

# Package desktop installer
npm run dist
```

## CLI Usage

Use `cadence-ctl` to control playback from the terminal or keybindings:

```bash
cadence-ctl play "Artist - Title"
cadence-ctl pause
cadence-ctl resume
cadence-ctl toggle
cadence-ctl status
cadence-ctl lastfm login
```

## License

MIT (c) [Darnell](https://github.com/DRNZY)
