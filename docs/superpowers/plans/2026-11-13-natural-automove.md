# Natural Auto Move & Menu Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement asynchronous, turn-start log-normal move deliberation with context-aware scaling, event-driven `requestAnimationFrame` DOM dispatch, and reorganize the options popup into 4 clean cards with progressive disclosure.

**Architecture:** Timing begins at turn transition (`On Move`), running concurrently with the UCI engine search. Move dispatch resolves at $\max(T_{\text{target}}, T_{\text{engine}})$ using Box-Muller log-normal sampling modified by board context (forced move, recapture, opening, clock pressure). The settings popup is restructured into four semantic cards: Engine Server, HUD & Display, Move Selection, and Auto Move Pacing (with progressive disclosure of advanced controls).

**Tech Stack:** JavaScript (ES6+), Chrome Extensions API (Manifest V3, `chrome.storage.sync`), HTML5/CSS3.

**Spec:** [docs/superpowers/specs/2026-11-13-natural-automove-design.md](file:///home/felix/documents/extensions/BetterMint/docs/superpowers/specs/2026-11-13-natural-automove-design.md)

## Global Constraints
- Zero external libraries or network requests; all calculations run strictly client-side.
- Zero comments in all code, scripts, and configurations per project rules.
- Native CSS and JavaScript only; no frameworks.
- Clean git commits for each task with descriptive messages.

## Review Focus
1. Turn switch race condition: Opponent moves rapidly in bullet; previous timer must be cleared before a new turn starts.
2. Engine slower than think time: When $T_{\text{engine}} > T_{\text{target}}$, move must dispatch immediately via `requestAnimationFrame` with zero extra delay.
3. Instant mode: When `Human-like Moves` is disabled, delay must be 0 and dispatch immediately after engine finishes on DOM ready.
4. Slider badge sync: Real-time update of all slider badge elements on `input` events.
5. Storage persistence: Seamless loading of default values when keys are not yet set in storage.

---

### Task 1: Timing Model & Asynchronous Deliberation in `Mint.js`

**Files:**
- Create: `BetterMint/tests/test_timing.js`
- Modify: `BetterMint/BetterMint/js/Mint.js`

**Interfaces:**
- Produces: `GameController.turnStartTime`, `StockfishEngine.calculateTargetDelay()`, `StockfishEngine.dispatchMove()`
- Consumes: `controller.getLegalMoves()`, `controller.getLastMove()`, `controller.getFEN()`, `getRemainingPlayerTimeSeconds()`

- [ ] **Step 1: Write standalone test for the log-normal math and context multipliers**

```javascript
// BetterMint/tests/test_timing.js
const assert = require("assert");

function calculateNaturalDelay(config, context) {
  if (!config.humanLikeMoves) return 0;

  let median = config.movePace * 1000;
  const minFloor = config.physicalFloor;

  if (config.fastForcedMoves && context.isForced) {
    median *= config.forcedMultiplier;
  } else if (config.fastRecaptures && context.isRecapture) {
    median *= config.recaptureMultiplier;
  } else if (config.fastOpening && context.moveNumber <= config.openingThreshold) {
    median *= config.openingMultiplier;
  }

  if (config.clockScaling && context.remainingSeconds !== null && context.remainingSeconds < config.clockThreshold) {
    const factor = Math.max(config.clockMinMultiplier, context.remainingSeconds / config.clockThreshold);
    median *= factor;
  }

  const u1 = Math.max(1e-7, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const mu = Math.log(Math.max(50, median - minFloor));
  return Math.round(minFloor + Math.exp(mu + config.timingSpread * z));
}

// Tests
const baseConfig = {
  humanLikeMoves: true,
  movePace: 1.5,
  physicalFloor: 200,
  timingSpread: 0.45,
  fastForcedMoves: true,
  forcedMultiplier: 0.35,
  fastRecaptures: true,
  recaptureMultiplier: 0.50,
  fastOpening: true,
  openingThreshold: 7,
  openingMultiplier: 0.65,
  clockScaling: true,
  clockThreshold: 60,
  clockMinMultiplier: 0.30
};

// 1. Instant mode
assert.strictEqual(calculateNaturalDelay({ ...baseConfig, humanLikeMoves: false }, {}), 0);

// 2. Minimum floor respected
for (let i = 0; i < 500; i++) {
  const delay = calculateNaturalDelay(baseConfig, { isForced: false, isRecapture: false, moveNumber: 15, remainingSeconds: 120 });
  assert.ok(delay >= baseConfig.physicalFloor, `Delay ${delay} below floor ${baseConfig.physicalFloor}`);
}

console.log("Timing tests passed.");
```

- [ ] **Step 2: Run timing test to verify math passes**

Run: `node /home/felix/documents/extensions/BetterMint/BetterMint/tests/test_timing.js`
Expected: `Timing tests passed.`

- [ ] **Step 3: Implement turn start timestamping and parallel timing in `Mint.js`**

1. In `GameController.constructor`:
   - Initialize `this.turnStartTime = 0;` and `this.autoMoveTimer = null;`.
   - On `this.controller.on("Move", (event) => { ... })`:
     - Clear any pending `this.autoMoveTimer`.
     - If active player turn: `this.turnStartTime = performance.now();`.
2. In `StockfishEngine`:
   - Add `calculateTargetDelay(bestMove)` method using `calculateNaturalDelay` logic.
   - Update `bestMoveSelected` handler in `StockfishEngine.ProcessMessage`:
     - Calculate target delay: `targetDelay = this.calculateTargetDelay(bestMove);`.
     - Calculate elapsed engine time: `elapsed = performance.now() - this.BetterMintmaster.game.turnStartTime;`.
     - Calculate remaining delay: `remaining = Math.max(0, targetDelay - elapsed);`.
     - If `remaining > 0`: schedule via `setTimeout(() => requestAnimationFrame(() => controller.move(moveData)), remaining)`.
     - If `remaining === 0`: execute immediately via `requestAnimationFrame(() => controller.move(moveData))`.

- [ ] **Step 4: Verify `Mint.js` syntax**

Run: `node -c /home/felix/documents/extensions/BetterMint/BetterMint/js/Mint.js`
Expected: Exit code 0.

- [ ] **Step 5: Commit**

```bash
git add BetterMint/tests/test_timing.js BetterMint/js/Mint.js
git commit -m "Implement turn-start parallel log-normal deliberation in Mint.js"
```

---

### Task 2: Config Schema Alignment in `Mint.js`, `loader.js`, and `options.js`

**Files:**
- Modify: `BetterMint/BetterMint/js/Mint.js`
- Modify: `BetterMint/BetterMint/js/loader.js`
- Modify: `BetterMint/BetterMint/js/options.js`

**Interfaces:**
- Produces: New storage keys matching Section 6 of spec
- Removes: Deprecated keys (`AutoMoveTime`, `AutoMoveTimeRandom`, `AutoMoveTimeRandomDiv`, `AutoMoveTimeRandomMulti`, `PanicMode`, `PanicTime`, `FastOpeningMoves`, `FastOpeningSpeed`)

- [ ] **Step 1: Update `enumOptions` in `Mint.js`**

Replace legacy timing keys with:
- `HumanLikeMoves: "option-human-like-moves"`
- `MovePace: "option-move-pace"`
- `AdvancedTiming: "option-advanced-timing"`
- `PhysicalFloor: "option-physical-floor"`
- `TimingSpread: "option-timing-spread"`
- `FastRecaptures: "option-fast-recaptures"`
- `RecaptureMultiplier: "option-recapture-multiplier"`
- `FastForcedMoves: "option-fast-forced-moves"`
- `ForcedMultiplier: "option-forced-multiplier"`
- `FastOpening: "option-fast-opening"`
- `OpeningMovesThreshold: "option-opening-moves-threshold"`
- `OpeningMultiplier: "option-opening-multiplier"`
- `ClockScaling: "option-clock-scaling"`
- `ClockThreshold: "option-clock-threshold"`
- `ClockMinMultiplier: "option-clock-min-multiplier"`

- [ ] **Step 2: Update `DefaultExtensionOptions` in `loader.js`**

Add all new keys with spec defaults and remove deprecated keys.

- [ ] **Step 3: Update `inputObjects` in `options.js`**

Register the new fields and remove deprecated fields in `options.js`.

- [ ] **Step 4: Verify syntax across all modified JS files**

Run:
```bash
for f in BetterMint/BetterMint/js/Mint.js BetterMint/BetterMint/js/loader.js BetterMint/BetterMint/js/options.js; do
  node -c "$f"
done
```
Expected: All exit 0.

- [ ] **Step 5: Commit**

```bash
git add BetterMint/js/Mint.js BetterMint/js/loader.js BetterMint/js/options.js
git commit -m "Update configuration keys and storage schema for new pacing options"
```

---

### Task 3: Restructure Settings Markup in `options.html`

**Files:**
- Modify: `BetterMint/BetterMint/html/options.html`

**Interfaces:**
- Consumes: Keys from Task 2
- Restructures: 4 clean cards (`card-engine`, `card-hud`, `card-selection`, `card-pacing`)
- Removes: Card "Automation & Safety"

- [ ] **Step 1: Move Mate Finder into Card 1 (Engine Server)**

Add `option-highmatechance` and `option-mate-finder-value` to Card 1.

- [ ] **Step 2: Move Auto Queue into Card 2 (HUD & Display)**

Add `option-auto-queue` to Card 2.

- [ ] **Step 3: Create Card 3 (Move Selection)**

Create `<section class="card">` containing:
- `option-random-best-move`
- `option-best-move-chance`
- `option-max-legit-auto-move-depth`

- [ ] **Step 4: Rebuild Card 4 (Auto Move Pacing) with Collapsible Structure**

Create Card 4 containing:
- `option-legit-auto-move` (Master toggle)
- Container `#pacing-group`:
  - `option-human-like-moves` (Toggle)
  - Container `#human-pace-group`:
    - `option-move-pace` (Slider 0.5s–5.0s, badge `badge-option-move-pace`)
    - `option-advanced-timing` (Toggle)
    - Container `#advanced-timing-panel` (Initially hidden):
      - `option-physical-floor`
      - `option-timing-spread`
      - `option-fast-recaptures` + `option-recapture-multiplier`
      - `option-fast-forced-moves` + `option-forced-multiplier`
      - `option-fast-opening` + `option-opening-moves-threshold` + `option-opening-multiplier`
      - `option-clock-scaling` + `option-clock-threshold` + `option-clock-min-multiplier`

- [ ] **Step 5: Delete Card "Automation & Safety"**

Verify zero references to old panic mode or deleted sliders remain.

- [ ] **Step 6: Verify HTML syntax & validation**

Check file structure and confirm no unclosed tags.

- [ ] **Step 7: Commit**

```bash
git add BetterMint/html/options.html
git commit -m "Restructure options.html into 4 semantic cards with progressive pacing controls"
```

---

### Task 4: Implement Progressive Disclosure & Slider Sync in `options.js` and `options.css`

**Files:**
- Modify: `BetterMint/BetterMint/css/options.css`
- Modify: `BetterMint/BetterMint/js/options.js`

**Interfaces:**
- Consumes: `#pacing-group`, `#human-pace-group`, `#advanced-timing-panel`, range sliders with `.badge`

- [ ] **Step 1: Add CSS rules for collapsible sections in `options.css`**

Add utility classes for toggled sections:
```css
.hidden {
    display: none !important;
}

.sub-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-left: 8px;
    border-left: 2px solid var(--border-color);
    margin-top: 4px;
}
```

- [ ] **Step 2: Add dynamic toggle listeners in `options.js`**

1. When `#option-legit-auto-move` changes: show/hide `#pacing-group`.
2. When `#option-human-like-moves` changes: show/hide `#human-pace-group`.
3. When `#option-advanced-timing` changes: show/hide `#advanced-timing-panel`.
4. Run visibility sync in `RestoreOptions()`.
5. Support float values for multiplier sliders with step (e.g. `step="0.05"` parsed as `parseFloat()`).

- [ ] **Step 3: Verify JS syntax**

Run: `node -c /home/felix/documents/extensions/BetterMint/BetterMint/js/options.js`
Expected: Exit code 0.

- [ ] **Step 4: Commit**

```bash
git add BetterMint/css/options.css BetterMint/js/options.js
git commit -m "Add progressive disclosure and float slider handling in options"
```

---

### Task 5: End-to-End Verification and Cleanup

**Files:**
- Test: `BetterMint/tests/test_timing.js`
- All files in `BetterMint/`

- [ ] **Step 1: Run complete timing test suite**

Run: `node /home/felix/documents/extensions/BetterMint/BetterMint/tests/test_timing.js`
Expected: `Timing tests passed.`

- [ ] **Step 2: Validate syntax across all JavaScript files**

Run:
```bash
for f in BetterMint/BetterMint/js/*.js; do
  echo "Checking $f"
  node -c "$f"
done
```
Expected: All exit with code 0.

- [ ] **Step 3: Verify clean git status**

Run: `git -C /home/felix/documents/extensions/BetterMint status`
Expected: Clean working tree.

- [ ] **Step 4: Final commit / push if remote exists**
