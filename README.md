# Cardeo Amp

> A local-first music player for people who still own their music.

Cardeo Amp is a lightweight, local-first visual music player focused on
simplicity, ownership, speed, and personality. It is intentionally the opposite
of modern streaming platforms: no accounts, no subscriptions, no cloud
dependency, no recommendation algorithms, and no social layer.

Just a fast, focused listening surface for local music files.

Cardeo Amp takes inspiration from the spirit of classic desktop music software:
small, expressive, customizable, and direct. It is a modern descendant of that
era in attitude, not branding. The project is original and avoids trademark,
visual identity, and naming conflicts with existing players.

## Why?

Local music ownership still matters because access is not the same thing as
ownership. Streaming catalogs change, licenses expire, accounts get locked, and
internet access is not always available. A music collection you own should remain
playable on your terms.

Cardeo Amp exists for people who still keep albums, downloads, rips, demos,
mixes, and personal archives on their own machines and want software that treats
that library with respect.

## Vision

Cardeo Amp should feel:

- Fast enough to disappear.
- Simple enough to understand immediately.
- Personal enough to feel like yours.
- Local-first enough to work without accounts, servers, or subscriptions.
- Open enough for the community to shape over time.

The project should stay small, practical, and opinionated. The current direction
is visualization-first: the browser viewport becomes a calm visual listening
surface, while playback controls stay compact and secondary.

## Principles

- Local-first: the user's music lives on the user's device.
- Ownership over access: owned files should remain useful without a platform.
- No required accounts: playback should never depend on identity services.
- No cloud dependency: the app should work offline by default.
- No recommendation algorithms: the listener chooses what to play.
- No social features: this is a music player, not a network.
- Speed over ceremony: opening and playing music should be quick.
- Personality without clutter: the app can have character without becoming busy.
- Function before themes: themes can change appearance, not core behavior.
- Visualization as interface: music should feel visually alive without turning
  the app into busy DJ software.

## Local-First Philosophy

Cardeo Amp should treat local files as the primary source of truth. The browser
app should be able to open and play files selected by the user without uploading
them, indexing them remotely, or requiring a service account.

Future desktop builds may add deeper filesystem integration, but the guiding
idea remains the same: keep the user's library under the user's control.

Saved playlists are stored locally in the browser. Browser security prevents a
web app from silently reopening arbitrary files after a reload, so saved
playlists currently preserve playlist names and track metadata. If matching
local files are already loaded in the session, a saved playlist can relink to
them. Deeper file-handle persistence is a future fit for the File System Access
API or a desktop build.

## Visualization Direction

Cardeo Amp now treats the visualization as the primary experience. The app uses
the Web Audio API, a stable `AudioContext`, an `AnalyserNode`, and an HTML canvas
renderer. Visualization modes can be switched without interrupting playback.

Current modes:

- Spectrum: smooth monochromatic frequency bars.
- Waveform: an oscilloscope-style time-domain line.
- Radial: a circular ambient visualization influenced by bass energy.

Future visualization modes may include particle fields, generative landscapes,
and other audio-reactive art systems.

## Themeability Vision

Cardeo Amp should eventually support a theme layer that can alter the player's
appearance without changing playback functionality. Themes should make the app
feel personal while keeping controls recognizable, accessible, and reliable.

The long-term goal is a healthy theme and skin ecosystem, including
community-created visual styles. Theme support should be designed carefully and
introduced after the core player experience is stable.

## Roadmap

### V1

- Local MP3 file picker
- Drag-and-drop support
- Playlists
- Saved playlist metadata
- Playback controls
- Progress bar
- Volume
- Shuffle and repeat
- Fullscreen canvas visualizations
- Playlist, EQ, and visualization drawers

### Future

- ID3 metadata
- Album artwork
- Additional visualization modes
- File System Access API playlist relinking
- Desktop app via Tauri
- Theme ecosystem
- Community-created skins

See [docs/roadmap.md](docs/roadmap.md) for the current roadmap.

## Architecture

The intended architecture is still deliberately small, but the product now has a
clearer separation of concerns:

```text
Audio Engine
Playback State
Playlist Management
EQ State
Visualization Renderer
UI Shell
```

The audio engine owns the browser audio graph. Playback state and playlist
management stay separate from visualization rendering. The visualization layer
reads analyser data but does not control playback. Themes should eventually be
able to alter appearance without changing functionality.

See [docs/architecture.md](docs/architecture.md) for the current architecture
notes.

## Contributing

Cardeo Amp is early, but playable. Contributions should support the core vision
before adding new surface area.

Good early contributions include:

- Improving playback reliability
- Improving accessibility for canvas-first controls
- Refining visualization performance
- Clarifying local-first playlist persistence
- Keeping new features small, focused, and browser-local

## License

Cardeo Amp is licensed under the MIT License.

MIT is a good fit because it is short, permissive, familiar to open-source
contributors, and friendly to experimentation. It allows people to use, modify,
distribute, and build on the project with minimal restriction while preserving
copyright and license notices.
