const assert = require("assert");
const path = require("path");
const { StockfishEngine, enumOptions, setOptionsForTesting } = require(path.join(__dirname, "../js/Mint.js"));

const baseConfig = {
  [enumOptions.HumanLikeMoves]: true,
  [enumOptions.MovePace]: 1.5,
  [enumOptions.PhysicalFloor]: 200,
  [enumOptions.TimingSpread]: 0.80,
  [enumOptions.FastForcedMoves]: true,
  [enumOptions.ForcedMultiplier]: 0.35,
  [enumOptions.FastRecaptures]: true,
  [enumOptions.RecaptureMultiplier]: 0.50,
  [enumOptions.FastOpening]: true,
  [enumOptions.OpeningMovesThreshold]: 8,
  [enumOptions.OpeningMultiplier]: 0.35,
  [enumOptions.ClockScaling]: false
};

function createEngineWithContext({ isForced = false, isRecapture = false, moveNumber = 15 } = {}) {
  const legalMoves = isForced ? [{ from: "e2", to: "e4" }] : [{ from: "e2", to: "e4" }, { from: "d2", to: "d4" }];
  const lastMove = isRecapture ? { from: "d5", to: "e4" } : { from: "e7", to: "e5" };
  const controller = {
    getLegalMoves: () => legalMoves,
    getLastMove: () => lastMove,
    getFEN: () => `rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 ${moveNumber}`
  };
  const engine = Object.create(StockfishEngine.prototype);
  engine.BetterMintmaster = { game: { controller } };
  return engine;
}

setOptionsForTesting({ ...baseConfig, [enumOptions.HumanLikeMoves]: false });
const disabledEngine = createEngineWithContext();
assert.strictEqual(disabledEngine.calculateTargetDelay({ from: "e2", to: "e4" }), 0);

setOptionsForTesting(baseConfig);
const normalEngine = createEngineWithContext({ moveNumber: 15 });

for (let i = 0; i < 500; i++) {
  const delay = normalEngine.calculateTargetDelay({ from: "e2", to: "e4" });
  assert.ok(delay >= baseConfig[enumOptions.PhysicalFloor], `Delay ${delay} below floor ${baseConfig[enumOptions.PhysicalFloor]}`);
}

const forcedEngine = createEngineWithContext({ isForced: true, moveNumber: 15 });
const forcedDelay = forcedEngine.calculateTargetDelay({ from: "e2", to: "e4" });
assert.ok(forcedDelay >= baseConfig[enumOptions.PhysicalFloor]);

const recaptureEngine = createEngineWithContext({ isRecapture: true, moveNumber: 15 });
const recaptureDelay = recaptureEngine.calculateTargetDelay({ from: "d1", to: "e4" });
assert.ok(recaptureDelay >= baseConfig[enumOptions.PhysicalFloor]);

console.log("Timing tests passed.");
