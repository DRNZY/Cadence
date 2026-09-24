# Cadence

A desktop audio player, DSP engine, and synchronized lyrics canvas for Linux, macOS, and Windows.

## Features

* 32-bit floating point audio engine supporting FLAC (up to 24-bit/192kHz), ALAC, WAV, MP3, AAC, and OPUS with a 10-band parametric EQ, tube saturation, dynamic bass boost, and ReplayGain loudness normalization.
* Customizable UI layouts with motion scaling, dockable player controls, and visualizers (Album Art, Analog Turntable, and CD modes).
* Sub-millisecond synchronized LRC lyrics with auto-centering viewport tracking and search.
* Native desktop integration with Linux MPRIS2 media player controls, PipeWire/PulseAudio support, system media keys, and Last.fm scrobbling.

## Installation

### Releases
Download pre-built packages for Android (.apk), Linux (.deb, .AppImage), macOS (.dmg), and Windows (.exe) from [Releases](https://github.com/DRNZY/Cadence/releases/latest).

### Flatpak
To build or install locally via flatpak-builder:

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

## CLI usage

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
