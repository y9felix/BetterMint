"use strict";

const PROBE_TIMEOUT_MS = 4000;
const UCI_OPTIONS_SYNC_DEBOUNCE_MS = 150;
const CONFIG_STATUS_DURATION_MS = 2600;

const THEMES = {
  dark: {
    label: "Dark",
    nextThemeId: "light",
    iconSvg: '<svg viewBox="0 0 16 16" class="svg-icon" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792-.001 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278"/></svg>'
  },
  light: {
    label: "Light",
    nextThemeId: "black",
    iconSvg: '<svg viewBox="0 0 16 16" class="svg-icon" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13m8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5M3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8m10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0m-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0m9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707M4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708"/></svg>'
  },
  black: {
    label: "Black",
    nextThemeId: "chesscom",
    iconSvg: '<svg viewBox="0 0 16 16" class="svg-icon" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm1.1 1.5a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4Z"/></svg>'
  },
  chesscom: {
    label: "Chess.com",
    nextThemeId: "dark",
    iconSvg: '<svg viewBox="0 0 16 16" class="svg-icon" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 1.2a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5M5.5 6.5a.65.65 0 0 0 0 1.3h.85c-.15 1.85-.8 3.35-2.05 4.45h7.4c-1.25-1.1-1.9-2.6-2.05-4.45h.85a.65.65 0 0 0 0-1.3zM3.6 13h8.8a.8.8 0 0 1 .8.8v.4a.8.8 0 0 1-.8.8H3.6a.8.8 0 0 1-.8-.8v-.4a.8.8 0 0 1 .8-.8"/></svg>'
  }
};

const DEFAULT_EXTENSION_OPTION_VALUES =
  typeof DEFAULT_EXTENSION_OPTIONS !== "undefined" ? DEFAULT_EXTENSION_OPTIONS : {};

let activeThemeId = "dark";
let activeConfigProfileName = null;
let customConfigProfiles = [];
let isConfigPopoverOpen = false;
let statusClearTimerId = null;
let isThemeInitialized = false;
let isConfigSystemInitialized = false;
let isEnginePanelInitialized = false;

const ZERO_OFF_SLIDER_OPTION_KEYS = new Set([
  "option-depth",
  "option-go-movetime",
  "option-go-nodes",
  "option-opening-moves-threshold",
  "option-clock-threshold"
]);

const ONE_OFF_SLIDER_OPTION_KEYS = new Set([
  "option-reflex-multiplier",
  "option-opening-multiplier"
]);

const FIXED_TWO_DECIMAL_SLIDER_OPTION_KEYS = new Set([
  "option-move-pace",
  "option-timing-spread",
  "option-reflex-multiplier",
  "option-opening-multiplier"
]);

const EXTENSION_OPTION_KEYS =
  typeof DEFAULT_EXTENSION_OPTIONS !== "undefined" ? Object.keys(DEFAULT_EXTENSION_OPTIONS) : [];
const extensionOptionInputs = {};

function formatSliderBadgeValue(optionKey, rawValue) {
  const numericValue = Number(rawValue);
  if (ZERO_OFF_SLIDER_OPTION_KEYS.has(optionKey) && numericValue === 0) return "Off";
  if (ONE_OFF_SLIDER_OPTION_KEYS.has(optionKey) && numericValue >= 1) return "Off";
  if (optionKey === "option-go-nodes" && !Number.isNaN(numericValue)) {
    return numericValue.toLocaleString("en-US");
  }
  if (FIXED_TWO_DECIMAL_SLIDER_OPTION_KEYS.has(optionKey) && !Number.isNaN(numericValue)) {
    return numericValue.toFixed(2);
  }
  return rawValue;
}

const boundEditableBadges = new WeakSet();
const baseSliderSteps = new WeakMap();

function isPlainRecord(candidate) {
  return Boolean(candidate) && typeof candidate === "object" && !Array.isArray(candidate);
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

function updateSliderTrackFill(rangeInput) {
  if (!rangeInput?.style?.setProperty) return;
  const parsedMin = parseFloat(rangeInput.min);
  const parsedMax = parseFloat(rangeInput.max);
  const parsedValue = parseFloat(rangeInput.value);
  const sliderMin = Number.isNaN(parsedMin) ? 0 : parsedMin;
  const sliderMax = Number.isNaN(parsedMax) ? 100 : parsedMax;
  const sliderValue = Number.isNaN(parsedValue) ? sliderMin : parsedValue;
  const rangeSpan = sliderMax - sliderMin;
  const progressPercent =
    rangeSpan > 0 ? Math.min(100, Math.max(0, ((sliderValue - sliderMin) / rangeSpan) * 100)) : 0;
  rangeInput.style.setProperty("--slider-progress", `${progressPercent.toFixed(2)}%`);
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
  updateSliderTrackFill(rangeInput);
}

function parseAndClampSliderInput(rangeInput, rawText, optionKey = null) {
  const cleanedText = String(rawText ?? "").trim().replace(/,/g, "");
  if (!cleanedText) return null;

  let parsedNumber;
  if (cleanedText.toLowerCase() === "off" && optionKey && ZERO_OFF_SLIDER_OPTION_KEYS.has(optionKey)) {
    parsedNumber = 0;
  } else if (cleanedText.toLowerCase() === "off" && optionKey && ONE_OFF_SLIDER_OPTION_KEYS.has(optionKey)) {
    parsedNumber = 1;
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
    const editLabel = badgeElement.getAttribute?.("aria-label") || "Edit value";
    inlineEditor.setAttribute?.("aria-label", editLabel);

    badgeElement.classList?.add("hidden");
    headerElement.appendChild(inlineEditor);
    inlineEditor.focus?.();
    inlineEditor.select?.();

    let hasFinishedEdit = false;
    const finishEdit = (shouldCommit, shouldRestoreFocus = false) => {
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
      if (shouldRestoreFocus) {
        badgeElement.focus?.();
      }
    };

    inlineEditor.addEventListener("keydown", (keyEvent) => {
      if (keyEvent?.key === "Enter") {
        keyEvent.preventDefault?.();
        keyEvent.stopPropagation?.();
        finishEdit(true, true);
      } else if (keyEvent?.key === "Escape") {
        keyEvent.preventDefault?.();
        keyEvent.stopPropagation?.();
        finishEdit(false, true);
      }
    });
    inlineEditor.addEventListener("blur", () => finishEdit(true, false));
  });
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

function getDefaultThemeId() {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

function initializeTheme() {
  applyTheme(getDefaultThemeId());
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

function buildUciControlId(optionName, optionIndex) {
  const normalizedSlug = String(optionName || "option")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `uci-option-${normalizedSlug || "control"}-${optionIndex}`;
}

const uciOptionControlRenderers = {
  spin(uciOption, currentValue, onUciOptionChange, controlId) {
    const valueBadge = createDomElement("button", {
      type: "button",
      className: "badge",
      textContent: currentValue
    });
    valueBadge.setAttribute?.("aria-label", `Edit ${uciOption.name} value`);
    const rangeInput = createDomElement("input", {
      id: controlId,
      type: "range",
      className: "range-slider",
      min: uciOption.min ?? 0,
      max: uciOption.max ?? 100,
      value: currentValue
    });
    updateSliderTrackFill(rangeInput);
    rangeInput.addEventListener("input", () => {
      valueBadge.textContent = rangeInput.value;
      updateSliderTrackFill(rangeInput);
      onUciOptionChange?.(uciOption.name, parseInt(rangeInput.value, 10), false);
    });
    bindEditableSliderBadge(valueBadge, rangeInput, {
      onCommit: (committedNumber) => onUciOptionChange?.(uciOption.name, parseInt(committedNumber, 10), false)
    });
    const titleLabel = createDomElement("label", {
      className: "title",
      htmlFor: controlId,
      textContent: uciOption.name
    });
    titleLabel.setAttribute?.("for", controlId);
    return createDomElement("div", { className: "control-col" }, [
      createDomElement("div", { className: "slider-header" }, [titleLabel, valueBadge]),
      rangeInput
    ]);
  },
  check(uciOption, currentValue, onUciOptionChange, controlId) {
    const checkboxInput = createDomElement("input", {
      id: controlId,
      type: "checkbox",
      className: "toggle-input",
      checked: currentValue === true || currentValue === "true"
    });
    checkboxInput.addEventListener("change", () => {
      onUciOptionChange?.(uciOption.name, checkboxInput.checked, false);
    });
    const toggleVisual = createDomElement("span", { className: "toggle-slider" });
    toggleVisual.setAttribute?.("aria-hidden", "true");
    const rowLabel = createDomElement("label", { className: "control-row", htmlFor: controlId }, [
      createDomElement("span", { className: "control-label-text", textContent: uciOption.name }),
      checkboxInput,
      toggleVisual
    ]);
    rowLabel.setAttribute?.("for", controlId);
    return rowLabel;
  },
  combo(uciOption, currentValue, onUciOptionChange, controlId) {
    const selectInput = createDomElement(
      "select",
      { id: controlId, className: "select-input" },
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
    const fieldLabel = createDomElement("label", {
      className: "control-label-text",
      htmlFor: controlId,
      textContent: uciOption.name
    });
    fieldLabel.setAttribute?.("for", controlId);
    return createDomElement("div", { className: "control-col" }, [fieldLabel, selectInput]);
  },
  string(uciOption, currentValue, onUciOptionChange, controlId) {
    const textInput = createDomElement("input", {
      id: controlId,
      type: "text",
      className: "text-input",
      value: String(currentValue ?? ""),
      spellcheck: false,
      autocomplete: "off"
    });
    textInput.addEventListener("change", () => {
      onUciOptionChange?.(uciOption.name, textInput.value.trim(), false);
    });
    const fieldLabel = createDomElement("label", {
      className: "control-label-text",
      htmlFor: controlId,
      textContent: uciOption.name
    });
    fieldLabel.setAttribute?.("for", controlId);
    return createDomElement("div", { className: "control-col" }, [fieldLabel, textInput]);
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
  containerElement.setAttribute?.("aria-busy", "false");
  containerElement.innerHTML = "";
  if (!uciOptionDefinitions || uciOptionDefinitions.length === 0) {
    containerElement.innerHTML =
      '<span class="status-text">No configurable options reported by engine.</span>';
    return;
  }

  uciOptionDefinitions.forEach((uciOption, optionIndex) => {
    const renderControl = uciOptionControlRenderers[uciOption.type];
    if (!renderControl) return;
    const currentValue = savedUciValues?.[uciOption.name] ?? uciOption.default;
    const controlId = buildUciControlId(uciOption.name, optionIndex);
    containerElement.appendChild(renderControl(uciOption, currentValue, onUciOptionChange, controlId));
  });
}

let activeProbeSocket = null;
let probeTimeoutTimerId = null;
let lastProbedEngineUrl = null;
let lastProbedUciOptions = [];

function setEngineOptionsStatusMessage(
  statusMessage,
  { isError = false, isLoading = false } = {}
) {
  const containerElement = document.getElementById("engine-options-container");
  if (!containerElement) return;
  containerElement.setAttribute?.("aria-busy", String(Boolean(isLoading)));
  containerElement.innerHTML = "";

  if (isLoading) {
    const skeletonWrapper = createDomElement("div", { className: "uci-skeleton" }, [
      createDomElement("div", { className: "skeleton-line is-medium" }),
      createDomElement("div", { className: "skeleton-line" }),
      createDomElement("div", { className: "skeleton-line is-short" })
    ]);
    skeletonWrapper.setAttribute?.("aria-hidden", "true");
    containerElement.appendChild(skeletonWrapper);
  }

  const statusTextElement = createDomElement("span", {
    className: "status-text",
    textContent: statusMessage
  });
  if (isError) {
    statusTextElement.setAttribute?.("role", "alert");
  }
  containerElement.appendChild(statusTextElement);
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
    setEngineOptionsStatusMessage("WebSocket unavailable.", { isError: true });
    return;
  }
  if (!engineUrl || !/^wss?:\/\//i.test(engineUrl)) {
    setEngineOptionsStatusMessage("Invalid WebSocket URL (use ws:// or wss://).", { isError: true });
    return;
  }

  setEngineOptionsStatusMessage("Connecting to engine...", { isLoading: true });
  const discoveredUciOptions = [];
  let lastErrorLine = "";
  try {
    const probeSocket = new WebSocket(engineUrl);
    activeProbeSocket = probeSocket;
    probeTimeoutTimerId = setTimeout(() => {
      if (activeProbeSocket !== probeSocket) return;
      resetEngineProbe();
      setEngineOptionsStatusMessage("Connection timed out.", { isError: true });
    }, PROBE_TIMEOUT_MS);

    probeSocket.addEventListener("open", () => {
      if (activeProbeSocket !== probeSocket) return;
      if (probeTimeoutTimerId) clearTimeout(probeTimeoutTimerId);
      probeTimeoutTimerId = setTimeout(() => {
        if (activeProbeSocket !== probeSocket) return;
        resetEngineProbe();
        setEngineOptionsStatusMessage("Engine handshake timed out.", { isError: true });
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
        lastErrorLine || "Engine connection closed before handshake.",
        { isError: true }
      );
    });

    probeSocket.addEventListener("error", () => {
      if (activeProbeSocket !== probeSocket) return;
      resetEngineProbe();
      setEngineOptionsStatusMessage("Unable to connect to engine.", { isError: true });
    });
  } catch (socketError) {
    console.warn("[BetterMint] Failed to initialize engine probe socket:", socketError);
    resetEngineProbe();
    setEngineOptionsStatusMessage("Failed to initialize engine socket.", { isError: true });
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
      normalizedOptions[optionKey] = Boolean(incomingValue);
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
      inputElement.checked = Boolean(optionValue);
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

  if (customConfigProfiles.length === 0) {
    listContainer.appendChild(
      createDomElement("div", {
        className: "config-empty",
        textContent: "No saved configs yet. Name and save your current setup above."
      })
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
    if (isActiveProfile) {
      selectProfileButton.setAttribute?.("aria-current", "true");
    }
    selectProfileButton.addEventListener("click", () => {
      applyConfigProfile(savedProfile.settings, savedProfile.customEngineOptions, {
        profileName: savedProfile.name,
        shouldMarkSaved: true
      });
      setConfigPopoverOpen(false, { shouldRestoreFocus: true });
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

function clearConfigSaveError() {
  const saveErrorElement = document.getElementById("config-save-error");
  const profileNameInput = document.getElementById("config-save-name");
  saveErrorElement?.classList?.add("hidden");
  profileNameInput?.removeAttribute?.("aria-invalid");
  profileNameInput?.removeAttribute?.("aria-describedby");
}

function setConfigPopoverOpen(shouldOpen, { shouldRestoreFocus = false } = {}) {
  isConfigPopoverOpen = Boolean(shouldOpen);
  const popoverElement = document.getElementById("config-popover");
  const configToggleButton = document.getElementById("config-toggle");

  if (configToggleButton) {
    configToggleButton.setAttribute?.("aria-expanded", String(isConfigPopoverOpen));
  }
  if (!popoverElement) return;

  popoverElement.classList?.toggle("hidden", !isConfigPopoverOpen);
  clearConfigSaveError();

  if (isConfigPopoverOpen) {
    loadConfigStorageState(() => {
      const profileNameInput = document.getElementById("config-save-name");
      if (profileNameInput) {
        profileNameInput.value = activeConfigProfileName || "";
        profileNameInput.focus?.();
      }
      renderSavedConfigList();
    });
  } else if (shouldRestoreFocus) {
    configToggleButton?.focus?.();
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

function handleSaveProfileSubmit() {
  const profileNameInput = document.getElementById("config-save-name");
  const saveErrorElement = document.getElementById("config-save-error");
  const profileName = profileNameInput?.value?.trim() || "";
  if (!profileName) {
    if (saveErrorElement) {
      saveErrorElement.textContent = "Enter a config name.";
      saveErrorElement.classList?.remove("hidden");
    }
    profileNameInput?.setAttribute?.("aria-invalid", "true");
    profileNameInput?.setAttribute?.("aria-describedby", "config-save-error");
    profileNameInput?.focus?.();
    return;
  }

  clearConfigSaveError();
  flushPendingUciOptions();
  const extensionOptions = readExtensionOptionsFromDom();
  loadConfigStorageState((storageState) => {
    saveCustomConfigProfile(profileName, extensionOptions, storageState.customEngineOptions);
    setActiveConfigProfileName(profileName);
    setConfigPopoverOpen(false, { shouldRestoreFocus: true });
    setConfigStatusMessage(`Saved ${profileName}`);
  });
}

function initializeConfigSystem() {
  loadConfigStorageState();
  if (isConfigSystemInitialized) return;
  isConfigSystemInitialized = true;

  document.getElementById("config-toggle")?.addEventListener("click", (clickEvent) => {
    clickEvent?.stopPropagation?.();
    setConfigPopoverOpen(!isConfigPopoverOpen);
  });

  document.getElementById("config-close")?.addEventListener("click", () => {
    setConfigPopoverOpen(false, { shouldRestoreFocus: true });
  });
  document.getElementById("config-save-confirm")?.addEventListener("click", handleSaveProfileSubmit);

  const profileNameInput = document.getElementById("config-save-name");
  profileNameInput?.addEventListener("input", clearConfigSaveError);
  profileNameInput?.addEventListener("keydown", (keyEvent) => {
    if (keyEvent?.key === "Enter") {
      keyEvent.preventDefault?.();
      handleSaveProfileSubmit();
    }
  });

  document.addEventListener?.("click", (clickEvent) => {
    if (!isConfigPopoverOpen) return;
    const popoverElement = document.getElementById("config-popover");
    const configToggleButton = document.getElementById("config-toggle");
    const eventTarget = clickEvent?.target;
    if (popoverElement?.contains?.(eventTarget) || configToggleButton?.contains?.(eventTarget)) {
      return;
    }
    setConfigPopoverOpen(false);
  });

  document.addEventListener?.("keydown", (keyEvent) => {
    if (keyEvent?.key === "Escape" && isConfigPopoverOpen) {
      setConfigPopoverOpen(false, { shouldRestoreFocus: true });
    }
  });
}

function enableInteractiveTransitions() {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body?.classList?.add("is-ready");
      });
    });
  }
}

function restoreExtensionOptions() {
  readChromeStorage("sync", DEFAULT_EXTENSION_OPTION_VALUES, (storedExtensionOptions) => {
    if (storedExtensionOptions === null) {
      updateDependentGroupVisibility();
      enableInteractiveTransitions();
      return;
    }
    applyExtensionOptionsToDom(storedExtensionOptions);
    probeEngineIfPanelExpanded();
    enableInteractiveTransitions();
  });
}

function handleExtensionOptionChange(changedOptionKey) {
  const extensionOptions = readExtensionOptionsFromDom();

  updateDependentGroupVisibility();
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
      updateSliderTrackFill(inputElement);
      inputElement.addEventListener("input", () => {
        updateSliderTrackFill(inputElement);
        if (badgeElement) {
          badgeElement.textContent = formatSliderBadgeValue(optionKey, inputElement.value);
        }
      });
      if (badgeElement) {
        bindEditableSliderBadge(badgeElement, inputElement, {
          optionKey,
          onCommit: () => handleExtensionOptionChange(optionKey)
        });
      }
    }
    inputElement.addEventListener("change", () => handleExtensionOptionChange(optionKey));
  });

  if (!isEnginePanelInitialized) {
    isEnginePanelInitialized = true;
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
    resetProbeStateForTesting: () => {
      lastProbedEngineUrl = null;
      lastProbedUciOptions = [];
      activeConfigProfileName = null;
      customConfigProfiles = [];
      isConfigPopoverOpen = false;
    }
  };
}
