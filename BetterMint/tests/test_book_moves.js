const assert = require("assert");
const path = require("path");
const {
  UciEngineClient,
  GameController,
  EXTENSION_OPTION_KEY,
  setExtensionOptionsForTesting
} = require(path.join(__dirname, "../js/Mint.js"));

class MockWebSocket {
  constructor(engineUrl) {
    this.url = engineUrl;
    this.readyState = MockWebSocket.OPEN;
    this.listeners = {};
    this.sentMessages = [];
  }
  addEventListener(eventName, listener) {
    if (!this.listeners[eventName]) this.listeners[eventName] = [];
    this.listeners[eventName].push(listener);
  }
  send(messageText) {
    this.sentMessages.push(messageText);
  }
  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSED = 3;
global.WebSocket = MockWebSocket;

assert.strictEqual(
  GameController.HIGHLIGHT_COLORS.Book,
  "#a88865",
  "Upstream Book highlight color #a88865 must be defined"
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
const addedMarkings = [];
const hintBatches = [];
const gameController = Object.create(GameController.prototype);
gameController.lastAnalysisMarkings = [];
gameController.activeHintMarkings = [];
gameController.lastHintSignature = "";
gameController.boardOptions = {};
gameController.renderMoveHints = (moves) => {
  hintBatches.push(moves);
};
gameController.chessComGame = {
  getPlayingAs: () => 1,
  getTurn: () => 2,
  getLastMove: () => lastPlayedMove,
  markings: {
    addOne: (marking) => addedMarkings.push(marking),
    removeOne: () => {}
  }
};

const engineClient = new UciEngineClient({
  extensionOptions: {
    [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/ws",
    [EXTENSION_OPTION_KEY.Depth]: 10
  },
  gameController
});
engineClient.isEngineLoaded = true;
engineClient.isEngineReady = true;

const originalWarn = console.warn;
const warnMessages = [];
console.warn = (msg) => warnMessages.push(String(msg));

try {
  // Position 1: 1. e4 -> current position still hits book with replies e7e5, c7c5
  lastPlayedMove = { from: "e2", to: "e4" };
  addedMarkings.length = 0;
  engineClient.setPositionAndSearch("fen_after_e4", true, "position startpos moves e2e4");
  engineClient.processEngineMessage("readyok");
  engineClient.processEngineMessage("info string book e7e5 c7c5");
  engineClient.processEngineMessage("bestmove e7e5");

  assert.strictEqual(hintBatches[hintBatches.length - 1][0].uciMove, "e7e5");
  assert.strictEqual(warnMessages.length, 0, "Book bestmove without PV info must not emit warning");
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

  // Position 2: Black plays 1... e5 (in previousPositionBookMoves), resulting position leaves book (miss)
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

  // Position 3: Out-of-book sideline (e7e5 -> g1f3 was expected bestmove at +0.35; White plays h2h3 dropping eval)
  // Note previousPositionBookMoves was empty after Position 2, and Position 3 is a book miss.
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

  // Stale book message while stop is in flight must be ignored
  engineClient.setPositionAndSearch("fen_mid", false, "position startpos moves d2d4");
  engineClient.hasRequestedStop = true;
  engineClient.processEngineMessage("info string book d7d5");
  assert.strictEqual(engineClient.hasCurrentPositionBookHit, false);

  // isNewGame must reset previousPositionBookMoves
  engineClient.hasRequestedStop = false;
  engineClient.processEngineMessage("info string book d7d5");
  assert.strictEqual(engineClient.currentPositionBookMoves.has("d7d5"), true);
  engineClient.setPositionAndSearch("fen_new", true, "position startpos");
  engineClient.processEngineMessage("readyok");
  assert.strictEqual(engineClient.previousPositionBookMoves.size, 0);
  assert.strictEqual(engineClient.hasCurrentPositionBookHit, false);
} finally {
  console.warn = originalWarn;
}

console.log("Book move tests passed.");
