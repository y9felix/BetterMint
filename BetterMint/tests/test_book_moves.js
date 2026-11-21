const assert = require("assert");
const path = require("path");
const {
  EXTENSION_ROOT_DIR,
  createAutoOpenWebSocketClass,
  createMockChessComGame,
  captureConsole
} = require("./helpers");

global.WebSocket = createAutoOpenWebSocketClass();

const {
  UciEngineClient,
  GameController,
  EXTENSION_OPTION_KEY,
  setExtensionOptionsForTesting
} = require(path.join(EXTENSION_ROOT_DIR, "js/Mint.js"));

assert.strictEqual(
  GameController.HIGHLIGHT_COLORS.Book,
  "#a88865",
  "Book highlight color #a88865 must be defined"
);

setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/ws",
  [EXTENSION_OPTION_KEY.Depth]: 10,
  [EXTENSION_OPTION_KEY.ShowHints]: true,
  [EXTENSION_OPTION_KEY.EvaluationBar]: false,
  [EXTENSION_OPTION_KEY.MoveAnalysis]: true,
  [EXTENSION_OPTION_KEY.LegitAutoMove]: false
});

let lastPlayedMove = null;
const hintBatches = [];
const { chessComGame, addedMarkings } = createMockChessComGame({
  getTurn: () => 2,
  getLastMove: () => lastPlayedMove
});

const gameController = Object.create(GameController.prototype);
gameController.lastAnalysisMarkings = [];
gameController.activeHintMarkings = [];
gameController.lastHintSignature = "";
gameController.boardOptions = {};
gameController.renderMoveHints = (moves) => {
  hintBatches.push(moves);
};
gameController.chessComGame = chessComGame;

const engineClient = new UciEngineClient({
  extensionOptions: {
    [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/ws",
    [EXTENSION_OPTION_KEY.Depth]: 10
  },
  gameController
});
engineClient.isEngineLoaded = true;
engineClient.isEngineReady = true;

const capturedWarnings = captureConsole(["warn"], () => {
  // 1. Position still hits book with replies e7e5, c7c5
  lastPlayedMove = { from: "e2", to: "e4" };
  addedMarkings.length = 0;
  engineClient.setPositionAndSearch("fen_after_e4", true, "position startpos moves e2e4");
  engineClient.processEngineMessage("readyok");
  engineClient.processEngineMessage("info string book e7e5 c7c5");
  engineClient.processEngineMessage("bestmove e7e5");

  assert.strictEqual(hintBatches[hintBatches.length - 1][0].uciMove, "e7e5");
  assert.deepStrictEqual(addedMarkings, [
    {
      data: { opacity: 0.5, color: "#a88865", square: "e4" },
      node: true,
      persistent: true,
      type: "highlight"
    },
    {
      data: { square: "e4", type: "Book" },
      node: true,
      persistent: true,
      type: "effect"
    }
  ]);

  // 2. Final leaf move matching previousPositionBookMoves still marks Book on book exit
  lastPlayedMove = { from: "e7", to: "e5" };
  addedMarkings.length = 0;
  engineClient.setPositionAndSearch("fen_after_e4_e5", false, "position startpos moves e2e4 e7e5");
  engineClient.processEngineMessage("info depth 10 score cp 35 pv g1f3");
  engineClient.processEngineMessage("bestmove g1f3");
  assert.strictEqual(
    addedMarkings.find((m) => m.type === "effect")?.data.type,
    "Book",
    "Final leaf move matching previousPositionBookMoves must still be marked Book on book exit"
  );

  // 3. Out-of-book sideline falls back to engine centipawn evaluation
  lastPlayedMove = { from: "h2", to: "h3" };
  addedMarkings.length = 0;
  engineClient.setPositionAndSearch("fen_after_h3", false, "position startpos moves e2e4 e7e5 h2h3");
  engineClient.processEngineMessage("info depth 10 score cp 250 pv d7d5");
  engineClient.processEngineMessage("bestmove d7d5");
  assert.strictEqual(
    addedMarkings.find((m) => m.type === "effect")?.data.type,
    "Blunder",
    "Non-book move after leaving book must fall back to engine centipawn evaluation"
  );

  // 4. Stale book message while stop is in flight is ignored
  engineClient.setPositionAndSearch("fen_mid", false, "position startpos moves d2d4");
  engineClient.hasRequestedStop = true;
  engineClient.processEngineMessage("info string book d7d5");
  assert.strictEqual(engineClient.hasCurrentPositionBookHit, false);

  // 5. isNewGame resets previousPositionBookMoves
  engineClient.hasRequestedStop = false;
  engineClient.processEngineMessage("info string book d7d5");
  assert.strictEqual(engineClient.currentPositionBookMoves.has("d7d5"), true);
  engineClient.setPositionAndSearch("fen_new", true, "position startpos");
  engineClient.processEngineMessage("readyok");
  assert.strictEqual(engineClient.previousPositionBookMoves.size, 0);
  assert.strictEqual(engineClient.hasCurrentPositionBookHit, false);
});

assert.strictEqual(
  capturedWarnings.warn.length,
  0,
  "Book bestmove without PV info must not emit console.warn"
);

console.log("Book move tests passed.");
