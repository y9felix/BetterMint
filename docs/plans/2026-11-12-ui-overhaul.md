# UI Overhaul & Progress Bar Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the in-game HUD progress bar (depth bar) and overhaul the extension settings popup into a self-contained, uniform, modern dark card layout.

**Architecture:** Approach A (Compact Unified Card Layout). Fully offline-first: eliminate external Google font imports and the 98KB FontAwesome bundle. Strip theme switcher logic in favor of a single dark slate palette (`#18181b`). Group settings into 4 clean cards with custom CSS toggle switches and live slider badges.

**Tech Stack:** Chrome Extension Manifest V3, HTML5, CSS3, Vanilla JavaScript.

**Spec:** [docs/2026-11-12-ui-overhaul-design.md](file:///home/felix/documents/extensions/BetterMint/BetterMint/docs/2026-11-12-ui-overhaul-design.md)

## Global Constraints

- Zero external network requests from the extension options or content scripts (no Google Fonts).
- 100% Manifest V3 compliant.
- Retain all core chess engine and auto-move configurations intact.
- Single fixed dark theme (`#18181b` background, `#27272a` cards).

## Review Focus

- Ensure `option-depth-bar` removal does not break `RestoreOptions()` or `ChromeRequest.getData()`.
- Ensure range slider values in `options.html` match the keys expected by `options.js` and `Mint.js`.
- Confirm `declarativeNetRequest` rules and manifest references are updated after deleting `depthbar.css`.
- Verify input events on all sliders update live numeric badges without lagging.

---

### Task 1: Remove HUD Progress Bar (Depth Bar)

**Files:**
- Delete: `BetterMint/css/depthbar.css`
- Modify: `BetterMint/manifest.json`
- Modify: `BetterMint/js/Mint.js`
- Modify: `BetterMint/js/loader.js`
- Modify: `BetterMint/js/options.js`

- [ ] Delete `BetterMint/css/depthbar.css`.
- [ ] In `BetterMint/manifest.json`, remove `"css/depthbar.css"` from `content_scripts[0].css`.
- [ ] In `BetterMint/js/Mint.js`:
  - Remove `this.depthBar = null;` from `BetterMint` constructor.
  - In `CreateAnalysisTools()`, remove `depthBarLayoutt` element creation, insertion, and `this.depthBar` query selector.
  - In `UpdateDepth()`, remove the block updating `this.depthBar.style.width` and classes.
  - In `enumOptions`, remove `DepthBar: "option-depth-bar"`.
- [ ] In `BetterMint/js/loader.js`, remove `"option-depth-bar"` from `inputObjects`.
- [ ] In `BetterMint/js/options.js`, remove `"option-depth-bar"` from `inputObjects`.
- [ ] Run `node -c` on all modified `.js` files to verify syntax.
- [ ] Commit changes: `git commit -m "Remove HUD progress bar and depthbar assets"`.

---

### Task 2: Refactor Settings Structure & Remove External Bloat ([options.html](file:///home/felix/documents/extensions/BetterMint/BetterMint/html/options.html))

**Files:**
- Modify: `BetterMint/html/options.html`

- [ ] Strip external `<link>` tags for `fonts.googleapis.com` (Exo 2, Comfortaa).
- [ ] Strip `<link>` tags for `css/fontawesome.css` and `css/material-icon.css`.
- [ ] Remove all embedded `<style>` blocks from `options.html` (migrate necessary rules to `css/options.css`).
- [ ] Remove obsolete modals: `#themes`, `.ModalBackground`, `.lmco`, `.lmcon`, `#learnmore`.
- [ ] Rebuild `options.html` body with a clean 380px container and 4 structured cards:
  1. **Engine Server**: Toggle (`option-api-stockfish`), URL input (`option-url-api-stockfish`), Sliders (`option-depth`, `option-multipv`, `option-hashtable-ram`, `option-num-cores`).
  2. **HUD & Display**: Toggles (`option-evaluation-bar`, `option-show-hints`, `option-move-analysis`, `option-text-to-speech`, `option-notifications`).
  3. **Auto Move**: Toggle (`option-legit-auto-move`), Sliders (`option-auto-move-time`, `option-auto-move-time-random`, `option-auto-move-time-random-div`, `option-auto-move-time-random-multi`, `option-best-move-chance`, `option-random-best-move`, `option-max-legit-auto-move-depth`, `option-fast-opening-moves`, `option-fast-opening-speed`).
  4. **Safety & Queue**: Toggles (`option-auto-queue`, `option-highmatechance`, `option-mate-finder-value`, `option-panic-mode`, `option-panic-time`).
- [ ] Commit changes: `git commit -m "Refactor options.html into unified semantic card layout"`.

---

### Task 3: Streamline Options Logic ([options.js](file:///home/felix/documents/extensions/BetterMint/BetterMint/js/options.js))

**Files:**
- Modify: `BetterMint/js/options.js`

- [ ] Remove theme handlers (`chrome.storage.local.get(["theme"])`, `ultradark`, `#themes` listeners).
- [ ] Remove modal event listeners (`#settingsb`, `#learnmore`, `window.onclick` modal closers).
- [ ] Update slider initialization to automatically sync value badges (e.g. updating `<span class="badge">` next to each slider label on `input` events).
- [ ] Ensure `OnOptionsChange` and `RestoreOptions` correctly bind all current inputs.
- [ ] Run `node -c BetterMint/js/options.js` to verify syntax.
- [ ] Commit changes: `git commit -m "Streamline options.js logic and add live slider badges"`.

---

### Task 4: Unified Modern Dark Theme ([css/options.css](file:///home/felix/documents/extensions/BetterMint/BetterMint/css/options.css))

**Files:**
- Modify: `BetterMint/css/options.css`

- [ ] Implement clean base layout: 380px width, `system-ui` typography, `#18181b` dark background, `#f4f4f5` text.
- [ ] Style header with BetterMint logo, title, and minimal popout button.
- [ ] Style `.card` containers: background `#27272a`, border `1px solid #3f3f46`, border-radius `8px`, clean padding.
- [ ] Implement modern toggle switch CSS:
  - Custom styled slider checkbox replacing browser default checkboxes.
  - Active color `#6366f1` (indigo).
- [ ] Implement modern range slider CSS:
  - Slim accent-colored track and clean circular thumb.
  - Live value badge styling (`background: #3f3f46`, rounded pill).
- [ ] Style text input for WebSocket URL with dark background `#18181b`, subtle border, and focus outline.
- [ ] Commit changes: `git commit -m "Implement modern dark CSS for extension options"`.

---

### Task 5: Verification & End-to-End Validation

**Files:**
- Inspect: all modified files

- [ ] Run syntax check across all JavaScript files:
  ```bash
  for f in BetterMint/js/*.js; do node -c "$f"; done
  ```
- [ ] Validate `manifest.json` formatting.
- [ ] Confirm no external network requests exist in HTML/CSS/JS.
- [ ] Final git status check and verification report.
