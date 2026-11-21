const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { EXTENSION_ROOT_DIR } = require("./helpers");

const { DEFAULT_EXTENSION_OPTIONS } = require(path.join(EXTENSION_ROOT_DIR, "js/loader.js"));
const { EXTENSION_OPTION_KEY } = require(path.join(EXTENSION_ROOT_DIR, "js/Mint.js"));

const manifest = JSON.parse(
  fs.readFileSync(path.join(EXTENSION_ROOT_DIR, "manifest.json"), "utf8")
);
const optionsHtml = fs.readFileSync(
  path.join(EXTENSION_ROOT_DIR, "html/options.html"),
  "utf8"
);
const optionsCss = fs.readFileSync(
  path.join(EXTENSION_ROOT_DIR, "css/options.css"),
  "utf8"
);
const readme = fs.readFileSync(path.join(EXTENSION_ROOT_DIR, "..", "README.md"), "utf8");

// 1. Cross-boundary option key parity across loader.js, Mint.js, and options.html
const defaultOptionKeys = Object.keys(DEFAULT_EXTENSION_OPTIONS).sort();
const mintOptionKeys = Object.values(EXTENSION_OPTION_KEY).sort();
assert.deepStrictEqual(
  defaultOptionKeys,
  mintOptionKeys,
  "DEFAULT_EXTENSION_OPTIONS keys in loader.js must match EXTENSION_OPTION_KEY values in Mint.js"
);
for (const optionKey of defaultOptionKeys) {
  assert.ok(
    optionsHtml.includes(`id="${optionKey}"`),
    `options.html must define a control with id="${optionKey}"`
  );
}

// 2. Manifest, asset existence, script load order, and version parity
assert.deepStrictEqual(manifest.content_scripts[0].js, ["js/loader.js"]);
assert.deepStrictEqual(manifest.content_scripts[0].css, ["css/evalbar.css"]);

const manifestAssets = []
  .concat(manifest.content_scripts[0].js, manifest.content_scripts[0].css)
  .concat([manifest.action.default_popup])
  .concat(Object.values(manifest.icons));
for (const relativePath of manifestAssets) {
  assert.ok(
    fs.existsSync(path.join(EXTENSION_ROOT_DIR, relativePath)),
    `Missing manifest asset: ${relativePath}`
  );
}
for (const match of optionsHtml.matchAll(/(?:href|src)="\.\.\/([^"]+)"/g)) {
  assert.ok(
    fs.existsSync(path.join(EXTENSION_ROOT_DIR, match[1])),
    `Missing options.html asset: ${match[1]}`
  );
}

const scriptOrder = [...optionsHtml.matchAll(/<script src="\.\.\/js\/([^"]+)"/g)].map(
  (match) => match[1]
);
assert.ok(
  scriptOrder.indexOf("loader.js") !== -1 &&
    scriptOrder.indexOf("options.js") !== -1 &&
    scriptOrder.indexOf("loader.js") < scriptOrder.indexOf("options.js"),
  "loader.js must load before options.js in options.html"
);

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

// 3. MV3 CSP hygiene: no inline scripts, inline styles, or inline event attributes
assert.strictEqual(
  /<script(?![^>]*\bsrc=)[^>]*>/i.test(optionsHtml),
  false,
  "options.html must not contain inline <script> blocks"
);
assert.strictEqual(
  /<style\b/i.test(optionsHtml),
  false,
  "options.html must not contain inline <style> blocks"
);
assert.strictEqual(
  /\son[a-z]+\s*=/i.test(optionsHtml),
  false,
  "options.html must not contain inline event handler attributes"
);
assert.strictEqual(
  /\sstyle\s*=/i.test(optionsHtml),
  false,
  "options.html must not contain inline style attributes"
);

// 4. Required popup JS DOM hooks, theme tokens, and accessibility contracts
const requiredStructuralIds = [
  "go-command-details",
  "engine-options-details",
  "advanced-timing-details",
  "engine-options-container",
  "auto-queue-group",
  "theme-toggle",
  "config-toggle",
  "config-popover",
  "config-close",
  "config-save-name",
  "config-save-confirm",
  "config-load-list",
  "config-status"
];
for (const elementId of requiredStructuralIds) {
  assert.ok(
    optionsHtml.includes(`id="${elementId}"`),
    `Missing required popup DOM hook: ${elementId}`
  );
}

for (const themeName of ["dark", "light", "black", "chesscom"]) {
  assert.ok(
    optionsCss.includes(`[data-theme="${themeName}"]`),
    `options.css must define [data-theme="${themeName}"] variables`
  );
}
assert.ok(
  optionsCss.includes("prefers-reduced-motion: reduce"),
  "options.css must respect prefers-reduced-motion"
);
assert.ok(
  optionsCss.includes("--slider-progress"),
  "options.css must consume --slider-progress custom property"
);
assert.ok(
  optionsHtml.includes('<label class="title" for="option-depth">'),
  "Range sliders must use explicit <label for> associations"
);
assert.ok(
  optionsHtml.includes('<button type="button" class="badge" id="badge-option-depth"'),
  "Editable slider badges must be keyboard-accessible buttons"
);
assert.ok(
  optionsHtml.includes('id="config-status"') &&
    optionsHtml.includes('role="status"') &&
    optionsHtml.includes('aria-live="polite"'),
  "Config status feedback must use a polite ARIA live region"
);
assert.ok(
  optionsHtml.includes('aria-controls="config-popover"'),
  "Config toggle button must reference config-popover via aria-controls"
);
assert.ok(
  /id="config-save-confirm"[^>]*\bdisabled\b/.test(optionsHtml),
  "Config save button must start disabled when input is empty"
);

// 5. loader.js ISOLATED-world message bridge and context-invalidation recovery
const loaderSource = fs.readFileSync(path.join(EXTENSION_ROOT_DIR, "js/loader.js"), "utf8");
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
let onMessageListener = null;
const mockChrome = {
  runtime: {
    id: "test-extension-id",
    getURL: (relativePath) => "chrome-extension://test-extension-id/" + relativePath,
    onMessage: {
      addListener: (listener) => {
        onMessageListener = listener;
      }
    }
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
assert.strictEqual(
  typeof onMessageListener,
  "function",
  "loader.js must register chrome.runtime.onMessage listener"
);

let receivedAck = null;
onMessageListener(
  { type: "UpdateOptions", extensionOptions: { "option-depth": 5 } },
  {},
  (response) => {
    receivedAck = response;
  }
);
assert.strictEqual(
  receivedAck?.ok,
  true,
  "loader.js must acknowledge UpdateOptions messages synchronously via sendResponse"
);

let unrelatedAckCalled = false;
onMessageListener({ type: "OtherMessage" }, {}, () => {
  unrelatedAckCalled = true;
});
assert.strictEqual(
  unrelatedAckCalled,
  false,
  "loader.js must ignore non-UpdateOptions runtime messages"
);

delete mockChrome.storage;
delete mockChrome.runtime.id;
assert.doesNotThrow(() => {
  windowListeners["BetterMintGetOptions"][0]({ detail: { requestId: 1 } });
}, "loader.js must not throw when chrome.storage is undefined after extension reload");
assert.strictEqual(
  (windowListeners["BetterMintGetOptions"] || []).length,
  0,
  "loader.js must detach BetterMintGetOptions listener once context is invalidated"
);

// 6. rules.json Declarative Net Request contracts
const dnrRules = JSON.parse(
  fs.readFileSync(path.join(EXTENSION_ROOT_DIR, "rules.json"), "utf8")
);
assert.ok(Array.isArray(dnrRules) && dnrRules.length >= 4, "rules.json must define all DNR rules");
const ruleIds = new Set(dnrRules.map((rule) => rule.id));
assert.strictEqual(ruleIds.size, dnrRules.length, "rules.json must have unique rule IDs");

const stripCspRule = dnrRules.find((rule) => rule.action?.type === "modifyHeaders");
assert.ok(stripCspRule, "rules.json must include a modifyHeaders rule to strip report-only CSP headers");
const removedHeaders = (stripCspRule.action.responseHeaders || [])
  .filter((entry) => entry.operation === "remove")
  .map((entry) => entry.header.toLowerCase());
assert.ok(
  removedHeaders.includes("content-security-policy-report-only"),
  "modifyHeaders rule must remove content-security-policy-report-only"
);
assert.ok(
  removedHeaders.includes("report-to") && removedHeaders.includes("reporting-endpoints"),
  "modifyHeaders rule must remove report-to and reporting-endpoints"
);
assert.ok(
  stripCspRule.condition?.requestDomains?.includes("chess.com"),
  "modifyHeaders rule must scope to chess.com"
);
assert.ok(
  ["main_frame", "sub_frame", "script"].every((type) =>
    stripCspRule.condition?.resourceTypes?.includes(type)
  ),
  "modifyHeaders rule must cover main_frame, sub_frame, and script responses"
);

const blockCspReportRule = dnrRules.find(
  (rule) =>
    rule.action?.type === "block" &&
    rule.condition?.resourceTypes?.includes("csp_report")
);
assert.ok(blockCspReportRule, "rules.json must block csp_report requests");
assert.ok(
  blockCspReportRule.condition?.initiatorDomains?.includes("chess.com"),
  "csp_report block rule must scope to chess.com initiators"
);

console.log("Extension contract tests passed.");
