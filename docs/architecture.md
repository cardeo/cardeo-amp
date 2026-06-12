# Architecture

Cardeo Amp should start with a deliberately small architecture.

```text
Player Engine
    +
Theme Layer
```

The current goal is clarity, not completeness. The architecture should leave
room for a React + Vite implementation while avoiding abstractions that are not
needed yet.

## Player Engine

The player engine should own playback behavior and player state.

Expected responsibilities include:

- Loading user-selected local audio files
- Managing the active track
- Playing, pausing, and seeking
- Tracking duration and progress
- Managing volume
- Managing playlist order
- Supporting shuffle and repeat behavior

The player engine should not depend on a specific visual theme.

## Theme Layer

The theme layer should own presentation.

Expected responsibilities include:

- Colors
- Typography
- Spacing
- Control appearance
- Layout styling
- Visual texture and personality

Themes should eventually be able to alter how the player looks without changing
what the player does. A theme should not change playback rules, file handling,
playlist behavior, or control semantics.

## Current Intent

Keep the system lightweight. Build the core player first, then introduce
themeability once the core interactions are stable enough to protect.

Avoid designing a plugin system, theme marketplace, or desktop architecture
before the browser-based V1 proves the foundation.
