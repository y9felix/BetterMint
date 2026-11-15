const assert = require("assert");
const path = require("path");
const {
  StockfishEngine,
  enumOptions,
  setOptionsForTesting
} = require(path.join(__dirname, "../js/Mint.js"));

class MockWebSocket {
  constructor(url) {
    if (url.startsWith("invalid://")) {
      throw new Error("Invalid URL");
    }
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.listeners = {};
    this.sent = [];
    this.closed = false;
    MockWebSocket.instances.push(this);
  }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  removeEventListener(event, fn) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((cb) => cb !== fn);
    }
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = MockWebSocket.CLOSED;
    this.trigger("close");
  }

  trigger(event, data) {
    const list = (this.listeners[event] || []).slice();
    list.forEach((fn) => fn(data ? { data } : {}));
  }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.trigger("open");
  }
}
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;
MockWebSocket.instances = [];

global.WebSocket = MockWebSocket;

setOptionsForTesting({
  [enumOptions.UrlApiStockfish]: "ws://localhost:8000/engineA",
  [enumOptions.Depth]: 3
});

function createEngine(masterMock) {
  MockWebSocket.instances = [];
  return new StockfishEngine(masterMock || { onEngineLoaded: () => {} });
}

let engineUpdateCalls = 0;
const masterMock = {
  onEngineLoaded: () => {},
  game: {
    UpdateEngine: () => {
      engineUpdateCalls++;
    }
  }
};

const engine = createEngine(masterMock);
assert.ok(engine.engineUciOptions instanceof Set, "engineUciOptions must be a Set");
assert.strictEqual(MockWebSocket.instances.length, 1);
const ws1 = MockWebSocket.instances[0];
assert.strictEqual(ws1.url, "ws://localhost:8000/engineA");

ws1.triggerOpen();
assert.deepStrictEqual(ws1.sent, ["uci", "isready"]);

engine.ProcessMessage("option name Hash type spin min 1 max 33554432 default 16");
assert.ok(engine.engineUciOptions.has("Hash"));

engine.ProcessMessage("option name MultiPV type spin default 1 min 1 max 500");
assert.ok(engine.engineUciOptions.has("MultiPV"));

engine.ProcessMessage("option name Style type combo default Normal var Solid var Normal var Risky");
assert.ok(engine.engineUciOptions.has("Style"));
assert.strictEqual(engine.engineUciOptions.size, 3);
engine.ProcessMessage("option name Broken");
assert.strictEqual(engine.engineUciOptions.size, 3, "A line without a type token must be ignored");
engine.ProcessMessage("option name Clear Hash type button");
assert.ok(engine.engineUciOptions.has("Clear Hash"), "Names with spaces must be kept whole");

engine.ProcessMessage("uciok");
assert.strictEqual(engine.loaded, true);
assert.ok(ws1.sent.includes("isready"));

engine.ProcessMessage("readyok");
assert.strictEqual(engine.ready, true);
assert.ok(ws1.sent.includes("ucinewgame"));

engine.isEvaluating = true;
engine.switchEngine("ws://localhost:8000/engineB");

assert.strictEqual(engine.targetUrl, "ws://localhost:8000/engineB");
assert.strictEqual(engine.isSwitching, true);
assert.ok(ws1.sent.includes("stop"));
assert.strictEqual(MockWebSocket.instances.length, 1, "New socket must not be created until evaluation stops");

engine.switchEngine("ws://localhost:8000/engineB");
assert.strictEqual(MockWebSocket.instances.length, 1);

engine.ProcessMessage("bestmove e2e4");
assert.strictEqual(engine.isEvaluating, false);
assert.strictEqual(MockWebSocket.instances.length, 2, "Second socket must now be initialized");

const ws2 = MockWebSocket.instances[1];
assert.strictEqual(ws2.url, "ws://localhost:8000/engineB");
assert.strictEqual(ws1.closed, true);
assert.strictEqual(engine.currentUrl, "ws://localhost:8000/engineB");
assert.strictEqual(engine.ready, false);
assert.strictEqual(engine.loaded, false);

ws2.triggerOpen();
assert.deepStrictEqual(ws2.sent, ["uci", "isready"]);
engine.ProcessMessage("uciok");
assert.strictEqual(engineUpdateCalls, 0, "UpdateEngine must not be called before ucinewgame");

engine.ProcessMessage("readyok");
assert.strictEqual(ws2.sent.filter((cmd) => cmd === "ucinewgame").length, 1);
assert.strictEqual(engineUpdateCalls, 1, "UpdateEngine must be called after ucinewgame completes");

const preErrorAttempts = engine.reconnectAttempts;
ws2.trigger("error", new Error("Simulated network blip"));
assert.strictEqual(engine.reconnectAttempts, preErrorAttempts, "Error event must not increment reconnectAttempts");

assert.doesNotThrow(() => {
  engine.initializeWebSocket("invalid://bad-scheme");
});
if (engine.reconnectTimer !== null) {
  clearTimeout(engine.reconnectTimer);
  engine.reconnectTimer = null;
}

const fresh = createEngine(masterMock);
MockWebSocket.instances[0].triggerOpen();
fresh.UpdateOptions({ Foo: 1 });
assert.ok(MockWebSocket.instances[0].sent.includes("setoption name Foo value 1"), "Empty option set must forward custom options");

const evaluatingEngine = createEngine(masterMock);
MockWebSocket.instances[0].triggerOpen();
evaluatingEngine.isEvaluating = true;
let restartedEngine = false;
masterMock.game.UpdateEngine = () => { restartedEngine = true; };

evaluatingEngine.UpdateExtensionOptions({ customEngineOptions: { MultiPV: 3 } });
assert.strictEqual(MockWebSocket.instances[0].sent.includes("stop"), true, "Must issue stop before setoption mid-evaluation");
assert.strictEqual(restartedEngine, false, "Must not restart engine before stop finishes");

evaluatingEngine.ProcessMessage("bestmove (none)");
assert.strictEqual(evaluatingEngine.isEvaluating, false, "bestmove (none) must reset isEvaluating to false");
assert.strictEqual(restartedEngine, true, "Must restart engine evaluation after options applied");

const lateEngine = createEngine(masterMock);
for (let i = 0; i < 6; i++) {
  MockWebSocket.instances[MockWebSocket.instances.length - 1].close();
  assert.ok(lateEngine.reconnectTimer !== null, `Must keep scheduling reconnect after attempt ${i + 1}`);
  clearTimeout(lateEngine.reconnectTimer);
  lateEngine.reconnectTimer = null;
  lateEngine.initializeWebSocket("ws://localhost:8000/engineA");
}
assert.strictEqual(lateEngine.reconnectAttempts, 6);

MockWebSocket.instances[MockWebSocket.instances.length - 1].close();
assert.ok(lateEngine.reconnectTimer !== null);
const preWakeCount = MockWebSocket.instances.length;
lateEngine.UpdatePosition("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", false);
assert.strictEqual(MockWebSocket.instances.length, preWakeCount + 1, "UpdatePosition while disconnected must trigger reconnectNow");
assert.strictEqual(lateEngine.reconnectTimer, null);

console.log("All live engine switching behavioral tests passed.");
