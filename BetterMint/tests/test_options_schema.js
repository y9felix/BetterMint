const assert = require("assert");
const fs = require("fs");
const path = require("path");

const extensionRootDir = path.join(__dirname, "..");
const { DEFAULT_EXTENSION_OPTIONS } = require(path.join(extensionRootDir, "js/loader.js"));
const manifest = JSON.parse(
  fs.readFileSync(path.join(extensionRootDir, "manifest.json"), "utf8")
);
const optionsHtml = fs.readFileSync(
  path.join(extensionRootDir, "html/options.html"),
  "utf8"
);

const actualOptionKeys = Object.keys(DEFAULT_EXTENSION_OPTIONS).sort();

const expectedOptionKeys = [
  "option-auto-queue",
  "option-clock-threshold",
  "option-depth",
  "option-evaluation-bar",
  "option-go-movetime",
  "option-go-nodes",
  "option-human-like-moves",
  "option-legit-auto-move",
  "option-move-analysis",
  "option-move-pace",
  "option-opening-moves-threshold",
  "option-opening-multiplier",
  "option-physical-floor",
  "option-reflex-multiplier",
  "option-rematch-first",
  "option-show-hints",
  "option-timing-spread",
  "option-url-api-stockfish"
].sort();

assert.deepStrictEqual(
  actualOptionKeys,
  expectedOptionKeys,
  "Defaults must match the active key set"
);
assert.deepStrictEqual(manifest.content_scripts[0].js, ["js/loader.js"]);

const scriptOrder = [...optionsHtml.matchAll(/<script src="\.\.\/js\/([^"]+)"/g)].map(
  (match) => match[1]
);
assert.ok(
  scriptOrder.indexOf("loader.js") < scriptOrder.indexOf("options.js"),
  "loader.js must load first"
);

for (const optionKey of actualOptionKeys) {
  assert.ok(optionsHtml.includes(`id="${optionKey}"`), "No control for " + optionKey);
}

const readme = fs.readFileSync(path.join(extensionRootDir, "..", "README.md"), "utf8");
assert.match(manifest.version, /^\d+\.\d+\.\d+$/, "manifest.json version must be semver");
assert.ok(
  optionsHtml.includes(`<span class="version-badge">v${manifest.version}</span>`),
  `options.html version badge must match manifest.json (${manifest.version})`
);
assert.ok(
  readme.includes(`version-${manifest.version}-`) &&
    readme.includes(`/releases/tag/v${manifest.version}`),
  `README.md version badge and release link must match manifest.json (${manifest.version})`
);

const vm = require("vm");
const loaderSource = fs.readFileSync(path.join(extensionRootDir, "js/loader.js"), "utf8");
const windowListeners = {};
const mockWindow = {
  location: { protocol: "https:" },
  addEventListener: (eventName, listener) => {
    (windowListeners[eventName] ||= []).push(listener);
  },
  removeEventListener: (eventName, listener) => {
    windowListeners[eventName] = (windowListeners[eventName] || []).filter((fn) => fn !== listener);
  },
  dispatchEvent: () => {}
};
const mockChrome = {
  runtime: {
    id: "test-extension-id",
    getURL: (relativePath) => "chrome-extension://test-extension-id/" + relativePath,
    onMessage: { addListener: () => {} }
  },
  storage: {
    sync: { get: (_defaults, cb) => cb({}) },
    local: { get: (_keys, cb) => cb({}) }
  }
};
const mockDocument = {
  head: { prepend: () => {} },
  documentElement: { prepend: () => {} },
  createElement: () => ({ remove: () => {} })
};
vm.runInNewContext(loaderSource, {
  window: mockWindow,
  document: mockDocument,
  chrome: mockChrome,
  CustomEvent: function CustomEvent(type, init) {
    this.type = type;
    this.detail = init?.detail;
  },
  console
});

assert.strictEqual(
  (windowListeners["BetterMintGetOptions"] || []).length,
  1,
  "loader.js must register BetterMintGetOptions listener on Chess.com pages"
);

delete mockChrome.storage;
delete mockChrome.runtime.id;
assert.doesNotThrow(() => {
  windowListeners["BetterMintGetOptions"][0]({ detail: { requestId: 1 } });
}, "loader.js must not throw when chrome.storage is undefined after extension reload");
assert.strictEqual(
  (windowListeners["BetterMintGetOptions"] || []).length,
  0,
  "loader.js must detach its BetterMintGetOptions listener once context is invalidated"
);

console.log("Options schema tests passed.");
