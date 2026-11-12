# UI Overhaul & HUD Progress Bar Removal Design

## 1. Intent & Scope
Streamline and modernize the BetterMint extension UI:
1. Strip the in-game HUD progress bar (depth bar) completely from the extension and page injection.
2. Overhaul the settings popup ([options.html](file:///home/felix/documents/extensions/bm/html/options.html) and [css/options.css](file:///home/felix/documents/extensions/bm/css/options.css)) into a clean, uniform, self-contained single-page card layout (Approach A).
3. Remove the theme changing modal and toggles, locking to a single minimalist dark theme (`#18181b`).

## 2. Approaches Considered
- **Approach A (Selected): Compact Unified Card Layout:**
  - 380px wide single-page popup with 4 grouped sections (Engine, HUD, Auto Move, Safety).
  - Native system fonts (`system-ui`), zero external network requests (no Google Fonts), removal of 98KB `fontawesome.css`.
  - Unified modern toggle switches and sliders with live numeric badges.
- **Approach B (Rejected): Tabbed Navigation:**
  - Categorized tabs. Rejected to preserve single-glance visibility without click-switching.

## 3. Implementation Details

### A. HUD Progress Bar Removal
- Delete `css/depthbar.css`.
- Remove `css/depthbar.css` entry from `content_scripts.css` in `manifest.json`.
- In `js/Mint.js`:
  - Remove `this.depthBar` variable and initialization.
  - Delete `depthBarLayoutt` DOM creation and insertion logic in `CreateAnalysisTools()`.
  - Strip `this.depthBar` progress bar updates in `UpdateDepth()`.
- In `js/loader.js` and `js/options.js`:
  - Remove `option-depth-bar` default configuration and schema entries.

### B. Settings Popup Overhaul
- **Assets & Privacy:**
  - Strip external font stylesheets: `fonts.googleapis.com` (Exo 2, Comfortaa).
  - Drop `css/fontawesome.css` and `css/material-icon.css` imports from `options.html`.
  - Delete legacy modal code (`.ModalBackground`, `#settingsb`, `#learnmore`, theme switcher `theme: "ud"`).
- **Structure (4 Sections in [options.html](file:///home/felix/documents/extensions/bm/html/options.html)):**
  1. **Engine Server:**
     - Toggle: Use Engine Server (`option-api-stockfish`)
     - Input: WebSocket URL (`option-url-api-stockfish`)
     - Sliders: Search Depth (`option-depth`), MultiPV (`option-multipv`), Hash RAM (`option-hashtable-ram`), CPU Cores (`option-num-cores`)
  2. **HUD & Display:**
     - Toggles: Eval Bar (`option-evaluation-bar`), Show Hint Arrows (`option-show-hints`), Move Analysis (`option-move-analysis`), Sound/TTS (`option-text-to-speech`), Toast Notifications (`option-notifications`)
  3. **Auto Move:**
     - Toggle: Enable Auto Move (`option-legit-auto-move`)
     - Sliders: Base Delay (`option-auto-move-time`), Jitter Range (`option-auto-move-time-random`), Randomizer Divider/Multiplier (`option-auto-move-time-random-div`, `option-auto-move-time-random-multi`)
     - Accuracy: Best Move Chance (`option-best-move-chance`), Random Best Move (`option-random-best-move`), Max Depth (`option-max-legit-auto-move-depth`)
     - Opening: Fast Opening Moves (`option-fast-opening-moves`), Speed (`option-fast-opening-speed`)
  4. **Safety & Queue:**
     - Toggles: Auto Queue (`option-auto-queue`), Mate Finder (`option-highmatechance`, `option-mate-finder-value`)
     - Panic Mode: Toggle (`option-panic-mode`), Threshold (`option-panic-time`)
- **Styling ([css/options.css](file:///home/felix/documents/extensions/bm/css/options.css)):**
  - Dark slate palette (`bg: #18181b`, `cards: #27272a`, `accent: #6366f1` / `#4f46e5`, `border: #3f3f46`, `text: #f4f4f5`).
  - Sleek custom toggle switches (CSS pure checkbox).
  - Modern range sliders with live value badges synced in real time.
