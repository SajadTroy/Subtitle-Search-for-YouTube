# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-09-01

### Fixed
- **Automatic Subtitle Loading**: Resolved subtitle discovery delays where videos showed "no subtitles available" until manually toggling CC in the YouTube player.
- **Direct InnerTube API Querying**: Added automatic direct querying of `/youtubei/v1/player` using page runtime `ytcfg` credentials to instantly acquire `captionTracks` without waiting for the video player to initialize.
- **Subtitle Cue Validation**: Added segment validation across subtitle formats (`json3`, `srv1`, `raw`, `vtt`) in `inject.js` to ensure empty XML headers do not stall subtitle retrieval.
- **Auto-Retry on Video Playback**: Content script now attaches listeners to video `play` / `playing` events to automatically retry subtitle fetching if metadata was still initializing during initial page load.
- **UI Window Injection & Reconnection**: Fixed intermittent UI injection failures across YouTube layout experiments, theatre mode, and DOM re-renders via multi-selector fallbacks and continuous DOM connection checks.
- **Entity & Multi-segment Decoding**: Full HTML entity decoding (e.g. `&#39;`, `&quot;`, `&amp;`) and XML child `<s>` segment concatenation.

## [1.0.0] - 2026-08-29

### Added
- **Core Functionality**: Search through YouTube subtitles and instantly jump to timestamps.
- **Robust Fetching**: Implemented `inject.js` to reliably fetch subtitle data directly from the main world `ytInitialPlayerResponse` object, bypassing fragile DOM scraping.
- **Live Sync Engine**: Added an auto-scrolling feature that keeps the active subtitle centered while the video plays.
- **Smart Scroll Break**: Manual scrolling pauses the auto-sync, allowing users to browse ahead. Clicking the "Sync to Video" button snaps back to the live position.
- **Native UI**: Injected a clean, unobtrusive UI directly into the YouTube side-panel.
- **Dynamic Theming**: Full support for YouTube's native Light and Dark modes using dynamic CSS variables.
- **Visuals**: Added a custom edge-to-edge transparent red "CC" icon and updated the extension UI to use YouTube's primary red accent color.
- **Creator Support**: Added a subtle, unified "Buy Me A Coffee" button to the UI header.
