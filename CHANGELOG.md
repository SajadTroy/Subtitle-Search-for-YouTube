# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-09-01

### Fixed
- **Automatic Subtitle Loading**: Fixed an issue where subtitles would fail to load unless captions were manually toggled on/off in the YouTube player.
- **SPA Navigation Caption Synchronization**: Intercepted InnerTube `/youtubei/v1/player` responses and added multi-source track discovery (`movie_player`, player caption modules, DOM player data, and same-origin HTML fallback) to ensure fresh caption tracks on all video transitions.
- **Main-World Proxy Fetching**: Subtitle timedtext data is now fetched with full same-origin credentials across JSON3, XML, and WebVTT formats.
- **UI Window Injection & Reconnection**: Fixed intermittent UI injection failures across YouTube layout experiments, theatre mode, and DOM re-renders via multi-selector fallbacks and continuous DOM connection checks.
- **Entity Decoding**: Added full HTML entity decoding (e.g. `&#39;`, `&quot;`, `&amp;`) in parsed subtitle segments.

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
