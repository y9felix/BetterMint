# AGENTS.md

## Role

Act as the lead engineer on BetterMint. BetterMint is a zero-bundler Manifest V3 Chromium extension in `BetterMint/` paired with a local Python 3.10+ WebSocket-to-UCI engine bridge in `EngineWS/`.

Prioritize simplicity, zero-dependency integrity, runtime stability, and accurate documentation over extra options or speculative abstractions. When code becomes tangled in workarounds, rewrite it cleanly instead of layering patches. Delete dead code immediately.

## Development workflow

Two agents share development in a fixed sequence: current project state, then the AI Studio agent, then `antigravity-cli`, then GitHub and the updated project state.

1. The user uploads the current project state into AI Studio.
2. The AI Studio agent edits source code, tests, and Markdown files in the AI Studio workspace and runs Layer 1 and Layer 2 checks before export.
3. The user downloads a `.zip` archive of the changed project from AI Studio.
4. `antigravity-cli` runs the `test-and-merge` gate on the host machine, commits verified changes locally to `dev`, cuts and publishes releases on `main`, syncs changed wiki files, and updates the current project state.

### Asymmetric responsibilities

- **AI Studio agent in the sandbox.** Edits code, regression tests, and Markdown files inside the uploaded workspace. Runs Layer 1 Node.js suites and Layer 2 Python checks before export. Keeps `BetterMint/`, `EngineWS/`, and `docs/` free of temporary files, caches, and extra tooling files. Does not run git commands, push to `origin`, or publish releases.
- **`antigravity-cli` on the host machine.** Ingests downloaded `.zip` archives through the `test-and-merge` gate. Enforces all three test layers, including real Chrome or Chromium CDP smoke tests. Manages git branches, commits, tags, pushes of `main` and tags to `origin`, GitHub Releases, and GitHub Wiki updates.

## Archive ingestion gate

`antigravity-cli` must pass every step of the `test-and-merge` gate before staging or committing any AI Studio `.zip` archive into the local repository:

1. **Inspect before applying.** Never unzip an archive blindly over the working tree. Inspect every added, modified, and deleted path against the current `dev` branch.
2. **Strip sandbox tooling and caches.** Discard external sandbox files and generated caches before staging, including `package.json`, `bun.lock`, `.aistudio/`, `vite.config.*`, `node_modules/`, `__pycache__/`, and `BetterMint/_metadata/`.
3. **Defend version monotonicity.** Verify that version strings in `BetterMint/manifest.json`, `BetterMint/html/options.html`, and `README.md` never drop below the current version on `dev` or `main`.
4. **Pass all required test layers.** Run Layer 1 Node.js suites, Layer 2 Python suites and `py_compile`, and Layer 3 offline CDP smoke tests before staging. Run `smoke_browser.py --live` as well whenever DOM selectors, `BetterMint/rules.json`, or `BetterMint/manifest.json` changed.
5. **Commit locally to `dev` only.** Stage and commit verified changes on the local `dev` branch. Never push `dev` to `origin`.

## Documentation and skills

Keep user documentation, engineering guides, and prose rules distinct.

- **Prose rule for all agents.** Always apply `docs/skills/unslop/SKILL.md` to all prose. Follow it in every chat message, commit description, release note, and Markdown file, including `README.md`, `AGENTS.md`, and `docs/BetterMint.wiki/*.md`.
- **User documentation.** `docs/BetterMint.wiki/` is written for BetterMint users and published to the GitHub Wiki. Update affected wiki pages whenever user-facing settings, commands, or runtime behavior change. Read `docs/BetterMint.wiki/Architecture-and-Development.md` for runtime data flow, UCI synchronization, testing details, and the manual browser checklist.
- **Code guides and extension skills.** Read the relevant guide before changing code, and do not duplicate these rules in other files:
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
- Keep production files virtually comment-free. Only write a brief single-line comment to explain a non-obvious browser, MV3, or Chess.com DOM quirk. Short section headers are permitted in test suites.
- Keep `option-*` keys identical across `BetterMint/html/options.html`, `DEFAULT_EXTENSION_OPTIONS` in `BetterMint/js/loader.js`, `EXTENSION_OPTION_KEY` in `BetterMint/js/Mint.js`, and `chrome.storage.sync`.

## Testing and verification

Verify every change at the required layers for your environment. Update both `AGENTS.md` and `docs/BetterMint.wiki/Architecture-and-Development.md` whenever test files or verification commands change.

| Verification layer | AI Studio agent | `antigravity-cli` on `dev` merge | `antigravity-cli` on release |
| :--- | :--- | :--- | :--- |
| Layer 1 Node.js suites | Required before export | Required before commit | Required before tag |
| Layer 2 Python suites and `py_compile` | Required before export when `websockets` is available | Required before commit | Required before tag |
| Layer 3 offline CDP smoke test | Not available in sandbox | Required before commit | Required before tag |
| Layer 3 live CDP smoke test (`--live`) | Not available in sandbox | Required when DOM selectors, `rules.json`, or `manifest.json` change | Required before tag |

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

Both `antigravity-cli` on the host machine and the AI Studio agent run Layer 2. If `websockets` is missing in the AI Studio sandbox, install it outside the repository directory before running `unittest` so no package files leak into the exported archive. Shared mocks live in `EngineWS/tests/helpers.py`. The suites cover Polyglot Zobrist hashing and binary search in `test_polyglot.py`, config loading and engine resolution in `test_config_engine.py`, and security guards, logging, crash forwarding, and real loopback WebSocket subprocess round-trips in `test_server_logging.py`.

```bash
python3 -m unittest discover -s EngineWS/tests -v
python3 -m py_compile EngineWS/main.py EngineWS/polyglot.py EngineWS/tests/*.py BetterMint/tests/smoke_browser.py
```

### Layer 3. Real browser CDP smoke test and manual checklist

`antigravity-cli` is the mandatory host gatekeeper for Layer 3. `BetterMint/tests/smoke_browser.py` drives the unpacked extension in real Chrome or Chromium over CDP using only the Python standard library and `websockets`. Pass `--headed` to watch the browser run, or pass `--chrome /path/to/chrome` to pick a specific binary.

```bash
python3 BetterMint/tests/smoke_browser.py
python3 BetterMint/tests/smoke_browser.py --live
```

The default offline run checks the popup, themes, sliders, configs, and real EngineWS probing, and must pass on every merge to `dev`. The `--live` run also checks live Chess.com DNR headers and evaluation bar attachment, and must pass on every release and on any merge that modifies Chess.com DOM selectors, `BetterMint/rules.json`, or `BetterMint/manifest.json`.

Verify live gameplay interactions on Chess.com against the manual browser verification checklist in `docs/BetterMint.wiki/Architecture-and-Development.md`. That covers actual moves, Auto Move, Auto Queue, mid-game engine switching, and single-page app navigation between games.

### Regression discipline

- Add a focused regression test for every protocol, timing, DOM contract, UI schema, or state-sync bug you fix.
- Keep test output silent on success. Use `captureConsole` when asserting warning paths.

## Release and version bump checklist

`antigravity-cli` owns version bumps, tags, pushes to `origin`, GitHub Releases, and wiki syncing. Execute every step in order when cutting version `X.Y.Z`:

1. **Update all three version files together.** `BetterMint/tests/test_contracts.js` enforces strict semver parity across these files, and no stale version strings may remain:
   - `BetterMint/manifest.json` (`"version": "X.Y.Z"`).
   - `BetterMint/html/options.html` (`<span class="version-badge">vX.Y.Z</span>`).
   - `README.md` (`version-X.Y.Z-` badge and `/releases/tag/vX.Y.Z` link).
2. **Run full three-layer verification.** Run Layer 1 Node.js suites, Layer 2 Python `unittest` and `py_compile`, and Layer 3 `smoke_browser.py` in both default offline mode and `--live` mode. Run any applicable checks from the manual browser checklist in `docs/BetterMint.wiki/Architecture-and-Development.md`.
3. **Commit, tag, and push `main`.** Branch order between `dev` and `main` is flexible, provided `main` carries the verified release commit and the `vX.Y.Z` git tag. Push `main` and `vX.Y.Z` to `origin`. Never push `dev` to `origin`.
4. **Build two clean release archives.** Package two separate zip files and exclude tests, bytecode caches, and generated metadata:
   - `BetterMint-vX.Y.Z-extension.zip` containing `BetterMint/` without `BetterMint/tests/`, `BetterMint/_metadata/`, or `__pycache__/`.
   - `BetterMint-vX.Y.Z-EngineWS.zip` containing `EngineWS/` without `EngineWS/tests/` or `__pycache__/`.
5. **Publish the GitHub release.** Create the release and upload both archives with `gh release create vX.Y.Z BetterMint-vX.Y.Z-extension.zip BetterMint-vX.Y.Z-EngineWS.zip`, writing release notes under `docs/skills/unslop/SKILL.md`.
6. **Sync the GitHub Wiki when wiki files changed.** If any Markdown files or images under `docs/BetterMint.wiki/` changed, copy them into the cloned GitHub Wiki repository, commit, and push to the wiki remote.
7. **Merge `main` back into `dev`.** Merge `main` into `dev` locally so both branches remain synchronized for the next AI Studio upload.

## Red flags and rationalization table

Reject every excuse in the left column and enforce the rule in the right column.

| Red flag or excuse | Mandatory rule |
| :--- | :--- |
| "Just unzip the AI Studio archive over the repository to save time." | Inspect the archive diff path by path and strip sandbox tooling files before copying anything into `dev`. |
| "Keep `package.json`, `bun.lock`, `.aistudio/`, or `vite.config.*` so AI Studio opens cleanly next time." | Never commit sandbox tooling files or caches to git and never include them in release archives. |
| "Push `dev` to `origin` as a backup." | Keep `dev` strictly local. Push only `main` and release tags to `origin`. |
| "The `.zip` had an older version string, so leave it as exported." | Enforce version monotonicity. Reject any semver regression against `dev` or `main`. |
| "Layer 1 and Layer 2 passed, so Chromium will work fine." | `antigravity-cli` must run `smoke_browser.py` offline on every merge to `dev` before committing. |
| "Skip `--live` because it only touches a minor Chess.com selector or rule." | Run `smoke_browser.py --live` on every release and on every change to DOM selectors, `rules.json`, or `manifest.json`. |
| "Add a quick test hook or branch in production code so the mock passes." | Keep production behavior clean and unchanged for tests. Keep `module.exports` blocks minimal and inert in the browser. |
| "Add comments to explain what this function does for the next agent." | Simplify the code or rename identifiers instead. Only write rare single-line comments for non-obvious browser, MV3, or Chess.com DOM quirks. |
| "`unslop` only applies to user wiki pages." | Apply `docs/skills/unslop/SKILL.md` to every Markdown file, release note, and chat message. |
| "Ship one combined zip or leave tests inside the release zip." | Always publish `BetterMint-vX.Y.Z-extension.zip` and `BetterMint-vX.Y.Z-EngineWS.zip` separately with tests, caches, and `_metadata/` excluded. |
