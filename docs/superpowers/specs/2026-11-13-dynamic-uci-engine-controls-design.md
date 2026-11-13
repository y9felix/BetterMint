# Design: Dynamic UCI Engine Options & Live WebSocket Switching

## Intent & Why
Different chess engines expose completely different UCI configuration options (e.g., Stockfish has `Skill Level`, `Threads`, `Hash`; Patricia has `UCI_Elo`, `UCI_LimitStrength`; Lc0/Maia has `WeightsFile`, `MinNodes`, `Temperature`). A static, hardcoded engine menu cannot accommodate multiple engines. Furthermore:
1. Changing the engine WebSocket URL currently requires a full browser page reload because `StockfishEngine` never checks for URL changes after initialization.
2. `EngineWS/run.sh` produces zero console output for UCI traffic, leaving no visibility into whether option changes are delivered to the engine.

This design introduces dynamic UCI option discovery, real-time command logging in `EngineWS`, and live engine switching without page reloads, while keeping all raw engine options neatly tucked under a collapsible toggle.

## Goals, Non-Goals, and Anti-Goals
- **Goals:**
  - **Live URL Switching (No Reload):** Detecting engine URL changes in `Mint.js` immediately closes the old WebSocket, opens the new connection, runs `uci`, synchronizes options, and re-evaluates the board without reloading the page.
  - **Dynamic UCI Discovery & Rendering:** Connect to the active engine over WebSocket, send `uci`, parse all reported options (`spin`, `check`, `combo`, `string`, `button`), and render them in a flat list inside a collapsible toggle in the options UI.
  - **Real UCI Dispatch:** Send genuine `setoption name <name> value <val>` commands to the engine, stopping the erroneous transmission of extension settings keys.
  - **Console Observability in `run.sh`:** Log all incoming commands (`[UCI IN] setoption name ...`), engine outputs, and engine lifecycle events (`[ENGINE SPAWN]`) to stdout with immediate flush.
  - **Per-Engine Settings Persistence:** Persist option values in `chrome.storage.local` keyed by engine identifier so settings are restored when switching back.
- **Non-Goals:**
  - Hardcoding per-engine settings schemas into the extension.
  - Modifying the underlying `lc0`, `stockfish`, or `patricia` binaries.
- **Anti-Goals:**
  - Cluttering the primary HUD with dozens of obscure engine parameters (the dynamic panel must remain collapsed under a toggle by default).
  - Interrupting live games or losing board state when changing engine settings.

## Approaches Considered
1. **Curated Per-Engine Panels:** Hand-crafted settings panels for Stockfish, Patricia, and Maia. (Rejected: Rigid, requires extension code changes for each new engine or path).
2. **Flat Raw Dynamic Generation with Collapsible Toggle (Selected):** Parse the engine's reported UCI options on the fly, dynamically generate corresponding form controls, and keep the entire block inside a collapsible toggle.
   - *Pros:* Fully universal for any UCI engine; zero maintenance when changing engine binaries; clean UI footprint when collapsed.
   - *Cons:* Shows all options the engine exposes; mitigated by keeping them collapsed.

## Architecture & Implementation Details

### 1. EngineWS Server Logging ([EngineWS/main.py](file:///home/felix/documents/extensions/BetterMint/EngineWS/main.py))
- In `handle_engine()`, log incoming WebSocket messages:
  `print(f"[UCI IN]  {msg}", flush=True)`
- In `handle_engine()`, log spawned process and termination:
  `print(f"[ENGINE SPAWN] {' '.join(cmd)}", flush=True)`
  `print(f"[ENGINE STOP]  {' '.join(cmd)}", flush=True)`
- When `--verbose` or debug is active, optionally log engine output lines.

### 2. Live Engine Switching & UCI Dispatch in [BetterMint/js/Mint.js](file:///home/felix/documents/extensions/BetterMint/BetterMint/js/Mint.js)
- Track `this.currentUrl` in `StockfishEngine`.
- In `UpdateExtensionOptions(options)`:
  - Check if `options[enumOptions.UrlApiStockfish]` differs from `this.currentUrl`.
  - If changed:
    1. Close current WebSocket: `if (this.stockfish) this.stockfish.close();`
    2. Set `this.currentUrl = newUrl;`
    3. Re-initialize: `this.initializeWebSocket(newUrl);`
    4. Upon `readyok` from the new engine, re-evaluate current position: `this.go();`
- Parse and store engine-reported options in `this.engineUciOptions = {}` on `option name ...` lines during UCI negotiation.
- Store custom values in `this.customEngineOptions = {}`. Only send `setoption` for recognized engine options.

### 3. Unified Disclosure Controls in [BetterMint/html/options.html](file:///home/felix/documents/extensions/BetterMint/BetterMint/html/options.html) & [BetterMint/js/options.js](file:///home/felix/documents/extensions/BetterMint/BetterMint/js/options.js)
- **Advanced Timing Settings Behavior:**
  - In [BetterMint/js/Mint.js](file:///home/felix/documents/extensions/BetterMint/BetterMint/js/Mint.js#L733-L778), `calculateTargetDelay` always applies the configured advanced parameters (`PhysicalFloor`, `FastForcedMoves`, `FastRecaptures`, `FastOpening`, `ClockScaling`). It never gated them on an on/off switch.
  - The previous `option-advanced-timing` was drawn as a feature toggle switch, mistakenly suggesting it enabled/disabled the features rather than merely hiding the UI.
- **Unified Disclosure Pattern (`<details class="collapse-group">`):**
  - Implement a dedicated disclosure button style with a rotating chevron indicator, completely distinct from setting toggles.
  - Clicking either disclosure button purely toggles DOM visibility (expand/collapse) without modifying, resetting, or overriding any underlying values.
  - Apply this identical pattern to two locations:
    1. **Engine Server Card:** `<details id="engine-options-details" class="collapse-group">` with summary label `Engine UCI Options` and a dynamic container for parsed UCI options.
    2. **Auto Move Pacing Card:** `<details id="advanced-timing-details" class="collapse-group">` with summary label `Advanced Timing Settings`, replacing the former toggle switch and enclosing the advanced timing controls.
- **Dynamic UCI Rendering in `options.js`:**
  - Probe the active engine WebSocket URL, query `uci`, and parse `option name ... type ...`:
    - `spin`: slider with min/max bounds and badge.
    - `check`: boolean toggle switch.
    - `combo`: `<select>` dropdown.
    - `string`: text input.
    - `button`: action trigger emitting `setoption name <name>`.
  - Persist values in `chrome.storage.local` under `engine_options_${engineId}` and dispatch `BetterMintUpdateOptions`.

## Verification Plan
1. **Live URL Switching:** Change URL from `/stockfish` to `/patricia` in options; verify in `run.sh` console that the old engine terminates, the new engine spawns, and evaluation resumes on the chessboard without reloading.
2. **Console Observability:** Verify that changing options in the UI prints `[UCI IN] setoption name ... value ...` in the `run.sh` terminal.
3. **Dynamic Form Generation:** Verify that connecting to Stockfish renders Stockfish-specific options (`Threads`, `Hash`, `Skill Level`), and connecting to Patricia renders Patricia-specific options (`UCI_Elo`, `UCI_LimitStrength`).
4. **Automated Tests:** Add test suites covering URL change detection, UCI option parsing, and dynamic form structure.
