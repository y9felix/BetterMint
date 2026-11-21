"use strict";

const PROBE_TIMEOUT_MS = 4000;
const UCI_OPTIONS_SYNC_DEBOUNCE_MS = 150;
const CONFIG_STATUS_DURATION_MS = 2600;
const EXPAND_SCROLL_DURATION_MS = 260;
const EXPAND_SCROLL_PADDING_PX = 10;

const DEFAULT_EXTENSION_OPTION_VALUES =
  typeof DEFAULT_EXTENSION_OPTIONS !== "undefined" ? DEFAULT_EXTENSION_OPTIONS : {};
const EXTENSION_OPTION_KEYS = Object.keys(DEFAULT_EXTENSION_OPTION_VALUES);

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
    iconSvg: '<svg viewBox="0 0 16 16" class="svg-icon" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 15A7 7 0 1 0 8 1zm0 1A8 8 0 1 1 8 0a8 8 0 0 1 0 16"/></svg>'
  },
  chesscom: {
    label: "Chess.com",
    nextThemeId: "dark",
    iconSvg: '<svg viewBox="0 0 16 16" class="svg-icon" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.5 6.38A2.9 2.9 0 1 1 9.5 6.38C11.1 6.45 11.2 7.65 9.7 7.8C9.9 10.1 10.9 11.7 12.3 12.6C13.1 13 13.4 13.6 13.4 14.3C13.4 14.75 13.05 15 12.6 15H3.4C2.95 15 2.6 14.75 2.6 14.3C2.6 13.6 2.9 13 3.7 12.6C5.1 11.7 6.1 10.1 6.3 7.8C4.8 7.65 4.9 6.45 6.5 6.38Z"/></svg>'
  }
};

const SLIDER_VALUE_SPECS = {
  "option-depth": { offValue: 0 },
  "option-go-movetime": { offValue: 0 },
  "option-go-nodes": { offValue: 0, grouped: true },
  "option-move-pace": { decimals: 2 },
  "option-timing-spread": { decimals: 2 },
  "option-reflex-multiplier": { offValue: 1, decimals: 2 },
  "option-opening-moves-threshold": { offValue: 0 },
  "option-opening-multiplier": { offValue: 1, decimals: 2 },
  "option-clock-threshold": { offValue: 0 }
};

const VISIBILITY_TOGGLE_GROUPS = [
  ["option-auto-queue", "auto-queue-group"],
  ["option-legit-auto-move", "pacing-group"],
  ["option-human-like-moves", "human-pace-group"]
];

const DISCLOSURE_PANEL_IDS = [
  "go-command-details",
  "engine-options-details",
  "advanced-timing-details"
];

const UCI_OPTION_KEYWORDS = new Set(["default", "min", "max", "var"]);

const boundEditableBadges = new WeakSet();
const baseSliderSteps = new WeakMap();

function isPlainRecord(candidate) {
  return Boolean(candidate) && typeof candidate === "object" && !Array.isArray(candidate);
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

function getDefaultThemeId() {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

function formatSliderBadgeValue(optionKey, rawValue) {
  const numericValue = Number(rawValue);
  const sliderSpec = SLIDER_VALUE_SPECS[optionKey];
  if (sliderSpec && !Number.isNaN(numericValue)) {
    if (sliderSpec.offValue === 0 && numericValue === 0) return "Off";
    if (sliderSpec.offValue === 1 && numericValue >= 1) return "Off";
    if (sliderSpec.grouped) return numericValue.toLocaleString("en-US");
    if (sliderSpec.decimals !== undefined) return numericValue.toFixed(sliderSpec.decimals);
  }
  return rawValue;
}

function getBaseSliderStep(rangeInput) {
  if (baseSliderSteps.has(rangeInput)) return baseSliderSteps.get(rangeInput);
  const baseStep =
    rangeInput.step !== null && rangeInput.step !== undefined && rangeInput.step !== ""
      ? String(rangeInput.step)
      : "";
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

  const offValue = optionKey ? SLIDER_VALUE_SPECS[optionKey]?.offValue : undefined;
  let parsedNumber;
  if (cleanedText.toLowerCase() === "off" && offValue !== undefined) {
    parsedNumber = offValue;
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

function createExpandScrollTracker() {
  let activeFrameId = null;
  let stopTracking = null;

  const stop = () => {
    stopTracking?.();
  };

  const scrollIntoView = (targetElement, anchorElement = null) => {
    if (!targetElement?.getBoundingClientRect || typeof document === "undefined") return;
    const scrollContainer = document.querySelector?.(".settings-container");
    if (!scrollContainer?.getBoundingClientRect) return;

    stop();

    const topElement = anchorElement?.getBoundingClientRect ? anchorElement : targetElement;

    const alignTarget = () => {
      const containerRect = scrollContainer.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      const topRect = topElement.getBoundingClientRect();
      const overflowBottom = targetRect.bottom - containerRect.bottom + EXPAND_SCROLL_PADDING_PX;
      if (overflowBottom <= 0) return;
      const maxTopHeadroom = Math.max(0, topRect.top - containerRect.top - EXPAND_SCROLL_PADDING_PX);
      const scrollDelta = Math.min(overflowBottom, maxTopHeadroom);
      if (scrollDelta > 0) {
        scrollContainer.scrollTop += scrollDelta;
      }
    };

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || typeof requestAnimationFrame !== "function") {
      alignTarget();
      return;
    }

    const cleanupTracking = () => {
      if (activeFrameId && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(activeFrameId);
        activeFrameId = null;
      }
      scrollContainer.removeEventListener?.("wheel", cleanupTracking);
      scrollContainer.removeEventListener?.("pointerdown", cleanupTracking);
      if (stopTracking === cleanupTracking) {
        stopTracking = null;
      }
    };

    stopTracking = cleanupTracking;
    scrollContainer.addEventListener?.("wheel", cleanupTracking, { passive: true, once: true });
    scrollContainer.addEventListener?.("pointerdown", cleanupTracking, { passive: true, once: true });

    const startTimestamp = typeof performance !== "undefined" ? performance.now() : Date.now();
    const trackFrame = (nowTimestamp) => {
      alignTarget();
      const elapsedMs =
        (typeof nowTimestamp === "number" ? nowTimestamp : Date.now()) - startTimestamp;
      if (elapsedMs < EXPAND_SCROLL_DURATION_MS) {
        activeFrameId = requestAnimationFrame(trackFrame);
      } else {
        cleanupTracking();
      }
    };
    activeFrameId = requestAnimationFrame(trackFrame);
  };

  return { scrollIntoView, stop };
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
    if (UCI_OPTION_KEYWORDS.has(token)) {
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

function buildUciControlId(optionName, optionIndex) {
  const normalizedSlug = String(optionName || "option")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `uci-option-${normalizedSlug || "control"}-${optionIndex}`;
}

const UCI_OPTION_CONTROL_RENDERERS = {
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
    const rowLabel = createDomElement("label", { className: "control-row" }, [
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
    const renderControl = UCI_OPTION_CONTROL_RENDERERS[uciOption.type];
    if (!renderControl) return;
    const currentValue = savedUciValues?.[uciOption.name] ?? uciOption.default;
    const controlId = buildUciControlId(uciOption.name, optionIndex);
    containerElement.appendChild(renderControl(uciOption, currentValue, onUciOptionChange, controlId));
  });
}

function formatConfigProfileSummary(extensionOptions) {
  const depth = extensionOptions?.["option-depth"] ?? DEFAULT_EXTENSION_OPTION_VALUES["option-depth"];
  const movePace =
    extensionOptions?.["option-move-pace"] ?? DEFAULT_EXTENSION_OPTION_VALUES["option-move-pace"];
  const autoMoveMode = extensionOptions?.["option-legit-auto-move"] ? "Auto" : "Manual";
  return `D${depth} · ${autoMoveMode} · ${movePace}s`;
}

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

function writeChromeStorage(storageArea, storagePayload, onError = null) {
  const storageHandle = typeof chrome !== "undefined" ? chrome.storage?.[storageArea] : null;
  if (!storageHandle?.set) return;
  storageHandle.set(storagePayload, () => {
    const runtimeError = typeof chrome !== "undefined" ? chrome.runtime?.lastError : null;
    if (runtimeError) {
      console.error(
        `[BetterMint] Failed to write ${storageArea} storage:`,
        runtimeError.message || runtimeError
      );
      onError?.();
    }
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

class UciOptionsController {
  constructor({ getActiveEngineUrl, onUserModified, onExpandedContentReady, onStorageWriteError }) {
    this.getActiveEngineUrl = getActiveEngineUrl;
    this.onUserModified = onUserModified;
    this.onExpandedContentReady = onExpandedContentReady;
    this.onStorageWriteError = onStorageWriteError;

    this.activeProbeSocket = null;
    this.probeTimeoutTimerId = null;
    this.lastProbedEngineUrl = null;
    this.lastProbedUciOptions = [];
    this.uciOptionsSyncTimerId = null;
    this.pendingUciOptionsWrite = null;
  }

  getPendingWriteForKey(storageKey) {
    if (this.pendingUciOptionsWrite && this.pendingUciOptionsWrite.storageKey === storageKey) {
      return this.pendingUciOptionsWrite.uciOptions;
    }
    return null;
  }

  hasCachedOptionsFor(engineUrl) {
    return this.lastProbedEngineUrl === engineUrl && this.lastProbedUciOptions.length > 0;
  }

  clearPendingWrite() {
    this.pendingUciOptionsWrite = null;
    if (this.uciOptionsSyncTimerId) {
      clearTimeout(this.uciOptionsSyncTimerId);
      this.uciOptionsSyncTimerId = null;
    }
  }

  flushPendingWrite({ shouldNotifyTabs = true } = {}) {
    if (!this.pendingUciOptionsWrite) return;
    if (this.uciOptionsSyncTimerId) {
      clearTimeout(this.uciOptionsSyncTimerId);
      this.uciOptionsSyncTimerId = null;
    }
    const { storageKey, engineUrl, uciOptions } = this.pendingUciOptionsWrite;
    this.pendingUciOptionsWrite = null;
    writeChromeStorage("local", { [storageKey]: uciOptions }, this.onStorageWriteError);
    const activeEngineUrl = this.getActiveEngineUrl?.();
    if (shouldNotifyTabs && (!engineUrl || !activeEngineUrl || engineUrl === activeEngineUrl)) {
      notifyActiveChessComTabs({ customEngineOptions: uciOptions });
    }
  }

  scheduleOptionsWrite(storageKey, engineUrl, uciOptions) {
    this.pendingUciOptionsWrite = { storageKey, engineUrl, uciOptions };
    if (this.uciOptionsSyncTimerId) clearTimeout(this.uciOptionsSyncTimerId);
    this.uciOptionsSyncTimerId = setTimeout(
      () => this.flushPendingWrite(),
      UCI_OPTIONS_SYNC_DEBOUNCE_MS
    );
  }

  setStatusMessage(statusMessage, { isError = false, isLoading = false } = {}) {
    const containerElement = document.getElementById("engine-options-container");
    if (!containerElement) return;
    containerElement.setAttribute?.("aria-busy", String(Boolean(isLoading)));
    containerElement.innerHTML = "";

    const statusTextElement = createDomElement("span", {
      className: "status-text",
      textContent: statusMessage
    });
    if (isError) {
      statusTextElement.setAttribute?.("role", "alert");
    }
    containerElement.appendChild(statusTextElement);
  }

  bindDynamicControls(
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
        this.onUserModified?.();
        this.scheduleOptionsWrite(storageKey, engineUrl, mutableUciValues);
      }
    );
  }

  rerenderCachedOptions(engineUrl, storageKey, savedUciValues) {
    const containerElement = document.getElementById("engine-options-container");
    if (!containerElement || !storageKey || !this.hasCachedOptionsFor(engineUrl)) return;
    this.bindDynamicControls(
      storageKey,
      this.lastProbedUciOptions,
      savedUciValues,
      containerElement,
      engineUrl
    );
  }

  loadAndRenderOptions(engineUrl, uciOptionDefinitions, containerElement) {
    const storageKey = getEngineOptionsStorageKey(engineUrl);
    readChromeStorage("local", [storageKey], (storedResult) => {
      if (storedResult === null) {
        renderDynamicUciOptions(uciOptionDefinitions, {}, containerElement, null);
        return;
      }
      if (this.lastProbedEngineUrl !== engineUrl) return;
      this.bindDynamicControls(
        storageKey,
        uciOptionDefinitions,
        storedResult?.[storageKey],
        containerElement,
        engineUrl
      );
      const engineDetailsElement = document.getElementById("engine-options-details");
      if (engineDetailsElement?.open && document.body?.classList?.contains("is-ready")) {
        this.onExpandedContentReady?.(engineDetailsElement);
      }
    });
  }

  resetProbe() {
    if (this.probeTimeoutTimerId) {
      clearTimeout(this.probeTimeoutTimerId);
      this.probeTimeoutTimerId = null;
    }
    if (this.activeProbeSocket) {
      const probeSocket = this.activeProbeSocket;
      this.activeProbeSocket = null;
      try {
        probeSocket.close();
      } catch (closeError) {
        console.warn("[BetterMint] Failed to close probe WebSocket:", closeError);
      }
    }
  }

  probeOptions(engineUrl, onProbeComplete = null) {
    const containerElement = document.getElementById("engine-options-container");
    if (!containerElement) return;
    this.resetProbe();

    if (typeof WebSocket === "undefined") {
      this.setStatusMessage("WebSocket unavailable.", { isError: true });
      return;
    }
    if (!engineUrl || !/^wss?:\/\//i.test(engineUrl)) {
      this.setStatusMessage("Invalid WebSocket URL (use ws:// or wss://).", { isError: true });
      return;
    }

    this.setStatusMessage("Connecting to engine...", { isLoading: true });
    const discoveredUciOptions = [];
    let lastErrorLine = "";
    const handleComplete =
      onProbeComplete ||
      ((url, options, container) => this.loadAndRenderOptions(url, options, container));

    try {
      const probeSocket = new WebSocket(engineUrl);
      this.activeProbeSocket = probeSocket;
      this.probeTimeoutTimerId = setTimeout(() => {
        if (this.activeProbeSocket !== probeSocket) return;
        this.resetProbe();
        this.setStatusMessage("Connection timed out.", { isError: true });
      }, PROBE_TIMEOUT_MS);

      probeSocket.addEventListener("open", () => {
        if (this.activeProbeSocket !== probeSocket) return;
        if (this.probeTimeoutTimerId) clearTimeout(this.probeTimeoutTimerId);
        this.probeTimeoutTimerId = setTimeout(() => {
          if (this.activeProbeSocket !== probeSocket) return;
          this.resetProbe();
          this.setStatusMessage("Engine handshake timed out.", { isError: true });
        }, PROBE_TIMEOUT_MS);
        probeSocket.send("uci\n");
      });

      probeSocket.addEventListener("message", (messageEvent) => {
        if (this.activeProbeSocket !== probeSocket) return;
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
            this.lastProbedEngineUrl = engineUrl;
            this.lastProbedUciOptions = discoveredUciOptions.slice();
            this.resetProbe();
            handleComplete(engineUrl, discoveredUciOptions, containerElement);
            return;
          }
        }
      });

      probeSocket.addEventListener("close", () => {
        if (this.activeProbeSocket !== probeSocket) return;
        this.resetProbe();
        this.setStatusMessage(lastErrorLine || "Engine connection closed before handshake.", {
          isError: true
        });
      });

      probeSocket.addEventListener("error", () => {
        if (this.activeProbeSocket !== probeSocket) return;
        this.resetProbe();
        this.setStatusMessage("Unable to connect to engine.", { isError: true });
      });
    } catch (socketError) {
      console.warn("[BetterMint] Failed to initialize engine probe socket:", socketError);
      this.resetProbe();
      this.setStatusMessage("Failed to initialize engine socket.", { isError: true });
    }
  }

  probeIfPanelExpanded() {
    const engineDetailsElement = document.getElementById("engine-options-details");
    if (!engineDetailsElement?.open) return;
    const engineUrl = this.getActiveEngineUrl?.();
    if (this.lastProbedEngineUrl !== engineUrl) {
      this.probeOptions(engineUrl);
    }
  }

  invalidate(engineUrl) {
    this.lastProbedEngineUrl = null;
    this.lastProbedUciOptions = [];
    this.resetProbe();
    if (document.getElementById("engine-options-details")?.open) {
      this.probeOptions(engineUrl);
    } else {
      this.setStatusMessage("Expand to load engine options.");
    }
  }

  reset() {
    this.resetProbe();
    this.clearPendingWrite();
    this.lastProbedEngineUrl = null;
    this.lastProbedUciOptions = [];
  }
}

class ConfigProfileController {
  constructor({
    getActiveEngineUrl,
    getPendingUciWrite,
    readExtensionOptions,
    normalizeExtensionOptions,
    onBeforeSave,
    onSelectProfile
  }) {
    this.getActiveEngineUrl = getActiveEngineUrl;
    this.getPendingUciWrite = getPendingUciWrite;
    this.readExtensionOptions = readExtensionOptions;
    this.normalizeExtensionOptions = normalizeExtensionOptions;
    this.onBeforeSave = onBeforeSave;
    this.onSelectProfile = onSelectProfile;

    this.customConfigProfiles = [];
    this.activeConfigProfileName = null;
    this.isPopoverOpen = false;
    this.statusClearTimerId = null;
    this.isEventsBound = false;
  }

  setActiveProfileName(profileName) {
    const normalizedName = profileName || null;
    if (this.activeConfigProfileName === normalizedName) return;
    this.activeConfigProfileName = normalizedName;
    writeChromeStorage("local", { activeConfigName: this.activeConfigProfileName }, () =>
      this.setStatusMessage("Failed to save settings.", true)
    );
  }

  loadStorageState(onLoaded) {
    const engineUrl =
      this.getActiveEngineUrl?.() || DEFAULT_EXTENSION_OPTION_VALUES["option-url-api-stockfish"];
    const engineStorageKey = getEngineOptionsStorageKey(engineUrl);
    const storageKeys = ["customConfigs", "activeConfigName"];
    if (engineStorageKey) storageKeys.push(engineStorageKey);

    readChromeStorage("local", storageKeys, (storedState) => {
      if (storedState === null) {
        onLoaded?.({ customEngineOptions: {} });
        return;
      }
      if (Array.isArray(storedState.customConfigs)) {
        this.customConfigProfiles = storedState.customConfigs;
      }
      if (Object.prototype.hasOwnProperty.call(storedState, "activeConfigName")) {
        this.activeConfigProfileName = storedState.activeConfigName || null;
      }
      const storedUciOptions = engineStorageKey ? storedState[engineStorageKey] || {} : {};
      const liveUciOptions = this.getPendingUciWrite?.(engineStorageKey) || storedUciOptions;
      onLoaded?.({ customEngineOptions: Object.assign({}, liveUciOptions) });
    });
  }

  saveProfile(profileName, extensionOptions, uciOptionOverrides) {
    const trimmedName = String(profileName || "").trim();
    if (!trimmedName) return null;
    const savedProfile = {
      name: trimmedName,
      settings: this.normalizeExtensionOptions(extensionOptions),
      customEngineOptions: Object.assign({}, uciOptionOverrides || {}),
      updatedAt: Date.now()
    };
    const remainingProfiles = this.customConfigProfiles.filter(
      (profile) => profile.name.toLowerCase() !== trimmedName.toLowerCase()
    );
    this.customConfigProfiles = [savedProfile, ...remainingProfiles];
    writeChromeStorage("local", { customConfigs: this.customConfigProfiles }, () =>
      this.setStatusMessage("Failed to save settings.", true)
    );
    return savedProfile;
  }

  deleteProfile(profileName) {
    this.customConfigProfiles = this.customConfigProfiles.filter(
      (profile) => profile.name !== profileName
    );
    const storageUpdates = { customConfigs: this.customConfigProfiles };
    if (this.activeConfigProfileName === profileName) {
      this.activeConfigProfileName = null;
      storageUpdates.activeConfigName = null;
    }
    writeChromeStorage("local", storageUpdates, () =>
      this.setStatusMessage("Failed to save settings.", true)
    );
  }

  setStatusMessage(statusMessage, isError = false) {
    const statusElement = document.getElementById("config-status");
    if (!statusElement) return;
    if (this.statusClearTimerId) {
      clearTimeout(this.statusClearTimerId);
      this.statusClearTimerId = null;
    }
    statusElement.textContent = statusMessage || "";
    statusElement.classList?.toggle("is-error", Boolean(isError));
    statusElement.classList?.toggle("hidden", !statusMessage);
    if (statusMessage) {
      this.statusClearTimerId = setTimeout(() => {
        statusElement.textContent = "";
        statusElement.classList?.add("hidden");
        this.statusClearTimerId = null;
      }, CONFIG_STATUS_DURATION_MS);
    }
  }

  updateSaveButtonState() {
    const saveButton = document.getElementById("config-save-confirm");
    const profileNameInput = document.getElementById("config-save-name");
    if (!saveButton) return;
    saveButton.disabled = !profileNameInput?.value?.trim();
  }

  renderSavedList() {
    const listContainer = document.getElementById("config-load-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    if (this.customConfigProfiles.length === 0) {
      listContainer.appendChild(
        createDomElement("div", {
          className: "config-empty",
          textContent: "No saved configs yet. Name and save your current setup above."
        })
      );
      return;
    }

    this.customConfigProfiles.forEach((savedProfile) => {
      const isActiveProfile = this.activeConfigProfileName === savedProfile.name;
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
        this.onSelectProfile?.(savedProfile);
        this.setPopoverOpen(false, { shouldRestoreFocus: true });
        this.setStatusMessage(`Loaded ${savedProfile.name}`);
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
        this.deleteProfile(savedProfile.name);
        this.renderSavedList();
      });

      listContainer.appendChild(
        createDomElement("div", { className: "config-item-row" }, [
          selectProfileButton,
          deleteProfileButton
        ])
      );
    });
  }

  setPopoverOpen(shouldOpen, { shouldRestoreFocus = false } = {}) {
    this.isPopoverOpen = Boolean(shouldOpen);
    const popoverElement = document.getElementById("config-popover");
    const configToggleButton = document.getElementById("config-toggle");

    if (configToggleButton) {
      configToggleButton.setAttribute?.("aria-expanded", String(this.isPopoverOpen));
    }
    if (!popoverElement) return;

    popoverElement.classList?.toggle("hidden", !this.isPopoverOpen);

    if (this.isPopoverOpen) {
      this.loadStorageState(() => {
        if (!this.isPopoverOpen) return;
        const profileNameInput = document.getElementById("config-save-name");
        if (profileNameInput) {
          profileNameInput.value = this.activeConfigProfileName || "";
          profileNameInput.focus?.();
        }
        this.updateSaveButtonState();
        this.renderSavedList();
      });
    } else if (shouldRestoreFocus) {
      configToggleButton?.focus?.();
    }
  }

  handleSaveSubmit() {
    const profileNameInput = document.getElementById("config-save-name");
    const profileName = profileNameInput?.value?.trim() || "";
    if (!profileName) return;

    this.onBeforeSave?.();
    const extensionOptions = this.readExtensionOptions();
    this.loadStorageState((storageState) => {
      this.saveProfile(profileName, extensionOptions, storageState.customEngineOptions);
      this.setActiveProfileName(profileName);
      this.setPopoverOpen(false, { shouldRestoreFocus: true });
      this.setStatusMessage(`Saved ${profileName}`);
    });
  }

  bindEvents() {
    if (this.isEventsBound) return;
    this.isEventsBound = true;

    document.getElementById("config-toggle")?.addEventListener("click", (clickEvent) => {
      clickEvent?.stopPropagation?.();
      this.setPopoverOpen(!this.isPopoverOpen);
    });

    document.getElementById("config-close")?.addEventListener("click", () => {
      this.setPopoverOpen(false, { shouldRestoreFocus: true });
    });
    document
      .getElementById("config-save-confirm")
      ?.addEventListener("click", () => this.handleSaveSubmit());

    const profileNameInput = document.getElementById("config-save-name");
    profileNameInput?.addEventListener("input", () => this.updateSaveButtonState());
    profileNameInput?.addEventListener("keydown", (keyEvent) => {
      if (keyEvent?.key === "Enter") {
        keyEvent.preventDefault?.();
        this.handleSaveSubmit();
      }
    });
    this.updateSaveButtonState();

    document.addEventListener?.("click", (clickEvent) => {
      if (!this.isPopoverOpen) return;
      const popoverElement = document.getElementById("config-popover");
      const configToggleButton = document.getElementById("config-toggle");
      const eventTarget = clickEvent?.target;
      if (popoverElement?.contains?.(eventTarget) || configToggleButton?.contains?.(eventTarget)) {
        return;
      }
      this.setPopoverOpen(false);
    });

    document.addEventListener?.("keydown", (keyEvent) => {
      if (keyEvent?.key === "Escape" && this.isPopoverOpen) {
        this.setPopoverOpen(false, { shouldRestoreFocus: true });
      }
    });
  }

  initialize() {
    this.loadStorageState();
    this.bindEvents();
  }

  reset() {
    if (this.statusClearTimerId) {
      clearTimeout(this.statusClearTimerId);
      this.statusClearTimerId = null;
    }
    this.activeConfigProfileName = null;
    this.customConfigProfiles = [];
    this.isPopoverOpen = false;
  }
}

class OptionsPageController {
  constructor() {
    this.activeThemeId = "dark";
    this.optionInputs = {};
    this.boundOptionInputs = new WeakSet();
    this.isThemeBound = false;
    this.isDisclosuresBound = false;
    this.expandScrollTracker = createExpandScrollTracker();

    const notifyStorageError = () =>
      this.configController.setStatusMessage("Failed to save settings.", true);

    this.uciController = new UciOptionsController({
      getActiveEngineUrl: () => this.getActiveEngineUrl(),
      onUserModified: () => this.configController.setActiveProfileName(null),
      onExpandedContentReady: (detailsElement) =>
        this.expandScrollTracker.scrollIntoView(detailsElement),
      onStorageWriteError: notifyStorageError
    });

    this.configController = new ConfigProfileController({
      getActiveEngineUrl: () => this.getActiveEngineUrl(),
      getPendingUciWrite: (storageKey) => this.uciController.getPendingWriteForKey(storageKey),
      readExtensionOptions: () => this.readOptionsFromDom(),
      normalizeExtensionOptions: (rawOptions) => this.normalizeOptions(rawOptions),
      onBeforeSave: () => this.uciController.flushPendingWrite(),
      onSelectProfile: (savedProfile) =>
        this.applyConfigProfile(savedProfile.settings, savedProfile.customEngineOptions, {
          profileName: savedProfile.name,
          shouldMarkSaved: true
        })
    });
  }

  getActiveEngineUrl() {
    return this.optionInputs["option-url-api-stockfish"]?.value?.trim();
  }

  readOptionsFromDom() {
    const extensionOptions = {};
    EXTENSION_OPTION_KEYS.forEach((optionKey) => {
      const inputElement = this.optionInputs[optionKey];
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

  normalizeOptions(rawExtensionOptions) {
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

  applyTheme(themeId) {
    const resolvedThemeId = THEMES[themeId] ? themeId : "dark";
    this.activeThemeId = resolvedThemeId;
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

  updateDependentGroupVisibility() {
    for (const [toggleInputId, groupContainerId] of VISIBILITY_TOGGLE_GROUPS) {
      const toggleInput = document.getElementById(toggleInputId);
      const groupContainer = document.getElementById(groupContainerId);
      if (toggleInput && groupContainer) {
        groupContainer.classList.toggle("hidden", !toggleInput.checked);
      }
    }
  }

  applyOptionsToDom(extensionOptions) {
    EXTENSION_OPTION_KEYS.forEach((optionKey) => {
      const inputElement = this.optionInputs[optionKey];
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
    this.updateDependentGroupVisibility();
  }

  enableInteractiveTransitions() {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.body?.classList?.add("is-ready");
        });
      });
    }
  }

  bindStaticOptionInputs() {
    EXTENSION_OPTION_KEYS.forEach((optionKey) => {
      const inputElement = document.getElementById(optionKey);
      if (!inputElement) return;
      this.optionInputs[optionKey] = inputElement;
      if (this.boundOptionInputs.has(inputElement)) return;
      this.boundOptionInputs.add(inputElement);

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
            onCommit: () => this.handleOptionChange(optionKey)
          });
        }
      }
      inputElement.addEventListener("change", () => this.handleOptionChange(optionKey));
    });
  }

  bindDisclosurePanels() {
    if (this.isDisclosuresBound) return;
    this.isDisclosuresBound = true;

    document
      .getElementById("engine-options-details")
      ?.addEventListener("toggle", () => this.uciController.probeIfPanelExpanded());

    for (const disclosureId of DISCLOSURE_PANEL_IDS) {
      const detailsElement = document.getElementById(disclosureId);
      detailsElement?.addEventListener("toggle", () => {
        if (detailsElement.open && document.body?.classList?.contains("is-ready")) {
          this.expandScrollTracker.scrollIntoView(detailsElement);
        }
      });
    }
  }

  initializeTheme() {
    this.applyTheme(getDefaultThemeId());
    readChromeStorage("local", ["theme"], (storedThemeState) => {
      if (storedThemeState?.theme) {
        this.applyTheme(storedThemeState.theme);
      }
    });
    if (this.isThemeBound) return;
    this.isThemeBound = true;
    document.getElementById("theme-toggle")?.addEventListener("click", () => {
      const nextThemeId = THEMES[this.activeThemeId]?.nextThemeId || "dark";
      this.applyTheme(nextThemeId);
      writeChromeStorage("local", { theme: nextThemeId }, () =>
        this.configController.setStatusMessage("Failed to save settings.", true)
      );
    });
  }

  restoreOptions() {
    readChromeStorage("sync", DEFAULT_EXTENSION_OPTION_VALUES, (storedExtensionOptions) => {
      if (storedExtensionOptions === null) {
        this.updateDependentGroupVisibility();
        this.enableInteractiveTransitions();
        return;
      }
      this.applyOptionsToDom(storedExtensionOptions);
      this.uciController.probeIfPanelExpanded();
      this.enableInteractiveTransitions();
    });
  }

  handleOptionChange(changedOptionKey) {
    const extensionOptions = this.readOptionsFromDom();

    this.updateDependentGroupVisibility();
    this.configController.setActiveProfileName(null);

    const toggledGroupEntry = VISIBILITY_TOGGLE_GROUPS.find(
      ([toggleInputId]) => toggleInputId === changedOptionKey
    );
    if (toggledGroupEntry && extensionOptions[changedOptionKey]) {
      const revealedGroup = document.getElementById(toggledGroupEntry[1]);
      if (revealedGroup) {
        this.expandScrollTracker.scrollIntoView(revealedGroup, revealedGroup.previousElementSibling);
      }
    }

    if (changedOptionKey === "option-url-api-stockfish") {
      this.uciController.flushPendingWrite({ shouldNotifyTabs: false });
      this.uciController.invalidate(extensionOptions["option-url-api-stockfish"]);
    }

    const changedPayload = { [changedOptionKey]: extensionOptions[changedOptionKey] };
    writeChromeStorage("sync", changedPayload, () =>
      this.configController.setStatusMessage("Failed to save settings.", true)
    );
    notifyActiveChessComTabs(changedPayload);
  }

  applyConfigProfile(
    rawExtensionOptions,
    uciOptionOverrides = {},
    { profileName = null, shouldMarkSaved = false } = {}
  ) {
    const previousEngineUrl = this.getActiveEngineUrl();
    const normalizedExtensionOptions = this.normalizeOptions(rawExtensionOptions);
    const sanitizedUciOptions = isPlainRecord(uciOptionOverrides)
      ? Object.assign({}, uciOptionOverrides)
      : {};

    this.uciController.clearPendingWrite();
    this.applyOptionsToDom(normalizedExtensionOptions);
    this.configController.setActiveProfileName(shouldMarkSaved ? profileName : null);

    const nextEngineUrl = normalizedExtensionOptions["option-url-api-stockfish"];
    const engineStorageKey = getEngineOptionsStorageKey(nextEngineUrl);
    const notifyStorageError = () =>
      this.configController.setStatusMessage("Failed to save settings.", true);

    if (engineStorageKey) {
      writeChromeStorage("local", { [engineStorageKey]: sanitizedUciOptions }, notifyStorageError);
    }
    writeChromeStorage("sync", normalizedExtensionOptions, notifyStorageError);

    if (previousEngineUrl !== nextEngineUrl) {
      this.uciController.invalidate(nextEngineUrl);
    } else if (document.getElementById("engine-options-details")?.open) {
      this.uciController.rerenderCachedOptions(nextEngineUrl, engineStorageKey, sanitizedUciOptions);
    }

    notifyActiveChessComTabs(
      Object.assign({}, normalizedExtensionOptions, { customEngineOptions: sanitizedUciOptions })
    );
  }

  handlePageHide() {
    this.expandScrollTracker.stop();
    this.uciController.flushPendingWrite();
  }

  initialize() {
    this.bindStaticOptionInputs();
    this.bindDisclosurePanels();
    this.initializeTheme();
    this.configController.initialize();
    this.restoreOptions();
  }

  reset() {
    this.expandScrollTracker.stop();
    this.uciController.reset();
    this.configController.reset();
  }
}

const popupController = new OptionsPageController();

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => popupController.handlePageHide());

  window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("github-link")?.addEventListener("click", () => {
      chrome.tabs?.create({ url: "https://github.com/y9felix/BetterMint" });
    });

    popupController.initialize();
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    THEMES,
    formatSliderBadgeValue,
    applyTheme: (themeId) => popupController.applyTheme(themeId),
    applyConfigProfile: (rawExtensionOptions, uciOptionOverrides, options) =>
      popupController.applyConfigProfile(rawExtensionOptions, uciOptionOverrides, options),
    deleteCustomConfigProfile: (profileName) =>
      popupController.configController.deleteProfile(profileName),
    setConfigPopoverOpen: (shouldOpen, options) =>
      popupController.configController.setPopoverOpen(shouldOpen, options),
    parseUciOptionLine,
    renderDynamicUciOptions,
    probeEngineUciOptions: (engineUrl, onProbeComplete) =>
      popupController.uciController.probeOptions(engineUrl, onProbeComplete),
    initializeOptionsPage: () => popupController.initialize(),
    handleExtensionOptionChange: (changedOptionKey) =>
      popupController.handleOptionChange(changedOptionKey),
    resetProbeStateForTesting: () => popupController.reset()
  };
}
