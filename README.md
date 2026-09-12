# Cadence

A modern, high-fidelity studio desktop audio player, DSP acoustic engine, and synchronized lyrics canvas for Linux, macOS, and Windows.

## Highlights

* **Precision Audio & DSP**: Bit-perfect 32-bit floating point audio engine supporting FLAC (up to 24-bit/192kHz), ALAC, WAV, MP3, AAC, and OPUS with a 10-band parametric EQ, tube saturation, dynamic bass boost, and ReplayGain loudness normalization.
* **Fluid Presentation**: Native resolution auto-scaling, customizable motion blur dynamics, customizable bottom player bar (floating pill or edge-to-edge dock), and realistic deck representations (Album Art, Analog Vinyl Turntable with scratch physics, and Metallic CD).
* **Synchronized Lyrics**: Sub-millisecond LRC lyrics sync with smooth auto-centering viewport tracking, instant fuzzy search, and romanization fallback.
* **Native Desktop Integration**: Linux D-Bus MPRIS2 media player controls, PipeWire/PulseAudio integration, system media keys, and Last.fm scrobbling.

## Installation

### Releases
Download pre-built packages for Linux (.deb, .AppImage), macOS (.dmg), and Windows (.exe) from [Releases](https://github.com/DRNZY/Cadence/releases/latest).

### Flatpak
Cadence is submitted to Flathub. To build or install locally:
```bash
flatpak-builder --user --install --force-clean build-dir packaging/flatpak/io.github.DRNZY.Cadence.yml
flatpak run io.github.DRNZY.Cadence
```

## Development

```bash
# Clone repository
git clone https://github.com/DRNZY/Cadence.git
cd Cadence

# Install dependencies
npm install

# Start local server and client
npm run dev
```

### Build

```bash
npm run build
npm run build:server
npm run dist
```

## CLI Usage

Control playback headlessly or bind hotkeys using `cadence-ctl`:

```bash
cadence-ctl play "Artist - Title"
cadence-ctl pause
cadence-ctl resume
cadence-ctl toggle
cadence-ctl status
```

## License

MIT
