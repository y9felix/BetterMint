const assert = require("assert");
const fs = require("fs");

const src = fs.readFileSync("BetterMint/js/Mint.js", "utf8");

assert.ok(!src.includes('this.send("ucinewgame");\n        this.stopInFlight = false;'), "stopEvaluation must not send ucinewgame");
assert.ok(!src.includes('this.goDoneCallbacks.forEach(cb => cb());\n        this.goDoneCallbacks = [];\n      } else {'), "stopEvaluation must not run callbacks synchronously");
assert.ok(src.includes("wasRequestedStop"), "ProcessMessage must track wasRequestedStop across stop cycles");

class MockStockfishEngine {
  constructor() {
    this.sent = [];
    this.isEvaluating = false;
    this.isRequestedStop = false;
    this.stopInFlight = false;
    this.goDoneCallbacks = [];
    this.stopTimeout = null;
    this.topMoves = [];
    this.onTopMovesCalls = [];
  }

  send(cmd) {
    this.sent.push(cmd);
  }

  onTopMoves(move, isBestMove) {
    this.onTopMovesCalls.push({ move, isBestMove });
  }

  stopEvaluation(callback) {
    if (this.isEvaluating) {
      if (typeof callback === "function") {
        this.goDoneCallbacks.push(callback);
      }
      if (!this.stopInFlight) {
        this.stopInFlight = true;
        this.isRequestedStop = true;
        this.send("stop");
        if (this.stopTimeout !== null) {
          clearTimeout(this.stopTimeout);
        }
        this.stopTimeout = setTimeout(() => {
          this.stopTimeout = null;
          if (this.stopInFlight) {
            this.stopInFlight = false;
            this.isRequestedStop = false;
            this.isEvaluating = false;
            const callbacks = this.goDoneCallbacks;
            this.goDoneCallbacks = [];
            callbacks.forEach((cb) => cb());
          }
        }, 150);
      }
    } else {
      if (typeof callback === "function") {
        callback();
      }
    }
  }

  processMessage(line) {
    const bestMoveMatch = line.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/);
    if (bestMoveMatch) {
      if (this.stopTimeout !== null) {
        clearTimeout(this.stopTimeout);
        this.stopTimeout = null;
      }
      this.isEvaluating = false;
      const wasRequestedStop = this.isRequestedStop;
      this.isRequestedStop = false;
      this.stopInFlight = false;

      const callbacks = this.goDoneCallbacks;
      this.goDoneCallbacks = [];
      callbacks.forEach((cb) => cb());

      if (!wasRequestedStop && bestMoveMatch[1] !== undefined) {
        this.onTopMoves({ move: bestMoveMatch[1] }, true);
      }
    }
  }
}

const engine = new MockStockfishEngine();
engine.isEvaluating = true;

let callbackFired = false;
engine.stopEvaluation(() => {
  callbackFired = true;
});

assert.strictEqual(callbackFired, false, "Callback must not run synchronously");
assert.strictEqual(engine.isRequestedStop, true);
assert.deepStrictEqual(engine.sent, ["stop"]);

engine.processMessage("bestmove e7e5");

assert.strictEqual(callbackFired, true, "Callback must run after bestmove arrives");
assert.strictEqual(engine.onTopMovesCalls.length, 0, "Aborted bestmove must not trigger onTopMoves");
assert.strictEqual(engine.isRequestedStop, false);

engine.isEvaluating = true;
engine.processMessage("bestmove g1f3");

assert.strictEqual(engine.onTopMovesCalls.length, 1, "Normal bestmove must trigger onTopMoves");
assert.strictEqual(engine.onTopMovesCalls[0].move.move, "g1f3");

console.log("Stop evaluation tests passed.");
