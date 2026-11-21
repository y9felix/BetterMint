const assert = require("assert");
const path = require("path");
const {
  UciEngineClient,
  GameController,
  CandidateMove,
  EXTENSION_OPTION_KEY,
  resolveLegalMove,
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
  [EXTENSION_OPTION_KEY.ShowHints]: true,
  [EXTENSION_OPTION_KEY.EvaluationBar]: false,
  [EXTENSION_OPTION_KEY.MoveAnalysis]: false,
  [EXTENSION_OPTION_KEY.LegitAutoMove]: false
});

let renderedHintMoves = [];
const extensionStub = {
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
    chessComGame: {
      getPlayingAs: () => 1,
      getTurn: () => 2
    }
  }
};

const engineClient = new UciEngineClient(extensionStub);
engineClient.isEngineLoaded = true;
engineClient.isEngineReady = true;
engineClient.isEvaluating = true;

engineClient.updatePosition({ fen: "fen_1", positionCommand: "position fen fen_1" }, false);
engineClient.updatePosition({ fen: "fen_2", positionCommand: "position fen fen_2" }, true);
engineClient.updatePosition({ fen: "fen_3", positionCommand: "position fen fen_3" }, false);

assert.deepStrictEqual(
  engineClient.pendingPositionUpdate,
  { fen: "fen_3", positionCommand: "position fen fen_3", isNewGame: true },
  "updatePosition must coalesce intermediate FENs and preserve isNewGame=true"
);

engineClient.processEngineMessage("bestmove e2e4");
assert.strictEqual(
  engineClient.pendingPositionUpdate,
  null,
  "Coalesced position must flush once stop completes"
);
assert.ok(
  engineClient.websocket.sentMessages.includes("ucinewgame"),
  "Coalesced isNewGame must send ucinewgame"
);

engineClient.processEngineMessage("readyok");
assert.ok(
  engineClient.websocket.sentMessages.includes("position fen fen_3"),
  "Must send latest coalesced FEN"
);
assert.ok(
  engineClient.websocket.sentMessages.includes("go depth 10"),
  "Must start search for latest FEN"
);

engineClient.processEngineMessage("info depth 8 score cp 35 pv e2e4 e7e5");
engineClient.processEngineMessage("info depth 10 score cp 120 pv d2d4 d7d5");
engineClient.processEngineMessage("info depth 10 score mate 3 pv f1c4 e7e5 d1h5");
assert.strictEqual(engineClient.candidateMoves[0].uciMove, "f1c4", "Mate-in-3 must sort ahead of centipawn moves");
assert.strictEqual(engineClient.candidateMoves[1].uciMove, "d2d4", "Depth 10 cp 120 must sort ahead of depth 8");

engineClient.processEngineMessage("bestmove f1c4");
assert.strictEqual(renderedHintMoves.length, 2, "MultiPV=2 must slice top 2 moves for hints");

const standardLegalMoves = [
  { from: "e1", to: "g1", san: "O-O", flags: "k" },
  { from: "e1", to: "c1", san: "O-O-O", flags: "q" },
  { from: "e7", to: "e8", promotion: "q" },
  { from: "e7", to: "e8", promotion: "n" }
];
assert.strictEqual(
  resolveLegalMove(standardLegalMoves, new CandidateMove("e1g1", 10, 0, null))?.san,
  "O-O",
  "Standard kingside castling e1g1 must resolve directly"
);
assert.strictEqual(
  resolveLegalMove(standardLegalMoves, new CandidateMove("e1c1", 10, 0, null))?.san,
  "O-O-O",
  "Standard queenside castling e1c1 must resolve directly"
);
assert.strictEqual(
  resolveLegalMove(standardLegalMoves, new CandidateMove("e7e8n", 10, 0, null))?.promotion,
  "n",
  "Exact promotion must resolve to matching legal move"
);
assert.strictEqual(
  resolveLegalMove([{ from: "e7", to: "e8", promotion: "Q" }], new CandidateMove("e7e8q", 10, 0, null))?.promotion,
  "Q",
  "Promotion comparison must match case-insensitively"
);
assert.strictEqual(
  resolveLegalMove(standardLegalMoves, new CandidateMove("e1h1", 10, 0, null)),
  null,
  "Chess960 king-takes-rook e1h1 must return null without Chess960 fallback"
);
assert.strictEqual(
  resolveLegalMove([{ from: "a4", to: "b4" }], new CandidateMove("a4d4", 10, 0, null)),
  null,
  "Illegal same-rank rook move must return null"
);

function classifyMoveQuality(preMoveCandidate, postMoveCandidate, playedMove) {
  const addedMarkings = [];
  const gameController = Object.create(GameController.prototype);
  gameController.lastAnalysisMarkings = [];
  gameController.chessComGame = {
    getLastMove: () => playedMove,
    markings: {
      addOne: (marking) => addedMarkings.push(marking),
      removeOne: () => {}
    }
  };
  const analysisEngineClient = Object.create(UciEngineClient.prototype);
  analysisEngineClient.previousPositionCandidateMoves = [preMoveCandidate];
  analysisEngineClient.candidateMoves = [postMoveCandidate];
  analysisEngineClient.extension = { gameController };
  analysisEngineClient.analyzeLastMove();
  const effectMarking = addedMarkings.find((marking) => marking.type === "effect");
  return effectMarking ? effectMarking.data.type : null;
}

assert.strictEqual(
  classifyMoveQuality(
    new CandidateMove("e2e4", 10, 30, null),
    new CandidateMove("e7e5", 10, -200, null),
    { from: "e2", to: "e4" }
  ),
  "BestMove",
  "Exact engine match must be BestMove"
);
assert.strictEqual(
  classifyMoveQuality(
    new CandidateMove("e7e8q", 10, 800, null),
    new CandidateMove("e8d8", 10, -800, null),
    { from: "e7", to: "e8", promotion: "Q" }
  ),
  "BestMove",
  "Uppercase promotion from Chess.com must match lowercase UCI promotion as BestMove"
);

assert.strictEqual(
  classifyMoveQuality(
    new CandidateMove("e2e4", 10, 1200, null),
    new CandidateMove("e7e5", 10, -900, null),
    { from: "d2", to: "d4" }
  ),
  "Good",
  "12.0 -> 9.0 drop is ~2.3% win-probability loss and must be Good, not Blunder"
);

assert.strictEqual(
  classifyMoveQuality(
    new CandidateMove("e2e4", 10, 1500, null),
    new CandidateMove("e7e5", 10, -1200, null),
    { from: "d2", to: "d4" }
  ),
  "Excellent",
  "15.0 -> 12.0 drop is <1% win-probability loss and must be Excellent"
);

assert.strictEqual(
  classifyMoveQuality(
    new CandidateMove("e2e4", 10, 30, null),
    new CandidateMove("e7e5", 10, 30, null),
    { from: "d2", to: "d4" }
  ),
  "Inaccuracy",
  "+0.3 -> -0.3 drop is ~5.5% win-probability loss and must be Inaccuracy"
);

assert.strictEqual(
  classifyMoveQuality(
    new CandidateMove("e2e4", 10, 30, null),
    new CandidateMove("e7e5", 10, 100, null),
    { from: "d2", to: "d4" }
  ),
  "Mistake",
  "+0.3 -> -1.0 drop is ~11.9% win-probability loss and must be Mistake"
);

assert.strictEqual(
  classifyMoveQuality(
    new CandidateMove("e2e4", 10, 30, null),
    new CandidateMove("e7e5", 10, 200, null),
    { from: "d2", to: "d4" }
  ),
  "Blunder",
  "+0.3 -> -2.0 drop is >20% win-probability loss and must be Blunder"
);

assert.strictEqual(
  classifyMoveQuality(
    new CandidateMove("e2e4", 10, null, 2),
    new CandidateMove("e7e5", 10, 0, null),
    { from: "d2", to: "d4" }
  ),
  "MissedWin",
  "Dropping forced mate to 0.00 equality must be MissedWin"
);

assert.strictEqual(
  classifyMoveQuality(
    new CandidateMove("e2e4", 10, null, 2),
    new CandidateMove("e7e5", 10, null, 1),
    { from: "d2", to: "d4" }
  ),
  "Blunder",
  "Dropping forced mate to getting mated must be Blunder"
);

assert.strictEqual(
  classifyMoveQuality(
    new CandidateMove("e2e4", 10, -100, null),
    new CandidateMove("e7e5", 10, -50, null),
    { from: "d2", to: "d4" }
  ),
  "BestMove",
  "Positive horizon gain must classify as BestMove, never GreatFind or Brilliant"
);

assert.strictEqual(GameController.HIGHLIGHT_COLORS.Brilliant, undefined);
assert.strictEqual(GameController.HIGHLIGHT_COLORS.GreatFind, undefined);

const liveHintBatches = [];
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
setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/ws",
  [EXTENSION_OPTION_KEY.Depth]: 12,
  [EXTENSION_OPTION_KEY.EvaluationBar]: true,
  [EXTENSION_OPTION_KEY.ShowHints]: true,
  [EXTENSION_OPTION_KEY.MoveAnalysis]: false,
  [EXTENSION_OPTION_KEY.LegitAutoMove]: false
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

const mockEvalController = Object.create(GameController.prototype);
mockEvalController.evalBarElement = {};
mockEvalController.evalBarWhiteFill = { style: {} };
mockEvalController.evalScoreAbbreviatedElement = { classList: { toggle: () => {} } };
mockEvalController.setEvaluationDisplay(0, false);
assert.strictEqual(
  mockEvalController.evalBarWhiteFill.style.transform,
  "translate3d(0px, 50%, 0px)"
);
mockEvalController.setEvaluationDisplay(500, false);
const percentAtPlusFive = parseFloat(
  mockEvalController.evalBarWhiteFill.style.transform.match(/([0-9.]+)%/)[1]
);
assert.ok(
  percentAtPlusFive > 10 && percentAtPlusFive < 20,
  `Expected sigmoid ~13.7% at +5.0 pawns, got ${percentAtPlusFive}%`
);
mockEvalController.setEvaluationDisplay(1200, false);
assert.strictEqual(
  mockEvalController.evalBarWhiteFill.style.transform,
  "translate3d(0px, 5%, 0px)"
);

const removedMarkingKeys = [];
let addManyCallCount = 0;
let lastAddedMarkings = [];
const hintController = Object.create(GameController.prototype);
hintController.activeHintMarkings = [];
hintController.lastHintSignature = "";
hintController.lastAnalysisMarkings = ["effect|g1"];
hintController.boardOptions = {};
hintController.chessComGame = {
  getTurn: () => 1,
  getLegalMoves: () => [{ from: "e1", to: "g1", san: "O-O", flags: "k" }],
  markings: {
    removeOne: (markingKey) => removedMarkingKeys.push(markingKey),
    addMany: (markings) => {
      addManyCallCount++;
      lastAddedMarkings = markings;
    }
  }
};
hintController.renderMoveHints([new CandidateMove("e1g1", 10, null, 2)]);
assert.strictEqual(addManyCallCount, 1);
assert.strictEqual(lastAddedMarkings[0].data.to, "g1", "Castling e1g1 arrow must target g1");
assert.strictEqual(
  lastAddedMarkings.some((marking) => marking.type === "effect" && marking.data.square === "g1"),
  false,
  "renderMoveHints must not overwrite or collide with existing MoveAnalysis effect|g1 marking"
);

hintController.renderMoveHints([new CandidateMove("e1g1", 10, null, 2)]);
assert.strictEqual(
  addManyCallCount,
  1,
  "Identical hint signature must skip redundant addMany redraws"
);

hintController.renderMoveHints([new CandidateMove("e2e4", 10, null, 1)]);
assert.strictEqual(addManyCallCount, 2, "Changed hint signature must redraw markings");
hintController.activeHintMarkings.push({ type: "effect", data: { square: "g1" } });
hintController.removeCurrentHintMarkings();
assert.strictEqual(
  removedMarkingKeys.includes("effect|g1"),
  false,
  "removeCurrentHintMarkings must preserve effect markings owned by lastAnalysisMarkings"
);

addManyCallCount = 0;
lastAddedMarkings = [];
hintController.renderMoveHints([
  new CandidateMove("a1a1", 10, null, 0),
  new CandidateMove("(none)", 10, 0, null)
]);
assert.strictEqual(
  addManyCallCount,
  0,
  "Self-pointing or malformed hint moves must not add arrow markings"
);

hintController.renderMoveHints([new CandidateMove("e2e4", 10, 50, null)]);
assert.strictEqual(addManyCallCount, 1);
hintController.chessComGame.getLegalMoves = () => [];
hintController.renderMoveHints([new CandidateMove("d1h5", 10, null, 1)]);
assert.strictEqual(
  addManyCallCount,
  1,
  "Terminal mate/stalemate position (0 legal moves) must not add hint arrows"
);
assert.strictEqual(
  hintController.activeHintMarkings.length,
  0,
  "Terminal position must clear existing hint arrows"
);

setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/ws",
  [EXTENSION_OPTION_KEY.Depth]: 10,
  [EXTENSION_OPTION_KEY.ShowHints]: false,
  [EXTENSION_OPTION_KEY.EvaluationBar]: false,
  [EXTENSION_OPTION_KEY.MoveAnalysis]: false,
  [EXTENSION_OPTION_KEY.LegitAutoMove]: true,
  [EXTENSION_OPTION_KEY.HumanLikeMoves]: false
});

let activeGameMode = "analysis";
let activeBoardFen = "fen_active";
let simulatedMoveBehavior = "ok";
const executedAutoMoves = [];
const autoMoveEngineClient = Object.create(UciEngineClient.prototype);
autoMoveEngineClient.candidateMoves = [];
autoMoveEngineClient.previousPositionCandidateMoves = [];
autoMoveEngineClient.lastAutoMovedFen = null;
autoMoveEngineClient.currentPositionFen = "fen_stale";
autoMoveEngineClient.uciOptionOverrides = {};
autoMoveEngineClient.extension = {
  gameController: {
    autoMoveTimeoutId: null,
    turnStartTimestampMs: 0,
    renderMoveHints: () => {},
    chessComGame: {
      getPlayingAs: () => 1,
      getTurn: () => 1,
      getMode: () => activeGameMode,
      getFEN: () => activeBoardFen,
      getLegalMoves: () => [{ from: "e7", to: "e8", piece: "p" }],
      move: (movePayload) => {
        if (simulatedMoveBehavior === "throw") throw new Error("board locked");
        if (simulatedMoveBehavior === "reject") return false;
        executedAutoMoves.push(movePayload);
        return true;
      }
    }
  }
};

autoMoveEngineClient.handleCandidateMoveUpdate(new CandidateMove("e7e8q", 10, 300, null), true);
assert.strictEqual(executedAutoMoves.length, 0, "Auto move must not execute in analysis mode");

activeGameMode = "gameOver";
autoMoveEngineClient.handleCandidateMoveUpdate(new CandidateMove("e7e8q", 10, 300, null), true);
assert.strictEqual(executedAutoMoves.length, 0, "Auto move must not execute in gameOver mode");

activeGameMode = "playing";
autoMoveEngineClient.handleCandidateMoveUpdate(new CandidateMove("e7e8q", 10, 300, null), true);
assert.strictEqual(
  executedAutoMoves.length,
  0,
  "Auto move must not execute when engine FEN is stale"
);

autoMoveEngineClient.currentPositionFen = "fen_active";
simulatedMoveBehavior = "reject";
autoMoveEngineClient.handleCandidateMoveUpdate(new CandidateMove("e7e8q", 10, 300, null), true);
assert.strictEqual(
  autoMoveEngineClient.lastAutoMovedFen,
  null,
  "Rejected chessComGame.move must not lock lastAutoMovedFen"
);

simulatedMoveBehavior = "throw";
autoMoveEngineClient.handleCandidateMoveUpdate(new CandidateMove("e7e8q", 10, 300, null), true);
assert.strictEqual(
  autoMoveEngineClient.lastAutoMovedFen,
  null,
  "Throwing chessComGame.move must not lock lastAutoMovedFen"
);

simulatedMoveBehavior = "ok";
autoMoveEngineClient.handleCandidateMoveUpdate(new CandidateMove("e7e8q", 10, 300, null), true);
assert.strictEqual(
  executedAutoMoves.length,
  1,
  "Auto move must recover and execute once board accepts moves"
);
assert.strictEqual(executedAutoMoves[0].promotion, "q");
assert.strictEqual(executedAutoMoves[0].userGenerated, true);
assert.strictEqual(autoMoveEngineClient.lastAutoMovedFen, "fen_active");

let clickedButtonLabels = [];
const createMockQueueButton = (labelText) => ({
  textContent: labelText,
  disabled: false,
  offsetWidth: 100,
  offsetHeight: 36,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 36 }),
  dispatchEvent: () => {},
  click: () => clickedButtonLabels.push(labelText)
});

let availablePrimaryButtons = [];
let availableAllButtons = [];
global.window = { addEventListener: () => {} };
global.PointerEvent = function () {};
global.MouseEvent = function () {};
global.document = {
  addEventListener: () => {},
  querySelectorAll: (selector) =>
    selector.includes("game-over-button-primary") ? availablePrimaryButtons : availableAllButtons
};

const autoQueueController = Object.create(GameController.prototype);
autoQueueController.lastAutoQueueClickMs = 0;

const newGameButton = createMockQueueButton("New 10 min");
const rematchButton = createMockQueueButton("Rematch");
availablePrimaryButtons = [newGameButton];
availableAllButtons = [newGameButton, rematchButton];

setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.AutoQueue]: true,
  [EXTENSION_OPTION_KEY.RematchFirst]: false
});
assert.strictEqual(autoQueueController.triggerAutoQueue(), true);
assert.deepStrictEqual(
  clickedButtonLabels,
  ["New 10 min"],
  "Default Auto Queue clicks primary New Game button first"
);

clickedButtonLabels = [];
autoQueueController.lastAutoQueueClickMs = 0;
setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.AutoQueue]: true,
  [EXTENSION_OPTION_KEY.RematchFirst]: true
});
assert.strictEqual(autoQueueController.triggerAutoQueue(), true);
assert.deepStrictEqual(
  clickedButtonLabels,
  ["Rematch"],
  "Rematch first must click secondary Rematch button before New Game"
);

clickedButtonLabels = [];
autoQueueController.lastAutoQueueClickMs = 0;
availableAllButtons = [newGameButton];
assert.strictEqual(autoQueueController.triggerAutoQueue(), true);
assert.deepStrictEqual(
  clickedButtonLabels,
  ["New 10 min"],
  "Rematch first must fall back to New Game when Rematch is absent"
);

clickedButtonLabels = [];
autoQueueController.lastAutoQueueClickMs = 0;
autoQueueController.chessComGame = { getMode: () => "playing" };
assert.strictEqual(
  autoQueueController.triggerAutoQueue(),
  false,
  "Auto Queue must skip DOM scans while actively playing"
);
autoQueueController.chessComGame = { getMode: () => "gameOver" };
assert.strictEqual(
  autoQueueController.triggerAutoQueue(),
  true,
  "Auto Queue must trigger once game enters gameOver"
);

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
goCommandClient.isEngineLoaded = true;
goCommandClient.isEngineReady = true;

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

let boardRectMeasurementCount = 0;
const animationFrameQueue = [];
const cancelledAnimationFrames = [];
const windowListeners = {};
const previousWindow = global.window;
const previousDocument = global.document;
const previousRaf = global.requestAnimationFrame;
const previousCancelRaf = global.cancelAnimationFrame;

let nextRafId = 1;
global.requestAnimationFrame = (callback) => {
  const frameId = nextRafId++;
  animationFrameQueue.push({ frameId, callback });
  return frameId;
};
global.cancelAnimationFrame = (frameId) => cancelledAnimationFrames.push(frameId);
global.window = {
  innerHeight: 1000,
  addEventListener: (eventName, listener) => {
    windowListeners[eventName] = listener;
  },
  removeEventListener: (eventName, listener) => {
    if (windowListeners[eventName] === listener) delete windowListeners[eventName];
  }
};
const createEvalChildElement = () => ({
  classList: { add: () => {}, toggle: () => {} },
  style: {},
  textContent: ""
});
const mockEvalBarElement = {
  className: "",
  innerHTML: "",
  style: {},
  classList: { add: () => {}, toggle: () => {} },
  querySelector: () => createEvalChildElement(),
  remove: () => {}
};
global.document = {
  body: { appendChild: () => {} },
  createElement: () => mockEvalBarElement
};

setExtensionOptionsForTesting({ [EXTENSION_OPTION_KEY.EvaluationBar]: true });
const rafController = Object.create(GameController.prototype);
rafController.evalBarElement = null;
rafController.boardOptions = {};
rafController.chessboardElement = {
  isConnected: true,
  getBoundingClientRect: () => {
    boardRectMeasurementCount++;
    return { left: 100, right: 500, top: 50, bottom: 450, width: 400, height: 400 };
  }
};
rafController.createAnalysisTools();
assert.strictEqual(
  boardRectMeasurementCount,
  1,
  "Initial createAnalysisTools must measure board once synchronously"
);

windowListeners.scroll();
windowListeners.scroll();
windowListeners.resize();
assert.strictEqual(
  animationFrameQueue.length,
  1,
  "Burst scroll/resize events must coalesce into 1 pending rAF"
);
assert.strictEqual(
  boardRectMeasurementCount,
  1,
  "Coalesced burst must not force layout before animation frame"
);

animationFrameQueue.shift().callback();
assert.strictEqual(boardRectMeasurementCount, 2, "Flushing rAF must run syncEvalBarPosition once");

windowListeners.scroll();
assert.strictEqual(animationFrameQueue.length, 1);
rafController.removeEvaluationBar();
assert.deepStrictEqual(
  cancelledAnimationFrames,
  [2],
  "removeEvaluationBar must cancel pending animation frame"
);
assert.strictEqual(windowListeners.scroll, undefined);
assert.strictEqual(windowListeners.resize, undefined);

global.window = previousWindow;
global.document = previousDocument;
global.requestAnimationFrame = previousRaf;
global.cancelAnimationFrame = previousCancelRaf;

const boardHandlers = {};
let postDestroyEngineUpdateCount = 0;
let postDestroyEvalBarRefreshCount = 0;
const fakeTimerQueue = [];
const prevSetTimeout = global.setTimeout;
const prevClearTimeout = global.clearTimeout;
let nextDestroyTimerId = 100;
global.setTimeout = (fn, delay) => {
  const timer = { id: nextDestroyTimerId++, fn, delay, cleared: false };
  fakeTimerQueue.push(timer);
  return timer.id;
};
global.clearTimeout = (id) => {
  const timer = fakeTimerQueue.find((entry) => entry.id === id);
  if (timer) timer.cleared = true;
};

setExtensionOptionsForTesting({ [EXTENSION_OPTION_KEY.EvaluationBar]: false, [EXTENSION_OPTION_KEY.AutoQueue]: false });
const teardownController = new GameController(
  {
    engineClient: {
      updatePosition: () => {
        postDestroyEngineUpdateCount++;
      }
    }
  },
  {
    game: {
      getOptions: () => ({ flipped: false }),
      getPlayingAs: () => 1,
      getTurn: () => 1,
      getFEN: () => "startpos",
      getLastMove: () => null,
      markings: { removeOne: () => {}, addOne: () => {}, addMany: () => {} },
      on: (eventName, handler) => {
        boardHandlers[eventName] = handler;
      }
    }
  }
);
teardownController.refreshEvaluationBar = () => {
  postDestroyEvalBarRefreshCount++;
};

assert.doesNotThrow(() => boardHandlers.UpdateOptions({}), "UpdateOptions without .data must not throw");
boardHandlers.ResetGame();
boardHandlers.ModeChanged({ data: "playing" });
assert.strictEqual(fakeTimerQueue.length, 2);

teardownController.destroy();
assert.ok(fakeTimerQueue.every((timer) => timer.cleared), "destroy must clear scheduled reset timers");
fakeTimerQueue.forEach((timer) => timer.fn());
boardHandlers.Move();
assert.strictEqual(postDestroyEngineUpdateCount, 0, "Destroyed controller must not update engine position");
assert.strictEqual(postDestroyEvalBarRefreshCount, 0, "Destroyed controller must not refresh eval bar");

global.setTimeout = prevSetTimeout;
global.clearTimeout = prevClearTimeout;

let gameOverStopCalls = 0;
const gameOverHandlers = {};
const clearedIntervalIds = [];
const prevSetInterval = global.setInterval;
const prevClearInterval = global.clearInterval;
global.setInterval = () => 777;
global.clearInterval = (intervalId) => clearedIntervalIds.push(intervalId);

setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.EvaluationBar]: false,
  [EXTENSION_OPTION_KEY.AutoQueue]: true
});
const gameOverController = new GameController(
  {
    engineClient: {
      updatePosition: () => {},
      stopEvaluation: () => {
        gameOverStopCalls++;
      }
    }
  },
  {
    game: {
      getOptions: () => ({ flipped: false }),
      getPlayingAs: () => 1,
      getTurn: () => 1,
      getMode: () => "gameOver",
      getFEN: () => "startpos",
      getLastMove: () => null,
      markings: { removeOne: () => {}, addOne: () => {}, addMany: () => {} },
      on: (eventName, handler) => {
        gameOverHandlers[eventName] = handler;
      }
    }
  }
);
gameOverController.triggerAutoQueue = () => false;
gameOverHandlers.ModeChanged({ data: "gameOver" });
assert.strictEqual(
  gameOverStopCalls,
  1,
  "Entering gameOver must stop any in-flight engine evaluation"
);
assert.strictEqual(gameOverController.gameOverRetryIntervalId, 777);

setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.EvaluationBar]: false,
  [EXTENSION_OPTION_KEY.AutoQueue]: false
});
gameOverController.setupAutoQueueObserver();
assert.strictEqual(
  gameOverController.gameOverRetryIntervalId,
  null,
  "Disabling AutoQueue must clear any pending game-over retry interval"
);
assert.ok(clearedIntervalIds.includes(777));
gameOverController.destroy();

global.setInterval = prevSetInterval;
global.clearInterval = prevClearInterval;

console.log("Engine pipeline tests passed.");
