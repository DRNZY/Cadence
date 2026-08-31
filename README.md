# Cadence

A local-first desktop music player and DSP audio engine for Linux and Windows.

## Overview

Cadence indexes local audio libraries, provides real-time WebAudio signal processing, and renders responsive deck interfaces with synchronized lyrics and spectrum analysis.

## Features

### Audio Engine and DSP
* Format support: FLAC (up to 24-bit / 192kHz), ALAC, WAV, AIFF, MP3, AAC, OGG, and OPUS.
* 10-band graphic equalizer with presets (Flat, Bass Boost, Vocal Clarity, Vinyl Warmth, Electronic, Hip-Hop).
* WebAudio DSP chain: binaural 3D spatialization, dynamic bass boost, analog tube saturation, and mastering limiter.
* ReplayGain loudness normalization, gapless playback, and configurable crossfade.

### Interface and Decks
* Four presentation modes: Square Album Cover (with 3D perspective tilt), Analog Vinyl Turntable (with scratch physics), Holographic CD, and Zen Minimal.
* Real-time spectrum visualizer with four visualization modes: Bars, Wave, Oscilloscope, and Radial.
* Synced karaoke lyrics with active timestamp scrolling and manual seek.
* Modular layouts: position the control bar at the bottom, top, or left sidebar; swap library and queue panels.
* Theme engine: dynamic album art palette extraction or custom dual-color gradient builder.

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
