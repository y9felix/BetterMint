const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { StockfishEngine } = require(path.join(__dirname, "../js/Mint.js"));

const src = fs.readFileSync("BetterMint/js/Mint.js", "utf8");

assert.ok(!src.includes('this.send("ucinewgame");\n        this.stopInFlight = false;'), "stopEvaluation must not send ucinewgame");
assert.ok(!src.includes('this.goDoneCallbacks.forEach(cb => cb());\n        this.goDoneCallbacks = [];\n      } else {'), "stopEvaluation must not run callbacks synchronously");
assert.ok(src.includes("wasRequestedStop"), "ProcessMessage must track wasRequestedStop across stop cycles");

function createEngine() {
  const engine = Object.create(StockfishEngine.prototype);
  engine.sent = [];
  engine.send = function (cmd) { this.sent.push(cmd); };
  engine.isEvaluating = false;
  engine.isRequestedStop = false;
  engine.stopInFlight = false;
  engine.goDoneCallbacks = [];
  engine.stopTimeout = null;
  engine.topMoves = [];
  engine.onTopMovesCalls = [];
  engine.onTopMoves = function (move, isBestMove) {
    this.onTopMovesCalls.push({ move, isBestMove });
  };
  return engine;
}

const engine = createEngine();
engine.isEvaluating = true;

let callbackFired = false;
engine.stopEvaluation(() => {
  callbackFired = true;
});

assert.strictEqual(callbackFired, false, "Callback must not run synchronously");
assert.strictEqual(engine.isRequestedStop, true);
assert.deepStrictEqual(engine.sent, ["stop"]);

engine.ProcessMessage("bestmove e7e5");

assert.strictEqual(callbackFired, true, "Callback must run after bestmove arrives");
assert.strictEqual(engine.onTopMovesCalls.length, 0, "Aborted bestmove must not trigger onTopMoves");
assert.strictEqual(engine.isRequestedStop, false);

engine.isEvaluating = true;
engine.ProcessMessage("bestmove g1f3");

assert.strictEqual(engine.onTopMovesCalls.length, 1, "Normal bestmove must trigger onTopMoves");
assert.strictEqual(engine.onTopMovesCalls[0].move.move, "g1f3");

console.log("Stop evaluation tests passed.");
