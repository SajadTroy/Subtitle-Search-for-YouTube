# Changelog

All notable changes to this project will be documented in this file.

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
