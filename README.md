# Cardeo Amp

> A local-first music player for people who still own their music.

Cardeo Amp is a lightweight, local-first music player focused on simplicity,
ownership, speed, and personality. It is intentionally the opposite of modern
streaming platforms: no accounts, no subscriptions, no cloud dependency, no
recommendation algorithms, and no social layer.

Just a fast, focused player for local music files.

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

The project should stay small, practical, and opinionated. It should play local
music files well before it does anything else.

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

## Local-First Philosophy

Cardeo Amp should treat local files as the primary source of truth. The browser
app should be able to open and play files selected by the user without uploading
them, indexing them remotely, or requiring a service account.

Future desktop builds may add deeper filesystem integration, but the guiding
idea remains the same: keep the user's library under the user's control.

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
- Playback controls
- Progress bar
- Volume
- Shuffle and repeat

### Future

- ID3 metadata
- Album artwork
- Visualizer
- Desktop app via Tauri
- Theme ecosystem
- Community-created skins

See [docs/roadmap.md](docs/roadmap.md) for the current roadmap.

## Architecture

The intended architecture is deliberately small:

```text
Player Engine
    +
Theme Layer
```

The player engine should own playback behavior and state. The theme layer should
own presentation. Themes should eventually be able to alter appearance without
changing functionality.

See [docs/architecture.md](docs/architecture.md) for the current architecture
notes.

## Contributing

Cardeo Amp is in its foundation phase. Contributions should support the core
vision before adding new surface area.

Good early contributions include:

- Clarifying documentation
- Improving accessibility expectations
- Refining architecture notes
- Discussing local-first design decisions
- Preparing small, focused implementation plans

Please avoid adding playback functionality until the project moves beyond Phase
1. The current priority is a clear foundation and shared project direction.

## License

Cardeo Amp is licensed under the MIT License.

MIT is a good fit because it is short, permissive, familiar to open-source
contributors, and friendly to experimentation. It allows people to use, modify,
distribute, and build on the project with minimal restriction while preserving
copyright and license notices.
