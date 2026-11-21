const assert = require("assert");
const path = require("path");
const { UciEngineClient } = require(path.join(__dirname, "../js/Mint.js"));

function createStubEngineClient() {
  const engineClient = Object.create(UciEngineClient.prototype);
  engineClient.sentCommands = [];
  engineClient.sendUciCommand = function (uciCommand) {
    this.sentCommands.push(uciCommand);
  };
  engineClient.isEvaluating = false;
  engineClient.hasRequestedStop = false;
  engineClient.staleBestMovesToIgnore = 0;
  engineClient.stopCompletionCallbacks = [];
  engineClient.stopFallbackTimeoutId = null;
  engineClient.candidateMoves = [];
  engineClient.candidateUpdateCalls = [];
  engineClient.handleCandidateMoveUpdate = function (candidateMove, isBestMove) {
    this.candidateUpdateCalls.push({ candidateMove, isBestMove });
  };
  return engineClient;
}

const activeClient = createStubEngineClient();
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

const bestMoveWarnings = [];
const originalConsoleWarn = console.warn;
console.warn = (...warnArgs) => bestMoveWarnings.push(warnArgs.join(" "));
activeClient.isEvaluating = true;
activeClient.processEngineMessage("bestmove g1f3");
console.warn = originalConsoleWarn;

assert.strictEqual(
  activeClient.candidateUpdateCalls.length,
  1,
  "Normal bestmove must trigger handleCandidateMoveUpdate"
);
assert.strictEqual(activeClient.candidateUpdateCalls[0].candidateMove.uciMove, "g1f3");
assert.strictEqual(
  bestMoveWarnings.length,
  0,
  "Valid bestmove without prior info pv line must not emit console.warn"
);

const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
const scheduledTimers = [];
let nextTimerId = 1;
global.setTimeout = (callback, delayMs) => {
  const timerRecord = { id: nextTimerId++, callback, delayMs, isCleared: false };
  scheduledTimers.push(timerRecord);
  return timerRecord.id;
};
global.clearTimeout = (timerId) => {
  const timerRecord = scheduledTimers.find((timer) => timer.id === timerId);
  if (timerRecord) timerRecord.isCleared = true;
};

const timeoutClient = createStubEngineClient();
timeoutClient.isEvaluating = true;
let hasTimeoutCallbackFired = false;
timeoutClient.stopEvaluation(() => {
  hasTimeoutCallbackFired = true;
});

assert.strictEqual(scheduledTimers.length, 1);
assert.strictEqual(scheduledTimers[0].delayMs, 1000, "ENGINE_STOP_TIMEOUT_MS must be 1000ms");
assert.strictEqual(hasTimeoutCallbackFired, false);

scheduledTimers[0].callback();
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

global.setTimeout = originalSetTimeout;
global.clearTimeout = originalClearTimeout;

console.log("Stop evaluation tests passed.");
