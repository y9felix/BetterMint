const assert = require("assert");
const { MockElement, MockWebSocket, createPopupFixture } = require("./helpers");

const { elementsById, optionsModule } = createPopupFixture();
const {
  parseUciOptionLine,
  renderDynamicUciOptions,
  probeEngineUciOptions,
  initializeOptionsPage,
  handleExtensionOptionChange,
  resetProbeStateForTesting
} = optionsModule;

const uciContainer = elementsById["engine-options-container"];
const uciDetails = elementsById["engine-options-details"];
const engineUrlInput = elementsById["option-url-api-stockfish"];

// 1. parseUciOptionLine grammar across all UCI option types and edge cases
assert.deepStrictEqual(parseUciOptionLine("option name Threads type spin default 1 min 1 max 512"), {
  name: "Threads",
  type: "spin",
  default: "1",
  min: 1,
  max: 512,
  vars: []
});
assert.deepStrictEqual(parseUciOptionLine("option name Hash type spin min 1 max 33554432 default 16"), {
  name: "Hash",
  type: "spin",
  default: "16",
  min: 1,
  max: 33554432,
  vars: []
});
assert.deepStrictEqual(parseUciOptionLine("option name Ponder type check default false"), {
  name: "Ponder",
  type: "check",
  default: "false",
  min: null,
  max: null,
  vars: []
});
assert.deepStrictEqual(
  parseUciOptionLine("option name Style type combo default Normal var Solid var Normal var Risky"),
  {
    name: "Style",
    type: "combo",
    default: "Normal",
    min: null,
    max: null,
    vars: ["Solid", "Normal", "Risky"]
  }
);
assert.deepStrictEqual(parseUciOptionLine("option name SyzygyPath type string default <empty>"), {
  name: "SyzygyPath",
  type: "string",
  default: "",
  min: null,
  max: null,
  vars: []
});
assert.deepStrictEqual(
  parseUciOptionLine("option name WeightsFile type string default /path with space/model.pb.gz"),
  {
    name: "WeightsFile",
    type: "string",
    default: "/path with space/model.pb.gz",
    min: null,
    max: null,
    vars: []
  }
);
assert.deepStrictEqual(
  parseUciOptionLine("option name EvalFile type string default /opt/min max var/model.nnue"),
  {
    name: "EvalFile",
    type: "string",
    default: "/opt/min max var/model.nnue",
    min: null,
    max: null,
    vars: []
  },
  "String option default containing UCI keyword tokens must stay intact"
);
assert.deepStrictEqual(
  parseUciOptionLine("option name PlayStyle type combo default Very Solid var Very Solid var Risk Taking"),
  {
    name: "PlayStyle",
    type: "combo",
    default: "Very Solid",
    min: null,
    max: null,
    vars: ["Very Solid", "Risk Taking"]
  }
);
assert.deepStrictEqual(parseUciOptionLine("option name Clear Hash type button"), {
  name: "Clear Hash",
  type: "button",
  default: "",
  min: null,
  max: null,
  vars: []
});

for (const nonOptionLine of ["uciok", "readyok", "id name Stockfish 16", "", null]) {
  assert.strictEqual(parseUciOptionLine(nonOptionLine), null);
}

// 2. renderDynamicUciOptions controls, accessibility links, --slider-progress, and inline edit
const uciRenderContainer = new MockElement("div");
renderDynamicUciOptions([], {}, uciRenderContainer, null);
assert.ok(uciRenderContainer.innerHTML.includes("No configurable options"));

const sampleUciOptions = [
  { name: "Threads", type: "spin", default: "1", min: 1, max: 128, vars: [] },
  { name: "Ponder", type: "check", default: "false", min: null, max: null, vars: [] },
  { name: "Style", type: "combo", default: "Normal", min: null, max: null, vars: ["Solid", "Normal"] },
  { name: "SyzygyPath", type: "string", default: "", min: null, max: null, vars: [] },
  { name: "Clear Hash", type: "button", default: "", min: null, max: null, vars: [] }
];

const updatedUciValues = {};
renderDynamicUciOptions(
  sampleUciOptions,
  { Threads: 4, Ponder: true },
  uciRenderContainer,
  (optionName, optionValue) => {
    updatedUciValues[optionName] = optionValue;
  }
);
assert.strictEqual(uciRenderContainer.children.length, 5);

const spinRangeInput = uciRenderContainer.children[0].querySelector("input");
const spinBadgeButton = uciRenderContainer.children[0].querySelector(".badge");
assert.strictEqual(spinRangeInput.value, 4);
assert.strictEqual(spinRangeInput.min, 1);
assert.strictEqual(spinRangeInput.max, 128);
assert.strictEqual(spinBadgeButton.tagName, "BUTTON", "Dynamic UCI spin badge must render as a button");
assert.strictEqual(
  uciRenderContainer.children[0].querySelector("label").attributes.for,
  spinRangeInput.id,
  "Dynamic UCI spin label must match slider id"
);
assert.ok(
  spinRangeInput.style.getPropertyValue("--slider-progress").endsWith("%"),
  "Dynamic UCI range slider must update --slider-progress fill"
);

spinRangeInput.value = "8";
spinRangeInput.trigger("input");
assert.strictEqual(updatedUciValues["Threads"], 8);

spinBadgeButton.trigger("click");
const threadsInlineEditor = spinBadgeButton.parentNode.querySelector("input");
assert.ok(threadsInlineEditor, "Dynamic UCI spin badge must support inline editing");
threadsInlineEditor.value = "16";
threadsInlineEditor.trigger("keydown", { key: "Enter", preventDefault: () => {} });
assert.strictEqual(spinRangeInput.value, "16");
assert.strictEqual(spinBadgeButton.textContent, "16");
assert.strictEqual(updatedUciValues["Threads"], 16);

const ponderCheckboxInput = uciRenderContainer.children[1].querySelector("input");
assert.strictEqual(ponderCheckboxInput.checked, true);
ponderCheckboxInput.checked = false;
ponderCheckboxInput.trigger("change");
assert.strictEqual(updatedUciValues["Ponder"], false);

const styleSelectInput = uciRenderContainer.children[2].querySelector("select");
styleSelectInput.value = "Solid";
styleSelectInput.trigger("change");
assert.strictEqual(updatedUciValues["Style"], "Solid");

const syzygyTextInput = uciRenderContainer.children[3].querySelector("input");
syzygyTextInput.value = "/path/to/tablebases";
syzygyTextInput.trigger("change");
assert.strictEqual(updatedUciValues["SyzygyPath"], "/path/to/tablebases");

const clearHashButton = uciRenderContainer.children[4].querySelector("button");
clearHashButton.trigger("click");
assert.strictEqual(updatedUciValues["Clear Hash"], "");

// 3. probeEngineUciOptions lifecycle, superseding, URL validation, and aria-busy states
let completedProbeResult = null;
const onProbeComplete = (engineUrl, discoveredOptions, containerElement) => {
  completedProbeResult = { engineUrl, discoveredOptions, containerElement };
};

MockWebSocket.reset();
probeEngineUciOptions("ws://localhost:8000/probe1", onProbeComplete);
assert.strictEqual(MockWebSocket.instances.length, 1);
const supersededProbeSocket = MockWebSocket.instances[0];

probeEngineUciOptions("ws://localhost:8000/probe2", onProbeComplete);
assert.strictEqual(MockWebSocket.instances.length, 2);
assert.strictEqual(supersededProbeSocket.isClosed, true);
const activeProbeSocket = MockWebSocket.instances[1];

activeProbeSocket.triggerOpen();
assert.deepStrictEqual(activeProbeSocket.sentMessages, ["uci\n"]);
activeProbeSocket.trigger("message", "option name MultiPV type spin default 1 min 1 max 500");
activeProbeSocket.trigger("message", "uciok");

assert.strictEqual(activeProbeSocket.isClosed, true);
assert.strictEqual(completedProbeResult.engineUrl, "ws://localhost:8000/probe2");
assert.strictEqual(completedProbeResult.discoveredOptions.length, 1);
assert.strictEqual(completedProbeResult.discoveredOptions[0].name, "MultiPV");

const socketCountBeforeInvalidUrl = MockWebSocket.instances.length;
probeEngineUciOptions("http://localhost:8000/not-ws", onProbeComplete);
assert.strictEqual(
  MockWebSocket.instances.length,
  socketCountBeforeInvalidUrl,
  "probeEngineUciOptions must reject non-ws/wss URLs before opening WebSocket"
);

MockWebSocket.reset();
probeEngineUciOptions("ws://localhost:8000/error-check", onProbeComplete);
assert.strictEqual(
  uciContainer.attributes["aria-busy"],
  "true",
  "UCI container must set aria-busy=true while probing"
);
assert.strictEqual(uciContainer.children[0].className, "status-text");
MockWebSocket.instances[0].trigger("error");
assert.strictEqual(
  uciContainer.attributes["aria-busy"],
  "false",
  "UCI container must clear aria-busy after probe error"
);
assert.strictEqual(uciContainer.children[0].className, "status-text");

// 4. Lazy probing on disclosure expand, caching, and clearing URL while open
MockWebSocket.reset();
resetProbeStateForTesting();
uciDetails.open = false;
initializeOptionsPage();
assert.strictEqual(
  MockWebSocket.instances.length,
  0,
  "Opening popup with collapsed UCI details must not spawn an engine probe"
);

uciDetails.open = true;
uciDetails.trigger("toggle");
assert.strictEqual(
  MockWebSocket.instances.length,
  1,
  "Expanding UCI details must probe the configured engine URL"
);
assert.strictEqual(MockWebSocket.instances[0].url, "ws://localhost:8000/lazy1");
MockWebSocket.instances[0].triggerOpen();
MockWebSocket.instances[0].trigger("message", "uciok");

uciDetails.open = false;
uciDetails.trigger("toggle");
uciDetails.open = true;
uciDetails.trigger("toggle");
assert.strictEqual(
  MockWebSocket.instances.length,
  1,
  "Re-expanding same URL after uciok must not re-probe"
);

uciDetails.open = false;
engineUrlInput.value = "ws://localhost:8000/lazy2";
handleExtensionOptionChange("option-url-api-stockfish");
assert.strictEqual(
  MockWebSocket.instances.length,
  1,
  "Changing URL while collapsed must not probe until expanded"
);

uciDetails.open = true;
uciDetails.trigger("toggle");
assert.strictEqual(
  MockWebSocket.instances.length,
  2,
  "Expanding after URL change must probe the new URL"
);
assert.strictEqual(MockWebSocket.instances[1].url, "ws://localhost:8000/lazy2");
MockWebSocket.instances[1].close();

renderDynamicUciOptions(
  [{ name: "Threads", type: "spin", default: "1", min: 1, max: 64 }],
  {},
  uciContainer,
  null
);
uciDetails.open = true;
engineUrlInput.value = "";
handleExtensionOptionChange("option-url-api-stockfish");
assert.ok(
  uciContainer.children.some((childElement) =>
    childElement.textContent.includes("Invalid WebSocket URL")
  ),
  "Clearing WebSocket URL with open UCI panel must clear stale controls and show URL error"
);

console.log("Popup UCI tests passed.");
