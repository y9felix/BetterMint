"use strict";

const PROBE_TIMEOUT_MS = 4000;
const UCI_OPTIONS_SYNC_DEBOUNCE_MS = 150;
const CONFIG_STATUS_DURATION_MS = 2600;

const THEMES = {
  dark: {
    label: "Dark",
    nextThemeId: "light",
    iconSvg: '<svg viewBox="0 0 16 16" class="svg-icon"><path fill="currentColor" d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792-.001 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278"/></svg>'
  },
  light: {
    label: "Light",
    nextThemeId: "black",
    iconSvg: '<svg viewBox="0 0 16 16" class="svg-icon"><path fill="currentColor" d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13m8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5M3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8m10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0m-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0m9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707M4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708"/></svg>'
  },
  black: {
    label: "Black",
    nextThemeId: "chesscom",
    iconSvg: '<svg viewBox="0 0 16 16" class="svg-icon"><path fill="currentColor" fill-rule="evenodd" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm1.1 1.5a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4Z"/></svg>'
  },
  chesscom: {
    label: "Chess.com",
    nextThemeId: "dark",
    iconSvg: '<svg viewBox="0 0 16 16" class="svg-icon"><path fill="currentColor" d="M8 1.2a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5M5.5 6.5a.65.65 0 0 0 0 1.3h.85c-.15 1.85-.8 3.35-2.05 4.45h7.4c-1.25-1.1-1.9-2.6-2.05-4.45h.85a.65.65 0 0 0 0-1.3zM3.6 13h8.8a.8.8 0 0 1 .8.8v.4a.8.8 0 0 1-.8.8H3.6a.8.8 0 0 1-.8-.8v-.4a.8.8 0 0 1 .8-.8"/></svg>'
  }
};

const DEFAULT_EXTENSION_OPTION_VALUES =
  typeof DEFAULT_EXTENSION_OPTIONS !== "undefined" ? DEFAULT_EXTENSION_OPTIONS : {};

function buildPresetExtensionOptions(optionOverrides) {
  return Object.assign({}, DEFAULT_EXTENSION_OPTION_VALUES, optionOverrides);
}

const DEFAULT_CONFIG_PRESETS = [
  {
    id: "bullet",
    name: "Bullet",
    summary: "D8 · 1.25s · 200ms",
    settings: buildPresetExtensionOptions({
      "option-depth": 8,
      "option-legit-auto-move": true,
      "option-move-pace": 1.25,
      "option-physical-floor": 200,
      "option-timing-spread": 0.45,
      "option-recapture-multiplier": 0.50,
      "option-forced-multiplier": 0.35,
      "option-opening-moves-threshold": 7,
      "option-opening-multiplier": 0.65,
      "option-clock-threshold": 20,
      "option-clock-min-multiplier": 0.40
    }),
    customEngineOptions: {}
  },
  {
    id: "blitz",
    name: "Blitz",
    summary: "D12 · 3.8s · 350ms",
    settings: buildPresetExtensionOptions({
      "option-depth": 12,
      "option-legit-auto-move": true,
      "option-move-pace": 3.8,
      "option-physical-floor": 350,
      "option-timing-spread": 0.65,
      "option-recapture-multiplier": 0.35,
      "option-forced-multiplier": 0.25,
      "option-opening-moves-threshold": 8,
      "option-opening-multiplier": 0.50,
      "option-clock-threshold": 45,
      "option-clock-min-multiplier": 0.28
    }),
    customEngineOptions: {}
  },
  {
    id: "rapid",
    name: "Rapid",
    summary: "D16 · 12.5s · 600ms",
    settings: buildPresetExtensionOptions({
      "option-depth": 16,
      "option-legit-auto-move": true
    }),
    customEngineOptions: {}
  },
  {
    id: "puzzles",
    name: "Puzzles",
    summary: "D14 · Queue · Hints",
    settings: buildPresetExtensionOptions({
      "option-depth": 14,
      "option-evaluation-bar": false,
      "option-show-hints": true,
      "option-move-analysis": false,
      "option-auto-queue": true,
      "option-legit-auto-move": true,
      "option-human-like-moves": false
    }),
    customEngineOptions: {}
  },
  {
    id: "bots",
    name: "Bots",
    summary: "D14 · Auto · Eval",
    settings: buildPresetExtensionOptions({
      "option-depth": 14,
      "option-show-hints": false,
      "option-move-analysis": false,
      "option-legit-auto-move": true,
      "option-human-like-moves": false
    }),
    customEngineOptions: {}
  }
];

let activeThemeId = "dark";
let activeConfigProfileName = null;
let customConfigProfiles = [];
let activePopoverMode = null;
let statusClearTimerId = null;
let isThemeInitialized = false;
let isConfigSystemInitialized = false;
let isSearchStopInitialized = false;

const ZERO_OFF_SLIDER_OPTION_KEYS = new Set([
  "option-depth",
  "option-go-movetime",
  "option-go-nodes",
  "option-go-mate",
  "option-go-movestogo",
  "option-go-infinite-timeout"
]);

const EXTENSION_OPTION_KEYS =
  typeof DEFAULT_EXTENSION_OPTIONS !== "undefined" ? Object.keys(DEFAULT_EXTENSION_OPTIONS) : [];
const extensionOptionInputs = {};

function formatSliderBadgeValue(optionKey, rawValue) {
  const numericValue = Number(rawValue);
  if (ZERO_OFF_SLIDER_OPTION_KEYS.has(optionKey) && numericValue === 0) return "Off";
  if (optionKey === "option-go-nodes" && !Number.isNaN(numericValue)) {
    return numericValue.toLocaleString("en-US");
  }
  return rawValue;
}

const boundEditableBadges = new WeakSet();
const baseSliderSteps = new WeakMap();

function isPlainRecord(candidate) {
  return Boolean(candidate) && typeof candidate === "object" && !Array.isArray(candidate);
}

function parseBooleanValue(rawValue) {
  if (typeof rawValue === "boolean") return rawValue;
  if (typeof rawValue === "string") {
    const normalizedText = rawValue.trim().toLowerCase();
    if (normalizedText === "false" || normalizedText === "0" || normalizedText === "off" || normalizedText === "") {
      return false;
    }
    if (normalizedText === "true" || normalizedText === "1" || normalizedText === "on") {
      return true;
    }
  }
  return Boolean(rawValue);
}

function getBaseSliderStep(rangeInput) {
  if (baseSliderSteps.has(rangeInput)) return baseSliderSteps.get(rangeInput);
  const baseStep = rangeInput.step != null && rangeInput.step !== "" ? String(rangeInput.step) : "";
  baseSliderSteps.set(rangeInput, baseStep);
  return baseStep;
}

function restoreBaseSliderStep(rangeInput) {
  const baseStep = getBaseSliderStep(rangeInput);
  if (baseStep && rangeInput.step !== baseStep) {
    rangeInput.step = baseStep;
  }
}

function setSliderExactValue(rangeInput, numericValue) {
  const baseStep = getBaseSliderStep(rangeInput);
  const parsedMin = parseFloat(rangeInput.min);
  const sliderMin = Number.isNaN(parsedMin) ? 0 : parsedMin;
  const targetNumber = Number(numericValue);
  const stepNumber = parseFloat(baseStep);

  if (baseStep && Number.isFinite(targetNumber) && Number.isFinite(stepNumber) && stepNumber > 0) {
    const stepOffset = (targetNumber - sliderMin) / stepNumber;
    const isStepAligned = Math.abs(stepOffset - Math.round(stepOffset)) < 1e-9;
    if (isStepAligned) {
      rangeInput.step = baseStep;
    } else {
      rangeInput.step = Number.isInteger(targetNumber) && Number.isInteger(sliderMin) ? "1" : "any";
    }
  }
  rangeInput.value = String(numericValue);
}

function parseAndClampSliderInput(rangeInput, rawText, optionKey = null) {
  const cleanedText = String(rawText ?? "").trim().replace(/,/g, "");
  if (!cleanedText) return null;

  let parsedNumber;
  if (optionKey && ZERO_OFF_SLIDER_OPTION_KEYS.has(optionKey) && cleanedText.toLowerCase() === "off") {
    parsedNumber = 0;
  } else {
    parsedNumber = Number(cleanedText);
    if (!Number.isFinite(parsedNumber)) return null;
  }

  const parsedMin = parseFloat(rangeInput.min);
  const parsedMax = parseFloat(rangeInput.max);
  const sliderMin = Number.isNaN(parsedMin) ? 0 : parsedMin;
  const sliderMax = Number.isNaN(parsedMax) ? 100 : parsedMax;
  const clampedNumber = Math.min(sliderMax, Math.max(sliderMin, parsedNumber));

  const stepText = getBaseSliderStep(rangeInput);
  const decimalPointIndex = stepText.indexOf(".");
  const decimalPlaces = decimalPointIndex === -1 ? 0 : stepText.length - decimalPointIndex - 1;
  return decimalPlaces > 0 ? Number(clampedNumber.toFixed(decimalPlaces)) : Math.round(clampedNumber);
}

function bindEditableSliderBadge(badgeElement, rangeInput, { optionKey = null, onCommit } = {}) {
  if (!badgeElement || !rangeInput || boundEditableBadges.has(badgeElement)) return;
  boundEditableBadges.add(badgeElement);
  getBaseSliderStep(rangeInput);
  rangeInput.addEventListener("pointerdown", () => restoreBaseSliderStep(rangeInput));
  rangeInput.addEventListener("keydown", () => restoreBaseSliderStep(rangeInput));
  badgeElement.title = "Click to edit";

  badgeElement.addEventListener("click", (clickEvent) => {
    clickEvent?.stopPropagation?.();
    const headerElement = badgeElement.parentNode;
    if (!headerElement || badgeElement.classList?.contains("hidden")) return;

    const inlineEditor = createDomElement("input", {
      type: "text",
      className: "badge-input",
      value: String(rangeInput.value ?? "0"),
      spellcheck: false,
      autocomplete: "off"
    });
    inlineEditor.setAttribute?.("inputmode", "decimal");

    badgeElement.classList?.add("hidden");
    headerElement.appendChild(inlineEditor);
    inlineEditor.focus?.();
    inlineEditor.select?.();

    let hasFinishedEdit = false;
    const finishEdit = (shouldCommit) => {
      if (hasFinishedEdit) return;
      hasFinishedEdit = true;
      if (shouldCommit) {
        const committedNumber = parseAndClampSliderInput(rangeInput, inlineEditor.value, optionKey);
        if (committedNumber !== null) {
          setSliderExactValue(rangeInput, committedNumber);
          badgeElement.textContent = optionKey
            ? formatSliderBadgeValue(optionKey, rangeInput.value)
            : String(rangeInput.value);
          onCommit?.(committedNumber);
        }
      }
      inlineEditor.remove?.();
      badgeElement.classList?.remove("hidden");
    };

    inlineEditor.addEventListener("keydown", (keyEvent) => {
      if (keyEvent?.key === "Enter") {
        keyEvent.preventDefault?.();
        finishEdit(true);
      } else if (keyEvent?.key === "Escape") {
        keyEvent.preventDefault?.();
        finishEdit(false);
      }
    });
    inlineEditor.addEventListener("blur", () => finishEdit(true));
  });
}

function parseSearchMovesTokens(rawMovesText) {
  const seenMoves = new Set();
  const validMoves = [];
  for (const moveToken of String(rawMovesText || "").trim().toLowerCase().split(/\s+/)) {
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(moveToken) && !seenMoves.has(moveToken)) {
      seenMoves.add(moveToken);
      validMoves.push(moveToken);
    }
  }
  return validMoves;
}

function buildGoPreviewCommand(extensionOptions = null) {
  const effectiveOptions = extensionOptions || readExtensionOptionsFromDom();
  const searchMoves = parseSearchMovesTokens(effectiveOptions["option-go-searchmoves"]);
  if (effectiveOptions["option-go-infinite"]) {
    const commandParts = ["go", "infinite"];
    if (searchMoves.length > 0) commandParts.push("searchmoves", ...searchMoves);
    return commandParts.join(" ");
  }

  const commandParts = ["go"];
  const depth = parseInt(effectiveOptions["option-depth"], 10) || 0;
  const movetimeMs = parseInt(effectiveOptions["option-go-movetime"], 10) || 0;
  const nodeLimit = parseInt(effectiveOptions["option-go-nodes"], 10) || 0;
  const mateDepth = parseInt(effectiveOptions["option-go-mate"], 10) || 0;
  const isClockSyncEnabled = Boolean(effectiveOptions["option-go-clock-sync"]);
  const clockIncrementMs = parseInt(effectiveOptions["option-go-clock-inc"], 10) || 0;
  const movesToGo = parseInt(effectiveOptions["option-go-movestogo"], 10) || 0;
  let hasSearchBound = false;

  if (depth > 0) {
    commandParts.push("depth", String(depth));
    hasSearchBound = true;
  }
  if (movetimeMs > 0) {
    commandParts.push("movetime", String(movetimeMs));
    hasSearchBound = true;
  }
  if (nodeLimit > 0) {
    commandParts.push("nodes", String(nodeLimit));
    hasSearchBound = true;
  }
  if (mateDepth > 0) {
    commandParts.push("mate", String(mateDepth));
    hasSearchBound = true;
  }
  if (isClockSyncEnabled) {
    commandParts.push("wtime", "<W>", "btime", "<B>");
    if (clockIncrementMs > 0) {
      commandParts.push("winc", String(clockIncrementMs), "binc", String(clockIncrementMs));
    }
    if (movesToGo > 0) {
      commandParts.push("movestogo", String(movesToGo));
    }
    hasSearchBound = true;
  }
  if (!hasSearchBound) {
    commandParts.push("depth", "1");
  }
  if (searchMoves.length > 0) {
    commandParts.push("searchmoves", ...searchMoves);
  }
  return commandParts.join(" ");
}

function updateGoCommandPreview(extensionOptions = null) {
  const previewElement = document.getElementById("go-command-preview");
  if (previewElement) {
    previewElement.textContent = buildGoPreviewCommand(extensionOptions);
  }
}

function applyTheme(themeId) {
  const resolvedThemeId = THEMES[themeId] ? themeId : "dark";
  activeThemeId = resolvedThemeId;
  const rootElement = document.documentElement;
  if (rootElement) {
    rootElement.dataset.theme = resolvedThemeId;
  }
  const themeToggleButton = document.getElementById("theme-toggle");
  if (themeToggleButton) {
    const themeMetadata = THEMES[resolvedThemeId];
    themeToggleButton.innerHTML = themeMetadata.iconSvg;
    themeToggleButton.title = `Theme: ${themeMetadata.label}`;
    themeToggleButton.setAttribute?.("aria-label", `Theme: ${themeMetadata.label}`);
  }
}

function initializeTheme() {
  applyTheme("dark");
  readChromeStorage("local", ["theme"], (storedThemeState) => {
    if (storedThemeState?.theme) {
      applyTheme(storedThemeState.theme);
    }
  });
  if (isThemeInitialized) return;
  isThemeInitialized = true;
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const nextThemeId = THEMES[activeThemeId]?.nextThemeId || "dark";
    applyTheme(nextThemeId);
    writeChromeStorage("local", { theme: nextThemeId });
  });
}

const VISIBILITY_TOGGLE_GROUPS = [
  ["option-go-clock-sync", "go-clock-group"],
  ["option-go-infinite", "go-infinite-group"],
  ["option-auto-queue", "auto-queue-group"],
  ["option-legit-auto-move", "pacing-group"],
  ["option-human-like-moves", "human-pace-group"]
];

function updateDependentGroupVisibility() {
  for (const [toggleInputId, groupContainerId] of VISIBILITY_TOGGLE_GROUPS) {
    const toggleInput = document.getElementById(toggleInputId);
    const groupContainer = document.getElementById(groupContainerId);
    if (toggleInput && groupContainer) {
      groupContainer.classList.toggle("hidden", !toggleInput.checked);
    }
  }
}

function parseUciOptionLine(uciLine) {
  if (!uciLine || typeof uciLine !== "string" || !uciLine.startsWith("option name ")) return null;
  const declarationBody = uciLine.slice(12);
  const typeDelimiterIndex = declarationBody.indexOf(" type ");
  if (typeDelimiterIndex === -1) return null;
  const optionName = declarationBody.slice(0, typeDelimiterIndex).trim();
  const typeAndAttributes = declarationBody.slice(typeDelimiterIndex + 6).trim();
  const attributeTokens = typeAndAttributes.split(/\s+/);
  const optionType = attributeTokens[0];
  if (!optionType) return null;

  if (optionType === "string") {
    const defaultMatch = typeAndAttributes.match(/^string\s+default\s*(.*)$/);
    const rawDefault = defaultMatch ? defaultMatch[1].trim() : "";
    return {
      name: optionName,
      type: optionType,
      default: rawDefault === "<empty>" ? "" : rawDefault,
      min: null,
      max: null,
      vars: []
    };
  }

  let defaultValue = "";
  let minValue = null;
  let maxValue = null;
  const allowedVariants = [];

  const uciKeywords = new Set(["default", "min", "max", "var"]);
  let activeAttributeKeyword = null;
  let collectedValueWords = [];

  const commitActiveAttribute = () => {
    if (!activeAttributeKeyword) return;
    const attributeValue = collectedValueWords.join(" ").trim();
    if (activeAttributeKeyword === "default") {
      defaultValue = attributeValue;
    } else if (activeAttributeKeyword === "min") {
      minValue = attributeValue ? parseInt(attributeValue, 10) : null;
    } else if (activeAttributeKeyword === "max") {
      maxValue = attributeValue ? parseInt(attributeValue, 10) : null;
    } else if (activeAttributeKeyword === "var") {
      if (attributeValue) allowedVariants.push(attributeValue);
    }
    collectedValueWords = [];
  };

  for (let tokenIndex = 1; tokenIndex < attributeTokens.length; tokenIndex++) {
    const token = attributeTokens[tokenIndex];
    if (uciKeywords.has(token)) {
      commitActiveAttribute();
      activeAttributeKeyword = token;
    } else if (activeAttributeKeyword) {
      collectedValueWords.push(token);
    }
  }
  commitActiveAttribute();

  return {
    name: optionName,
    type: optionType,
    default: defaultValue,
    min: minValue,
    max: maxValue,
    vars: allowedVariants
  };
}

function createDomElement(tagName, properties = {}, childNodes = []) {
  const element = document.createElement(tagName);
  for (const [propertyName, propertyValue] of Object.entries(properties)) {
    if (propertyValue !== undefined && propertyValue !== null) {
      element[propertyName] = propertyValue;
    }
  }
  for (const childNode of childNodes) {
    if (childNode) element.appendChild(childNode);
  }
  return element;
}

const uciOptionControlRenderers = {
  spin(uciOption, currentValue, onUciOptionChange) {
    const valueBadge = createDomElement("span", { className: "badge", textContent: currentValue });
    const rangeInput = createDomElement("input", {
      type: "range",
      className: "range-slider",
      min: uciOption.min ?? 0,
      max: uciOption.max ?? 100,
      value: currentValue
    });
    rangeInput.addEventListener("input", () => {
      valueBadge.textContent = rangeInput.value;
      onUciOptionChange?.(uciOption.name, parseInt(rangeInput.value, 10), false);
    });
    bindEditableSliderBadge(valueBadge, rangeInput, {
      onCommit: (committedNumber) => onUciOptionChange?.(uciOption.name, parseInt(committedNumber, 10), false)
    });
    return createDomElement("div", { className: "control-col" }, [
      createDomElement("div", { className: "slider-header" }, [
        createDomElement("span", { className: "title", textContent: uciOption.name }),
        valueBadge
      ]),
      rangeInput
    ]);
  },
  check(uciOption, currentValue, onUciOptionChange) {
    const checkboxInput = createDomElement("input", {
      type: "checkbox",
      className: "toggle-input",
      checked: currentValue === true || currentValue === "true"
    });
    checkboxInput.addEventListener("change", () => {
      onUciOptionChange?.(uciOption.name, checkboxInput.checked, false);
    });
    return createDomElement("label", { className: "control-row" }, [
      createDomElement("span", { className: "control-label-text", textContent: uciOption.name }),
      checkboxInput,
      createDomElement("span", { className: "toggle-slider" })
    ]);
  },
  combo(uciOption, currentValue, onUciOptionChange) {
    const selectInput = createDomElement(
      "select",
      { className: "select-input" },
      (uciOption.vars || []).map((optionVariant) =>
        createDomElement("option", {
          value: optionVariant,
          textContent: optionVariant,
          selected: optionVariant === String(currentValue)
        })
      )
    );
    selectInput.addEventListener("change", () => {
      onUciOptionChange?.(uciOption.name, selectInput.value, false);
    });
    return createDomElement("div", { className: "control-col" }, [
      createDomElement("label", { className: "control-label-text", textContent: uciOption.name }),
      selectInput
    ]);
  },
  string(uciOption, currentValue, onUciOptionChange) {
    const textInput = createDomElement("input", {
      type: "text",
      className: "text-input",
      value: String(currentValue ?? ""),
      spellcheck: false,
      autocomplete: "off"
    });
    textInput.addEventListener("change", () => {
      onUciOptionChange?.(uciOption.name, textInput.value.trim(), false);
    });
    return createDomElement("div", { className: "control-col" }, [
      createDomElement("label", { className: "control-label-text", textContent: uciOption.name }),
      textInput
    ]);
  },
  button(uciOption, _currentValue, onUciOptionChange) {
    const executeButton = createDomElement("button", {
      type: "button",
      className: "action-btn",
      textContent: "Execute"
    });
    executeButton.addEventListener("click", () => {
      onUciOptionChange?.(uciOption.name, "", true);
    });
    return createDomElement("div", { className: "control-row" }, [
      createDomElement("span", { className: "control-label-text", textContent: uciOption.name }),
      executeButton
    ]);
  }
};

function renderDynamicUciOptions(uciOptionDefinitions, savedUciValues, containerElement, onUciOptionChange) {
  if (!containerElement) return;
  containerElement.innerHTML = "";
  if (!uciOptionDefinitions || uciOptionDefinitions.length === 0) {
    containerElement.innerHTML =
      '<span class="status-text">No configurable options reported by engine.</span>';
    return;
  }

  uciOptionDefinitions.forEach((uciOption) => {
    const renderControl = uciOptionControlRenderers[uciOption.type];
    if (!renderControl) return;
    const currentValue = savedUciValues?.[uciOption.name] ?? uciOption.default;
    containerElement.appendChild(renderControl(uciOption, currentValue, onUciOptionChange));
  });
}

let activeProbeSocket = null;
let probeTimeoutTimerId = null;
let lastProbedEngineUrl = null;
let lastProbedUciOptions = [];

function setEngineOptionsStatusMessage(statusMessage) {
  const containerElement = document.getElementById("engine-options-container");
  if (!containerElement) return;
  containerElement.innerHTML = "";
  containerElement.appendChild(
    createDomElement("span", { className: "status-text", textContent: statusMessage })
  );
}

function resetEngineProbe() {
  if (probeTimeoutTimerId) {
    clearTimeout(probeTimeoutTimerId);
    probeTimeoutTimerId = null;
  }
  if (activeProbeSocket) {
    const probeSocket = activeProbeSocket;
    activeProbeSocket = null;
    try {
      probeSocket.close();
    } catch (closeError) {
      console.warn("[BetterMint] Failed to close probe WebSocket:", closeError);
    }
  }
}

function probeEngineUciOptions(engineUrl, onProbeComplete = loadAndRenderEngineUciOptions) {
  const containerElement = document.getElementById("engine-options-container");
  if (!containerElement) return;
  resetEngineProbe();

  if (typeof WebSocket === "undefined") {
    setEngineOptionsStatusMessage("WebSocket unavailable.");
    return;
  }
  if (!engineUrl || !/^wss?:\/\//i.test(engineUrl)) {
    setEngineOptionsStatusMessage("Invalid WebSocket URL (use ws:// or wss://).");
    return;
  }

  setEngineOptionsStatusMessage("Connecting to engine...");
  const discoveredUciOptions = [];
  let lastErrorLine = "";
  try {
    const probeSocket = new WebSocket(engineUrl);
    activeProbeSocket = probeSocket;
    probeTimeoutTimerId = setTimeout(() => {
      if (activeProbeSocket !== probeSocket) return;
      resetEngineProbe();
      setEngineOptionsStatusMessage("Connection timed out.");
    }, PROBE_TIMEOUT_MS);

    probeSocket.addEventListener("open", () => {
      if (activeProbeSocket !== probeSocket) return;
      if (probeTimeoutTimerId) clearTimeout(probeTimeoutTimerId);
      probeTimeoutTimerId = setTimeout(() => {
        if (activeProbeSocket !== probeSocket) return;
        resetEngineProbe();
        setEngineOptionsStatusMessage("Engine handshake timed out.");
      }, PROBE_TIMEOUT_MS);
      probeSocket.send("uci\n");
    });

    probeSocket.addEventListener("message", (messageEvent) => {
      if (activeProbeSocket !== probeSocket) return;
      if (!messageEvent.data) return;
      const uciLines = String(messageEvent.data).split("\n");
      for (const uciLine of uciLines) {
        const trimmedLine = uciLine.trim();
        if (trimmedLine.startsWith("info string Error:")) {
          lastErrorLine = trimmedLine.slice("info string ".length);
        }
        const parsedUciOption = parseUciOptionLine(trimmedLine);
        if (parsedUciOption) {
          discoveredUciOptions.push(parsedUciOption);
        } else if (trimmedLine === "uciok") {
          lastProbedEngineUrl = engineUrl;
          lastProbedUciOptions = discoveredUciOptions.slice();
          resetEngineProbe();
          onProbeComplete(engineUrl, discoveredUciOptions, containerElement);
          return;
        }
      }
    });

    probeSocket.addEventListener("close", () => {
      if (activeProbeSocket !== probeSocket) return;
      resetEngineProbe();
      setEngineOptionsStatusMessage(
        lastErrorLine || "Engine connection closed before handshake."
      );
    });

    probeSocket.addEventListener("error", () => {
      if (activeProbeSocket !== probeSocket) return;
      resetEngineProbe();
      setEngineOptionsStatusMessage("Unable to connect to engine.");
    });
  } catch (socketError) {
    console.warn("[BetterMint] Failed to initialize engine probe socket:", socketError);
    resetEngineProbe();
    setEngineOptionsStatusMessage("Failed to initialize engine socket.");
  }
}

function invalidateEngineProbe(engineUrl) {
  lastProbedEngineUrl = null;
  lastProbedUciOptions = [];
  resetEngineProbe();
  if (document.getElementById("engine-options-details")?.open) {
    probeEngineUciOptions(engineUrl);
  } else {
    setEngineOptionsStatusMessage("Expand to load engine options.");
  }
}

let uciOptionsSyncTimerId = null;
let pendingUciOptionsWrite = null;

function readChromeStorage(storageArea, storageKeys, onLoaded) {
  const storageHandle = typeof chrome !== "undefined" ? chrome.storage?.[storageArea] : null;
  if (!storageHandle?.get) {
    onLoaded?.(null);
    return;
  }
  storageHandle.get(storageKeys, (storedResult) => {
    const runtimeError = typeof chrome !== "undefined" ? chrome.runtime?.lastError : null;
    if (runtimeError) {
      console.warn(
        `[BetterMint] Failed to read ${storageArea} storage:`,
        runtimeError.message || runtimeError
      );
    }
    onLoaded?.(storedResult || {});
  });
}

function writeChromeStorage(storageArea, storagePayload) {
  const storageHandle = typeof chrome !== "undefined" ? chrome.storage?.[storageArea] : null;
  if (!storageHandle?.set) return;
  storageHandle.set(storagePayload, () => {
    const runtimeError = typeof chrome !== "undefined" ? chrome.runtime?.lastError : null;
    if (runtimeError) {
      console.error(
        `[BetterMint] Failed to write ${storageArea} storage:`,
        runtimeError.message || runtimeError
      );
      setConfigStatusMessage("Failed to save settings.", true);
    }
  });
}

function flushPendingUciOptions({ shouldNotifyTabs = true } = {}) {
  if (!pendingUciOptionsWrite) return;
  if (uciOptionsSyncTimerId) {
    clearTimeout(uciOptionsSyncTimerId);
    uciOptionsSyncTimerId = null;
  }
  const { storageKey, engineUrl, uciOptions } = pendingUciOptionsWrite;
  pendingUciOptionsWrite = null;
  writeChromeStorage("local", { [storageKey]: uciOptions });
  const activeEngineUrl = extensionOptionInputs["option-url-api-stockfish"]?.value?.trim();
  if (shouldNotifyTabs && (!engineUrl || !activeEngineUrl || engineUrl === activeEngineUrl)) {
    notifyActiveChessComTabs({ customEngineOptions: uciOptions });
  }
}

function bindDynamicUciOptionControls(
  storageKey,
  uciOptionDefinitions,
  savedUciValues,
  containerElement,
  engineUrl = null
) {
  const mutableUciValues = Object.assign({}, savedUciValues || {});
  renderDynamicUciOptions(
    uciOptionDefinitions,
    mutableUciValues,
    containerElement,
    (optionName, optionValue, isButtonOption) => {
      if (isButtonOption) {
        notifyActiveChessComTabs({ uciButton: optionName });
        return;
      }
      mutableUciValues[optionName] = optionValue;
      setActiveConfigProfileName(null);
      pendingUciOptionsWrite = { storageKey, engineUrl, uciOptions: mutableUciValues };
      if (uciOptionsSyncTimerId) clearTimeout(uciOptionsSyncTimerId);
      uciOptionsSyncTimerId = setTimeout(flushPendingUciOptions, UCI_OPTIONS_SYNC_DEBOUNCE_MS);
    }
  );
}

function loadAndRenderEngineUciOptions(engineUrl, uciOptionDefinitions, containerElement) {
  const storageKey = getEngineOptionsStorageKey(engineUrl);
  readChromeStorage("local", [storageKey], (storedResult) => {
    if (storedResult === null) {
      renderDynamicUciOptions(uciOptionDefinitions, {}, containerElement, null);
      return;
    }
    if (lastProbedEngineUrl !== engineUrl) return;
    bindDynamicUciOptionControls(
      storageKey,
      uciOptionDefinitions,
      storedResult?.[storageKey],
      containerElement,
      engineUrl
    );
  });
}

function notifyActiveChessComTabs(extensionOptions) {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) return;
  chrome.tabs.query({ url: "*://*.chess.com/*" }, (matchingTabs) => {
    if (chrome.runtime?.lastError || !Array.isArray(matchingTabs)) return;
    matchingTabs.forEach((tab) => {
      if (tab?.id === undefined) return;
      chrome.tabs
        .sendMessage(tab.id, { type: "UpdateOptions", extensionOptions })
        ?.catch?.(() => {});
    });
  });
}

function probeEngineIfPanelExpanded() {
  const engineDetailsElement = document.getElementById("engine-options-details");
  if (!engineDetailsElement?.open) return;
  const engineUrl = extensionOptionInputs["option-url-api-stockfish"]?.value?.trim();
  if (lastProbedEngineUrl !== engineUrl) {
    probeEngineUciOptions(engineUrl);
  }
}

function readExtensionOptionsFromDom() {
  const extensionOptions = {};
  EXTENSION_OPTION_KEYS.forEach((optionKey) => {
    const inputElement = extensionOptionInputs[optionKey];
    if (!inputElement) {
      extensionOptions[optionKey] = DEFAULT_EXTENSION_OPTION_VALUES[optionKey];
      return;
    }
    if (inputElement.type === "checkbox") {
      extensionOptions[optionKey] = Boolean(inputElement.checked);
    } else if (inputElement.type === "range") {
      const numericValue = parseFloat(inputElement.value);
      extensionOptions[optionKey] = Number.isNaN(numericValue) ? 0 : numericValue;
    } else {
      extensionOptions[optionKey] = String(inputElement.value ?? "").trim();
    }
  });
  return extensionOptions;
}

function normalizeExtensionOptions(rawExtensionOptions) {
  const normalizedOptions = {};
  EXTENSION_OPTION_KEYS.forEach((optionKey) => {
    const defaultValue = DEFAULT_EXTENSION_OPTION_VALUES[optionKey];
    const incomingValue =
      rawExtensionOptions && Object.prototype.hasOwnProperty.call(rawExtensionOptions, optionKey)
        ? rawExtensionOptions[optionKey]
        : defaultValue;
    if (typeof defaultValue === "boolean") {
      normalizedOptions[optionKey] = parseBooleanValue(incomingValue);
    } else if (typeof defaultValue === "number") {
      const parsedNumber = parseFloat(incomingValue);
      normalizedOptions[optionKey] = Number.isNaN(parsedNumber) ? defaultValue : parsedNumber;
    } else {
      normalizedOptions[optionKey] = String(incomingValue ?? defaultValue ?? "").trim();
    }
  });
  return normalizedOptions;
}

function applyExtensionOptionsToDom(extensionOptions) {
  EXTENSION_OPTION_KEYS.forEach((optionKey) => {
    const inputElement = extensionOptionInputs[optionKey];
    if (!inputElement) return;
    const optionValue = extensionOptions[optionKey] ?? DEFAULT_EXTENSION_OPTION_VALUES[optionKey];
    if (inputElement.type === "checkbox") {
      inputElement.checked = parseBooleanValue(optionValue);
    } else if (inputElement.type === "range") {
      setSliderExactValue(inputElement, optionValue);
      const badgeElement = document.getElementById("badge-" + optionKey);
      if (badgeElement) {
        badgeElement.textContent = formatSliderBadgeValue(optionKey, optionValue);
      }
    } else {
      inputElement.value = optionValue;
    }
  });
  updateDependentGroupVisibility();
  updateGoCommandPreview(extensionOptions);
}

function setActiveConfigProfileName(profileName) {
  const normalizedName = profileName || null;
  if (activeConfigProfileName === normalizedName) return;
  activeConfigProfileName = normalizedName;
  writeChromeStorage("local", { activeConfigName: activeConfigProfileName });
}

function setConfigStatusMessage(statusMessage, isError = false) {
  const statusElement = document.getElementById("config-status");
  if (!statusElement) return;
  if (statusClearTimerId) {
    clearTimeout(statusClearTimerId);
    statusClearTimerId = null;
  }
  statusElement.textContent = statusMessage || "";
  statusElement.classList?.toggle("is-error", Boolean(isError));
  statusElement.classList?.toggle("hidden", !statusMessage);
  if (statusMessage) {
    statusClearTimerId = setTimeout(() => {
      statusElement.textContent = "";
      statusElement.classList?.add("hidden");
      statusClearTimerId = null;
    }, CONFIG_STATUS_DURATION_MS);
  }
}

function sanitizeConfigFilename(rawName) {
  const sanitizedName = String(rawName || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-")
    .replace(/\s+/g, " ");
  return sanitizedName || "config";
}

function stripMintFileExtension(filename) {
  return String(filename || "").replace(/\.mint$/i, "").trim();
}

function getExportConfigFilename(profileName = activeConfigProfileName) {
  return profileName ? `${sanitizeConfigFilename(profileName)}.mint` : "config.mint";
}

function applyConfigProfile(
  rawExtensionOptions,
  uciOptionOverrides = {},
  { profileName = null, shouldMarkSaved = false } = {}
) {
  const previousEngineUrl = extensionOptionInputs["option-url-api-stockfish"]?.value?.trim();
  const normalizedExtensionOptions = normalizeExtensionOptions(rawExtensionOptions);
  const sanitizedUciOptions = isPlainRecord(uciOptionOverrides)
    ? Object.assign({}, uciOptionOverrides)
    : {};

  pendingUciOptionsWrite = null;
  if (uciOptionsSyncTimerId) {
    clearTimeout(uciOptionsSyncTimerId);
    uciOptionsSyncTimerId = null;
  }

  applyExtensionOptionsToDom(normalizedExtensionOptions);
  setActiveConfigProfileName(shouldMarkSaved ? profileName : null);

  const nextEngineUrl = normalizedExtensionOptions["option-url-api-stockfish"];
  const engineStorageKey = getEngineOptionsStorageKey(nextEngineUrl);
  if (engineStorageKey) {
    writeChromeStorage("local", { [engineStorageKey]: sanitizedUciOptions });
  }
  writeChromeStorage("sync", normalizedExtensionOptions);

  if (previousEngineUrl !== nextEngineUrl) {
    invalidateEngineProbe(nextEngineUrl);
  } else if (
    document.getElementById("engine-options-details")?.open &&
    lastProbedEngineUrl === nextEngineUrl
  ) {
    const containerElement = document.getElementById("engine-options-container");
    if (containerElement && lastProbedUciOptions.length > 0 && engineStorageKey) {
      bindDynamicUciOptionControls(
        engineStorageKey,
        lastProbedUciOptions,
        sanitizedUciOptions,
        containerElement,
        nextEngineUrl
      );
    }
  }

  notifyActiveChessComTabs(
    Object.assign({}, normalizedExtensionOptions, { customEngineOptions: sanitizedUciOptions })
  );
}

function saveCustomConfigProfile(profileName, extensionOptions, uciOptionOverrides) {
  const trimmedName = String(profileName || "").trim();
  if (!trimmedName) return null;
  const savedProfile = {
    name: trimmedName,
    settings: normalizeExtensionOptions(extensionOptions),
    customEngineOptions: Object.assign({}, uciOptionOverrides || {}),
    updatedAt: Date.now()
  };
  const remainingProfiles = customConfigProfiles.filter(
    (profile) => profile.name.toLowerCase() !== trimmedName.toLowerCase()
  );
  customConfigProfiles = [savedProfile, ...remainingProfiles];
  writeChromeStorage("local", { customConfigs: customConfigProfiles });
  return savedProfile;
}

function deleteCustomConfigProfile(profileName) {
  customConfigProfiles = customConfigProfiles.filter((profile) => profile.name !== profileName);
  const storageUpdates = { customConfigs: customConfigProfiles };
  if (activeConfigProfileName === profileName) {
    activeConfigProfileName = null;
    storageUpdates.activeConfigName = null;
  }
  writeChromeStorage("local", storageUpdates);
}

function formatConfigProfileSummary(extensionOptions) {
  const depth = extensionOptions?.["option-depth"] ?? DEFAULT_EXTENSION_OPTION_VALUES["option-depth"];
  const movePace =
    extensionOptions?.["option-move-pace"] ?? DEFAULT_EXTENSION_OPTION_VALUES["option-move-pace"];
  const autoMoveMode = extensionOptions?.["option-legit-auto-move"] ? "Auto" : "Manual";
  return `D${depth} · ${autoMoveMode} · ${movePace}s`;
}

function renderSavedConfigList() {
  const listContainer = document.getElementById("config-load-list");
  if (!listContainer) return;
  listContainer.innerHTML = "";

  listContainer.appendChild(
    createDomElement("div", { className: "config-section-label", textContent: "Presets" })
  );
  DEFAULT_CONFIG_PRESETS.forEach((presetProfile) => {
    const presetButton = createDomElement("button", { type: "button", className: "config-item-btn" }, [
      createDomElement("span", { className: "config-item-name", textContent: presetProfile.name }),
      createDomElement("span", { className: "config-item-meta", textContent: presetProfile.summary })
    ]);
    presetButton.addEventListener("click", () => {
      applyConfigProfile(presetProfile.settings, presetProfile.customEngineOptions, {
        shouldMarkSaved: false
      });
      setConfigPopoverMode(null);
      setConfigStatusMessage(`Loaded ${presetProfile.name}`);
    });
    listContainer.appendChild(
      createDomElement("div", { className: "config-item-row config-item" }, [presetButton])
    );
  });

  listContainer.appendChild(
    createDomElement("div", { className: "config-section-label", textContent: "Custom" })
  );
  if (customConfigProfiles.length === 0) {
    listContainer.appendChild(
      createDomElement("div", { className: "config-empty", textContent: "No saved configs yet." })
    );
    return;
  }

  customConfigProfiles.forEach((savedProfile) => {
    const isActiveProfile = activeConfigProfileName === savedProfile.name;
    const selectProfileButton = createDomElement(
      "button",
      {
        type: "button",
        className: isActiveProfile ? "config-item-btn is-active" : "config-item-btn"
      },
      [
        createDomElement("span", { className: "config-item-name", textContent: savedProfile.name }),
        createDomElement("span", {
          className: "config-item-meta",
          textContent: formatConfigProfileSummary(savedProfile.settings)
        })
      ]
    );
    selectProfileButton.addEventListener("click", () => {
      applyConfigProfile(savedProfile.settings, savedProfile.customEngineOptions, {
        profileName: savedProfile.name,
        shouldMarkSaved: true
      });
      setConfigPopoverMode(null);
      setConfigStatusMessage(`Loaded ${savedProfile.name}`);
    });

    const deleteProfileButton = createDomElement("button", {
      type: "button",
      className: "config-delete-btn",
      title: `Delete ${savedProfile.name}`,
      textContent: "×"
    });
    deleteProfileButton.setAttribute?.("aria-label", `Delete ${savedProfile.name}`);
    deleteProfileButton.addEventListener("click", (clickEvent) => {
      clickEvent?.stopPropagation?.();
      deleteCustomConfigProfile(savedProfile.name);
      renderSavedConfigList();
    });

    listContainer.appendChild(
      createDomElement("div", { className: "config-item-row config-item" }, [
        selectProfileButton,
        deleteProfileButton
      ])
    );
  });
}

function setConfigPopoverMode(popoverMode) {
  activePopoverMode = popoverMode || null;
  const popoverElement = document.getElementById("config-popover");
  const configToggleButton = document.getElementById("config-toggle");
  const actionMenuElement = document.getElementById("config-menu");
  const loadPanelElement = document.getElementById("config-load-panel");
  const savePanelElement = document.getElementById("config-save-panel");
  const saveErrorElement = document.getElementById("config-save-error");

  if (configToggleButton) {
    configToggleButton.setAttribute?.("aria-expanded", String(Boolean(activePopoverMode)));
  }
  if (!popoverElement) return;

  popoverElement.classList?.toggle("hidden", !activePopoverMode);
  popoverElement.classList?.toggle(
    "is-wide",
    activePopoverMode === "load" || activePopoverMode === "save"
  );
  actionMenuElement?.classList?.toggle("hidden", activePopoverMode !== "menu");
  loadPanelElement?.classList?.toggle("hidden", activePopoverMode !== "load");
  savePanelElement?.classList?.toggle("hidden", activePopoverMode !== "save");
  saveErrorElement?.classList?.add("hidden");

  if (activePopoverMode === "load") {
    loadConfigStorageState(() => renderSavedConfigList());
  } else if (activePopoverMode === "save") {
    const profileNameInput = document.getElementById("config-save-name");
    if (profileNameInput) {
      profileNameInput.value = activeConfigProfileName || "";
      profileNameInput.focus?.();
      profileNameInput.select?.();
    }
  }
}

function loadConfigStorageState(onLoaded) {
  const engineUrl =
    extensionOptionInputs["option-url-api-stockfish"]?.value?.trim() ||
    DEFAULT_EXTENSION_OPTION_VALUES["option-url-api-stockfish"];
  const engineStorageKey = getEngineOptionsStorageKey(engineUrl);
  const storageKeys = ["customConfigs", "activeConfigName"];
  if (engineStorageKey) storageKeys.push(engineStorageKey);

  readChromeStorage("local", storageKeys, (storedState) => {
    if (storedState === null) {
      onLoaded?.({
        customConfigs: customConfigProfiles,
        activeConfigName: activeConfigProfileName,
        customEngineOptions: {}
      });
      return;
    }
    if (Array.isArray(storedState.customConfigs)) {
      customConfigProfiles = storedState.customConfigs;
    }
    if (Object.prototype.hasOwnProperty.call(storedState, "activeConfigName")) {
      activeConfigProfileName = storedState.activeConfigName || null;
    }
    const storedUciOptions = engineStorageKey ? storedState[engineStorageKey] || {} : {};
    const liveUciOptions =
      pendingUciOptionsWrite && pendingUciOptionsWrite.storageKey === engineStorageKey
        ? pendingUciOptionsWrite.uciOptions
        : storedUciOptions;
    onLoaded?.({
      customConfigs: customConfigProfiles,
      activeConfigName: activeConfigProfileName,
      customEngineOptions: Object.assign({}, liveUciOptions)
    });
  });
}

function buildConfigExportSnapshot(onSnapshotReady) {
  const extensionOptions = readExtensionOptionsFromDom();
  loadConfigStorageState((storageState) => {
    const exportSnapshot = {
      format: "bettermint-config",
      version: 2,
      name: storageState.activeConfigName || null,
      exportedAt: new Date().toISOString(),
      settings: extensionOptions,
      customEngineOptions: storageState.customEngineOptions || {},
      theme: activeThemeId,
      customConfigs: storageState.customConfigs.map((savedProfile) => ({
        name: savedProfile.name,
        settings: savedProfile.settings,
        customEngineOptions: savedProfile.customEngineOptions || {},
        updatedAt: savedProfile.updatedAt
      }))
    };
    onSnapshotReady?.(exportSnapshot, getExportConfigFilename(storageState.activeConfigName));
  });
}

function downloadJsonFile(filename, jsonContent) {
  if (typeof Blob === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) return;
  const fileBlob = new Blob([jsonContent], { type: "application/json" });
  const blobUrl = URL.createObjectURL(fileBlob);
  const downloadLink = createDomElement("a", {
    href: blobUrl,
    download: filename,
    className: "hidden"
  });
  document.body?.appendChild?.(downloadLink);
  downloadLink.click?.();
  downloadLink.remove?.();
  URL.revokeObjectURL?.(blobUrl);
}

function exportActiveConfig() {
  flushPendingUciOptions();
  buildConfigExportSnapshot((exportSnapshot, filename) => {
    downloadJsonFile(filename, JSON.stringify(exportSnapshot, null, 2));
    setConfigPopoverMode(null);
    setConfigStatusMessage(`Exported ${filename}`);
  });
}

function handleSaveProfileSubmit() {
  const profileNameInput = document.getElementById("config-save-name");
  const saveErrorElement = document.getElementById("config-save-error");
  const profileName = profileNameInput?.value?.trim() || "";
  if (!profileName) {
    if (saveErrorElement) {
      saveErrorElement.textContent = "Enter a config name.";
      saveErrorElement.classList?.remove("hidden");
    }
    profileNameInput?.focus?.();
    return;
  }

  flushPendingUciOptions();
  const extensionOptions = readExtensionOptionsFromDom();
  loadConfigStorageState((storageState) => {
    saveCustomConfigProfile(profileName, extensionOptions, storageState.customEngineOptions);
    setActiveConfigProfileName(profileName);
    setConfigPopoverMode(null);
    setConfigStatusMessage(`Saved ${profileName}`);
  });
}

function importMintConfigText(rawJsonText, filename = "config.mint") {
  let parsedSnapshot;
  try {
    parsedSnapshot = JSON.parse(String(rawJsonText || ""));
  } catch {
    return { isSuccess: false, error: "Invalid .mint file." };
  }

  if (!isPlainRecord(parsedSnapshot)) {
    return { isSuccess: false, error: "Invalid .mint payload." };
  }

  const importedExtensionOptions = isPlainRecord(parsedSnapshot.settings)
    ? parsedSnapshot.settings
    : EXTENSION_OPTION_KEYS.some((optionKey) =>
          Object.prototype.hasOwnProperty.call(parsedSnapshot, optionKey)
        )
      ? parsedSnapshot
      : null;

  if (!importedExtensionOptions) {
    return { isSuccess: false, error: "No valid settings in .mint file." };
  }

  if (Array.isArray(parsedSnapshot.customConfigs)) {
    parsedSnapshot.customConfigs.forEach((savedProfile) => {
      if (
        isPlainRecord(savedProfile) &&
        typeof savedProfile.name === "string" &&
        savedProfile.name.trim() &&
        isPlainRecord(savedProfile.settings)
      ) {
        saveCustomConfigProfile(
          savedProfile.name,
          savedProfile.settings,
          savedProfile.customEngineOptions
        );
      }
    });
  }

  if (parsedSnapshot.theme) {
    const importedThemeId =
      typeof parsedSnapshot.theme === "string" ? parsedSnapshot.theme : parsedSnapshot.theme.id;
    applyTheme(importedThemeId || activeThemeId);
    writeChromeStorage("local", { theme: activeThemeId });
  }

  const importedProfileName =
    (typeof parsedSnapshot.name === "string" && parsedSnapshot.name.trim()) ||
    stripMintFileExtension(filename) ||
    "Imported Config";
  const importedUciOptions = isPlainRecord(parsedSnapshot.customEngineOptions)
    ? parsedSnapshot.customEngineOptions
    : {};

  saveCustomConfigProfile(importedProfileName, importedExtensionOptions, importedUciOptions);
  applyConfigProfile(importedExtensionOptions, importedUciOptions, {
    profileName: importedProfileName,
    shouldMarkSaved: true
  });

  return { isSuccess: true, name: importedProfileName };
}

function initializeConfigSystem() {
  loadConfigStorageState();
  if (isConfigSystemInitialized) return;
  isConfigSystemInitialized = true;

  document.getElementById("config-toggle")?.addEventListener("click", (clickEvent) => {
    clickEvent?.stopPropagation?.();
    setConfigPopoverMode(activePopoverMode ? null : "menu");
  });

  document.getElementById("config-action-load")?.addEventListener("click", () => {
    setConfigPopoverMode("load");
  });

  document.getElementById("config-action-save")?.addEventListener("click", () => {
    setConfigPopoverMode("save");
  });

  document.getElementById("config-action-export")?.addEventListener("click", () => {
    exportActiveConfig();
  });

  const importFileInput = document.getElementById("config-import-input");
  document.getElementById("config-action-import")?.addEventListener("click", () => {
    setConfigPopoverMode(null);
    if (importFileInput) {
      importFileInput.value = "";
      importFileInput.click?.();
    }
  });

  importFileInput?.addEventListener("change", () => {
    const selectedFile = importFileInput.files?.[0];
    if (!selectedFile) return;
    selectedFile.text().then(
      (fileContents) => {
        loadConfigStorageState(() => {
          const importOutcome = importMintConfigText(fileContents, selectedFile.name);
          setConfigStatusMessage(
            importOutcome.isSuccess ? `Imported ${importOutcome.name}` : importOutcome.error,
            !importOutcome.isSuccess
          );
        });
      },
      () => setConfigStatusMessage("Failed to read .mint file.", true)
    );
  });

  for (const closeButtonId of ["config-load-close", "config-save-close", "config-save-cancel"]) {
    document
      .getElementById(closeButtonId)
      ?.addEventListener("click", () => setConfigPopoverMode(null));
  }
  document.getElementById("config-save-confirm")?.addEventListener("click", handleSaveProfileSubmit);

  document.getElementById("config-save-name")?.addEventListener("keydown", (keyEvent) => {
    if (keyEvent?.key === "Enter") {
      keyEvent.preventDefault?.();
      handleSaveProfileSubmit();
    }
  });

  document.addEventListener?.("click", (clickEvent) => {
    if (!activePopoverMode) return;
    const popoverElement = document.getElementById("config-popover");
    const configToggleButton = document.getElementById("config-toggle");
    const eventTarget = clickEvent?.target;
    if (popoverElement?.contains?.(eventTarget) || configToggleButton?.contains?.(eventTarget)) {
      return;
    }
    setConfigPopoverMode(null);
  });

  document.addEventListener?.("keydown", (keyEvent) => {
    if (keyEvent?.key === "Escape" && activePopoverMode) {
      setConfigPopoverMode(null);
    }
  });
}

function restoreExtensionOptions() {
  readChromeStorage("sync", DEFAULT_EXTENSION_OPTION_VALUES, (storedExtensionOptions) => {
    if (storedExtensionOptions === null) {
      updateDependentGroupVisibility();
      return;
    }
    applyExtensionOptionsToDom(storedExtensionOptions);
    probeEngineIfPanelExpanded();
  });
}

function handleExtensionOptionChange(changedOptionKey) {
  const extensionOptions = readExtensionOptionsFromDom();

  updateDependentGroupVisibility();
  updateGoCommandPreview(extensionOptions);
  setActiveConfigProfileName(null);

  if (changedOptionKey === "option-url-api-stockfish") {
    flushPendingUciOptions({ shouldNotifyTabs: false });
    invalidateEngineProbe(extensionOptions["option-url-api-stockfish"]);
  }

  const changedPayload = changedOptionKey
    ? { [changedOptionKey]: extensionOptions[changedOptionKey] }
    : extensionOptions;
  writeChromeStorage("sync", changedPayload);
  notifyActiveChessComTabs(changedPayload);
}

function initializeOptionsPage() {
  EXTENSION_OPTION_KEYS.forEach((optionKey) => {
    const inputElement = document.getElementById(optionKey);
    if (!inputElement) return;
    extensionOptionInputs[optionKey] = inputElement;

    if (inputElement.type === "range") {
      const badgeElement = document.getElementById("badge-" + optionKey);
      inputElement.addEventListener("input", () => {
        if (badgeElement) {
          badgeElement.textContent = formatSliderBadgeValue(optionKey, inputElement.value);
        }
        if (optionKey === "option-depth" || optionKey.startsWith("option-go-")) {
          updateGoCommandPreview();
        }
      });
      if (badgeElement) {
        bindEditableSliderBadge(badgeElement, inputElement, {
          optionKey,
          onCommit: () => handleExtensionOptionChange(optionKey)
        });
      }
    } else if (optionKey === "option-go-searchmoves") {
      inputElement.addEventListener("input", () => updateGoCommandPreview());
    }
    inputElement.addEventListener("change", () => handleExtensionOptionChange(optionKey));
  });

  if (!isSearchStopInitialized) {
    isSearchStopInitialized = true;
    document.getElementById("go-stop-btn")?.addEventListener("click", () => {
      notifyActiveChessComTabs({ shouldStopSearch: true });
      setConfigStatusMessage("Stop sent");
    });
    document
      .getElementById("engine-options-details")
      ?.addEventListener("toggle", probeEngineIfPanelExpanded);
  }
  initializeTheme();
  initializeConfigSystem();
  restoreExtensionOptions();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPendingUciOptions);

  window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("github-link")?.addEventListener("click", () => {
      chrome.tabs?.create({ url: "https://github.com/y9felix/BetterMint" });
    });

    initializeOptionsPage();
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    THEMES,
    DEFAULT_CONFIG_PRESETS,
    formatSliderBadgeValue,
    buildGoPreviewCommand,
    applyTheme,
    getExportConfigFilename,
    applyConfigProfile,
    buildConfigExportSnapshot,
    importMintConfigText,
    deleteCustomConfigProfile,
    setConfigPopoverMode,
    parseUciOptionLine,
    renderDynamicUciOptions,
    probeEngineUciOptions,
    initializeOptionsPage,
    handleExtensionOptionChange,
    resetProbeStateForTesting: () => {
      lastProbedEngineUrl = null;
      lastProbedUciOptions = [];
      activeConfigProfileName = null;
      customConfigProfiles = [];
      activePopoverMode = null;
    }
  };
}
