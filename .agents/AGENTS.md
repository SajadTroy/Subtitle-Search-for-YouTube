# Extension Guidelines & Architecture

## Core Rule
**DO NOT USE ANY COMMENTS IN THE CODE.** All code files (`.js`, `.css`, etc.) must be completely stripped of comments. Documentation and structure should be maintained solely within this `agents.md` file. Any updates, creations, or deletions to the extension's structure must be reflected here.

## Folder Structure & File Usage

- **`manifest.json`**: The Chrome Extension Manifest (V3). Defines permissions, host access (`*://*.youtube.com/*`), content scripts, and web accessible resources.
- **`content.js`**: The primary content script injected into YouTube. It handles:
  - SPA navigation (`yt-navigate-finish`)
  - Fetching subtitle XML and parsing it
  - Injecting the search UI into the DOM
  - Video synchronization (auto-scrolling transcript)
  - Intercepting manual user scrolling to break sync
- **`inject.js`**: A script injected directly into the Main World of the page. Because content scripts live in an Isolated World, they cannot directly read variables like `window.ytInitialPlayerResponse`. This script fetches the player response and uses `postMessage` to pass the subtitle URL back to `content.js`.
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
