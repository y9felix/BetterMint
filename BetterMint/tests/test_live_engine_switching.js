const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const src = fs.readFileSync("BetterMint/js/Mint.js", "utf8");
assert.ok(src.includes("switchEngine"), "StockfishEngine must implement switchEngine");
assert.ok(src.includes("this.currentUrl"), "StockfishEngine must track currentUrl");
assert.ok(src.includes("this.targetUrl"), "StockfishEngine must track targetUrl");
assert.ok(src.includes("this.isSwitching"), "StockfishEngine must track isSwitching");
assert.ok(src.includes("this.engineUciOptions"), "StockfishEngine must track engineUciOptions");
assert.ok(!src.includes("setoption name option-depth"), "Must not emit extension settings keys as UCI options");

const lines = src.split("\n");
const classCode = lines.slice(583, 1245).join("\n");

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

function createEngine(masterMock) {
  MockWebSocket.instances = [];
  const sandbox = {
    getValueConfig: (k) => (k === "UrlApiStockfish" ? "ws://localhost:8000/engineA" : 3),
    enumOptions: { UrlApiStockfish: "UrlApiStockfish", Depth: "Depth" },
    WebSocket: MockWebSocket,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(classCode + "\nthis.StockfishEngine = StockfishEngine;", sandbox);
  return new sandbox.StockfishEngine(masterMock || { onEngineLoaded: () => {} });
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
assert.strictEqual(MockWebSocket.instances.length, 1);
const ws1 = MockWebSocket.instances[0];
assert.strictEqual(ws1.url, "ws://localhost:8000/engineA");

ws1.triggerOpen();
assert.deepStrictEqual(ws1.sent, ["uci", "isready"]);

engine.ProcessMessage("option name Hash type spin min 1 max 33554432 default 16");
assert.deepStrictEqual(JSON.parse(JSON.stringify(engine.engineUciOptions["Hash"])), {
  type: "spin",
  default: "16",
  min: 1,
  max: 33554432,
  vars: []
});

engine.ProcessMessage("option name MultiPV type spin default 1 min 1 max 500");
assert.deepStrictEqual(JSON.parse(JSON.stringify(engine.engineUciOptions["MultiPV"])), {
  type: "spin",
  default: "1",
  min: 1,
  max: 500,
  vars: []
});

engine.ProcessMessage("option name Style type combo default Normal var Solid var Normal var Risky");
assert.deepStrictEqual(JSON.parse(JSON.stringify(engine.engineUciOptions["Style"])), {
  type: "combo",
  default: "Normal",
  min: null,
  max: null,
  vars: ["Solid", "Normal", "Risky"]
});

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
assert.strictEqual(ws2.sent.filter(cmd => cmd === "ucinewgame").length, 1);
assert.strictEqual(engineUpdateCalls, 1, "UpdateEngine must be called after ucinewgame completes");

const preErrorAttempts = engine.reconnectAttempts;
ws2.trigger("error", new Error("Simulated network blip"));
assert.strictEqual(engine.reconnectAttempts, preErrorAttempts, "Error event must not increment reconnectAttempts");

assert.doesNotThrow(() => {
  engine.initializeWebSocket("invalid://bad-scheme");
});

console.log("All live engine switching behavioral tests passed.");
