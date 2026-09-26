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
npm run build        # typecheck, build the client, bundle the server
npm run dist         # build, then package for the current platform
```

`npm run dist` infers the electron-builder targets from the host platform and
calls the same `npm run build` the other targets use:

| Platform | Targets |
|---|---|
| Linux | AppImage, tar.gz, deb |
| Windows | nsis, zip |
| macOS | zip |

Useful flags:

```bash
npm run dist -- --dry-run       # print the steps, build nothing
npm run dist -- --dir           # unpacked output, no installer
npm run dist -- --skip-build    # package whatever is already in dist/
npm run dist -- --targets "zip" # override the inferred list
```

Per-platform scripts remain available if you want to cross-package:
`npm run build:linux`, `npm run build:win`, `npm run build:mac`, and
`npm run build:all` for every platform at once.

### A note on `dist-server/`

`npm run build:server` bundles the server to `dist-server/index.mjs`, and
`electron/main.cjs` loads that `.mjs` file. `dist-server/` is a build directory
and is gitignored.

If a stale `dist-server/index.cjs` is sitting there, it is a leftover from an
earlier CommonJS build. Nothing references it, but `electron-builder.json`
packages `dist-server/**/*`, so it will still be copied into the installer.
`npm run dist` prints a note when it finds one. Delete it if you do not want it
shipped.

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
