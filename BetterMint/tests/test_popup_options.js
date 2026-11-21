const assert = require("assert");
const { createPopupFixture, captureConsole } = require("./helpers");

const {
  elementsById,
  sliderHeaders,
  documentStub,
  DEFAULT_EXTENSION_OPTIONS,
  optionsModule,
  localStore,
  chrome,
  getLastSyncedOptions,
  getLocalWriteCount,
  resetLocalWriteCount
} = createPopupFixture();

const {
  THEMES,
  formatSliderBadgeValue,
  applyTheme,
  applyConfigProfile,
  deleteCustomConfigProfile,
  setConfigPopoverOpen,
  initializeOptionsPage,
  handleExtensionOptionChange
} = optionsModule;

initializeOptionsPage();

// 1. Theme cycling, unknown fallback, and persisted theme restore
const themeToggleButton = elementsById["theme-toggle"];
assert.strictEqual(documentStub.documentElement.dataset.theme, "dark");
assert.strictEqual(themeToggleButton.title, "Theme: Dark");
assert.strictEqual(themeToggleButton.attributes["aria-label"], "Theme: Dark");
assert.strictEqual(themeToggleButton.innerHTML, THEMES.dark.iconSvg);

themeToggleButton.trigger("click");
assert.strictEqual(documentStub.documentElement.dataset.theme, "light");
assert.strictEqual(themeToggleButton.title, "Theme: Light");
assert.strictEqual(themeToggleButton.innerHTML, THEMES.light.iconSvg);
assert.strictEqual(localStore.theme, "light");

themeToggleButton.trigger("click");
assert.strictEqual(documentStub.documentElement.dataset.theme, "black");
assert.strictEqual(themeToggleButton.title, "Theme: Black");
assert.strictEqual(themeToggleButton.innerHTML, THEMES.black.iconSvg);
assert.strictEqual(localStore.theme, "black");

themeToggleButton.trigger("click");
assert.strictEqual(documentStub.documentElement.dataset.theme, "chesscom");
assert.strictEqual(themeToggleButton.title, "Theme: Chess.com");
assert.strictEqual(themeToggleButton.innerHTML, THEMES.chesscom.iconSvg);
assert.strictEqual(localStore.theme, "chesscom");

themeToggleButton.trigger("click");
assert.strictEqual(documentStub.documentElement.dataset.theme, "dark");
assert.strictEqual(localStore.theme, "dark");

applyTheme("unknown");
assert.strictEqual(documentStub.documentElement.dataset.theme, "dark");

localStore.theme = "chesscom";
initializeOptionsPage();
assert.strictEqual(documentStub.documentElement.dataset.theme, "chesscom");
assert.strictEqual(themeToggleButton.title, "Theme: Chess.com");

localStore.theme = "black";
initializeOptionsPage();
assert.strictEqual(documentStub.documentElement.dataset.theme, "black");
assert.strictEqual(themeToggleButton.title, "Theme: Black");

// 2. Default human-like timing schema values
assert.strictEqual(DEFAULT_EXTENSION_OPTIONS["option-move-pace"], 12.5);
assert.strictEqual(DEFAULT_EXTENSION_OPTIONS["option-physical-floor"], 600);
assert.strictEqual(DEFAULT_EXTENSION_OPTIONS["option-timing-spread"], 0.80);
assert.strictEqual(DEFAULT_EXTENSION_OPTIONS["option-reflex-multiplier"], 0.25);
assert.strictEqual(DEFAULT_EXTENSION_OPTIONS["option-opening-moves-threshold"], 10);
assert.strictEqual(DEFAULT_EXTENSION_OPTIONS["option-opening-multiplier"], 0.40);
assert.strictEqual(DEFAULT_EXTENSION_OPTIONS["option-clock-threshold"], 180);

// 3. Config popover empty state, validation, save, load, delete, and manual-edit highlight clear
setConfigPopoverOpen(true);
assert.strictEqual(
  elementsById["config-load-list"].children.length,
  1,
  "Empty Load list must show empty-state message"
);
assert.ok(
  elementsById["config-load-list"].children[0].textContent.includes("No saved configs yet")
);
setConfigPopoverOpen(false);

elementsById["config-toggle"].trigger("click");
assert.strictEqual(elementsById["config-popover"].classList.contains("hidden"), false);

elementsById["config-save-name"].value = "   ";
elementsById["config-save-name"].trigger("input");
assert.strictEqual(
  elementsById["config-save-confirm"].disabled,
  true,
  "Whitespace-only config name must keep Save button disabled"
);
elementsById["config-save-confirm"].trigger("click");
assert.strictEqual((localStore.customConfigs || []).length, 0);

elementsById["option-depth"].value = "16";
elementsById["config-save-name"].value = "My Tournament";
elementsById["config-save-name"].trigger("input");
assert.strictEqual(elementsById["config-save-confirm"].disabled, false);
elementsById["config-save-confirm"].trigger("click");
assert.strictEqual(elementsById["config-popover"].classList.contains("hidden"), true);
assert.strictEqual(localStore.activeConfigName, "My Tournament");
assert.strictEqual(localStore.customConfigs.length, 1);

handleExtensionOptionChange("option-depth");
assert.strictEqual(
  localStore.activeConfigName,
  null,
  "Manual edit must clear activeConfigName highlight"
);

elementsById["option-depth"].value = "8";
setConfigPopoverOpen(true);
assert.strictEqual(
  elementsById["config-load-list"].children.length,
  1,
  "Load list must render saved custom configs"
);
elementsById["config-load-list"].children[0].querySelector("button").trigger("click");
assert.strictEqual(elementsById["option-depth"].value, "16");
assert.strictEqual(localStore.activeConfigName, "My Tournament");

deleteCustomConfigProfile("My Tournament");
assert.strictEqual(localStore.customConfigs.length, 0);
assert.strictEqual(localStore.activeConfigName, null);

// 4. Config profile application and disclosure group visibility
applyConfigProfile(
  { "option-auto-queue": false, "option-legit-auto-move": true },
  {},
  { shouldMarkSaved: false }
);
assert.strictEqual(getLastSyncedOptions()["option-auto-queue"], false);
assert.strictEqual(getLastSyncedOptions()["option-legit-auto-move"], true);
assert.strictEqual(elementsById["auto-queue-group"].classList.contains("hidden"), true);

elementsById["option-auto-queue"].checked = true;
handleExtensionOptionChange("option-auto-queue");
assert.strictEqual(
  elementsById["auto-queue-group"].classList.contains("hidden"),
  false,
  "Rematch first group must appear when Auto Queue is enabled"
);

elementsById["option-auto-queue"].checked = false;
handleExtensionOptionChange("option-auto-queue");
assert.strictEqual(
  elementsById["auto-queue-group"].classList.contains("hidden"),
  true,
  "Rematch first group must hide when Auto Queue is disabled"
);

// 5. Slider badge formatting, --slider-progress fill, and inline badge editing
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

elementsById["option-depth"].value = "12";
elementsById["option-depth"].trigger("input");
assert.strictEqual(
  elementsById["option-depth"].style.getPropertyValue("--slider-progress"),
  "24.00%",
  "Dragging static range slider must update --slider-progress fill"
);

elementsById["badge-option-depth"].trigger("click");
const depthInlineEditor = sliderHeaders["badge-option-depth"].querySelector("input");
assert.ok(depthInlineEditor, "Clicking slider badge must spawn inline input editor");
assert.strictEqual(elementsById["badge-option-depth"].classList.contains("hidden"), true);
depthInlineEditor.value = "99";
depthInlineEditor.trigger("keydown", { key: "Enter", preventDefault: () => {} });
assert.strictEqual(elementsById["option-depth"].value, "50", "Inline edit must clamp to slider max");
assert.strictEqual(elementsById["badge-option-depth"].textContent, "50");
assert.strictEqual(elementsById["badge-option-depth"].classList.contains("hidden"), false);
assert.strictEqual(sliderHeaders["badge-option-depth"].querySelector("input"), null);
assert.strictEqual(getLastSyncedOptions()["option-depth"], 50);

elementsById["badge-option-depth"].trigger("click");
const cancelledDepthEditor = sliderHeaders["badge-option-depth"].querySelector("input");
cancelledDepthEditor.value = "12";
cancelledDepthEditor.trigger("keydown", { key: "Escape", preventDefault: () => {} });
assert.strictEqual(
  elementsById["option-depth"].value,
  "50",
  "Escape must cancel inline edit without changing slider"
);

elementsById["badge-option-go-movetime"].trigger("click");
const movetimeInlineEditor = sliderHeaders["badge-option-go-movetime"].querySelector("input");
movetimeInlineEditor.value = "320";
movetimeInlineEditor.trigger("blur");
assert.strictEqual(
  elementsById["option-go-movetime"].value,
  "320",
  "Search Options inline edit must accept exact 1ms precision without step quantization"
);
assert.strictEqual(elementsById["badge-option-go-movetime"].textContent, "320");

elementsById["badge-option-go-nodes"].trigger("click");
const nodesInlineEditor = sliderHeaders["badge-option-go-nodes"].querySelector("input");
nodesInlineEditor.value = "12345";
nodesInlineEditor.trigger("keydown", { key: "Enter", preventDefault: () => {} });
assert.strictEqual(elementsById["option-go-nodes"].value, "12345");
assert.strictEqual(elementsById["badge-option-go-nodes"].textContent, "12,345");
assert.strictEqual(
  elementsById["option-go-nodes"].step,
  "1",
  "Unaligned exact node value must relax range step to 1 for Chromium compatibility"
);

elementsById["option-go-nodes"].trigger("pointerdown");
assert.strictEqual(
  elementsById["option-go-nodes"].step,
  "10000",
  "Slider drag start must restore original step"
);

elementsById["badge-option-go-movetime"].trigger("click");
const movetimeOffEditor = sliderHeaders["badge-option-go-movetime"].querySelector("input");
movetimeOffEditor.value = "off";
movetimeOffEditor.trigger("keydown", { key: "Enter", preventDefault: () => {} });
assert.strictEqual(elementsById["option-go-movetime"].value, "0");
assert.strictEqual(elementsById["badge-option-go-movetime"].textContent, "Off");

elementsById["badge-option-reflex-multiplier"].trigger("click");
const reflexOffEditor = sliderHeaders["badge-option-reflex-multiplier"].querySelector("input");
reflexOffEditor.value = "off";
reflexOffEditor.trigger("keydown", { key: "Enter", preventDefault: () => {} });
assert.strictEqual(elementsById["option-reflex-multiplier"].value, "1");
assert.strictEqual(elementsById["badge-option-reflex-multiplier"].textContent, "Off");

applyConfigProfile(
  { "option-go-movetime": 320, "option-auto-queue": false },
  {},
  { shouldMarkSaved: false }
);
assert.strictEqual(elementsById["option-go-movetime"].value, "320");
assert.strictEqual(elementsById["option-go-movetime"].step, "1");

// 6. Single-key storage writes and error/race resilience
resetLocalWriteCount();
elementsById["option-depth"].value = "12";
handleExtensionOptionChange("option-depth");
assert.deepStrictEqual(
  Object.keys(getLastSyncedOptions()),
  ["option-depth"],
  "handleExtensionOptionChange must write only the changed key to sync storage"
);
assert.strictEqual(
  getLocalWriteCount(),
  0,
  "handleExtensionOptionChange must skip redundant local activeConfigName: null writes"
);

const prevTabsQuery = chrome.tabs.query;
chrome.tabs.query = (_queryFilter, onTabs) => onTabs(undefined);
try {
  assert.doesNotThrow(() => {
    handleExtensionOptionChange("option-depth");
  }, "notifyActiveChessComTabs must not throw when tabs.query returns undefined");
} finally {
  chrome.tabs.query = prevTabsQuery;
}

chrome.runtime = { lastError: { message: "Simulated storage read failure" } };
const capturedWarnings = captureConsole(["warn"], () => {
  try {
    initializeOptionsPage();
  } finally {
    delete chrome.runtime;
  }
});
assert.ok(
  capturedWarnings.warn.some((message) => message.includes("Simulated storage read failure")),
  "readChromeStorage must surface chrome.runtime.lastError via console.warn"
);

let deferredLocalGetCallback = null;
const originalLocalGet = chrome.storage.local.get;
let hiddenNameFocusCount = 0;
const originalNameFocus = elementsById["config-save-name"].focus;
elementsById["config-save-name"].focus = () => {
  hiddenNameFocusCount++;
};
chrome.storage.local.get = (_requestedKeys, onLoaded) => {
  deferredLocalGetCallback = () => onLoaded({});
};
try {
  setConfigPopoverOpen(true);
  setConfigPopoverOpen(false, { shouldRestoreFocus: true });
  assert.ok(deferredLocalGetCallback, "Opening Configs popover must trigger async storage read");
  deferredLocalGetCallback();
  assert.strictEqual(
    hiddenNameFocusCount,
    0,
    "Closing Configs popover before async storage resolves must not focus hidden input"
  );
} finally {
  chrome.storage.local.get = originalLocalGet;
  elementsById["config-save-name"].focus = originalNameFocus;
}

let syncWriteCount = 0;
const originalSyncSet = chrome.storage.sync.set;
chrome.storage.sync.set = (storagePayload, onSaved) => {
  syncWriteCount++;
  originalSyncSet(storagePayload, onSaved);
};
try {
  initializeOptionsPage();
  initializeOptionsPage();
  syncWriteCount = 0;
  elementsById["option-depth"].value = "14";
  elementsById["option-depth"].trigger("change");
  assert.strictEqual(
    syncWriteCount,
    1,
    "Repeated initializeOptionsPage calls must not attach duplicate static input listeners"
  );
} finally {
  chrome.storage.sync.set = originalSyncSet;
}

console.log("Popup options tests passed.");
