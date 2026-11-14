const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("BetterMint/html/options.html", "utf8");
assert.ok(html.includes('id="engine-options-details"'), "Missing engine-options-details details element");
assert.ok(html.includes('id="advanced-timing-details"'), "Missing advanced-timing-details details element");
assert.ok(!html.includes('id="option-advanced-timing"'), "Former toggle switch must be replaced by details summary");

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this._innerHTML = "";
    this._textContent = "";
    this.children = [];
    this.listeners = {};
    this.type = "";
    this.value = "";
    this.checked = false;
    this.selected = false;
    this.min = "";
    this.max = "";
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = val;
    this.children = [];
    if (val === "") {
      this._textContent = "";
    }
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(val) {
    this._textContent = String(val);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  trigger(event) {
    const list = this.listeners[event] || [];
    list.forEach((fn) => fn.call(this));
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (selector === child.tagName.toLowerCase()) return child;
      if (selector.startsWith(".") && child.className.split(" ").includes(selector.substring(1))) return child;
      if (selector === "input" && child.tagName === "INPUT") return child;
      if (selector === "select" && child.tagName === "SELECT") return child;
      if (selector === "button" && child.tagName === "BUTTON") return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
}

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.listeners = {};
    this.closed = false;
    this.sent = [];
    MockWebSocket.instances.push(this);
  }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.trigger("close");
  }

  trigger(event, data) {
    const list = (this.listeners[event] || []).slice();
    list.forEach((fn) => fn(data ? { data } : {}));
  }
}
MockWebSocket.instances = [];

const jsSource = fs.readFileSync("BetterMint/js/options.js", "utf8");
const uciStart = jsSource.indexOf("function parseUciOptionLine");
const uciEnd = jsSource.indexOf("function loadAndRenderEngineOptions");
assert.ok(uciStart !== -1 && uciEnd > uciStart, "UCI option section must be locatable");
const uciSection = jsSource.slice(uciStart, uciEnd);

const containerElement = new MockElement("div");
let loadedOptionsArgs = null;

const sandbox = {
  document: {
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => (id === "engine-options-container" ? containerElement : null),
  },
  WebSocket: MockWebSocket,
  loadAndRenderEngineOptions: (url, opts, container) => {
    loadedOptionsArgs = { url, opts, container };
  },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  console: console,
};

vm.createContext(sandbox);
vm.runInContext(uciSection, sandbox);

const parse = sandbox.parseUciOptionLine;

assert.deepStrictEqual(JSON.parse(JSON.stringify(parse("option name Threads type spin default 1 min 1 max 512"))), {
  name: "Threads",
  type: "spin",
  default: "1",
  min: 1,
  max: 512,
  vars: []
});

assert.deepStrictEqual(JSON.parse(JSON.stringify(parse("option name Hash type spin min 1 max 33554432 default 16"))), {
  name: "Hash",
  type: "spin",
  default: "16",
  min: 1,
  max: 33554432,
  vars: []
});

assert.deepStrictEqual(JSON.parse(JSON.stringify(parse("option name Ponder type check default false"))), {
  name: "Ponder",
  type: "check",
  default: "false",
  min: null,
  max: null,
  vars: []
});

assert.deepStrictEqual(JSON.parse(JSON.stringify(parse("option name Style type combo default Normal var Solid var Normal var Risky"))), {
  name: "Style",
  type: "combo",
  default: "Normal",
  min: null,
  max: null,
  vars: ["Solid", "Normal", "Risky"]
});

assert.deepStrictEqual(JSON.parse(JSON.stringify(parse("option name SyzygyPath type string default <empty>"))), {
  name: "SyzygyPath",
  type: "string",
  default: "<empty>",
  min: null,
  max: null,
  vars: []
});

assert.deepStrictEqual(JSON.parse(JSON.stringify(parse("option name WeightsFile type string default /path with space/model.pb.gz"))), {
  name: "WeightsFile",
  type: "string",
  default: "/path with space/model.pb.gz",
  min: null,
  max: null,
  vars: []
});

assert.deepStrictEqual(JSON.parse(JSON.stringify(parse("option name PlayStyle type combo default Very Solid var Very Solid var Risk Taking"))), {
  name: "PlayStyle",
  type: "combo",
  default: "Very Solid",
  min: null,
  max: null,
  vars: ["Very Solid", "Risk Taking"]
});

assert.deepStrictEqual(JSON.parse(JSON.stringify(parse("option name Clear Hash type button"))), {
  name: "Clear Hash",
  type: "button",
  default: "",
  min: null,
  max: null,
  vars: []
});

assert.strictEqual(parse("uciok"), null);
assert.strictEqual(parse("readyok"), null);
assert.strictEqual(parse("id name Stockfish 16"), null);
assert.strictEqual(parse(""), null);
assert.strictEqual(parse(null), null);

const render = sandbox.renderDynamicUciOptions;
const renderContainer = new MockElement("div");

render([], {}, renderContainer, null);
assert.ok(renderContainer.innerHTML.includes("No configurable options"));

const testOptions = [
  { name: "Threads", type: "spin", default: "1", min: 1, max: 128, vars: [] },
  { name: "Ponder", type: "check", default: "false", min: null, max: null, vars: [] },
  { name: "Style", type: "combo", default: "Normal", min: null, max: null, vars: [] },
  { name: "SyzygyPath", type: "string", default: "", min: null, max: null, vars: [] },
  { name: "Clear Hash", type: "button", default: "", min: null, max: null, vars: [] }
];

let changedValues = {};
render(testOptions, { Threads: 4, Ponder: true }, renderContainer, (name, val) => {
  changedValues[name] = val;
});

assert.strictEqual(renderContainer.children.length, 5);

const spinInput = renderContainer.children[0].querySelector("input");
assert.strictEqual(spinInput.value, 4);
assert.strictEqual(spinInput.min, 1);
assert.strictEqual(spinInput.max, 128);
spinInput.value = "8";
spinInput.trigger("input");
assert.strictEqual(changedValues["Threads"], 8);

const checkInput = renderContainer.children[1].querySelector("input");
assert.strictEqual(checkInput.checked, true);
checkInput.checked = false;
checkInput.trigger("change");
assert.strictEqual(changedValues["Ponder"], false);

const select = renderContainer.children[2].querySelector("select");
select.value = "Solid";
select.trigger("change");
assert.strictEqual(changedValues["Style"], "Solid");

const textInput = renderContainer.children[3].querySelector("input");
textInput.value = "/path/to/tablebases";
textInput.trigger("change");
assert.strictEqual(changedValues["SyzygyPath"], "/path/to/tablebases");

const button = renderContainer.children[4].querySelector("button");
button.trigger("click");
assert.strictEqual(changedValues["Clear Hash"], "");

MockWebSocket.instances = [];
sandbox.probeEngine("ws://localhost:8000/probe1");
assert.strictEqual(MockWebSocket.instances.length, 1);
const probeWs1 = MockWebSocket.instances[0];

sandbox.probeEngine("ws://localhost:8000/probe2");
assert.strictEqual(MockWebSocket.instances.length, 2);
assert.strictEqual(probeWs1.closed, true);
const probeWs2 = MockWebSocket.instances[1];

probeWs2.trigger("open");
assert.deepStrictEqual(probeWs2.sent, ["uci\n"]);
probeWs2.trigger("message", "option name MultiPV type spin default 1 min 1 max 500");
probeWs2.trigger("message", "uciok");

assert.strictEqual(probeWs2.closed, true);
assert.strictEqual(loadedOptionsArgs.url, "ws://localhost:8000/probe2");
assert.strictEqual(loadedOptionsArgs.opts.length, 1);
assert.strictEqual(loadedOptionsArgs.opts[0].name, "MultiPV");

console.log("All dynamic UCI UI behavioral tests passed.");
