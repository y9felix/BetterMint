# Pure Engine Delegation & Redundancy Pruning Design

## 1. Intent & Why
BetterMint historically accumulated client-side heuristics that duplicate or interfere with native engine computation. Features like synthetic blunder injection (`BestMoveChance`, `RandomBestMove`), client-side checkmate overrides (`MateFinder`), dead hardware sliders (`Hash RAM`, `CPU Cores` never dispatched over UCI), an obsolete in-browser WASM worker fallback, and text-to-speech audio clutter both the settings UI and the execution pipeline.

This refactor strips away all synthetic tampering and dead stubs. Stockfish is delegated complete authority over move calculation and hardware management over a dedicated WebSocket connection. `MultiPV` is locked to 1 for maximum calculation performance. The UI is reduced to three clean cards: **Engine Server**, **HUD & Display**, and **Auto Move Pacing**.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Pure Engine Delegation:** Stockfish directly determines the best move (`bestmove`). Zero client-side move randomization, blunder injection, or synthetic mate overrides.
- **WebSocket-Only Architecture:** Remove the legacy in-browser WebWorker/WASM loader. Connect exclusively to the configured WebSocket URL (`EngineWS`, `bettermint-sockets`, or remote host).
- **Single-Line Optimization:** Lock engine `MultiPV` to `1` internally, eliminating candidate line overhead.
- **Full Pruning of Bloat:**
  - Delete Text-to-Speech (`window.speechSynthesis`).
  - Delete Mate Finder (`option-highmatechance`, `option-mate-finder-value`).
  - Delete Move Selection (`option-best-move-chance`, `option-random-best-move`, `option-max-legit-auto-move-depth`).
  - Delete Hardware Sliders (`option-hashtable-ram`, `option-num-cores`).
  - Delete In-Browser Engine Toggle (`option-api-stockfish`).
- **3-Card Settings UI:**
  1. **Engine Server:** WebSocket URL (`option-url-api-stockfish`), Search Depth (`option-depth`, 1–50).
  2. **HUD & Display:** Evaluation Bar (`option-evaluation-bar`), Show Hint Arrows (`option-show-hints`), Move Analysis (`option-move-analysis`), Auto Queue (`option-auto-queue`), Toast Notifications (`option-notifications`).
  3. **Auto Move Pacing:** Master toggle (`option-legit-auto-move`), Human-like toggle (`option-human-like-moves`), Move Pace slider (`option-move-pace`, 0.5s–30.0s), and expandable flat Advanced Settings sub-panel.

### Non-Goals
- Modifying the natural log-normal auto-move timing math or clock pressure curves.
- Changing the internal Chess.com DOM interaction model or auto-queue event dispatchers.

### Anti-Goals
- Never retain dormant configuration keys or orphaned HTML controls in the schema.
- Never intercept or swap Stockfish's top-1 evaluated move with a suboptimal candidate.

---

## 3. Approaches Considered

### Approach 1: Pure WebSocket Engine & Full Bloat Removal (Selected)
- **Architecture:** Remove in-browser WebWorker fallback completely. All engine interactions pass over standard WebSocket (`new WebSocket(url)`). Remove all move selection, mate finder, hardware sliders, and TTS code.
- **Pros:** Minimal footprint, zero dead code, clean 3-card UI, fastest single-line Stockfish evaluation, completely pure engine decisions.
- **Cons:** Requires a running WebSocket engine server (e.g. `EngineWS` or `bettermint-sockets`), which is already the user's operational standard.

### Approach 2: Retain Headless WASM Fallback & Hide Controls
- **Architecture:** Hide the deleted settings from `options.html` but keep the WebWorker and WASM loading code in `Mint.js` as an invisible fallback if the WebSocket fails.
- **Pros:** Fallback availability if local WebSocket daemon is offline.
- **Cons:** Retains ~200 lines of dead WASM loader baggage, violates the user's explicit goal of a pure, minimal engine configuration.

---

## 4. Detailed Component Design

### 4.1 Options Schema & Settings UI
* **[BetterMint/html/options.html](file:///home/felix/documents/extensions/BetterMint/BetterMint/html/options.html):**
  * **Card 1: Engine Server**
    * Text Input: `WebSocket URL` (`option-url-api-stockfish`)
    * Range Slider: `Search Depth` (`option-depth`, min 1, max 50)
  * **Card 2: HUD & Display (5 controls)**
    * Toggle: `Evaluation Bar` (`option-evaluation-bar`)
    * Toggle: `Show Hint Arrows` (`option-show-hints`)
    * Toggle: `Move Analysis` (`option-move-analysis`)
    * Toggle: `Auto Queue New Game` (`option-auto-queue`)
    * Toggle: `Toast Notifications` (`option-notifications`)
  * **Card 3: Auto Move Pacing**
    * Toggle: `Enable Auto Move` (`option-legit-auto-move`)
    * Toggle: `Human-like Moves` (`option-human-like-moves`)
    * Range Slider: `Move Pace` (`option-move-pace`, min 0.5, max 30.0, step 0.1)
    * Toggle: `Advanced Settings` (`option-advanced-timing`)
    * Flat Sub-panel:
      * Range Slider: `Physical Floor` (`option-physical-floor`, 50–500 ms)
      * Range Slider: `Timing Spread (σ)` (`option-timing-spread`, 0.10–1.20)
      * Toggle + Slider: `Fast Recaptures` (`option-fast-recaptures`) + `Recapture Multiplier` (`option-recapture-multiplier`, 0.10–1.00)
      * Toggle + Slider: `Fast Forced Moves` (`option-fast-forced-moves`) + `Forced Multiplier` (`option-forced-multiplier`, 0.10–1.00)
      * Toggle + Sliders: `Fast Opening` (`option-fast-opening`) + `Opening Moves Threshold` (`option-opening-moves-threshold`, 1–15) + `Opening Multiplier` (`option-opening-multiplier`, 0.10–1.00)
      * Toggle + Sliders: `Clock Scaling` (`option-clock-scaling`) + `Clock Threshold` (`option-clock-threshold`, 10–120s) + `Clock Min Multiplier` (`option-clock-min-multiplier`, 0.10–0.80)

* **[BetterMint/js/options.js](file:///home/felix/documents/extensions/BetterMint/BetterMint/js/options.js) & [BetterMint/js/loader.js](file:///home/felix/documents/extensions/BetterMint/BetterMint/js/loader.js):**
  * Remove keys: `option-api-stockfish`, `option-num-cores`, `option-hashtable-ram`, `option-multipv`, `option-highmatechance`, `option-mate-finder-value`, `option-text-to-speech`, `option-best-move-chance`, `option-random-best-move`, `option-max-legit-auto-move-depth`.
  * Retain strictly the active 17 options.
  * Update `UpdateVisibility()` in `options.js` to manage only the auto-move pacing progressive disclosures.

### 4.2 Engine Pipeline in [BetterMint/js/Mint.js](file:///home/felix/documents/extensions/BetterMint/BetterMint/js/Mint.js)
* **WebSocket-Only Connection:**
  * Delete `initializeWorker()` and in-browser WASM worker instantiation branches.
  * Initialize engine directly via `initializeWebSocket(getValueConfig(enumOptions.UrlApiStockfish))`.
  * Lock `MultiPV` to `1`:
    ```javascript
    this.options = {
      "Slow Mover": "10",
      "MultiPV": "1"
    };
    ```
* **Execution Directness (`ExecuteAutoMove`):**
  * Strip `RandomBestMove`, `BestMoveChance`, and `HighMateChance` sorting blocks.
  * `bestMove` is taken directly from `top_pv_moves[0]` (`this.topMoves[0]`).
  * If `LegitAutoMove` is active and it is our turn, calculate delay via `calculateTargetDelay(bestMove)` and schedule `controller.move(moveData)` directly via `setTimeout`.
* **TTS Removal:**
  * Delete `window.speechSynthesis` calls and speech voice loading from `onTopMoves`.

---

## 5. Verification Plan
- **Syntax Verification:** Validate all JavaScript files with `node -c`.
- **Test Harness:** Run `node BetterMint/tests/test_timing.js` to ensure the timing engine remains fully functional.
- **Options Integrity:** Verify that options page initializes with zero undefined keys and persists cleanly into `chrome.storage.sync`.
