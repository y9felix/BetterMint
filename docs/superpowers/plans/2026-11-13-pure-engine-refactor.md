# Pure Engine Delegation & Redundancy Pruning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate redundant client-side heuristics (move randomization, mate finder overrides, hardware sliders, in-browser WASM worker, TTS) and delegate move calculation and performance completely to native Stockfish over WebSocket, simplifying the UI to 3 cards.

**Architecture:** Remove in-browser WebWorker fallback and enforce pure WebSocket engine connectivity in `Mint.js`. Lock `MultiPV` to 1 for single-line search efficiency. Streamline `ExecuteAutoMove` to play Stockfish's top move directly using the calibrated log-normal timing engine. Refactor `options.html`, `options.js`, and `loader.js` down to 17 active keys across 3 semantic cards.

**Tech Stack:** Vanilla JavaScript (ES6+), Chrome Extension Manifest V3, WebSockets, HTML5 / CSS3, Node.js (test harness).

**Spec:** [docs/superpowers/specs/2026-11-13-pure-engine-refactor-design.md](file:///home/felix/documents/extensions/BetterMint/docs/superpowers/specs/2026-11-13-pure-engine-refactor-design.md)

## Global Constraints
- Zero comments in all JavaScript, HTML, CSS, and configuration files (keep only required shebangs).
- Zero partial upgrades or external npm dependencies; test scripts must use vanilla Node.js `assert`.
- All file references must use absolute markdown `file://` links.
- Every commit must be atomic, verified with syntax and unit checks before committing.

## Review Focus
1. `options.html` input IDs must strictly match `loader.js` and `options.js` `inputObjects` keys with zero orphaned sliders.
2. `Mint.js` `enumOptions` must remove pruned keys to avoid reading undefined configuration properties.
3. `MultiPV` must remain locked at `1` across `InitOptions`, `UpdateOptions`, and `uci` initialization.
4. Auto-move must play `topMoves[0]` directly without throwing errors when `RandomBestMove` or `BestMoveChance` are absent.
5. Inactive browser tab execution must not regress; `controller.move()` must remain direct inside `setTimeout`.

---

### Task 1: Clean Configuration Schema & Options Storage

**Files:**
- Modify: `BetterMint/js/loader.js`
- Modify: `BetterMint/js/options.js`
- Create: `BetterMint/tests/test_options_schema.js`

**Interfaces:**
- Consumes: `inputObjects` schema definition in `loader.js` and `options.js`.
- Produces: Exactly 17 active configuration keys in `DefaultExtensionOptions`.

- [ ] **Step 1: Write the schema test**

Create `BetterMint/tests/test_options_schema.js`:
```javascript
const assert = require("assert");
const fs = require("fs");

const loaderSrc = fs.readFileSync("BetterMint/js/loader.js", "utf8");
const optionsSrc = fs.readFileSync("BetterMint/js/options.js", "utf8");

function extractKeys(src) {
  const match = src.match(/let inputObjects = \{([\s\S]*?)\};/);
  assert.ok(match, "inputObjects definition found");
  const keys = [];
  const re = /"([^"]+)":/g;
  let m;
  while ((m = re.exec(match[1])) !== null) {
    keys.push(m[1]);
  }
  return keys.sort();
}

const loaderKeys = extractKeys(loaderSrc);
const optionsKeys = extractKeys(optionsSrc);

assert.deepStrictEqual(loaderKeys, optionsKeys, "loader.js and options.js keys must match");

const expectedKeys = [
  "option-advanced-timing",
  "option-auto-queue",
  "option-clock-min-multiplier",
  "option-clock-scaling",
  "option-clock-threshold",
  "option-depth",
  "option-evaluation-bar",
  "option-fast-forced-moves",
  "option-fast-opening",
  "option-fast-recaptures",
  "option-forced-multiplier",
  "option-human-like-moves",
  "option-legit-auto-move",
  "option-move-analysis",
  "option-move-pace",
  "option-notifications",
  "option-opening-moves-threshold",
  "option-opening-multiplier",
  "option-physical-floor",
  "option-recapture-multiplier",
  "option-show-hints",
  "option-timing-spread",
  "option-url-api-stockfish"
].sort();

assert.deepStrictEqual(loaderKeys, expectedKeys, "Active keys must match expected pruned schema");
console.log("Schema tests passed.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node BetterMint/tests/test_options_schema.js`
Expected: FAIL showing deleted keys (`option-api-stockfish`, `option-num-cores`, etc.) present.

- [ ] **Step 3: Prune `loader.js` and `options.js`**

Remove the following keys from `inputObjects` in both `BetterMint/js/loader.js` and `BetterMint/js/options.js`:
- `option-api-stockfish`
- `option-num-cores`
- `option-hashtable-ram`
- `option-multipv`
- `option-highmatechance`
- `option-mate-finder-value`
- `option-text-to-speech`
- `option-best-move-chance`
- `option-random-best-move`
- `option-max-legit-auto-move-depth`

In `BetterMint/js/options.js`, clean up `UpdateVisibility()` to remove references to deleted elements.

- [ ] **Step 4: Run test to verify it passes**

Run: `node BetterMint/tests/test_options_schema.js`
Expected: PASS with "Schema tests passed."

- [ ] **Step 5: Commit**

```bash
git add BetterMint/js/loader.js BetterMint/js/options.js BetterMint/tests/test_options_schema.js
git commit -m "Prune obsolete settings keys and harmonize options schema"
```

---

### Task 2: Refactor `options.html` into 3 Clean Cards

**Files:**
- Modify: `BetterMint/html/options.html`
- Create: `BetterMint/tests/test_options_html.js`

**Interfaces:**
- Consumes: Active schema keys from Task 1.
- Produces: Clean 3-card options page markup.

- [ ] **Step 1: Write the HTML validation test**

Create `BetterMint/tests/test_options_html.js`:
```javascript
const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("BetterMint/html/options.html", "utf8");

const expectedInputs = [
  "option-url-api-stockfish",
  "option-depth",
  "option-evaluation-bar",
  "option-show-hints",
  "option-move-analysis",
  "option-auto-queue",
  "option-notifications",
  "option-legit-auto-move",
  "option-human-like-moves",
  "option-move-pace",
  "option-advanced-timing",
  "option-physical-floor",
  "option-timing-spread",
  "option-fast-recaptures",
  "option-recapture-multiplier",
  "option-fast-forced-moves",
  "option-forced-multiplier",
  "option-fast-opening",
  "option-opening-moves-threshold",
  "option-opening-multiplier",
  "option-clock-scaling",
  "option-clock-threshold",
  "option-clock-min-multiplier"
];

for (const id of expectedInputs) {
  assert.ok(html.includes(`id="${id}"`), `Missing expected input: ${id}`);
}

const prunedInputs = [
  "option-api-stockfish",
  "option-num-cores",
  "option-hashtable-ram",
  "option-multipv",
  "option-highmatechance",
  "option-mate-finder-value",
  "option-text-to-speech",
  "option-best-move-chance",
  "option-random-best-move",
  "option-max-legit-auto-move-depth"
];

for (const id of prunedInputs) {
  assert.ok(!html.includes(`id="${id}"`), `Pruned input still present in HTML: ${id}`);
}

const cardCount = (html.match(/<section class="card">/g) || []).length;
assert.strictEqual(cardCount, 3, `Expected exactly 3 cards, found ${cardCount}`);

console.log("HTML structure tests passed.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node BetterMint/tests/test_options_html.js`
Expected: FAIL showing 4 cards and pruned inputs still present.

- [ ] **Step 3: Refactor `BetterMint/html/options.html`**

1. Card 1 (Engine Server): Retain only `option-url-api-stockfish` and `option-depth` slider.
2. Card 2 (HUD & Display): Retain `option-evaluation-bar`, `option-show-hints`, `option-move-analysis`, `option-auto-queue`, and `option-notifications`. Delete `option-text-to-speech`.
3. Delete Card 3 (Move Selection) entirely.
4. Card 3 becomes Auto Move Pacing: Retain `option-legit-auto-move`, `option-human-like-moves`, `option-move-pace`, and `option-advanced-timing` with its flat sub-panel.

- [ ] **Step 4: Run test to verify it passes**

Run: `node BetterMint/tests/test_options_html.js`
Expected: PASS with "HTML structure tests passed."

- [ ] **Step 5: Commit**

```bash
git add BetterMint/html/options.html BetterMint/tests/test_options_html.js
git commit -m "Refactor options.html into 3 cards and remove pruned controls"
```

---

### Task 3: Pure WebSocket Engine & Execution Directness in `Mint.js`

**Files:**
- Modify: `BetterMint/js/Mint.js`
- Create: `BetterMint/tests/test_engine_pipeline.js`

**Interfaces:**
- Consumes: Pruned `enumOptions` and WebSocket URL.
- Produces: Direct `bestmove` auto-play execution without client-side move tampering.

- [ ] **Step 1: Write the pipeline test**

Create `BetterMint/tests/test_engine_pipeline.js`:
```javascript
const assert = require("assert");
const fs = require("fs");

const src = fs.readFileSync("BetterMint/js/Mint.js", "utf8");

assert.ok(!src.includes("speechSynthesis"), "speechSynthesis should be completely removed");
assert.ok(!src.includes("initializeWorker"), "initializeWorker should be completely removed");
assert.ok(!src.includes("HighMateChance"), "HighMateChance should be removed");
assert.ok(!src.includes("RandomBestMove"), "RandomBestMove should be removed");
assert.ok(!src.includes("BestMoveChance"), "BestMoveChance should be removed");
assert.ok(!src.includes("MaxLegitAutoMoveDepth"), "MaxLegitAutoMoveDepth should be removed");

assert.ok(src.includes('"MultiPV": "1"'), 'MultiPV must be locked to "1"');
assert.ok(!src.includes("requestAnimationFrame"), "requestAnimationFrame must remain removed from automove");

console.log("Engine pipeline tests passed.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node BetterMint/tests/test_engine_pipeline.js`
Expected: FAIL showing `initializeWorker` or `speechSynthesis` still present in `Mint.js`.

- [ ] **Step 3: Refactor `Mint.js`**

1. Update `enumOptions`: Remove `ApiStockfish`, `NumCores`, `HashtableRam`, `MateFinderValue`, `MultiPV`, `HighMateChance`, `BestMoveChance`, `RandomBestMove`, `MaxLegitAutoMoveDepth`, `TextToSpeech`.
2. In `StockfishEngine.constructor()`: Remove WASM worker initialization branch; initialize directly via `this.initializeWebSocket(getValueConfig(enumOptions.UrlApiStockfish))`.
3. Delete `initializeWorker()` method entirely.
4. Lock `MultiPV: "1"` in `this.options`.
5. In `onTopMoves()`: Remove TTS execution block (`getValueConfig(enumOptions.TextToSpeech)`).
6. In `ExecuteAutoMove()`: Remove random move shuffling and mate finder sorting blocks. Take `bestMove = this.topMoves[0]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node BetterMint/tests/test_engine_pipeline.js`
Expected: PASS with "Engine pipeline tests passed."

- [ ] **Step 5: Commit**

```bash
git add BetterMint/js/Mint.js BetterMint/tests/test_engine_pipeline.js
git commit -m "Streamline StockfishEngine to pure WebSocket delegation in Mint.js"
```

---

### Task 4: System Integration & Timing Verification

**Files:**
- Modify: `BetterMint/tests/test_timing.js`

**Interfaces:**
- Consumes: Refactored engine configuration and natural auto-move timing model.
- Produces: All test suites passing.

- [ ] **Step 1: Update `test_timing.js` if needed**

Ensure `baseConfig` in `test_timing.js` aligns with the active options schema.

- [ ] **Step 2: Run all syntax and test suites**

Run:
```bash
node -c BetterMint/js/Mint.js BetterMint/js/options.js BetterMint/js/loader.js
node BetterMint/tests/test_options_schema.js
node BetterMint/tests/test_options_html.js
node BetterMint/tests/test_engine_pipeline.js
node BetterMint/tests/test_timing.js
```
Expected: All tests pass with zero syntax errors.

- [ ] **Step 3: Commit**

```bash
git add BetterMint/tests/test_timing.js
git commit -m "Verify full system integration and test suite consistency"
```
