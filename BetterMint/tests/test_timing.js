const assert = require("assert");
const path = require("path");
const {
  UciEngineClient,
  EXTENSION_OPTION_KEY,
  setExtensionOptionsForTesting
} = require(path.join(__dirname, "../js/Mint.js"));

const baseTimingOptions = {
  [EXTENSION_OPTION_KEY.HumanLikeMoves]: true,
  [EXTENSION_OPTION_KEY.MovePace]: 1.5,
  [EXTENSION_OPTION_KEY.PhysicalFloor]: 200,
  [EXTENSION_OPTION_KEY.TimingSpread]: 0.80,
  [EXTENSION_OPTION_KEY.ReflexMultiplier]: 0.35,
  [EXTENSION_OPTION_KEY.OpeningMovesThreshold]: 8,
  [EXTENSION_OPTION_KEY.OpeningMultiplier]: 0.35,
  [EXTENSION_OPTION_KEY.ClockThreshold]: 0
};

function createEngineWithGameContext({
  isForced = false,
  isRecapture = false,
  moveNumber = 15
} = {}) {
  const legalMoves = isForced
    ? [{ from: "e2", to: "e4" }]
    : [
        { from: "e2", to: "e4" },
        { from: "d2", to: "d4" }
      ];
  const lastMove = isRecapture ? { from: "d5", to: "e4" } : { from: "e7", to: "e5" };
  const chessComGame = {
    getLegalMoves: () => legalMoves,
    getLastMove: () => lastMove,
    getFEN: () =>
      `rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 ${moveNumber}`
  };
  const engineClient = Object.create(UciEngineClient.prototype);
  engineClient.extension = { gameController: { chessComGame } };
  return engineClient;
}

setExtensionOptionsForTesting({
  ...baseTimingOptions,
  [EXTENSION_OPTION_KEY.HumanLikeMoves]: false
});
const instantEngine = createEngineWithGameContext();
assert.strictEqual(instantEngine.calculateAutoMoveDelayMs({ from: "e2", to: "e4" }), 0);

setExtensionOptionsForTesting(baseTimingOptions);
const normalEngine = createEngineWithGameContext({ moveNumber: 15 });

for (let sampleIndex = 0; sampleIndex < 500; sampleIndex++) {
  const delayMs = normalEngine.calculateAutoMoveDelayMs({ from: "e2", to: "e4" });
  assert.ok(
    delayMs >= baseTimingOptions[EXTENSION_OPTION_KEY.PhysicalFloor],
    `Delay ${delayMs} below floor ${baseTimingOptions[EXTENSION_OPTION_KEY.PhysicalFloor]}`
  );
}

const forcedEngine = createEngineWithGameContext({ isForced: true, moveNumber: 15 });
const forcedDelayMs = forcedEngine.calculateAutoMoveDelayMs({ from: "e2", to: "e4" });
assert.ok(forcedDelayMs >= baseTimingOptions[EXTENSION_OPTION_KEY.PhysicalFloor]);

const recaptureEngine = createEngineWithGameContext({ isRecapture: true, moveNumber: 15 });
const recaptureDelayMs = recaptureEngine.calculateAutoMoveDelayMs({ from: "d1", to: "e4" });
assert.ok(recaptureDelayMs >= baseTimingOptions[EXTENSION_OPTION_KEY.PhysicalFloor]);

const originalRandom = Math.random;
Math.random = () => 0.25;
try {
  const prevDocument = global.document;
  global.document = {
    querySelector: () => ({ textContent: "0:30" })
  };

  setExtensionOptionsForTesting({
    [EXTENSION_OPTION_KEY.HumanLikeMoves]: true,
    [EXTENSION_OPTION_KEY.MovePace]: 10.0,
    [EXTENSION_OPTION_KEY.PhysicalFloor]: 500,
    [EXTENSION_OPTION_KEY.TimingSpread]: 0.01,
    [EXTENSION_OPTION_KEY.ReflexMultiplier]: 0.25,
    [EXTENSION_OPTION_KEY.OpeningMovesThreshold]: 0,
    [EXTENSION_OPTION_KEY.OpeningMultiplier]: 0.40,
    [EXTENSION_OPTION_KEY.ClockThreshold]: 0
  });
  const baseMedianDelay = createEngineWithGameContext({ moveNumber: 3 }).calculateAutoMoveDelayMs({
    from: "e2",
    to: "e4"
  });
  const reflexMedianDelay = createEngineWithGameContext({
    isRecapture: true,
    moveNumber: 15
  }).calculateAutoMoveDelayMs({ from: "d1", to: "e4" });
  assert.ok(
    reflexMedianDelay < baseMedianDelay * 0.4,
    "Reflex multiplier < 1 must speed up recaptures/forced moves while OpeningMoves=0 stays off"
  );

  setExtensionOptionsForTesting({
    [EXTENSION_OPTION_KEY.HumanLikeMoves]: true,
    [EXTENSION_OPTION_KEY.MovePace]: 10.0,
    [EXTENSION_OPTION_KEY.PhysicalFloor]: 500,
    [EXTENSION_OPTION_KEY.TimingSpread]: 0.01,
    [EXTENSION_OPTION_KEY.ReflexMultiplier]: 1.0,
    [EXTENSION_OPTION_KEY.OpeningMovesThreshold]: 0,
    [EXTENSION_OPTION_KEY.OpeningMultiplier]: 1.0,
    [EXTENSION_OPTION_KEY.ClockThreshold]: 120
  });
  const lowClockDelay = createEngineWithGameContext({ moveNumber: 15 }).calculateAutoMoveDelayMs({
    from: "e2",
    to: "e4"
  });
  assert.ok(
    lowClockDelay < baseMedianDelay * 0.4 && lowClockDelay >= 500,
    "Clock threshold must scale delay linearly toward physical floor without hardcoded min multiplier"
  );

  global.document = prevDocument;
} finally {
  Math.random = originalRandom;
}

console.log("Timing tests passed.");
