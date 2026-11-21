const path = require("path");

const EXTENSION_ROOT_DIR = path.join(__dirname, "..");

class MockWebSocket {
  constructor(engineUrl, options = {}) {
    if (MockWebSocket.rejectPrefixes.some((prefix) => String(engineUrl).startsWith(prefix))) {
      throw new Error(`Invalid URL: ${engineUrl}`);
    }
    this.url = engineUrl;
    this.readyState = options.autoOpen ? MockWebSocket.OPEN : MockWebSocket.CONNECTING;
    this.listeners = {};
    this.sentMessages = [];
    this.isClosed = false;
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
    if (this.isClosed) return;
    this.isClosed = true;
    this.readyState = MockWebSocket.CLOSED;
    this.trigger("close");
  }

  trigger(eventName, messagePayload) {
    const eventListeners = (this.listeners[eventName] || []).slice();
    eventListeners.forEach((listener) =>
      listener(messagePayload !== undefined ? { data: messagePayload } : {})
    );
  }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.trigger("open");
  }

  static reset() {
    MockWebSocket.instances = [];
    MockWebSocket.rejectPrefixes = [];
  }
}

MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSED = 3;
MockWebSocket.instances = [];
MockWebSocket.rejectPrefixes = [];

function createAutoOpenWebSocketClass() {
  class AutoOpenMockWebSocket extends MockWebSocket {
    constructor(engineUrl) {
      super(engineUrl, { autoOpen: true });
    }
  }
  AutoOpenMockWebSocket.CONNECTING = MockWebSocket.CONNECTING;
  AutoOpenMockWebSocket.OPEN = MockWebSocket.OPEN;
  AutoOpenMockWebSocket.CLOSED = MockWebSocket.CLOSED;
  return AutoOpenMockWebSocket;
}

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.id = "";
    this.className = "";
    this._innerHTML = "";
    this._textContent = "";
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.type = "";
    this.value = "";
    this.checked = false;
    this.selected = false;
    this.disabled = false;
    this.min = "";
    this.max = "";
    this.step = "";
    this.open = false;
    this.title = "";
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
    const eventListeners = (this.listeners[eventName] || []).slice();
    eventListeners.forEach((listener) => listener.call(this, eventPayload));
  }

  querySelector(selector) {
    for (const childElement of this.children) {
      if (selector === childElement.tagName.toLowerCase()) return childElement;
      if (
        selector.startsWith(".") &&
        (childElement.className.split(" ").includes(selector.substring(1)) ||
          childElement.classList.contains(selector.substring(1)))
      ) {
        return childElement;
      }
      const matchingDescendant = childElement.querySelector(selector);
      if (matchingDescendant) return matchingDescendant;
    }
    return null;
  }
}

function createMockChrome(initialSyncData = {}) {
  const localStore = {};
  let lastSyncedOptions = null;
  let localWriteCount = 0;

  const chrome = {
    storage: {
      sync: {
        get: (_defaultOptions, onLoaded) => onLoaded(Object.assign({}, initialSyncData)),
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
        set: (storagePayload) => {
          localWriteCount++;
          Object.assign(localStore, storagePayload);
        }
      }
    },
    tabs: {
      query: (_queryFilter, onTabs) => onTabs([{ id: 42 }]),
      sendMessage: () => Promise.resolve()
    }
  };

  return {
    chrome,
    localStore,
    getLastSyncedOptions: () => lastSyncedOptions,
    getLocalWriteCount: () => localWriteCount,
    resetLocalWriteCount: () => {
      localWriteCount = 0;
    }
  };
}

function createPopupFixture(initialSyncData = { "option-url-api-stockfish": "ws://localhost:8000/lazy1" }) {
  const elementsById = {
    "engine-options-container": new MockElement("div"),
    "engine-options-details": Object.assign(new MockElement("details"), { open: false }),
    "option-url-api-stockfish": Object.assign(new MockElement("input"), { type: "text" }),
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
    "theme-toggle": new MockElement("button"),
    "config-toggle": new MockElement("button"),
    "config-popover": new MockElement("div"),
    "config-close": new MockElement("button"),
    "config-load-list": new MockElement("div"),
    "config-save-name": new MockElement("input"),
    "config-save-confirm": new MockElement("button"),
    "config-status": new MockElement("span")
  };

  elementsById["config-popover"].classList.add("hidden");
  elementsById["config-status"].classList.add("hidden");

  const sliderHeaders = {};
  for (const badgeId of [
    "badge-option-depth",
    "badge-option-go-movetime",
    "badge-option-go-nodes",
    "badge-option-reflex-multiplier"
  ]) {
    const header = new MockElement("div");
    header.appendChild(elementsById[badgeId]);
    sliderHeaders[badgeId] = header;
  }

  const chromeFixture = createMockChrome(initialSyncData);
  const documentStub = {
    documentElement: { dataset: {} },
    body: new MockElement("body"),
    createElement: (tagName) => new MockElement(tagName),
    getElementById: (elementId) => elementsById[elementId] || null
  };

  const {
    DEFAULT_EXTENSION_OPTIONS,
    getEngineOptionsStorageKey
  } = require(path.join(EXTENSION_ROOT_DIR, "js/loader.js"));

  global.document = documentStub;
  global.WebSocket = MockWebSocket;
  global.DEFAULT_EXTENSION_OPTIONS = DEFAULT_EXTENSION_OPTIONS;
  global.getEngineOptionsStorageKey = getEngineOptionsStorageKey;
  global.chrome = chromeFixture.chrome;

  const optionsModule = require(path.join(EXTENSION_ROOT_DIR, "js/options.js"));

  return {
    elementsById,
    sliderHeaders,
    documentStub,
    DEFAULT_EXTENSION_OPTIONS,
    getEngineOptionsStorageKey,
    optionsModule,
    ...chromeFixture
  };
}

function createMockChessComGame(overrides = {}) {
  const eventHandlers = {};
  const addedMarkings = [];
  const removedMarkingKeys = [];

  const chessComGame = Object.assign(
    {
      getOptions: () => ({ flipped: false }),
      getPlayingAs: () => 1,
      getTurn: () => 1,
      getMode: () => "playing",
      getFEN: () => "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      getLastMove: () => null,
      getLegalMoves: () => [],
      markings: {
        addOne: (marking) => addedMarkings.push(marking),
        addMany: (markings) => addedMarkings.push(...markings),
        removeOne: (markingKey) => removedMarkingKeys.push(markingKey)
      },
      move: () => true,
      on: (eventName, handler) => {
        eventHandlers[eventName] = handler;
      }
    },
    overrides
  );

  return { chessComGame, eventHandlers, addedMarkings, removedMarkingKeys };
}

function createFakeTimers() {
  const timeouts = [];
  const intervals = [];
  const clearedTimeoutIds = [];
  const clearedIntervalIds = [];
  let nextTimeoutId = 1;
  let nextIntervalId = 1000;

  return {
    timeouts,
    intervals,
    clearedTimeoutIds,
    clearedIntervalIds,
    globals: {
      setTimeout: (callback, delayMs) => {
        const entry = { id: nextTimeoutId++, callback, delayMs, isCleared: false };
        timeouts.push(entry);
        return entry.id;
      },
      clearTimeout: (timerId) => {
        clearedTimeoutIds.push(timerId);
        const entry = timeouts.find((item) => item.id === timerId);
        if (entry) entry.isCleared = true;
      },
      setInterval: (callback, delayMs) => {
        const entry = { id: nextIntervalId++, callback, delayMs, isCleared: false };
        intervals.push(entry);
        return entry.id;
      },
      clearInterval: (intervalId) => {
        clearedIntervalIds.push(intervalId);
        const entry = intervals.find((item) => item.id === intervalId);
        if (entry) entry.isCleared = true;
      }
    }
  };
}

function withMockedGlobals(overrides, callback) {
  const saved = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    saved.set(key, {
      existed: Object.prototype.hasOwnProperty.call(global, key),
      value: global[key]
    });
    global[key] = value;
  }
  try {
    return callback();
  } finally {
    for (const [key, descriptor] of saved.entries()) {
      if (descriptor.existed) {
        global[key] = descriptor.value;
      } else {
        delete global[key];
      }
    }
  }
}

function captureConsole(methods, callback) {
  const originals = {};
  const captured = {};
  for (const methodName of methods) {
    originals[methodName] = console[methodName];
    captured[methodName] = [];
    console[methodName] = (...args) => {
      captured[methodName].push(args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" "));
    };
  }
  try {
    callback(captured);
  } finally {
    for (const methodName of methods) {
      console[methodName] = originals[methodName];
    }
  }
  return captured;
}

module.exports = {
  EXTENSION_ROOT_DIR,
  MockWebSocket,
  createAutoOpenWebSocketClass,
  MockElement,
  createMockChrome,
  createPopupFixture,
  createMockChessComGame,
  createFakeTimers,
  withMockedGlobals,
  captureConsole
};
