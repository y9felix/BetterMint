const assert = require("assert");

function calculateNaturalDelay(config, context) {
  if (!config.humanLikeMoves) return 0;

  let median = config.movePace * 1000;
  const minFloor = config.physicalFloor;

  if (config.fastForcedMoves && context.isForced) {
    median *= config.forcedMultiplier;
  } else if (config.fastRecaptures && context.isRecapture) {
    median *= config.recaptureMultiplier;
  } else if (config.fastOpening && context.moveNumber <= config.openingThreshold) {
    median *= config.openingMultiplier;
  }

  if (config.clockScaling && context.remainingSeconds !== null && context.remainingSeconds !== undefined && context.remainingSeconds < config.clockThreshold) {
    const factor = Math.max(config.clockMinMultiplier, context.remainingSeconds / config.clockThreshold);
    median *= factor;
  }

  const u1 = Math.max(1e-7, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const mu = Math.log(Math.max(50, median - minFloor));
  return Math.round(minFloor + Math.exp(mu + config.timingSpread * z));
}

const baseConfig = {
  humanLikeMoves: true,
  movePace: 1.5,
  physicalFloor: 200,
  timingSpread: 0.80,
  fastForcedMoves: true,
  forcedMultiplier: 0.35,
  fastRecaptures: true,
  recaptureMultiplier: 0.50,
  fastOpening: true,
  openingThreshold: 8,
  openingMultiplier: 0.35,
  clockScaling: true,
  clockThreshold: 60,
  clockMinMultiplier: 0.30
};

assert.strictEqual(calculateNaturalDelay({ ...baseConfig, humanLikeMoves: false }, {}), 0);

for (let i = 0; i < 500; i++) {
  const delay = calculateNaturalDelay(baseConfig, { isForced: false, isRecapture: false, moveNumber: 15, remainingSeconds: 120 });
  assert.ok(delay >= baseConfig.physicalFloor, `Delay ${delay} below floor ${baseConfig.physicalFloor}`);
}

const forcedDelay = calculateNaturalDelay(baseConfig, { isForced: true, isRecapture: false, moveNumber: 15, remainingSeconds: 120 });
assert.ok(forcedDelay >= baseConfig.physicalFloor);

const recaptureDelay = calculateNaturalDelay(baseConfig, { isForced: false, isRecapture: true, moveNumber: 15, remainingSeconds: 120 });
assert.ok(recaptureDelay >= baseConfig.physicalFloor);

console.log("Timing tests passed.");
