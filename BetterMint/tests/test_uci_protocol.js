const assert = require("assert");
const path = require("path");
const {
  EXTENSION_ROOT_DIR,
  createAutoOpenWebSocketClass,
  createFakeTimers,
  withMockedGlobals,
  captureConsole
} = require("./helpers");

global.WebSocket = createAutoOpenWebSocketClass();

const {
  UciEngineClient,
  EXTENSION_OPTION_KEY,
  setExtensionOptionsForTesting
} = require(path.join(EXTENSION_ROOT_DIR, "js/Mint.js"));

// 1. Position coalescing, ucinewgame preservation, candidate sorting, and MultiPV slicing
setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/ws",
  [EXTENSION_OPTION_KEY.Depth]: 10,
  [EXTENSION_OPTION_KEY.ShowHints]: true,
  [EXTENSION_OPTION_KEY.EvaluationBar]: false,
  [EXTENSION_OPTION_KEY.MoveAnalysis]: false,
  [EXTENSION_OPTION_KEY.LegitAutoMove]: false
});

let renderedHintMoves = [];
const coalescingClient = new UciEngineClient({
  extensionOptions: {
    [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/ws",
    [EXTENSION_OPTION_KEY.Depth]: 10,
    [EXTENSION_OPTION_KEY.ShowHints]: true,
    customEngineOptions: { MultiPV: 2 }
  },
  gameController: {
    renderMoveHints: (candidateMoves) => {
      renderedHintMoves = candidateMoves;
    },
    updateEnginePosition: () => {},
    chessComGame: { getPlayingAs: () => 1, getTurn: () => 2 }
  }
});
coalescingClient.isEngineLoaded = true;
coalescingClient.isEngineReady = true;
coalescingClient.isEvaluating = true;

coalescingClient.updatePosition({ fen: "fen_1", positionCommand: "position fen fen_1" }, false);
coalescingClient.updatePosition({ fen: "fen_2", positionCommand: "position fen fen_2" }, true);
coalescingClient.updatePosition({ fen: "fen_3", positionCommand: "position fen fen_3" }, false);

assert.deepStrictEqual(
  coalescingClient.pendingPositionUpdate,
  { fen: "fen_3", positionCommand: "position fen fen_3", isNewGame: true },
  "updatePosition must coalesce intermediate FENs and preserve isNewGame=true"
);

coalescingClient.processEngineMessage("bestmove e2e4");
assert.strictEqual(
  coalescingClient.pendingPositionUpdate,
  null,
  "Coalesced position must flush once stop completes"
);
assert.ok(
  coalescingClient.websocket.sentMessages.includes("ucinewgame"),
  "Coalesced isNewGame must send ucinewgame"
);

coalescingClient.processEngineMessage("readyok");
assert.ok(
  coalescingClient.websocket.sentMessages.includes("position fen fen_3"),
  "Must send latest coalesced FEN"
);
assert.ok(
  coalescingClient.websocket.sentMessages.includes("go depth 10"),
  "Must start search for latest FEN"
);

coalescingClient.processEngineMessage("info depth 8 score cp 35 pv e2e4 e7e5");
coalescingClient.processEngineMessage("info depth 10 score cp 120 pv d2d4 d7d5");
coalescingClient.processEngineMessage("info depth 10 score mate 3 pv f1c4 e7e5 d1h5");
assert.strictEqual(
  coalescingClient.candidateMoves[0].uciMove,
  "f1c4",
  "Mate-in-3 must sort ahead of centipawn moves"
);
assert.strictEqual(
  coalescingClient.candidateMoves[1].uciMove,
  "d2d4",
  "Depth 10 cp 120 must sort ahead of depth 8"
);

coalescingClient.processEngineMessage("bestmove f1c4");
assert.strictEqual(renderedHintMoves.length, 2, "MultiPV=2 must slice top 2 moves for hints");

// 2. Progressive info streaming, aspiration bound filtering, bestmove anchoring, and MultiPV guard
const liveHintBatches = [];
setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/ws",
  [EXTENSION_OPTION_KEY.Depth]: 12,
  [EXTENSION_OPTION_KEY.EvaluationBar]: true,
  [EXTENSION_OPTION_KEY.ShowHints]: true,
  [EXTENSION_OPTION_KEY.MoveAnalysis]: false,
  [EXTENSION_OPTION_KEY.LegitAutoMove]: false
});
const liveEvalClient = new UciEngineClient({
  extensionOptions: {
    [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/ws",
    [EXTENSION_OPTION_KEY.Depth]: 12,
    [EXTENSION_OPTION_KEY.EvaluationBar]: true,
    [EXTENSION_OPTION_KEY.ShowHints]: true,
    [EXTENSION_OPTION_KEY.MoveAnalysis]: false,
    [EXTENSION_OPTION_KEY.LegitAutoMove]: false
  },
  gameController: {
    renderMoveHints: (candidateMoves) => liveHintBatches.push(candidateMoves),
    updateEnginePosition: () => {},
    chessComGame: { getPlayingAs: () => 1, getTurn: () => 1 }
  }
});

liveEvalClient.processEngineMessage("info depth 4 score cp 50 pv e2e4");
liveEvalClient.processEngineMessage("info depth 6 score cp 999 upperbound pv a2a3");
assert.strictEqual(liveHintBatches.length, 1, "upperbound info lines must be ignored");

liveEvalClient.processEngineMessage("info depth 8 score cp 150 pv d2d4");
assert.strictEqual(
  liveHintBatches.length,
  2,
  "Hints and eval bar must update progressively on intermediate info lines"
);
assert.strictEqual(liveHintBatches[1][0].uciMove, "d2d4");

liveEvalClient.processEngineMessage("bestmove e2e4");
assert.strictEqual(liveHintBatches[2][0].uciMove, "e2e4", "Engine bestmove must anchor at rank #1");

liveEvalClient.uciOptionOverrides = { MultiPV: "true" };
liveEvalClient.processEngineMessage("info depth 10 score cp 180 pv c2c4");
assert.strictEqual(
  liveHintBatches[3].length,
  1,
  "Non-numeric MultiPV must fall back to 1 instead of NaN"
);

// 3. buildGoCommand search limit combinations and safe fallbacks
const goCommandClient = new UciEngineClient({
  extensionOptions: {},
  gameController: {
    renderMoveHints: () => {},
    updateEnginePosition: () => {},
    chessComGame: {
      getPlayingAs: () => 1,
      getLegalMoves: () => [
        { from: "e2", to: "e4" },
        { from: "d2", to: "d4" }
      ]
    }
  }
});

setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.Depth]: 16,
  [EXTENSION_OPTION_KEY.GoMovetime]: 300,
  [EXTENSION_OPTION_KEY.GoNodes]: 0
});
assert.strictEqual(
  goCommandClient.buildGoCommand(),
  "go depth 16 movetime 300",
  "buildGoCommand must combine depth and movetime bounds"
);

setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.Depth]: 0,
  [EXTENSION_OPTION_KEY.GoMovetime]: 0,
  [EXTENSION_OPTION_KEY.GoNodes]: 200000
});
assert.strictEqual(
  goCommandClient.buildGoCommand(),
  "go nodes 200000",
  "Zero depth must omit depth and emit active node limit"
);

setExtensionOptionsForTesting({});
assert.strictEqual(
  goCommandClient.buildGoCommand(),
  "go depth 3",
  "Omitted depth option must fall back to default search depth 3"
);

setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.Depth]: 0,
  [EXTENSION_OPTION_KEY.GoMovetime]: 0,
  [EXTENSION_OPTION_KEY.GoNodes]: 0
});
assert.strictEqual(
  goCommandClient.buildGoCommand(),
  "go depth 1",
  "All-zero bounds must safely fall back to go depth 1"
);

// 4. stopEvaluation serialization, timeout fallback, and stale bestmove discarding
function createStopStubClient() {
  const client = Object.create(UciEngineClient.prototype);
  client.sentCommands = [];
  client.sendUciCommand = function (uciCommand) {
    this.sentCommands.push(uciCommand);
  };
  client.isEvaluating = false;
  client.hasRequestedStop = false;
  client.staleBestMovesToIgnore = 0;
  client.stopCompletionCallbacks = [];
  client.stopFallbackTimeoutId = null;
  client.candidateMoves = [];
  client.candidateUpdateCalls = [];
  client.handleCandidateMoveUpdate = function (candidateMove, isBestMove) {
    this.candidateUpdateCalls.push({ candidateMove, isBestMove });
  };
  return client;
}

const activeClient = createStopStubClient();
activeClient.isEvaluating = true;

let hasStopCallbackFired = false;
activeClient.stopEvaluation(() => {
  hasStopCallbackFired = true;
});
assert.strictEqual(hasStopCallbackFired, false, "Callback must not run synchronously");
assert.strictEqual(activeClient.hasRequestedStop, true);
assert.deepStrictEqual(activeClient.sentCommands, ["stop"]);

activeClient.processEngineMessage("bestmove e7e5");
assert.strictEqual(hasStopCallbackFired, true, "Callback must run after bestmove arrives");
assert.strictEqual(
  activeClient.candidateUpdateCalls.length,
  0,
  "Aborted bestmove must not trigger handleCandidateMoveUpdate"
);
assert.strictEqual(activeClient.hasRequestedStop, false);

const capturedNormalWarnings = captureConsole(["warn"], () => {
  activeClient.isEvaluating = true;
  activeClient.processEngineMessage("bestmove g1f3");
});
assert.strictEqual(
  activeClient.candidateUpdateCalls.length,
  1,
  "Normal bestmove must trigger handleCandidateMoveUpdate"
);
assert.strictEqual(activeClient.candidateUpdateCalls[0].candidateMove.uciMove, "g1f3");
assert.strictEqual(
  capturedNormalWarnings.warn.length,
  0,
  "Valid bestmove without prior info pv line must not emit console.warn"
);

const fakeTimers = createFakeTimers();
withMockedGlobals(fakeTimers.globals, () => {
  const timeoutClient = createStopStubClient();
  timeoutClient.isEvaluating = true;
  let hasTimeoutCallbackFired = false;
  timeoutClient.stopEvaluation(() => {
    hasTimeoutCallbackFired = true;
  });

  assert.strictEqual(fakeTimers.timeouts.length, 1);
  assert.strictEqual(fakeTimers.timeouts[0].delayMs, 1000, "ENGINE_STOP_TIMEOUT_MS must be 1000ms");
  assert.strictEqual(hasTimeoutCallbackFired, false);

  fakeTimers.timeouts[0].callback();
  assert.strictEqual(
    hasTimeoutCallbackFired,
    true,
    "Fallback callback must run after 1000ms timeout"
  );
  assert.strictEqual(timeoutClient.isEvaluating, false);
  assert.strictEqual(timeoutClient.staleBestMovesToIgnore, 1);

  timeoutClient.processEngineMessage("bestmove e2e4");
  assert.strictEqual(
    timeoutClient.staleBestMovesToIgnore,
    0,
    "Late bestmove must be consumed as stale"
  );
  assert.strictEqual(
    timeoutClient.candidateUpdateCalls.length,
    0,
    "Late stale bestmove must not trigger handleCandidateMoveUpdate"
  );
});

// 5. Null bestmoves (a1a1 / 0000) clear evaluation cleanly without warnings or hints
let nullMoveHintCalls = 0;
const nullMoveClient = new UciEngineClient({
  gameController: {
    renderMoveHints: () => {
      nullMoveHintCalls++;
    },
    updateEnginePosition: () => {}
  }
});
const capturedNullMoveWarnings = captureConsole(["warn"], () => {
  nullMoveClient.isEvaluating = true;
  nullMoveClient.processEngineMessage("bestmove a1a1");
  assert.strictEqual(nullMoveClient.isEvaluating, false, "bestmove a1a1 must clear isEvaluating");
  nullMoveClient.isEvaluating = true;
  nullMoveClient.processEngineMessage("bestmove 0000");
  assert.strictEqual(nullMoveClient.isEvaluating, false, "bestmove 0000 must clear isEvaluating");
});
assert.strictEqual(
  capturedNullMoveWarnings.warn.length,
  0,
  "Null bestmoves (a1a1 / 0000) must not emit warnings"
);
assert.strictEqual(
  nullMoveHintCalls,
  0,
  "Null bestmoves (a1a1 / 0000) must not push fake moves to renderMoveHints"
);

console.log("UCI protocol tests passed.");
