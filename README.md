# Cadence

A Linux desktop audio player with a Web Audio DSP engine and synchronized lyrics.

## Features

* 32-bit floating point audio engine supporting FLAC (up to 24-bit/192kHz), ALAC, WAV, MP3, AAC, and OPUS with a 10-band parametric EQ, tube saturation, dynamic bass boost, and ReplayGain loudness normalization.
* Customizable UI layouts with motion scaling, dockable player controls, and visualizers (Album Art, Analog Turntable, and CD modes).
* Sub-millisecond synchronized LRC lyrics with auto-centering viewport tracking and search.
* Local playback controls, Last.fm scrobbling, Discord presence, and remote control through `cadence-ctl`.

## Installation

The current desktop build uses GTK 3 and the system WebKitGTK 4.1 engine. On Arch or CachyOS, install the build and runtime packages:

```bash
sudo pacman -S --needed base-devel pkgconf gtk3 webkit2gtk-4.1 libsoup3 json-glib nodejs ffmpeg
```

Build and install locally:

```bash
npm ci
npm run install:local
cadence
```

The installed Cadence files are under `~/.local/lib/cadence`; the launcher is `~/.local/bin/cadence`. The UI uses the native window titlebar. Audio still plays in the visible Cadence window.

## Development

Run the server, Vite, and native window together:

```bash
npm run dev
```

Build the client, standalone Node server, and native shell:

```bash
npm run build
npm run dist
```

`npm run dist` creates a Linux tarball containing the prebuilt shell, UI, and server. Extract it and run `CADENCE_SKIP_BUILD=1 bash scripts/install-local.sh` to install without npm. Node.js and the GTK/WebKit packages remain system requirements. Older Electron release packages are historical; this native build does not produce Windows or macOS packages.

## CLI usage

Control the desktop player or bind hotkeys using `cadence-ctl`:

```bash
cadence-ctl play "Artist - Title"
cadence-ctl pause
cadence-ctl resume
cadence-ctl toggle
cadence-ctl status
```

## License

MIT
