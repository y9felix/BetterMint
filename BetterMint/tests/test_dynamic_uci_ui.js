const assert = require("assert");
const path = require("path");

const extensionRootDir = path.join(__dirname, "..");

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
    this.attributes = {};
    this.style = {
      _properties: {},
      setProperty: (propertyName, propertyValue) => {
        this.style._properties[propertyName] = String(propertyValue);
      },
      getPropertyValue: (propertyName) => this.style._properties[propertyName] || ""
    };
    this.classList = {
      _classNames: new Set(),
      toggle: (className, shouldForce) => {
        if (shouldForce === undefined) {
          if (this.classList._classNames.has(className)) this.classList._classNames.delete(className);
          else this.classList._classNames.add(className);
        } else if (shouldForce) {
          this.classList._classNames.add(className);
        } else {
          this.classList._classNames.delete(className);
        }
      },
      add: (...classNames) =>
        classNames.forEach((className) => this.classList._classNames.add(className)),
      remove: (...classNames) =>
        classNames.forEach((className) => this.classList._classNames.delete(className)),
      contains: (className) => this.classList._classNames.has(className)
    };
  }

  setAttribute(attributeName, attributeValue) {
    this.attributes[attributeName] = String(attributeValue);
  }

  getAttribute(attributeName) {
    return attributeName in this.attributes ? this.attributes[attributeName] : null;
  }

  contains(targetElement) {
    if (targetElement === this) return true;
    return this.children.some((childElement) => childElement.contains?.(targetElement));
  }

  focus() {}
  select() {}
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter(
        (childElement) => childElement !== this
      );
      this.parentNode = null;
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(htmlString) {
    this._innerHTML = htmlString;
    this.children = [];
    if (htmlString === "") {
      this._textContent = "";
    }
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(textValue) {
    this._textContent = String(textValue);
  }

  appendChild(childElement) {
    childElement.parentNode = this;
    this.children.push(childElement);
    return childElement;
  }

  addEventListener(eventName, listener) {
    if (!this.listeners[eventName]) this.listeners[eventName] = [];
    this.listeners[eventName].push(listener);
  }

  trigger(eventName, eventPayload = {}) {
    const eventListeners = this.listeners[eventName] || [];
    eventListeners.forEach((listener) => listener.call(this, eventPayload));
  }

  querySelector(selector) {
    for (const childElement of this.children) {
      if (selector === childElement.tagName.toLowerCase()) return childElement;
      if (selector.startsWith(".") && childElement.className.split(" ").includes(selector.substring(1))) {
        return childElement;
      }
      const matchingDescendant = childElement.querySelector(selector);
      if (matchingDescendant) return matchingDescendant;
    }
    return null;
  }
}

class MockWebSocket {
  constructor(engineUrl) {
    this.url = engineUrl;
    this.listeners = {};
    this.isClosed = false;
    this.sentMessages = [];
    MockWebSocket.instances.push(this);
  }

  addEventListener(eventName, listener) {
    if (!this.listeners[eventName]) this.listeners[eventName] = [];
    this.listeners[eventName].push(listener);
  }

  send(messageText) {
    this.sentMessages.push(messageText);
  }

  close() {
    this.isClosed = true;
    this.trigger("close");
  }

  trigger(eventName, messagePayload) {
    const eventListeners = (this.listeners[eventName] || []).slice();
    eventListeners.forEach((listener) =>
      listener(messagePayload ? { data: messagePayload } : {})
    );
  }
}
MockWebSocket.instances = [];

const uciOptionsContainerElement = new MockElement("div");
const uciOptionsDetailsElement = new MockElement("details");
uciOptionsDetailsElement.open = false;
const engineUrlInput = new MockElement("input");
engineUrlInput.type = "text";
const themeToggleButton = new MockElement("button");

const mockElementsById = {
  "engine-options-container": uciOptionsContainerElement,
  "engine-options-details": uciOptionsDetailsElement,
  "option-url-api-stockfish": engineUrlInput,
  "option-depth": Object.assign(new MockElement("input"), {
    type: "range",
    min: "0",
    max: "50",
    value: "3"
  }),
  "badge-option-depth": new MockElement("span"),
  "option-go-movetime": Object.assign(new MockElement("input"), {
    type: "range",
    min: "0",
    max: "5000",
    step: "50",
    value: "0"
  }),
  "badge-option-go-movetime": new MockElement("span"),
  "option-go-nodes": Object.assign(new MockElement("input"), {
    type: "range",
    min: "0",
    max: "5000000",
    step: "10000",
    value: "0"
  }),
  "badge-option-go-nodes": new MockElement("span"),
  "option-reflex-multiplier": Object.assign(new MockElement("input"), {
    type: "range",
    min: "0.10",
    max: "1.00",
    step: "0.05",
    value: "0.25"
  }),
  "badge-option-reflex-multiplier": new MockElement("span"),
  "option-auto-queue": Object.assign(new MockElement("input"), {
    type: "checkbox",
    checked: false
  }),
  "auto-queue-group": new MockElement("div"),
  "theme-toggle": themeToggleButton,
  "config-toggle": new MockElement("button"),
  "config-popover": new MockElement("div"),
  "config-close": new MockElement("button"),
  "config-load-list": new MockElement("div"),
  "config-save-name": new MockElement("input"),
  "config-save-confirm": new MockElement("button"),
  "config-status": new MockElement("span")
};
mockElementsById["config-popover"].classList.add("hidden");
mockElementsById["config-status"].classList.add("hidden");

const depthSliderHeader = new MockElement("div");
depthSliderHeader.appendChild(mockElementsById["badge-option-depth"]);
const movetimeSliderHeader = new MockElement("div");
movetimeSliderHeader.appendChild(mockElementsById["badge-option-go-movetime"]);
const nodesSliderHeader = new MockElement("div");
nodesSliderHeader.appendChild(mockElementsById["badge-option-go-nodes"]);
const reflexSliderHeader = new MockElement("div");
reflexSliderHeader.appendChild(mockElementsById["badge-option-reflex-multiplier"]);

const localStore = {};
let lastSyncedOptions = null;

global.document = {
  documentElement: {
    dataset: {}
  },
  body: new MockElement("body"),
  createElement: (tagName) => new MockElement(tagName),
  getElementById: (elementId) => mockElementsById[elementId] || null
};
global.WebSocket = MockWebSocket;
const {
  DEFAULT_EXTENSION_OPTIONS,
  getEngineOptionsStorageKey
} = require(path.join(extensionRootDir, "js/loader.js"));
global.DEFAULT_EXTENSION_OPTIONS = DEFAULT_EXTENSION_OPTIONS;
global.getEngineOptionsStorageKey = getEngineOptionsStorageKey;
global.chrome = {
  storage: {
    sync: {
      get: (_defaultOptions, onLoaded) =>
        onLoaded({ "option-url-api-stockfish": "ws://localhost:8000/lazy1" }),
      set: (storagePayload) => {
        lastSyncedOptions = Object.assign({}, storagePayload);
      }
    },
    local: {
      get: (requestedKeys, onLoaded) => {
        const storedEntries = {};
        if (Array.isArray(requestedKeys)) {
          for (const storageKey of requestedKeys) {
            if (storageKey in localStore) storedEntries[storageKey] = localStore[storageKey];
          }
        }
        onLoaded(storedEntries);
      },
      set: (storagePayload) => Object.assign(localStore, storagePayload)
    }
  },
  tabs: {
    query: (_queryFilter, onTabs) => onTabs([{ id: 42 }]),
    sendMessage: () => Promise.resolve()
  }
};

const {
  THEMES,
  formatSliderBadgeValue,
  applyTheme,
  applyConfigProfile,
  deleteCustomConfigProfile,
  setConfigPopoverOpen,
  parseUciOptionLine,
  renderDynamicUciOptions,
  probeEngineUciOptions,
  initializeOptionsPage,
  handleExtensionOptionChange,
  resetProbeStateForTesting
} = require(path.join(extensionRootDir, "js/options.js"));

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

assert.strictEqual(parseUciOptionLine("uciok"), null);
assert.strictEqual(parseUciOptionLine("readyok"), null);
assert.strictEqual(parseUciOptionLine("id name Stockfish 16"), null);
assert.strictEqual(parseUciOptionLine(""), null);
assert.strictEqual(parseUciOptionLine(null), null);

const uciRenderContainer = new MockElement("div");

renderDynamicUciOptions([], {}, uciRenderContainer, null);
assert.ok(uciRenderContainer.innerHTML.includes("No configurable options"));

const sampleUciOptions = [
  { name: "Threads", type: "spin", default: "1", min: 1, max: 128, vars: [] },
  { name: "Ponder", type: "check", default: "false", min: null, max: null, vars: [] },
  { name: "Style", type: "combo", default: "Normal", min: null, max: null, vars: [] },
  { name: "SyzygyPath", type: "string", default: "", min: null, max: null, vars: [] },
  { name: "Clear Hash", type: "button", default: "", min: null, max: null, vars: [] }
];

const updatedUciValues = {};
renderDynamicUciOptions(sampleUciOptions, { Threads: 4, Ponder: true }, uciRenderContainer, (optionName, optionValue) => {
  updatedUciValues[optionName] = optionValue;
});

assert.strictEqual(uciRenderContainer.children.length, 5);

const spinRangeInput = uciRenderContainer.children[0].querySelector("input");
assert.strictEqual(spinRangeInput.value, 4);
assert.strictEqual(spinRangeInput.min, 1);
assert.strictEqual(spinRangeInput.max, 128);
spinRangeInput.value = "8";
spinRangeInput.trigger("input");
assert.strictEqual(updatedUciValues["Threads"], 8);

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

let completedProbeResult = null;
const onProbeComplete = (engineUrl, discoveredOptions, containerElement) => {
  completedProbeResult = { engineUrl, discoveredOptions, containerElement };
};

MockWebSocket.instances = [];
probeEngineUciOptions("ws://localhost:8000/probe1", onProbeComplete);
assert.strictEqual(MockWebSocket.instances.length, 1);
const supersededProbeSocket = MockWebSocket.instances[0];

probeEngineUciOptions("ws://localhost:8000/probe2", onProbeComplete);
assert.strictEqual(MockWebSocket.instances.length, 2);
assert.strictEqual(supersededProbeSocket.isClosed, true);
const activeProbeSocket = MockWebSocket.instances[1];

activeProbeSocket.trigger("open");
assert.deepStrictEqual(activeProbeSocket.sentMessages, ["uci\n"]);
activeProbeSocket.trigger("message", "option name MultiPV type spin default 1 min 1 max 500");
activeProbeSocket.trigger("message", "uciok");

assert.strictEqual(activeProbeSocket.isClosed, true);
assert.strictEqual(completedProbeResult.engineUrl, "ws://localhost:8000/probe2");
assert.strictEqual(completedProbeResult.discoveredOptions.length, 1);
assert.strictEqual(completedProbeResult.discoveredOptions[0].name, "MultiPV");

MockWebSocket.instances = [];
resetProbeStateForTesting();
uciOptionsDetailsElement.open = false;
initializeOptionsPage();
assert.strictEqual(
  MockWebSocket.instances.length,
  0,
  "Opening popup with collapsed UCI details must not spawn an engine probe"
);

uciOptionsDetailsElement.open = true;
uciOptionsDetailsElement.trigger("toggle");
assert.strictEqual(
  MockWebSocket.instances.length,
  1,
  "Expanding UCI details must probe the configured engine URL"
);
assert.strictEqual(MockWebSocket.instances[0].url, "ws://localhost:8000/lazy1");
MockWebSocket.instances[0].trigger("open");
MockWebSocket.instances[0].trigger("message", "uciok");

uciOptionsDetailsElement.open = false;
uciOptionsDetailsElement.trigger("toggle");
uciOptionsDetailsElement.open = true;
uciOptionsDetailsElement.trigger("toggle");
assert.strictEqual(
  MockWebSocket.instances.length,
  1,
  "Re-expanding same URL after uciok must not re-probe"
);

uciOptionsDetailsElement.open = false;
engineUrlInput.value = "ws://localhost:8000/lazy2";
handleExtensionOptionChange("option-url-api-stockfish");
assert.strictEqual(
  MockWebSocket.instances.length,
  1,
  "Changing URL while collapsed must not probe until expanded"
);

uciOptionsDetailsElement.open = true;
uciOptionsDetailsElement.trigger("toggle");
assert.strictEqual(
  MockWebSocket.instances.length,
  2,
  "Expanding after URL change must probe the new URL"
);
assert.strictEqual(MockWebSocket.instances[1].url, "ws://localhost:8000/lazy2");
MockWebSocket.instances[1].close();

assert.strictEqual(global.document.documentElement.dataset.theme, "dark");
assert.strictEqual(themeToggleButton.title, "Theme: Dark");
assert.strictEqual(themeToggleButton.attributes["aria-label"], "Theme: Dark");
assert.strictEqual(themeToggleButton.innerHTML, THEMES.dark.iconSvg);

themeToggleButton.trigger("click");
assert.strictEqual(global.document.documentElement.dataset.theme, "light");
assert.strictEqual(themeToggleButton.title, "Theme: Light");
assert.strictEqual(themeToggleButton.innerHTML, THEMES.light.iconSvg);
assert.strictEqual(localStore.theme, "light");

themeToggleButton.trigger("click");
assert.strictEqual(global.document.documentElement.dataset.theme, "black");
assert.strictEqual(themeToggleButton.title, "Theme: Black");
assert.strictEqual(themeToggleButton.innerHTML, THEMES.black.iconSvg);
assert.strictEqual(localStore.theme, "black");

themeToggleButton.trigger("click");
assert.strictEqual(global.document.documentElement.dataset.theme, "chesscom");
assert.strictEqual(themeToggleButton.title, "Theme: Chess.com");
assert.strictEqual(themeToggleButton.innerHTML, THEMES.chesscom.iconSvg);
assert.strictEqual(localStore.theme, "chesscom");

themeToggleButton.trigger("click");
assert.strictEqual(global.document.documentElement.dataset.theme, "dark");
assert.strictEqual(themeToggleButton.title, "Theme: Dark");
assert.strictEqual(themeToggleButton.innerHTML, THEMES.dark.iconSvg);
assert.strictEqual(localStore.theme, "dark");

applyTheme("unknown");
assert.strictEqual(global.document.documentElement.dataset.theme, "dark");

localStore.theme = "chesscom";
initializeOptionsPage();
assert.strictEqual(global.document.documentElement.dataset.theme, "chesscom");
assert.strictEqual(themeToggleButton.title, "Theme: Chess.com");
assert.strictEqual(themeToggleButton.innerHTML, THEMES.chesscom.iconSvg);

localStore.theme = "black";
initializeOptionsPage();
assert.strictEqual(global.document.documentElement.dataset.theme, "black");
assert.strictEqual(themeToggleButton.title, "Theme: Black");
assert.strictEqual(themeToggleButton.innerHTML, THEMES.black.iconSvg);

assert.strictEqual(DEFAULT_EXTENSION_OPTIONS["option-move-pace"], 12.5);
assert.strictEqual(DEFAULT_EXTENSION_OPTIONS["option-physical-floor"], 600);
assert.strictEqual(DEFAULT_EXTENSION_OPTIONS["option-timing-spread"], 0.80);
assert.strictEqual(DEFAULT_EXTENSION_OPTIONS["option-reflex-multiplier"], 0.25);
assert.strictEqual(DEFAULT_EXTENSION_OPTIONS["option-opening-moves-threshold"], 10);
assert.strictEqual(DEFAULT_EXTENSION_OPTIONS["option-opening-multiplier"], 0.40);
assert.strictEqual(DEFAULT_EXTENSION_OPTIONS["option-clock-threshold"], 180);

setConfigPopoverOpen(true);
assert.strictEqual(
  mockElementsById["config-load-list"].children.length,
  1,
  "Empty Load list must show empty-state message"
);
assert.ok(
  mockElementsById["config-load-list"].children[0].textContent.includes("No saved configs yet")
);
setConfigPopoverOpen(false);

mockElementsById["config-toggle"].trigger("click");
assert.strictEqual(mockElementsById["config-popover"].classList.contains("hidden"), false);

mockElementsById["config-save-name"].value = "";
mockElementsById["config-save-name"].trigger("input");
assert.strictEqual(mockElementsById["config-save-confirm"].disabled, true);
mockElementsById["config-save-confirm"].trigger("click");
assert.strictEqual((localStore.customConfigs || []).length, 0);

mockElementsById["option-depth"].value = "16";
mockElementsById["config-save-name"].value = "My Tournament";
mockElementsById["config-save-name"].trigger("input");
assert.strictEqual(mockElementsById["config-save-confirm"].disabled, false);
mockElementsById["config-save-confirm"].trigger("click");
assert.strictEqual(mockElementsById["config-popover"].classList.contains("hidden"), true);
assert.strictEqual(localStore.activeConfigName, "My Tournament");
assert.strictEqual(localStore.customConfigs.length, 1);

handleExtensionOptionChange("option-depth");
assert.strictEqual(
  localStore.activeConfigName,
  null,
  "Manual edit clears activeConfigName highlight"
);

mockElementsById["option-depth"].value = "8";
setConfigPopoverOpen(true);
assert.strictEqual(
  mockElementsById["config-load-list"].children.length,
  1,
  "Load list must render saved custom configs without built-in presets"
);
const savedConfigButton = mockElementsById["config-load-list"].children[0].querySelector("button");
savedConfigButton.trigger("click");
assert.strictEqual(mockElementsById["option-depth"].value, "16");
assert.strictEqual(localStore.activeConfigName, "My Tournament");

deleteCustomConfigProfile("My Tournament");
assert.strictEqual(localStore.customConfigs.length, 0);
assert.strictEqual(localStore.activeConfigName, null);

applyConfigProfile(
  { "option-auto-queue": false, "option-legit-auto-move": true },
  {},
  { shouldMarkSaved: false }
);
assert.strictEqual(lastSyncedOptions["option-auto-queue"], false);
assert.strictEqual(lastSyncedOptions["option-legit-auto-move"], true);
assert.strictEqual(mockElementsById["auto-queue-group"].classList.contains("hidden"), true);

mockElementsById["option-auto-queue"].checked = true;
handleExtensionOptionChange("option-auto-queue");
assert.strictEqual(
  mockElementsById["auto-queue-group"].classList.contains("hidden"),
  false,
  "Rematch first group must appear when Auto Queue is enabled"
);

mockElementsById["option-auto-queue"].checked = false;
handleExtensionOptionChange("option-auto-queue");
assert.strictEqual(
  mockElementsById["auto-queue-group"].classList.contains("hidden"),
  true,
  "Rematch first group must hide when Auto Queue is disabled"
);

assert.strictEqual(formatSliderBadgeValue("option-depth", 0), "Off");
assert.strictEqual(formatSliderBadgeValue("option-depth", 16), 16);
assert.strictEqual(formatSliderBadgeValue("option-go-movetime", 0), "Off");
assert.strictEqual(formatSliderBadgeValue("option-go-nodes", 0), "Off");
assert.strictEqual(formatSliderBadgeValue("option-go-nodes", 50000), "50,000");
assert.strictEqual(formatSliderBadgeValue("option-opening-moves-threshold", 0), "Off");
assert.strictEqual(formatSliderBadgeValue("option-clock-threshold", 0), "Off");
assert.strictEqual(formatSliderBadgeValue("option-reflex-multiplier", 1), "Off");
assert.strictEqual(formatSliderBadgeValue("option-opening-multiplier", 1), "Off");
assert.strictEqual(formatSliderBadgeValue("option-reflex-multiplier", 0.25), "0.25");
assert.strictEqual(formatSliderBadgeValue("option-timing-spread", 1.2), "1.20");
assert.strictEqual(formatSliderBadgeValue("option-move-pace", 12.5), "12.50");

mockElementsById["badge-option-depth"].trigger("click");
const depthInlineEditor = depthSliderHeader.querySelector("input");
assert.ok(depthInlineEditor, "Clicking slider badge must spawn inline input editor");
assert.strictEqual(mockElementsById["badge-option-depth"].classList.contains("hidden"), true);
depthInlineEditor.value = "99";
depthInlineEditor.trigger("keydown", { key: "Enter", preventDefault: () => {} });
assert.strictEqual(
  mockElementsById["option-depth"].value,
  "50",
  "Inline edit must clamp to slider max"
);
assert.strictEqual(mockElementsById["badge-option-depth"].textContent, "50");
assert.strictEqual(mockElementsById["badge-option-depth"].classList.contains("hidden"), false);
assert.strictEqual(depthSliderHeader.querySelector("input"), null);
assert.strictEqual(lastSyncedOptions["option-depth"], 50);

mockElementsById["badge-option-depth"].trigger("click");
const cancelledDepthEditor = depthSliderHeader.querySelector("input");
cancelledDepthEditor.value = "12";
cancelledDepthEditor.trigger("keydown", { key: "Escape", preventDefault: () => {} });
assert.strictEqual(
  mockElementsById["option-depth"].value,
  "50",
  "Escape must cancel inline edit without changing slider"
);

mockElementsById["badge-option-go-movetime"].trigger("click");
const movetimeInlineEditor = movetimeSliderHeader.querySelector("input");
movetimeInlineEditor.value = "320";
movetimeInlineEditor.trigger("blur");
assert.strictEqual(
  mockElementsById["option-go-movetime"].value,
  "320",
  "Search Options inline edit must accept exact 1ms precision without step quantization"
);
assert.strictEqual(mockElementsById["badge-option-go-movetime"].textContent, "320");

mockElementsById["badge-option-go-nodes"].trigger("click");
const nodesInlineEditor = nodesSliderHeader.querySelector("input");
nodesInlineEditor.value = "12345";
nodesInlineEditor.trigger("keydown", { key: "Enter", preventDefault: () => {} });
assert.strictEqual(
  mockElementsById["option-go-nodes"].value,
  "12345",
  "Node limit inline edit must accept any exact integer"
);
assert.strictEqual(mockElementsById["badge-option-go-nodes"].textContent, "12,345");

mockElementsById["badge-option-go-movetime"].trigger("click");
const movetimeOffEditor = movetimeSliderHeader.querySelector("input");
movetimeOffEditor.value = "off";
movetimeOffEditor.trigger("keydown", { key: "Enter", preventDefault: () => {} });
assert.strictEqual(mockElementsById["option-go-movetime"].value, "0");
assert.strictEqual(mockElementsById["badge-option-go-movetime"].textContent, "Off");

mockElementsById["badge-option-reflex-multiplier"].trigger("click");
const reflexOffEditor = reflexSliderHeader.querySelector("input");
reflexOffEditor.value = "off";
reflexOffEditor.trigger("keydown", { key: "Enter", preventDefault: () => {} });
assert.strictEqual(mockElementsById["option-reflex-multiplier"].value, "1");
assert.strictEqual(mockElementsById["badge-option-reflex-multiplier"].textContent, "Off");

const threadsSpinBadge = uciRenderContainer.children[0].querySelector(".badge");
threadsSpinBadge.trigger("click");
const threadsSliderHeader = threadsSpinBadge.parentNode;
const threadsInlineEditor = threadsSliderHeader.querySelector("input");
assert.ok(threadsInlineEditor, "Dynamic UCI spin badge must also support inline editing");
threadsInlineEditor.value = "16";
threadsInlineEditor.trigger("keydown", { key: "Enter", preventDefault: () => {} });
assert.strictEqual(spinRangeInput.value, "16");
assert.strictEqual(threadsSpinBadge.textContent, "16");
assert.strictEqual(updatedUciValues["Threads"], 16);

const socketCountBeforeInvalidUrlProbe = MockWebSocket.instances.length;
probeEngineUciOptions("http://localhost:8000/not-ws", onProbeComplete);
assert.strictEqual(
  MockWebSocket.instances.length,
  socketCountBeforeInvalidUrlProbe,
  "probeEngineUciOptions must reject non-ws/wss URLs before opening WebSocket"
);

assert.strictEqual(
  mockElementsById["option-go-nodes"].step,
  "1",
  "Unaligned exact node value must relax step to 1"
);
mockElementsById["option-go-nodes"].trigger("pointerdown");
assert.strictEqual(
  mockElementsById["option-go-nodes"].step,
  "10000",
  "Slider drag start must restore original step"
);
applyConfigProfile(
  { "option-go-movetime": 320, "option-auto-queue": false },
  {},
  { shouldMarkSaved: false }
);
assert.strictEqual(mockElementsById["option-go-movetime"].value, "320");
assert.strictEqual(mockElementsById["option-go-movetime"].step, "1");
assert.strictEqual(lastSyncedOptions["option-auto-queue"], false);

renderDynamicUciOptions(
  [{ name: "Threads", type: "spin", default: "1", min: 1, max: 64 }],
  {},
  uciOptionsContainerElement,
  null
);
uciOptionsDetailsElement.open = true;
engineUrlInput.value = "";
handleExtensionOptionChange("option-url-api-stockfish");
assert.ok(
  uciOptionsContainerElement.children.some((childElement) =>
    childElement.textContent.includes("Invalid WebSocket URL")
  ),
  "Clearing WebSocket URL with open UCI panel must clear stale controls and show URL error"
);

let localStorageWriteCount = 0;
const originalLocalSet = global.chrome.storage.local.set;
global.chrome.storage.local.set = (storagePayload) => {
  localStorageWriteCount++;
  originalLocalSet(storagePayload);
};
mockElementsById["option-depth"].value = "12";
handleExtensionOptionChange("option-depth");
assert.deepStrictEqual(
  Object.keys(lastSyncedOptions),
  ["option-depth"],
  "handleExtensionOptionChange must write only the changed key to sync storage"
);
assert.strictEqual(
  localStorageWriteCount,
  0,
  "handleExtensionOptionChange must skip redundant local activeConfigName: null writes"
);
global.chrome.storage.local.set = originalLocalSet;

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

const prevTabsQuery = global.chrome.tabs.query;
global.chrome.tabs.query = (_queryFilter, onTabs) => onTabs(undefined);
assert.doesNotThrow(() => {
  handleExtensionOptionChange("option-depth");
}, "notifyActiveChessComTabs must not throw when tabs.query returns undefined");
global.chrome.tabs.query = prevTabsQuery;

const storageReadWarnings = [];
const originalConsoleWarn = console.warn;
console.warn = (...warningArgs) => storageReadWarnings.push(warningArgs.join(" "));
global.chrome.runtime = { lastError: { message: "Simulated storage read failure" } };
initializeOptionsPage();
delete global.chrome.runtime;
console.warn = originalConsoleWarn;
assert.ok(
  storageReadWarnings.some((message) => message.includes("Simulated storage read failure")),
  "readChromeStorage must surface chrome.runtime.lastError via console.warn"
);

const spinBadgeElement = uciRenderContainer.children[0].querySelector(".badge");
assert.strictEqual(spinBadgeElement.tagName, "BUTTON", "Dynamic UCI spin badge must render as a button");
assert.strictEqual(
  uciRenderContainer.children[0].querySelector("label").attributes.for,
  spinRangeInput.id,
  "Dynamic UCI spin label must match slider id"
);
assert.ok(
  spinRangeInput.style.getPropertyValue("--slider-progress").endsWith("%"),
  "Dynamic UCI range slider must update --slider-progress fill"
);
assert.strictEqual(
  mockElementsById["option-depth"].style.getPropertyValue("--slider-progress"),
  "6.00%",
  "Static range slider must compute --slider-progress from restored default value"
);
mockElementsById["option-depth"].value = "12";
mockElementsById["option-depth"].trigger("input");
assert.strictEqual(
  mockElementsById["option-depth"].style.getPropertyValue("--slider-progress"),
  "24.00%",
  "Dragging static range slider must update --slider-progress fill"
);

MockWebSocket.instances = [];
probeEngineUciOptions("ws://localhost:8000/error-check", onProbeComplete);
assert.strictEqual(
  uciOptionsContainerElement.attributes["aria-busy"],
  "true",
  "UCI container must set aria-busy=true while probing"
);
assert.strictEqual(
  uciOptionsContainerElement.querySelector(".uci-skeleton"),
  null,
  "UCI container must not render a loading skeleton while probing"
);
assert.strictEqual(
  uciOptionsContainerElement.children[0].className,
  "status-text",
  "UCI probing must render plain italic status-text"
);
MockWebSocket.instances[0].trigger("error");
assert.strictEqual(
  uciOptionsContainerElement.attributes["aria-busy"],
  "false",
  "UCI container must clear aria-busy after probe error"
);
assert.strictEqual(
  uciOptionsContainerElement.querySelector(".uci-retry-btn"),
  null,
  "Failed UCI probe must render simple italic text without a Retry button"
);
assert.strictEqual(
  uciOptionsContainerElement.children[0].className,
  "status-text",
  "Failed UCI probe must use plain status-text class"
);

mockElementsById["config-save-name"].value = "   ";
mockElementsById["config-save-name"].trigger("input");
assert.strictEqual(
  mockElementsById["config-save-confirm"].disabled,
  true,
  "Whitespace-only config name must keep Save button disabled"
);
mockElementsById["config-save-name"].value = "Blitz";
mockElementsById["config-save-name"].trigger("input");
assert.strictEqual(
  mockElementsById["config-save-confirm"].disabled,
  false,
  "Non-empty config name must enable Save button"
);
mockElementsById["config-save-name"].value = "";
mockElementsById["config-save-name"].trigger("input");
assert.strictEqual(
  mockElementsById["config-save-confirm"].disabled,
  true,
  "Clearing config name input must disable Save button"
);

const mockScrollContainer = {
  scrollTop: 0,
  getBoundingClientRect: () => ({ top: 44, bottom: 530 })
};
const prevDocumentQuerySelector = global.document.querySelector;
global.document.querySelector = (selector) =>
  selector === ".settings-container" ? mockScrollContainer : null;

const autoQueueGroupElement = mockElementsById["auto-queue-group"];
const autoQueueRowAnchor = {
  getBoundingClientRect: () => ({ top: 470 - mockScrollContainer.scrollTop, bottom: 496 - mockScrollContainer.scrollTop })
};
autoQueueGroupElement.previousElementSibling = autoQueueRowAnchor;
autoQueueGroupElement.getBoundingClientRect = () => ({
  top: 506 - mockScrollContainer.scrollTop,
  bottom: 720 - mockScrollContainer.scrollTop
});

mockElementsById["option-auto-queue"].checked = true;
handleExtensionOptionChange("option-auto-queue");
assert.strictEqual(
  mockScrollContainer.scrollTop,
  200,
  "Enabling an Automation toggle must scroll .settings-container to reveal its expanded panel above the sticky footer"
);

mockScrollContainer.scrollTop = 0;
autoQueueGroupElement.getBoundingClientRect = () => ({
  top: 506 - mockScrollContainer.scrollTop,
  bottom: 1200 - mockScrollContainer.scrollTop
});
handleExtensionOptionChange("option-auto-queue");
assert.strictEqual(
  mockScrollContainer.scrollTop,
  416,
  "Auto-scroll must stop before scrolling the toggle anchor row above the top edge"
);

delete autoQueueGroupElement.getBoundingClientRect;
delete autoQueueGroupElement.previousElementSibling;
global.document.querySelector = prevDocumentQuerySelector;

let deferredLocalGetCallback = null;
const originalLocalGet = global.chrome.storage.local.get;
let hiddenNameFocusCount = 0;
const originalNameFocus = mockElementsById["config-save-name"].focus;
mockElementsById["config-save-name"].focus = () => {
  hiddenNameFocusCount++;
};
global.chrome.storage.local.get = (_requestedKeys, onLoaded) => {
  deferredLocalGetCallback = () => onLoaded({});
};
setConfigPopoverOpen(true);
setConfigPopoverOpen(false, { shouldRestoreFocus: true });
assert.ok(deferredLocalGetCallback, "Opening Configs popover must trigger async storage read");
deferredLocalGetCallback();
assert.strictEqual(
  hiddenNameFocusCount,
  0,
  "Closing Configs popover before async storage resolves must not focus hidden input"
);
global.chrome.storage.local.get = originalLocalGet;
mockElementsById["config-save-name"].focus = originalNameFocus;

console.log("All dynamic UCI UI behavioral tests passed.");
