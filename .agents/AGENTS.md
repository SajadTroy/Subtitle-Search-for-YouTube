# Extension Guidelines & Architecture

## Core Rule
**DO NOT USE ANY COMMENTS IN THE CODE.** All code files (`.js`, `.css`, etc.) must be completely stripped of comments. Documentation and structure should be maintained solely within this `agents.md` file. Any updates, creations, or deletions to the extension's structure must be reflected here.

## Folder Structure & File Usage

- **`manifest.json`**: The Chrome Extension Manifest (V3). Defines permissions, host access (`*://*.youtube.com/*`), content scripts, and web accessible resources.
- **`content.js`**: The primary content script injected into YouTube. It handles:
  - Multi-event navigation tracking (`yt-navigate-finish`, `yt-page-data-updated`, `yt-player-updated`, `popstate`) and interval-based health checking.
  - Multi-target resilient UI DOM injection and automatic reconnection.
  - Subtitle coordination: requesting tracks, multi-language prioritization, and triggering fallbacks.
  - Automatic playback retry triggers on video `play`/`playing` events.
  - Parsing XML (`<text>`, `<p>`, `<s>`), JSON3, and WebVTT timed text with full HTML entity decoding.
  - Video synchronization (real-time timestamp tracking and auto-scrolling transcript).
  - Manual scroll/interaction detection to toggle auto-sync state and display the "Sync to Video" action button.
  - Subtitle search with live term highlighting and time jumping.
- **`inject.js`**: A script injected directly into the Main World of the page. Because content scripts live in an Isolated World, they cannot directly read internal player states or intercept page-level network calls. This script handles:
  - Direct InnerTube `/youtubei/v1/player` POST requests using YouTube's page runtime `window.ytcfg` context.
  - Intercepting `fetch` and `XMLHttpRequest` for `api/timedtext` and InnerTube `/youtubei/v1/player` / `/youtubei/v1/next` endpoints to capture fresh player responses and caption tracks on SPA transitions.
  - Main-world multi-source caption track discovery (`cachedPlayerResponses`, direct InnerTube API, `movie_player.getPlayerResponse()`, `movie_player.getOption('captions', 'tracklist')`, `ytd-watch-flexy`/`grid` DOM data, `window.ytInitialPlayerResponse`, and direct HTML watch page fetch fallback).
  - Validating subtitle cue presence across formats (`fmt=json3`, `fmt=srv1`, `raw`, `fmt=vtt`) before returning fetched subtitle payloads to avoid empty XML stall.
  - Main-world same-origin proxy fetching for subtitle timed text.
  - Silent player caption activation with automatic preference restoration.
- **`styles.css`**: Defines the user interface. It utilizes CSS Variables tied to YouTube's `<html dark>` attribute to seamlessly toggle between YouTube's native Light and Dark themes.
- **`LICENSE`**: The MIT open-source license for the project.
- **`README.md`**: Provides an overview, features, and installation instructions for the project.
- **`CHANGELOG.md`**: Tracks notable changes, versions, and updates to the project.
- **`PRIVACY.md`**: Details the project's zero-data-collection privacy policy.

## Update Log
*Note: Add a new entry here whenever a file is created, modified significantly, or deleted.*
- **2026-08-29**: Created base extension files (`manifest.json`, `content.js`, `inject.js`, `styles.css`). Implemented core search, live-sync auto-scrolling, native YouTube theming, and stripped all comments from code per user rules.
- **2026-08-29**: Added standard MIT open-source `LICENSE` file.
- **2026-08-29**: Added subtle Buy Me A Coffee logo to the UI header, sourcing the SVG from the local `src` folder, and updated manifest permissions.
- **2026-08-29**: Generated edge-to-edge transparent `icon.svg` using the Material CC shape, converted it to `16`, `48`, and `128` PNGs using `sips`, updated UI CSS variables to YouTube Red, and added `README.md`, `CHANGELOG.md`, and `PRIVACY.md`.
- **2026-09-01**: Resolved subtitle loading failures on video playback and intermittent UI window visibility issues. Enhanced `inject.js` with InnerTube `/youtubei/v1/player` direct API querying and interception, multi-source caption discovery, subtitle cue validation across formats, and automatic player caption triggering. Updated `content.js` with continuous DOM connection health checks, playback event retry listeners, multi-selector fallback injection, full HTML entity decoding, and multi-language track prioritization. Verified zero comments in code per extension guidelines.
