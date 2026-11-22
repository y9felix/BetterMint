# AGENTS.md

## Role

Act as the lead engineer on BetterMint. BetterMint is a zero-bundler Manifest V3 Chromium extension in `BetterMint/` paired with a local Python 3.10+ WebSocket-to-UCI engine bridge in `EngineWS/`.

Prioritize simplicity, zero-dependency integrity, runtime stability, and accurate documentation over extra features or speculative abstractions. When code becomes tangled in workarounds, rewrite it cleanly instead of layering patches. Delete dead code immediately.

## Development workflow

Two agents share development in a fixed sequence: current project state, then the AI Studio agent, then `antigravity-cli`, then GitHub and the updated project state.

1. The user uploads the current project state into AI Studio.
2. The AI Studio agent implements code, test, and documentation changes in the AI Studio workspace and runs the unit checks available in that environment.
3. The user downloads a `.zip` archive of the changed project from AI Studio.
4. The `antigravity-cli` agent unpacks and merges the changes into the local git repository on the real machine, runs the full test suite including real browser checks, manages branches and commits, pushes to `origin`, creates and publishes GitHub releases, and updates the current project state.

### Responsibilities by agent

- **AI Studio agent.** Edits code, tests, and Markdown files inside the uploaded workspace. Runs Layer 1 Node.js suites and Layer 2 Python syntax and unit checks when dependencies are available. Keeps `BetterMint/`, `EngineWS/`, and `docs/` free of temporary files or caches so the downloaded `.zip` stays clean. Does not run git workflows, push to GitHub, or publish releases.
- **`antigravity-cli`.** Manages all git operations on the real machine, including branches, merging `.zip` exports, commits, tags, pushing to `origin`, creating and publishing GitHub releases, and syncing the GitHub Wiki. Runs all three verification layers on the real machine, including Layer 3 Chrome or Chromium CDP smoke tests and live engine checks, before merging or cutting a release.

## Documentation and skills

Keep user documentation, engineering guides, and prose rules distinct.

- **Prose rule for all agents.** Always follow `docs/skills/unslop/SKILL.md` for all prose. Apply it to every chat message you write and every Markdown file you edit, including `README.md`, `AGENTS.md`, `docs/BetterMint.wiki/*.md`, and release notes.
- **User documentation.** The `docs/BetterMint.wiki/` directory is written for BetterMint users and published to the GitHub Wiki. Keep affected wiki pages accurate whenever user-facing settings, commands, or runtime behavior change. Read `docs/BetterMint.wiki/Architecture-and-Development.md` for runtime data flow, UCI synchronization, testing details, and the manual browser checklist.
- **Code guides and extension skills.** The AI Studio agent reads the relevant guide before changing code, and `antigravity-cli` checks changes against the same rules. Do not duplicate these guides in other files:
  - `docs/guidelines/philosophy.md` defines architecture, frugality, and quality ordering: Simplicity, then Correctness, then Consistency, then Completeness.
  - `docs/guidelines/style.md` defines formatting, naming, MV3 boundaries, error handling, and comment discipline.
  - `docs/skills/chrome-extensions/SKILL.md` defines Manifest V3 and Chromium extension rules.
  - `docs/skills/extension-ui/SKILL.md` defines popup UI and CSS standards.

## Core engineering invariants

### Zero-dependency integrity

- **Extension.** `BetterMint/` uses raw HTML, CSS, and vanilla ES2022+ JavaScript loaded directly by Chromium. Do not add bundlers, transpilers, runtime npm dependencies, or CSS frameworks.
- **Server.** `EngineWS/` targets cross-platform Python 3.10+. Keep external dependencies limited to `websockets>=13.0` in `EngineWS/requirements.txt`, isolated inside `EngineWS/main.py`. Keep `EngineWS/polyglot.py` pure standard library.
- **Testing.** Do not add heavy test frameworks such as Playwright, Jest, or Mocha. Use Node.js `node:assert`, Python `unittest`, and direct Chrome DevTools Protocol over `websockets` with installed Chrome or Chromium.

### MV3 boundaries, stability, and security

Keep execution contexts strictly separated, with no background service worker:

- `BetterMint/html/options.html`, `BetterMint/css/options.css`, and `BetterMint/js/options.js` own the popup UI, `chrome.storage.sync` and `chrome.storage.local`, on-demand UCI probing, and `chrome.tabs.sendMessage`.
- `BetterMint/js/loader.js` runs in the `ISOLATED` world, bridges `chrome.storage` and `chrome.runtime.onMessage` through `CustomEvent`, and injects `js/Mint.js`.
- `BetterMint/js/Mint.js` and `BetterMint/css/evalbar.css` run in the `MAIN` world and own the Chess.com board controller, evaluation bar, move pacing, and plain-text UCI over WebSocket.
- `BetterMint/rules.json` defines `declarativeNetRequest` rules.
- `EngineWS/main.py`, `EngineWS/polyglot.py`, and `EngineWS/config.json` own the WebSocket-to-UCI bridge, subprocess lifecycle, and Polyglot `.bin` lookups.

Enforce these runtime rules across every change:

- **Strict MV3 CSP.** Never use `eval()`, `new Function()`, inline `<script>` or `<style>` blocks, inline event handlers such as `onclick`, or `innerHTML` with dynamic or untrusted strings.
- **Process and protocol resilience.** Gate `isready` behind `uciok` and option synchronization. Serialize `stop` before starting a new search or switching engines. Always reap child engine subprocesses in `finally` blocks. Validate WebSocket origins, strip carriage returns and line feeds inside single commands, block unsafe `setoption` targets (`debug log file` and `logfile`), and never pass `shell=True`.
- **No test-only production distortion.** Never add dead code, synthetic test hooks, or behavioral workarounds to production modules only to satisfy mocks. Keep optional `module.exports` blocks at the bottom of extension scripts minimal and inert in the browser.

### Style and code hygiene

- Indent with 2 spaces in `BetterMint/js/*.js`, `BetterMint/tests/*.js`, `BetterMint/manifest.json`, `BetterMint/rules.json`, and `EngineWS/config.json`. Indent with 4 spaces in `BetterMint/html/*`, `BetterMint/css/*`, `EngineWS/*.py`, and `EngineWS/tests/*.py`.
- Use double quotes everywhere except CSS attribute selectors inside JavaScript strings. Put `"use strict";` at the top of extension JavaScript files and leave no trailing whitespace.
- Keep production files nearly comment-free. Only write a brief single-line comment to explain a non-obvious browser, MV3, or Chess.com DOM quirk. Short section labels are fine in tests.
- Keep `option-*` keys identical across `BetterMint/html/options.html`, `DEFAULT_EXTENSION_OPTIONS` in `BetterMint/js/loader.js`, `EXTENSION_OPTION_KEY` in `BetterMint/js/Mint.js`, and `chrome.storage.sync`.

## Testing and verification

Verify every change at the appropriate layer. Update `docs/BetterMint.wiki/Architecture-and-Development.md` whenever test files or verification steps change.

### Layer 1. Standalone Node.js extension suites

Both the AI Studio agent and `antigravity-cli` run Layer 1. Shared fixtures live in `BetterMint/tests/helpers.js`:

- `test_contracts.js` verifies manifest semver and three-file version parity, option key parity, MV3 CSP hygiene, `rules.json` DNR contracts, and the `loader.js` message and storage bridge.
- `test_uci_protocol.js` and `test_live_engine_switching.js` verify UCI framing, `uciok` and `readyok` gating, `stop` timeouts, reconnect backoff, and fatal errors.
- `test_gameplay.js`, `test_position_history.js`, `test_book_moves.js`, `test_timing.js`, and `test_evalbar.js` verify move classification, legal move resolution, move history reconstruction, Polyglot book tracking, human-like pacing, and evaluation bar geometry with `requestAnimationFrame` coalescing.
- `test_popup_options.js` and `test_popup_uci.js` verify popup persistence, themes, saved configs, inline badge editing, and live UCI probing.

```bash
for f in BetterMint/tests/test_*.js; do node "$f"; done
```

### Layer 2. Python EngineWS suites

`antigravity-cli` runs Layer 2 on the real machine, and the AI Studio agent runs it whenever `websockets` is available. Shared mocks live in `EngineWS/tests/helpers.py`. The suites cover Polyglot Zobrist hashing and binary search in `test_polyglot.py`, config loading and engine resolution in `test_config_engine.py`, and security guards, logging, crash forwarding, and real loopback WebSocket subprocess round-trips in `test_server_logging.py`.

```bash
python3 -m unittest discover -s EngineWS/tests -v
python3 -m py_compile EngineWS/main.py EngineWS/polyglot.py EngineWS/tests/*.py BetterMint/tests/smoke_browser.py
```

### Layer 3. Real browser CDP smoke test and manual checklist

`antigravity-cli` runs Layer 3 on the real machine where Chrome or Chromium is installed. `BetterMint/tests/smoke_browser.py` drives the unpacked extension in real Chrome or Chromium over CDP using only the Python standard library and `websockets`. Pass `--headed` to watch the browser run, or pass `--chrome /path/to/chrome` to pick a specific binary.

```bash
python3 BetterMint/tests/smoke_browser.py
python3 BetterMint/tests/smoke_browser.py --live
```

The default offline run checks the popup, themes, sliders, configs, and real EngineWS probing. The `--live` run also checks live Chess.com DNR headers and evaluation bar attachment.

Verify live gameplay interactions on Chess.com against the manual browser verification checklist in `docs/BetterMint.wiki/Architecture-and-Development.md`. That covers actual moves, Auto Move, Auto Queue, mid-game engine switching, and single-page app navigation between games.

### Regression and documentation discipline

- Add a focused regression test for every protocol, timing, DOM contract, UI schema, or state-sync bug you fix.
- Keep test output silent on success. Use `captureConsole` when asserting warning paths.
- Update both `AGENTS.md` and `docs/BetterMint.wiki/Architecture-and-Development.md` whenever you add or rename test files or change verification commands.

## Version bump and release checklist

`antigravity-cli` handles version bumps, git tags, pushes to `origin`, and GitHub releases. `BetterMint/tests/test_contracts.js` enforces strict semver parity across all three files, so update them together and verify that no stale version strings remain:

1. `BetterMint/manifest.json` (`"version": "X.Y.Z"`).
2. `BetterMint/html/options.html` (`<span class="version-badge">vX.Y.Z</span>`).
3. `README.md` (`version-X.Y.Z-` badge and `/releases/tag/vX.Y.Z` link).
