const assert = require("assert");
const path = require("path");
const {
  EXTENSION_ROOT_DIR,
  createAutoOpenWebSocketClass,
  createMockChessComGame,
  createFakeTimers,
  withMockedGlobals,
  captureConsole
} = require("./helpers");

global.WebSocket = createAutoOpenWebSocketClass();

const {
  UciEngineClient,
  GameController,
  CandidateMove,
  EXTENSION_OPTION_KEY,
  resolveLegalMove,
  setExtensionOptionsForTesting
} = require(path.join(EXTENSION_ROOT_DIR, "js/Mint.js"));

// 1. Legal move resolution (castling, promotions, and illegal/Chess960 rejection)
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

// 2. Win-probability move quality classification
function classifyMoveQuality(preMoveCandidate, postMoveCandidate, playedMove) {
  const { chessComGame, addedMarkings } = createMockChessComGame({
    getLastMove: () => playedMove
  });
  const gameController = Object.create(GameController.prototype);
  gameController.lastAnalysisMarkings = [];
  gameController.chessComGame = chessComGame;

  const analysisClient = Object.create(UciEngineClient.prototype);
  analysisClient.previousPositionCandidateMoves = [preMoveCandidate];
  analysisClient.candidateMoves = [postMoveCandidate];
  analysisClient.extension = { gameController };
  analysisClient.analyzeLastMove();

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

// 3. Hint rendering, signature dedupe, analysis-marking preservation, and terminal positions
setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/ws",
  [EXTENSION_OPTION_KEY.Depth]: 10,
  [EXTENSION_OPTION_KEY.ShowHints]: true,
  [EXTENSION_OPTION_KEY.EvaluationBar]: false,
  [EXTENSION_OPTION_KEY.MoveAnalysis]: false,
  [EXTENSION_OPTION_KEY.LegitAutoMove]: false
});

let addManyCallCount = 0;
let lastAddedMarkings = [];
const hintHarness = createMockChessComGame({
  getLegalMoves: () => [{ from: "e1", to: "g1", san: "O-O", flags: "k" }],
  markings: {
    removeOne: (markingKey) => hintHarness.removedMarkingKeys.push(markingKey),
    addMany: (markings) => {
      addManyCallCount++;
      lastAddedMarkings = markings;
    }
  }
});

const hintController = Object.create(GameController.prototype);
hintController.activeHintMarkings = [];
hintController.lastHintSignature = "";
hintController.lastAnalysisMarkings = ["effect|g1"];
hintController.boardOptions = {};
hintController.chessComGame = hintHarness.chessComGame;

hintController.renderMoveHints([new CandidateMove("e1g1", 10, null, 2)]);
assert.strictEqual(addManyCallCount, 1);
assert.strictEqual(lastAddedMarkings[0].data.to, "g1", "Castling e1g1 arrow must target g1");
assert.strictEqual(
  lastAddedMarkings.some((marking) => marking.type === "effect" && marking.data.square === "g1"),
  false,
  "renderMoveHints must not collide with existing MoveAnalysis effect|g1 marking"
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
  hintHarness.removedMarkingKeys.includes("effect|g1"),
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

// 4. Auto Move safety guards and recovery after rejected/throwing board moves
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
const autoMoveClient = Object.create(UciEngineClient.prototype);
autoMoveClient.candidateMoves = [];
autoMoveClient.previousPositionCandidateMoves = [];
autoMoveClient.lastAutoMovedFen = null;
autoMoveClient.currentPositionFen = "fen_stale";
autoMoveClient.uciOptionOverrides = {};
autoMoveClient.extension = {
  gameController: {
    autoMoveTimeoutId: null,
    turnStartTimestampMs: 0,
    renderMoveHints: () => {},
    chessComGame: createMockChessComGame({
      getMode: () => activeGameMode,
      getFEN: () => activeBoardFen,
      getLegalMoves: () => [{ from: "e7", to: "e8", piece: "p" }],
      move: (movePayload) => {
        if (simulatedMoveBehavior === "throw") throw new Error("board locked");
        if (simulatedMoveBehavior === "reject") return false;
        executedAutoMoves.push(movePayload);
        return true;
      }
    }).chessComGame
  }
};

autoMoveClient.handleCandidateMoveUpdate(new CandidateMove("e7e8q", 10, 300, null), true);
assert.strictEqual(executedAutoMoves.length, 0, "Auto move must not execute in analysis mode");

activeGameMode = "gameOver";
autoMoveClient.handleCandidateMoveUpdate(new CandidateMove("e7e8q", 10, 300, null), true);
assert.strictEqual(executedAutoMoves.length, 0, "Auto move must not execute in gameOver mode");

activeGameMode = "playing";
autoMoveClient.handleCandidateMoveUpdate(new CandidateMove("e7e8q", 10, 300, null), true);
assert.strictEqual(executedAutoMoves.length, 0, "Auto move must not execute when engine FEN is stale");

autoMoveClient.currentPositionFen = "fen_active";
simulatedMoveBehavior = "reject";
autoMoveClient.handleCandidateMoveUpdate(new CandidateMove("e7e8q", 10, 300, null), true);
assert.strictEqual(
  autoMoveClient.lastAutoMovedFen,
  null,
  "Rejected chessComGame.move must not lock lastAutoMovedFen"
);

simulatedMoveBehavior = "throw";
const capturedMoveErrors = captureConsole(["error"], () => {
  autoMoveClient.handleCandidateMoveUpdate(new CandidateMove("e7e8q", 10, 300, null), true);
});
assert.ok(
  capturedMoveErrors.error.some((message) => message.includes("board locked")),
  "Throwing chessComGame.move must log error diagnostics"
);
assert.strictEqual(
  autoMoveClient.lastAutoMovedFen,
  null,
  "Throwing chessComGame.move must not lock lastAutoMovedFen"
);

simulatedMoveBehavior = "ok";
autoMoveClient.handleCandidateMoveUpdate(new CandidateMove("e7e8q", 10, 300, null), true);
assert.strictEqual(
  executedAutoMoves.length,
  1,
  "Auto move must recover and execute once board accepts moves"
);
assert.strictEqual(executedAutoMoves[0].promotion, "q");
assert.strictEqual(executedAutoMoves[0].userGenerated, true);
assert.strictEqual(autoMoveClient.lastAutoMovedFen, "fen_active");

// 5. Auto Queue button priority and active-game guard
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
withMockedGlobals(
  {
    window: { addEventListener: () => {} },
    PointerEvent: function () {},
    MouseEvent: function () {},
    document: {
      addEventListener: () => {},
      querySelectorAll: (selector) =>
        selector.includes("game-over-button-primary") ? availablePrimaryButtons : availableAllButtons
    }
  },
  () => {
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
  }
);

// 6. GameController teardown and gameOver cleanup
const teardownTimers = createFakeTimers();
withMockedGlobals(teardownTimers.globals, () => {
  let postDestroyEngineUpdateCount = 0;
  let postDestroyEvalBarRefreshCount = 0;
  const { chessComGame, eventHandlers } = createMockChessComGame();

  setExtensionOptionsForTesting({
    [EXTENSION_OPTION_KEY.EvaluationBar]: false,
    [EXTENSION_OPTION_KEY.AutoQueue]: false
  });
  const teardownController = new GameController(
    {
      engineClient: {
        updatePosition: () => {
          postDestroyEngineUpdateCount++;
        }
      }
    },
    { game: chessComGame }
  );
  teardownController.refreshEvaluationBar = () => {
    postDestroyEvalBarRefreshCount++;
  };

  assert.doesNotThrow(
    () => eventHandlers.UpdateOptions({}),
    "UpdateOptions without .data must not throw"
  );
  eventHandlers.ResetGame();
  eventHandlers.ModeChanged({ data: "playing" });
  assert.strictEqual(teardownTimers.timeouts.length, 2);

  teardownController.destroy();
  assert.ok(
    teardownTimers.timeouts.every((timer) => timer.isCleared),
    "destroy must clear scheduled reset timers"
  );
  teardownTimers.timeouts.forEach((timer) => timer.callback());
  eventHandlers.Move();
  assert.strictEqual(postDestroyEngineUpdateCount, 0, "Destroyed controller must not update engine");
  assert.strictEqual(postDestroyEvalBarRefreshCount, 0, "Destroyed controller must not refresh eval bar");
});

const gameOverTimers = createFakeTimers();
withMockedGlobals(gameOverTimers.globals, () => {
  let gameOverStopCalls = 0;
  const { chessComGame, eventHandlers } = createMockChessComGame({
    getMode: () => "gameOver"
  });

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
    { game: chessComGame }
  );
  gameOverController.triggerAutoQueue = () => false;
  eventHandlers.ModeChanged({ data: "gameOver" });
  assert.strictEqual(
    gameOverStopCalls,
    1,
    "Entering gameOver must stop any in-flight engine evaluation"
  );
  assert.strictEqual(gameOverController.gameOverRetryIntervalId, gameOverTimers.intervals[0].id);

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
  assert.ok(gameOverTimers.clearedIntervalIds.includes(gameOverTimers.intervals[0].id));
  gameOverController.destroy();
});

console.log("Gameplay tests passed.");
