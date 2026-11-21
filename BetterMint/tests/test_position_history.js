const assert = require("assert");
const path = require("path");
const {
  UciEngineClient,
  GameController,
  EXTENSION_OPTION_KEY,
  formatMoveToUci,
  buildUciPositionCommand,
  STANDARD_STARTPOS_FEN,
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

setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/ws",
  [EXTENSION_OPTION_KEY.Depth]: 10,
  [EXTENSION_OPTION_KEY.EvaluationBar]: false,
  [EXTENSION_OPTION_KEY.ShowHints]: false,
  [EXTENSION_OPTION_KEY.MoveAnalysis]: false,
  [EXTENSION_OPTION_KEY.AutoQueue]: false,
  [EXTENSION_OPTION_KEY.LegitAutoMove]: false
});

assert.strictEqual(formatMoveToUci({ from: "e2", to: "e4" }), "e2e4");
assert.strictEqual(formatMoveToUci({ from: "E7", to: "E8", promotion: "Q" }), "e7e8q");
assert.strictEqual(formatMoveToUci("g1f3"), "g1f3");
assert.strictEqual(formatMoveToUci("Nf3"), null, "SAN strings must not parse as UCI moves");
assert.strictEqual(formatMoveToUci(null), null);

assert.strictEqual(buildUciPositionCommand(STANDARD_STARTPOS_FEN, []), "position startpos");
assert.strictEqual(
  buildUciPositionCommand(STANDARD_STARTPOS_FEN, ["e2e4", "e7e5"]),
  "position startpos moves e2e4 e7e5"
);
const customAnchorFen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
assert.strictEqual(
  buildUciPositionCommand(customAnchorFen, ["f1b5"]),
  `position fen ${customAnchorFen} moves f1b5`
);

function createMockBoardHarness(initialFen, extraGameMethods = {}) {
  let activeFen = initialFen;
  let lastPlayedMove = null;
  let turnValue = activeFen.split(" ")[1] === "b" ? 2 : 1;
  const eventHandlers = {};

  const chessComGame = Object.assign(
    {
      getOptions: () => ({ flipped: false }),
      getPlayingAs: () => 1,
      getTurn: () => turnValue,
      getMode: () => "playing",
      getFEN: () => activeFen,
      getLastMove: () => lastPlayedMove,
      getLegalMoves: () => [],
      markings: { removeOne: () => {}, addOne: () => {}, addMany: () => {} },
      on: (eventName, handler) => {
        eventHandlers[eventName] = handler;
      }
    },
    extraGameMethods
  );

  const extension = {
    extensionOptions: {
      [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/ws",
      [EXTENSION_OPTION_KEY.Depth]: 10,
      [EXTENSION_OPTION_KEY.EvaluationBar]: false,
      [EXTENSION_OPTION_KEY.ShowHints]: false,
      [EXTENSION_OPTION_KEY.MoveAnalysis]: false,
      [EXTENSION_OPTION_KEY.AutoQueue]: false,
      [EXTENSION_OPTION_KEY.LegitAutoMove]: false
    },
    gameController: null,
    engineClient: null
  };

  extension.gameController = new GameController(extension, { game: chessComGame });
  const engineClient = new UciEngineClient(extension);
  engineClient.isEngineLoaded = true;
  engineClient.isEngineReady = true;
  extension.engineClient = engineClient;

  return {
    extension,
    engineClient,
    playMove(nextFen, moveObject) {
      activeFen = nextFen;
      lastPlayedMove = moveObject;
      turnValue = nextFen.split(" ")[1] === "b" ? 2 : 1;
      eventHandlers.Move();
    },
    setBoardFen(nextFen, moveObject = null) {
      activeFen = nextFen;
      lastPlayedMove = moveObject;
      turnValue = nextFen.split(" ")[1] === "b" ? 2 : 1;
    }
  };
}

// 1. Sequential moves from startpos build full UCI move history including repetition cycles
const standardHarness = createMockBoardHarness(STANDARD_STARTPOS_FEN);
standardHarness.extension.gameController.updateEnginePosition(true);
standardHarness.engineClient.processEngineMessage("readyok");
assert.ok(standardHarness.engineClient.websocket.sentMessages.includes("position startpos"));

const repetitionSequence = [
  { fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", move: { from: "e2", to: "e4" } },
  { fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", move: { from: "e7", to: "e5" } },
  { fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2", move: { from: "g1", to: "f3" } },
  { fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3", move: { from: "b8", to: "c6" } },
  { fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 3 3", move: { from: "f3", to: "g1" } },
  { fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 4 4", move: { from: "c6", to: "b8" } },
  { fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 5 4", move: { from: "g1", to: "f3" } }
];

for (const step of repetitionSequence) {
  standardHarness.engineClient.isEvaluating = false;
  standardHarness.playMove(step.fen, step.move);
}

const sentPositions = standardHarness.engineClient.websocket.sentMessages.filter((msg) =>
  msg.startsWith("position ")
);
assert.strictEqual(
  sentPositions[sentPositions.length - 1],
  "position startpos moves e2e4 e7e5 g1f3 b8c6 f3g1 c6b8 g1f3",
  "Sequential moves must accumulate into full startpos move history"
);

// 2. Idempotent re-query on same FEN (e.g. changing options / switching engines) must not duplicate last move
standardHarness.engineClient.isEvaluating = false;
standardHarness.extension.gameController.updateEnginePosition(false);
const afterRequeryPositions = standardHarness.engineClient.websocket.sentMessages.filter((msg) =>
  msg.startsWith("position ")
);
assert.strictEqual(
  afterRequeryPositions[afterRequeryPositions.length - 1],
  "position startpos moves e2e4 e7e5 g1f3 b8c6 f3g1 c6b8 g1f3",
  "Re-querying same FEN must not duplicate last move"
);

// 3. Backward ply jump (takeback without board history API) resets anchor safely
standardHarness.engineClient.isEvaluating = false;
const takebackFen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
standardHarness.playMove(takebackFen, { from: "b8", to: "c6" });
const afterTakebackPositions = standardHarness.engineClient.websocket.sentMessages.filter((msg) =>
  msg.startsWith("position ")
);
assert.strictEqual(
  afterTakebackPositions[afterTakebackPositions.length - 1],
  `position fen ${takebackFen}`,
  "Takeback mismatch must reset anchor cleanly to current FEN"
);

// 4. Resetting to a new game clears move history and starts fresh
standardHarness.engineClient.isEvaluating = false;
standardHarness.setBoardFen(STANDARD_STARTPOS_FEN, null);
standardHarness.extension.gameController.updateEnginePosition(true);
standardHarness.engineClient.processEngineMessage("readyok");
const afterResetPositions = standardHarness.engineClient.websocket.sentMessages.filter((msg) =>
  msg.startsWith("position ")
);
assert.strictEqual(
  afterResetPositions[afterResetPositions.length - 1],
  "position startpos",
  "New game reset must clear prior moves and emit position startpos"
);

// 5. Mid-game attach with board history API recovers full move list and supports takebacks
let mockBoardHistory = [
  { from: "d2", to: "d4" },
  { from: "d7", to: "d5" },
  { from: "c2", to: "c4" }
];
const midGameFen = "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2";
const apiHarness = createMockBoardHarness(midGameFen, {
  getHistory: () => mockBoardHistory,
  getStartingFEN: () => STANDARD_STARTPOS_FEN
});
apiHarness.extension.gameController.updateEnginePosition(false);
assert.ok(
  apiHarness.engineClient.websocket.sentMessages.includes(
    "position startpos moves d2d4 d7d5 c2c4"
  ),
  "Board history API must supply full move list on mid-game attach"
);

mockBoardHistory = [{ from: "d2", to: "d4" }];
apiHarness.engineClient.isEvaluating = false;
apiHarness.playMove(
  "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1",
  { from: "d2", to: "d4" }
);
const apiPositions = apiHarness.engineClient.websocket.sentMessages.filter((msg) =>
  msg.startsWith("position ")
);
assert.strictEqual(
  apiPositions[apiPositions.length - 1],
  "position startpos moves d2d4",
  "Board history API takeback must truncate move list accurately"
);

// 6. SAN-only getMoves() is rejected safely and falls back to incremental tracking
const sanFallbackHarness = createMockBoardHarness(STANDARD_STARTPOS_FEN, {
  getMoves: () => ["e4", "e5"]
});
sanFallbackHarness.playMove(
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  { from: "e2", to: "e4" }
);
assert.ok(
  sanFallbackHarness.engineClient.websocket.sentMessages.includes("position startpos moves e2e4"),
  "SAN getMoves() must be ignored in favor of incremental UCI move tracking"
);

// 7. Coalescing overlapping position updates preserves latest positionCommand
const coalesceClient = new UciEngineClient({
  gameController: {
    chessComGame: { getPlayingAs: () => 1, getTurn: () => 2 },
    renderMoveHints: () => {}
  }
});
coalesceClient.isEngineLoaded = true;
coalesceClient.isEngineReady = true;
coalesceClient.isEvaluating = true;

coalesceClient.updatePosition(
  {
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    positionCommand: "position startpos moves e2e4"
  },
  false
);
coalesceClient.updatePosition(
  {
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    positionCommand: "position startpos moves e2e4 e7e5"
  },
  false
);
coalesceClient.processEngineMessage("bestmove e2e4");
assert.ok(
  coalesceClient.websocket.sentMessages.includes("position startpos moves e2e4 e7e5"),
  "Coalesced structured update must send latest full positionCommand"
);
assert.strictEqual(
  coalesceClient.currentPositionFen,
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"
);

// 8. Custom non-standard starting FEN anchors at fen and tracks promotion moves
const puzzleStartFen = "8/4P3/8/8/8/8/4K3/4k3 w - - 0 40";
const puzzleHarness = createMockBoardHarness(puzzleStartFen);
puzzleHarness.playMove("4Q3/8/8/8/8/8/4K3/4k3 b - - 0 40", {
  from: "e7",
  to: "e8",
  promotion: "Q"
});
assert.ok(
  puzzleHarness.engineClient.websocket.sentMessages.includes(
    `position fen ${puzzleStartFen} moves e7e8q`
  ),
  "Custom anchor FEN must preserve moves including uppercase promotion normalization"
);

// 9. Early move recorded before engineClient is attached survives until readyok sync
let preClientFen = STANDARD_STARTPOS_FEN;
let preClientMove = null;
const preClientHandlers = {};
const preClientExtension = {
  extensionOptions: {
    [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/ws",
    [EXTENSION_OPTION_KEY.Depth]: 10,
    [EXTENSION_OPTION_KEY.EvaluationBar]: false,
    [EXTENSION_OPTION_KEY.ShowHints]: false,
    [EXTENSION_OPTION_KEY.MoveAnalysis]: false,
    [EXTENSION_OPTION_KEY.AutoQueue]: false,
    [EXTENSION_OPTION_KEY.LegitAutoMove]: false
  },
  gameController: null,
  engineClient: null
};
preClientExtension.gameController = new GameController(preClientExtension, {
  game: {
    getOptions: () => ({ flipped: false }),
    getPlayingAs: () => 1,
    getTurn: () => (preClientFen.split(" ")[1] === "b" ? 2 : 1),
    getMode: () => "playing",
    getFEN: () => preClientFen,
    getLastMove: () => preClientMove,
    markings: { removeOne: () => {}, addOne: () => {}, addMany: () => {} },
    on: (eventName, handler) => {
      preClientHandlers[eventName] = handler;
    }
  }
});
preClientFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
preClientMove = { from: "e2", to: "e4" };
preClientHandlers.Move();

const lateClient = new UciEngineClient(preClientExtension);
lateClient.isEngineLoaded = true;
lateClient.isEngineReady = true;
preClientExtension.engineClient = lateClient;
preClientExtension.gameController.updateEnginePosition(false);
assert.ok(
  lateClient.websocket.sentMessages.includes("position startpos moves e2e4"),
  "Move played before engineClient connects must still be included once synced"
);

console.log("Position history tests passed.");
