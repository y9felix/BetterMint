# Design: Maia Dynamic Endgame Search Node Allocation

## Intent & Why
Maia models human decision-making via supervised learning over Lichess human blitz games. When queried at `depth 1` (`nodes 1`), `lc0` evaluates only the raw policy distribution with zero lookahead calculation. This accurately reproduces human opening and middlegame choices, including typical human mistakes and tactical preferences. However, endgames require concrete forward calculation (e.g. calculating passed pawn advancement, king opposition, and mating nets). Without search, raw policy often assigns equal or higher probability to non-blundering, passive piece/king shuffles, causing the engine to stall instead of converting advantages. Dynamically increasing Maia's search budget to `nodes 100` in the endgame allows MCTS to find concrete tactical conversion paths while preserving its human style throughout the rest of the game.

## Goals, Non-Goals, and Anti-Goals
- **Goals:**
  - Detect endgame board state from incoming UCI `position fen ...` messages within `EngineWS`.
  - Dynamically translate `go depth 1` to `go nodes 100` specifically for `/maia-{elo}` WebSocket connections during the endgame.
  - Retain raw `go depth 1` for opening and middlegame phases.
  - Keep the browser extension ([BetterMint/js/Mint.js](file:///home/felix/documents/extensions/BetterMint/BetterMint/js/Mint.js)) decoupled and unmodified.
  - Implement regression tests verifying endgame FEN detection and command translation.
- **Non-Goals:**
  - Re-training or fine-tuning neural network weights.
  - Altering UCI command flow for Stockfish or Patricia endpoints.
  - Adding dedicated endgame UI configuration controls to the browser extension.
- **Anti-Goals:**
  - Increasing endgame node search so high (e.g. >500 nodes) that Maia plays like a cold, superhuman engine.
  - Introducing latency to opening/middlegame evaluations.

## Constraints
- Minimalist footprint, zero comments in code/config.
- Low-latency FEN evaluation (<0.1ms per position).
- Service reliability: seamless fallback if a FEN cannot be parsed.

## Approaches Considered
1. **Server-Side Translation in [EngineWS/main.py](file:///home/felix/documents/extensions/BetterMint/EngineWS/main.py) (Selected):**
   - Intercepts UCI commands in the WebSocket proxy, evaluates FEN material, and rewrites `go depth 1` to `go nodes 100` in endgames.
   - *Pros:* Keeps the browser extension lean and generic; centralizes engine-specific quirks in the local engine server.
   - *Cons:* Backend inspects the UCI stream.
2. **Client-Side Engine Options in [BetterMint/js/Mint.js](file:///home/felix/documents/extensions/BetterMint/BetterMint/js/Mint.js):**
   - Client inspects FEN and sends `go nodes` directly, controlled by an extension settings slider.
   - *Pros:* User can tweak endgame nodes from browser UI.
   - *Cons:* Leaks engine-specific UCI command logic into client; requires modifying extension HTML/JS.
3. **Global Static Node Search across All Phases:**
   - Run Maia at a fixed node count (e.g. 30–50 nodes) throughout the whole game.
   - *Pros:* Simple.
   - *Cons:* Dilutes Maia's authentic human error rate and adds delay to opening/middlegame moves.

## Implementation Details
- **Endgame Detection (`is_endgame_fen`):**
  - Parse FEN board placement string.
  - Calculate non-pawn material points per side (Queen=9, Rook=5, Bishop=3, Knight=3).
  - Endgame condition: `(w_mat <= 13 and b_mat <= 13) or total_pieces <= 10`.
- **Command Translation in `handle_engine`:**
  - Add optional `is_maia: bool = False` flag to `handle_engine`.
  - For Maia connections, record the active position from `position fen <FEN>`.
  - When receiving `go depth ...`, if the position is an endgame, forward `go nodes 100` to the engine process; otherwise forward the original command.
- **Verification:**
  - Automated test suite verifying FEN classification against standard opening, middlegame, and endgame positions, as well as UCI command translation.
