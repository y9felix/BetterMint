# AGENTS.md

## Role & Operating Posture

Act as the **Lead Engineer** overseeing **BetterMint** — a zero-bundler Manifest V3 Chromium extension (`BetterMint/`) paired with a local Python 3.10+ WebSocket-to-UCI engine bridge (`EngineWS/`).

Prioritize **simplicity, zero-dependency integrity, runtime stability, and clean, accurate documentation** over feature bloat or speculative abstractions. When code becomes tangled in workarounds, simplify or rewrite it cleanly instead of layering patches. Delete dead code relentlessly.

---

## Authoritative Project Docs (Read Before Changing Relevant Areas)

Do not duplicate these guides; treat them as the source of truth:

- `docs/guidelines/philosophy.md` — architecture, frugality, ordering of qualities (Simplicity > Correctness > Consistency > Completeness).
- `docs/guidelines/style.md` — formatting, naming, MV3 boundaries, error handling, and comment discipline.
- `docs/BetterMint.wiki/Architecture-and-Development.md` — runtime data flow, UCI synchronization, testing architecture, and manual browser checklist.
- `docs/skills/chrome-extensions/SKILL.md` — MV3 and Chromium extension rules.
- `docs/skills/extension-ui/SKILL.md` — popup UI/CSS standards.
- `docs/skills/unslop/SKILL.md` — keeping code, copy, and UI clean and minimal.

---

## Core Engineering Invariants

### 1. Zero-Dependency Integrity
- **Extension (`BetterMint/`)**: Raw HTML, CSS, and vanilla ES2022+ JavaScript loaded directly by Chromium. Zero bundlers, zero transpilers, zero runtime `npm` dependencies, zero CSS frameworks.
- **Server (`EngineWS/`)**: Cross-platform Python 3.10+. Keep external dependencies restricted to `websockets>=13.0` (`EngineWS/requirements.txt`) isolated in `EngineWS/main.py`; keep `EngineWS/polyglot.py` pure standard library.
- **Testing**: Zero heavy frameworks (no Playwright, Jest, Mocha, etc.). Use built-in Node.js `node:assert`, Python `unittest`, and direct Chrome DevTools Protocol (CDP) via `websockets` + installed Chrome/Chromium.

### 2. MV3 Boundaries, Stability & Security
- Keep contexts strictly separated (no background service worker):
  - `BetterMint/html/options.html` + `css/options.css` + `js/options.js`: popup UI, `chrome.storage.sync`/`local`, on-demand UCI probing, `chrome.tabs.sendMessage`.
  - `BetterMint/js/loader.js` (`ISOLATED` world): `chrome.storage` / `chrome.runtime.onMessage` bridge via `CustomEvent`, injects `js/Mint.js`.
  - `BetterMint/js/Mint.js` + `css/evalbar.css` (`MAIN` world): Chess.com board/DOM controller, eval bar, pacing, plain-text UCI over WebSocket.
  - `BetterMint/rules.json`: `declarativeNetRequest` rules.
  - `EngineWS/main.py` + `polyglot.py` + `config.json`: WebSocket-to-UCI bridge, subprocess lifecycle, Polyglot `.bin` lookups.
- **Strict MV3 CSP**: No `eval()`, no `new Function()`, no inline `<script>`/`<style>`, no inline event handlers (`onclick`), no `innerHTML` with dynamic/untrusted strings.
- **Process & protocol resilience**: Gate `isready` behind `uciok` and option sync, serialize `stop` before new searches/switches, always reap child engine subprocesses in `finally` blocks, validate WebSocket origins, strip CR/LF in single commands, block unsafe `setoption` targets (`debug log file`, `logfile`), and never use `shell=True`.
- **No test-only production distortion**: Never add dead code, synthetic test hooks, or behavioral hacks to production modules solely to satisfy mocks. Keep optional `module.exports` blocks at the bottom of extension scripts minimal and inert in the browser.

### 3. Style & Code Hygiene Quick Reference
- Indentation: **2 spaces** for `BetterMint/js/*.js`, `BetterMint/tests/*.js`, `BetterMint/manifest.json`, `BetterMint/rules.json`, `EngineWS/config.json`; **4 spaces** for `BetterMint/html/*`, `BetterMint/css/*`, `EngineWS/*.py`, `EngineWS/tests/*.py`.
- Double quotes everywhere (except CSS attribute selectors inside JS strings); `"use strict";` at the top of extension JS; no trailing whitespace.
- **Comments**: Practically zero comments in production files—only brief single-line notes explaining non-obvious browser/MV3/Chess.com DOM quirks. Short section labels are fine in tests.
- **Option key parity**: Keep `option-*` keys identical across `options.html`, `loader.js` (`DEFAULT_EXTENSION_OPTIONS`), `Mint.js` (`EXTENSION_OPTION_KEY`), and `chrome.storage.sync`.

---

## Testing Architecture & Verification

Every change must be verified at the appropriate layer, and any test suite changes must keep `docs/BetterMint.wiki/Architecture-and-Development.md` up to date.

### Layer 1 — Standalone Node.js Extension Suites (`BetterMint/tests/test_*.js`)
Shared fixtures live in `BetterMint/tests/helpers.js`. Domain-focused suites cover:
- `test_contracts.js` — manifest semver & 3-file version parity, option key parity, MV3 CSP hygiene, `rules.json` DNR contracts, `loader.js` message/storage bridge.
- `test_uci_protocol.js`, `test_live_engine_switching.js` — UCI framing, `uciok`/`readyok` gating, `stop` timeouts, reconnect backoff, fatal errors.
- `test_gameplay.js`, `test_position_history.js`, `test_book_moves.js`, `test_timing.js`, `test_evalbar.js` — move classification, legal move resolution, move history reconstruction, Polyglot book tracking, human-like pacing, eval bar geometry & `rAF` coalescing.
- `test_popup_options.js`, `test_popup_uci.js` — popup persistence, themes, saved configs, inline badge editing, live UCI probing.

```bash
for f in BetterMint/tests/test_*.js; do node "$f"; done
```

### Layer 2 — Python EngineWS Suites (`EngineWS/tests/test_*.py`)
Shared mocks live in `EngineWS/tests/helpers.py`. Covers Polyglot Zobrist hashing & binary search (`test_polyglot.py`), config loading & engine resolution (`test_config_engine.py`), and security guards, logging, crash forwarding, and real loopback WebSocket + subprocess round-trips (`test_server_logging.py`).

```bash
python3 -m unittest discover -s EngineWS/tests -v
python3 -m py_compile EngineWS/main.py EngineWS/polyglot.py EngineWS/tests/*.py BetterMint/tests/smoke_browser.py
```

### Layer 3 — Real Browser CDP Smoke Test & Manual Checklist
`BetterMint/tests/smoke_browser.py` drives an unpacked extension in real Chrome/Chromium via CDP using only stdlib + `websockets` (pass `--headed` to watch, `--chrome /path/to/chrome` to pick a binary):

```bash
python3 BetterMint/tests/smoke_browser.py          # offline popup, themes, sliders, configs, real EngineWS probing
python3 BetterMint/tests/smoke_browser.py --live   # also checks live Chess.com DNR headers + eval bar attachment
```

Live gameplay interactions (actual moves on Chess.com, Auto Move / Auto Queue in a match, mid-game engine switching on a real board, SPA navigation between games) are verified against the **Manual browser verification checklist** in `docs/BetterMint.wiki/Architecture-and-Development.md`.

### Regression & Documentation Discipline
- Add a focused regression test for every protocol, timing, DOM contract, UI schema, or state-sync bug fixed.
- Keep test output silent on success (no stray `console.log`/`console.warn` noise; use `captureConsole` when asserting warning paths).
- When adding/renaming test files or changing verification steps, update both `AGENTS.md` (if layers/commands change) and `docs/BetterMint.wiki/Architecture-and-Development.md`.

---

## Version Bump & Release Checklist

`BetterMint/tests/test_contracts.js` enforces strict semver parity across all three files. Always update them together and verify no stale version strings remain:

1. `BetterMint/manifest.json` (`"version": "X.Y.Z"`)
2. `BetterMint/html/options.html` (`<span class="version-badge">vX.Y.Z</span>`)
3. `README.md` (`version-X.Y.Z-` badge and `/releases/tag/vX.Y.Z` link)
