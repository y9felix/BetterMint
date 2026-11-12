# Natural Auto Move & Menu Reorganization Design

## 1. Intent & Why
BetterMint's legacy Auto Move calculation uses an artificial formula (`base + (rand % div) * multi`) that produces unnatural clustered timing profiles. Additionally, the existing execution pipeline is strictly sequential: it waits for the engine search to complete before initiating the delay timer, effectively doubling the move time when the engine takes long. 

This overhaul replaces the delay calculation with a context-aware log-normal distribution, runs the move timer asynchronously from the moment the turn begins in parallel with the engine search, dispatches moves via `requestAnimationFrame` to ensure DOM settlement, and reorganizes the settings UI into four logically separated cards with progressive disclosure.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Parallel Deliberation:** Start think-time countdown immediately when the player's turn begins (`On Move`).
- **Log-Normal Distribution:** Model human decision latency using Box-Muller transform ($\sigma = 0.45$, physical floor $200$ ms).
- **Context Awareness:** Automatically adjust median think time based on forced single legal moves ($0.35\times$), piece recaptures ($0.50\times$), early openings ($0.65\times$), and remaining clock time (smooth decay).
- **Instant Mode with Event Settlement:** If human-like pacing is disabled, dispatch moves as soon as the engine finishes using `requestAnimationFrame` to wait for DOM mutation/paint cycles without arbitrary sleep timers.
- **Card Hierarchy Reorganization:**
  1. Engine Server (with Mate Finder)
  2. HUD & Display (with Auto Queue)
  3. Move Selection (accuracy, randomize top moves, max depth)
  4. Auto Move Pacing (master toggle, human-like toggle, pace slider, expandable advanced settings)
- **Progressive Disclosure:** Hide advanced timing sliders by default; reveal only when toggled.

### Non-Goals
- Adding server-side engine timing modulation (UCI `movetime` or `wtime`/`btime` management is left to the client script).
- Adding complex board vision heuristics (e.g. piece square distance travel math).

### Anti-Goals
- Never stack delay timers sequentially on top of engine search latency.
- Never freeze or block the browser UI thread with synchronous delays or busy loops.
- Never add external libraries or runtime dependencies.

---

## 3. Constraints
- **Offline First:** Zero external requests or CDNs; all math must run locally in JavaScript.
- **Minimal Footprint:** No extra frameworks; pure native DOM APIs and `chrome.storage.sync`.
- **Zero Comments:** Code written without explanatory comments per project rules.

---

## 4. Approaches Considered

### Approach 1: Parallel Context-Aware Log-Normal with Progressive UI (Selected)
- **How it works:**
  - Timer starts at turn transition ($t_0$). Target think time $T_{\text{target}}$ is drawn from a log-normal distribution with context multipliers.
  - When the engine finishes, it dispatches at $\max(0, T_{\text{target}} - (t_{\text{now}} - t_0))$ via `requestAnimationFrame`.
  - UI replaces 6 legacy sliders and 2 toggles with 1 default `Move Pace` slider and a collapsable `Advanced Settings` panel.
- **Why chosen:** Produces statistically natural human telemetry, avoids sequential double-delays, and simplifies the default UI while keeping full granular control available.

### Approach 2: Pure Statistical Log-Normal (No Context)
- **How it works:** Single static log-normal distribution without reading board state (recaptures, forced moves, or remaining clock).
- **Trade-off:** Forced recaptures take unnatural 3-4 second pauses, and complex tactical blunders take identical time to simple checks. Rejected for poor realism.

### Approach 3: Deep MultiPV Delta Complexity Evaluation
- **How it works:** Evaluates engine score gaps between line 1 and line 2 to scale think times.
- **Trade-off:** High code complexity, fragile hooks into the engine UCI stream, violates the minimalism rule. Rejected as bloat.

---

## 5. Detailed Technical Specification

### 5.1 Parallel Execution Timeline
```
Opponent Moves (Turn starts)
  │
  ├─► t0 = performance.now()
  ├─► Compute T_target (Context-aware Log-Normal)
  │
  ├─► StockfishEngine.go() (Asynchronous UCI search)
  │     │
  │     ▼
  │   Engine outputs bestmove (Search finished at t_engine)
  │
  ▼
elapsed = t_engine - t0
remainingDelay = max(0, T_target - elapsed)

if remainingDelay > 0:
    setTimeout(() => requestAnimationFrame(doMove), remainingDelay)
else:
    requestAnimationFrame(doMove)
```

### 5.2 Timing & Log-Normal Model

#### Formula
$$Z = \sqrt{-2 \ln(U_1)} \cos(2\pi U_2), \quad U_1, U_2 \sim \mathcal{U}(0, 1)$$
$$T_{\text{target}} = \text{minFloor} + \exp(\ln(\max(50, \text{median} - \text{minFloor})) + \sigma \cdot Z)$$

#### Context Factors (Applied to Median before Sampling)
1. **Forced Move:** `controller.getLegalMoves().length === 1` $\rightarrow$ `median *= forcedMultiplier` (default $0.35\times$).
2. **Immediate Recapture:** `lastMove && bestMove.to === lastMove.to` $\rightarrow$ `median *= recaptureMultiplier` (default $0.50\times$).
3. **Early Opening:** `fullMoveNumber <= openingMovesTrigger` (default 7) $\rightarrow$ `median *= openingMultiplier` (default $0.65\times$).
4. **Clock Scaling:** `remainingSeconds < clockThreshold` (default 60s) $\rightarrow$ `median *= max(clockMinMultiplier, remainingSeconds / clockThreshold)` (default min $0.30\times$).
5. **Instant Mode:** If `Human-like Moves` is disabled $\rightarrow$ $T_{\text{target}} = 0$.

### 5.3 Event-Driven DOM Queue Settlement
When the scheduled move is ready:
```javascript
function dispatchMove(controller, moveData) {
  requestAnimationFrame(() => {
    controller.move(moveData);
  });
}
```
Ensures all layout calculations and DOM animations from the prior move are committed before dispatching the new move.

### 5.4 Reorganized UI Structure (4 Cards)

#### Card 1: Engine Server
- `Enable Engine Server` (Checkbox toggle)
- `WebSocket API URL` (Text input)
- `Search Depth` (Range: 1–30, default 3)
- `MultiPV (Lines)` (Range: 1–10, default 3)
- `Hash RAM (MB)` (Range: 16–4096, default 1024)
- `CPU Cores` (Range: 1–16, default 1)
- `Mate Finder` (Checkbox toggle) [Moved from Automation & Safety]
- `Mate Finder Max Depth` (Range: 1–10, default 5) [Moved from Automation & Safety]

#### Card 2: HUD & Display
- `Evaluation Bar` (Checkbox toggle)
- `Show Move Hints` (Checkbox toggle)
- `Move Analysis` (Checkbox toggle)
- `Text-to-Speech` (Checkbox toggle)
- `Toast Notifications` (Checkbox toggle)
- `Auto Queue New Game` (Checkbox toggle) [Moved from Automation & Safety]

#### Card 3: Move Selection [New Card]
- `Randomize Top Moves` (Checkbox toggle)
- `Best Move Chance (%)` (Range: 0–100, default 30)
- `Max Auto Move Depth` (Range: 1–25, default 10)

#### Card 4: Auto Move Pacing [Overhauled Card]
- `Enable Auto Move` (Checkbox toggle, master switch)
- `Human-like Moves` (Checkbox toggle: when unchecked, moves instant; when checked, reveals pace & advanced)
- `Move Pace` (Range: 0.5s–5.0s, step 0.1s, default 1.5s)
- `Advanced Settings` (Checkbox toggle: expands/collapses granular parameters)
  - *Collapsible Section:*
    - `Physical Floor (ms)` (Range: 50–500 ms, default 200 ms)
    - `Variation Spread (σ)` (Range: 0.10–1.00, step 0.05, default 0.45)
    - `Fast Recaptures` (Checkbox toggle) + `Recapture Multiplier` (Range: 0.10–1.00, step 0.05, default 0.50×)
    - `Fast Forced Moves` (Checkbox toggle) + `Forced Move Multiplier` (Range: 0.10–1.00, step 0.05, default 0.35×)
    - `Fast Opening` (Checkbox toggle) + `Opening Moves` (Range: 1–15, default 7) + `Opening Multiplier` (Range: 0.10–1.00, step 0.05, default 0.65×)
    - `Clock Scaling` (Checkbox toggle) + `Clock Threshold (s)` (Range: 10–120s, default 60s) + `Clock Min Multiplier` (Range: 0.10–0.80, default 0.30×)

*Note: The legacy "Automation & Safety" card is deleted.*

---

## 6. Storage Schema & Defaults

```javascript
{
  // Engine
  "option-api-stockfish": true,
  "option-url-api-stockfish": "ws://localhost:8000/ws",
  "option-depth": 3,
  "option-multipv": 3,
  "option-hashtable-ram": 1024,
  "option-num-cores": 1,
  "option-highmatechance": false,
  "option-mate-finder-value": 5,

  // HUD & Display
  "option-evaluation-bar": true,
  "option-show-hints": true,
  "option-move-analysis": true,
  "option-text-to-speech": false,
  "option-notifications": false,
  "option-auto-queue": false,

  // Move Selection
  "option-legit-auto-move": false,
  "option-random-best-move": false,
  "option-best-move-chance": 30,
  "option-max-legit-auto-move-depth": 10,

  // Auto Move Pacing
  "option-human-like-moves": true,
  "option-move-pace": 1.5,
  "option-advanced-timing": false,
  "option-physical-floor": 200,
  "option-timing-spread": 0.45,
  "option-fast-recaptures": true,
  "option-recapture-multiplier": 0.50,
  "option-fast-forced-moves": true,
  "option-forced-multiplier": 0.35,
  "option-fast-opening": true,
  "option-opening-moves-threshold": 7,
  "option-opening-multiplier": 0.65,
  "option-clock-scaling": true,
  "option-clock-threshold": 60,
  "option-clock-min-multiplier": 0.30
}
```

---

## 7. Verification Plan
- **Syntax Check:** Run `node -c` across `BetterMint/js/*.js`.
- **Options UI Validation:** Verify in Brave that toggling `Human-like Moves` and `Advanced Settings` smoothly displays/hides sub-panels without layout breakage.
- **Timing Log Validation:** Inspect console output on Chess.com (`turn duration = max(target, engine_time)` and `requestAnimationFrame` execution).
- **Git Commit:** Stage and commit clean state to the repository.
