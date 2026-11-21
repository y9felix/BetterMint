# BetterMint Manual Verification Checklist

Manual verification checklist covering behaviors that automated Node.js and Python unit tests cannot verify: real Chromium rendering and browser APIs, live Chess.com DOM and board internals, and real OS process/engine lifecycle.

## When to Run Each Section

| Trigger | Sections to Run |
|---|---|
| Edited popup HTML, CSS, or `options.js` | §1 (Load) + §2 (Popup UX) |
| Edited `manifest.json` or `rules.json` | §1 (MV3 & DNR) |
| Edited `Mint.js` DOM, overlay, or automation code | §3 (Live Chess.com) |
| Chess.com frontend update or broken overlays | §1 (DNR) + §3 (Live Chess.com) |
| Edited EngineWS, `config.json`, or upgraded an engine binary | §4 (Real EngineWS & Subprocesses) |
| Before tagging a release | All sections (§1–§4) |

---

## §1. Chrome MV3 Load, Permissions & DNR Rules

- **Clean unpacked load**: Reload `BetterMint/` in `chrome://extensions` and confirm zero errors or warnings on the extension card.
- **Report-only CSP stripping (`rules.json`)**:
  - Open Chess.com with DevTools → Network (`Doc` filter) and reload 5–10 times (Chess.com samples the header intermittently).
  - Confirm response headers contain no `Content-Security-Policy-Report-Only`, `Report-To`, or `Reporting-Endpoints`.
  - Confirm DevTools Console has zero `Mint.js` report-only CSP notices and Network shows zero outgoing `csp_report` requests.
  - Confirm any enforced `Content-Security-Policy` is untouched and Chess.com loads normally.
- **Blocked monitor endpoints**: Verify fair-play / play-monitor blocks in `rules.json` do not break live games, puzzles, or analysis loading.
- **Extension reload recovery (`loader.js`)**: Reload BetterMint in `chrome://extensions` while a Chess.com tab is already open; confirm interacting with the page does not spam unhandled `Extension context invalidated` errors in Console (then refresh the tab to re-attach).
- **Cross-tab messaging**: With two Chess.com tabs open, toggle a setting in the popup and confirm active tabs update immediately with zero `Unchecked runtime.lastError: The message port closed...` warnings.

---

## §2. Popup UI, CSS Layout, Themes & Keyboard UX

- **Popup height & overflow**: Open the extension popup and verify it stays within Chrome's 600px height cap, the sticky footer never detaches, and there is no horizontal scrollbar.
- **All 4 themes**: Cycle **Dark** → **Light** → **Black** → **Chess.com**. Check text contrast, slider accent fill, badge legibility, icon swap, and Configs popover styling. Close and reopen the popup to verify the theme persists.
- **Disclosure animations & focus clipping**:
  - Expand and collapse Search Options, UCI Options, and Advanced Timing.
  - Press `Tab` through every control—especially the first and last controls inside each expanded disclosure and sub-panel—and confirm focus outlines are never clipped.
- **Reduced motion**: In popup DevTools → Rendering → emulate `prefers-reduced-motion: reduce`; confirm disclosure and toggle animations disable cleanly.
- **Auto-scroll above sticky footer**: Scroll near the bottom of the popup and toggle Auto Queue and Auto Move on; confirm `.settings-container` scrolls smoothly to reveal the expanded panel above the sticky footer without scrolling the toggle row out of sight.
- **Real `<input type="range">` + inline badge editing**:
  - Click a slider badge (e.g., Move Time or Nodes), type an unaligned value (`320` or `12345`), and press `Enter`. Confirm the badge shows the exact value, the slider does not snap away, and closing/reopening the popup preserves the exact value.
  - Drag that same slider thumb afterward and confirm it snaps cleanly back to its coarse step (`50` / `10000`).
  - Test `Escape` (cancels), clicking away / blur (commits), typing above max (clamps), and typing `off`.
- **Configs popover & focus return**: Open the Configs popover, save a named profile, manually change a slider (confirm active highlight clears), reopen and load the profile (confirm both standard sliders and per-engine UCI options restore), delete it (confirm empty state), and test closing via `Escape` and clicking outside.
- **Dynamic UCI controls with a real engine**:
  - Expand UCI Options while EngineWS is running and verify `spin`, `check`, `combo`, `string`, and `button` controls render legibly—including huge-range spins like Stockfish Hash via badge inline editing.
  - Stop EngineWS and expand UCI Options on a fresh popup; confirm clean status text appears with no stuck loading state.

---

## §3. Live Chess.com DOM & Board Integration

- **Multi-view board attachment**: Test on Live game, Play vs. Computer, and Analysis views. Confirm `wc-chess-board` / `chess-board` attaches and `board.game` APIs (`getFEN`, `getLegalMoves`, `getLastMove`, `getMode`, `getTurn`, `getPlayingAs`, `markings`, `move`) work without console errors.
- **SPA navigation without reload**: Play a game to completion and start another (or switch from Play → Analysis → Play) without refreshing the browser tab. Confirm:
  - The evaluation bar hides cleanly when a board unmounts and re-mounts cleanly on the next board.
  - No duplicate eval bars, duplicate arrows, or stale move history carry over from the previous game.
- **Floating Evaluation Bar geometry**:
  - **Desktop (>= 960px)**: Aligns cleanly to the left edge of the board (30px wide, 40px offset) without overlapping coordinates or Chess.com panels.
  - **Compact (< 960px)**: Shrinks cleanly (20px wide, 30px offset).
  - **Dynamic layout changes**: Resize the window, scroll the page, change browser zoom (90% / 110% / 125%), and flip the board (White vs. Black perspective). Confirm `ResizeObserver` + `requestAnimationFrame` keeps the bar aligned without flicker or inverted fill.
  - **Non-interactive**: Clicking/dragging directly along the eval bar edge never steals clicks from the board (`pointer-events: none`).
- **Hints, Move Analysis & Book markings**:
  - Verify `MultiPV >= 2` renders distinct arrows progressively as depth increases and clears all arrows on checkmate/stalemate.
  - Play castling (`O-O`, `O-O-O`), en passant, and a pawn promotion (including underpromotion); confirm arrows point to the right squares and MoveAnalysis badges do not collide with or erase hint arrows.
  - Play a known opening line with a `.bin` book configured; confirm the `#a88865` Book badge appears on book moves and switches cleanly to centipawn classification on the first out-of-book move.
- **Live clock reading & Human-like Auto Move**:
  - Enable Clock Threshold and play into low time (including sub-10s tenths format like `0:08.4`); confirm `.clock-bottom` is still read properly and move pace visibly speeds up.
  - Verify Auto Move executes legal moves (including promotions and castling) in live play, never fires in analysis or `gameOver`, and cancels any pending delay timer if you manually play a move or the game ends before the timer fires.
- **Auto Queue & Rematch First**:
  - With Auto Queue on and Rematch first off, confirm the game-over modal clicks New Game (and never clicks anything while playing).
  - With Rematch first on, confirm it clicks Rematch when present and falls back to New Game when Rematch is absent or disabled.

---

## §4. Real EngineWS, Real Engines & Process Lifecycle

- **Real UCI engine compatibility**: Connect to each configured engine in `EngineWS/config.json` (e.g., Stockfish, Patricia, Maia/Lc0) and verify startup, `setoption` application with zero engine stderr errors, and search completion under depth, movetime, and nodes limits.
- **Live mid-game engine switching**: While an engine is actively searching at high depth, switch the WebSocket URL in the popup to another engine. Confirm EngineWS logs clean `[ENGINE STOP]` → `[ENGINE SPAWN]` transitions and the current board position immediately re-evaluates on the new engine.
- **Real Polyglot `.bin` opening books**: Confirm EngineWS terminal logs show book hits bypassing engine search, book misses forwarding to the engine, and a missing/corrupt book path logging `[CONFIG WARN]` while falling back to the engine.
- **Tab visibility, wake & crash-loop behavior**:
  - Stop EngineWS while a Chess.com tab is open, switch to another browser tab, and verify reconnect backoff pauses while hidden; return to the Chess.com tab and verify it reconnects immediately on visibility/focus.
  - Start EngineWS after Chess.com is already open and verify it connects on tab focus or next move without a page reload.
  - Point to a nonexistent binary in `config.json` and confirm the fatal error latches (no infinite reconnect loop in Console/terminal), then switch to a valid engine URL and confirm immediate recovery.
- **Zero orphaned engine processes**: Rapidly reload a Chess.com tab 3–4 times, close the tab, and stop EngineWS with `Ctrl+C`. Check `ps aux` (Linux/macOS) or Task Manager (Windows) to confirm zero stray `stockfish` / `lc0` / `patricia` processes remain alive.
