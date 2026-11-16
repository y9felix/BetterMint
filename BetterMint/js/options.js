"use strict";

const PROBE_TIMEOUT_MS = 4000;
const ENGINE_OPTS_DEBOUNCE_MS = 150;
const CONFIG_STATUS_DURATION_MS = 2600;

const THEME_COLOR_VARS = [
  "--bg-primary",
  "--bg-card",
  "--border-color",
  "--divider-color",
  "--text-primary",
  "--text-muted",
  "--accent",
  "--badge-bg",
  "--badge-text",
  "--track-bg",
  "--thumb-bg",
  "--error-text"
];

const THEMES = {
  dark: {
    label: "Dark",
    next: "light",
    icon: '<svg viewBox="0 0 16 16" class="svg-icon"><path fill="currentColor" d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792-.001 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278"/></svg>',
    colors: {
      "--bg-primary": "#18181b",
      "--bg-card": "#27272a",
      "--border-color": "#3f3f46",
      "--divider-color": "rgba(255, 255, 255, 0.06)",
      "--text-primary": "#f4f4f5",
      "--text-muted": "#a1a1aa",
      "--accent": "#6366f1",
      "--badge-bg": "#3f3f46",
      "--badge-text": "#e4e4f7",
      "--track-bg": "#3f3f46",
      "--thumb-bg": "#ffffff",
      "--error-text": "#f87171"
    }
  },
  light: {
    label: "Light",
    next: "black",
    icon: '<svg viewBox="0 0 16 16" class="svg-icon"><path fill="currentColor" d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13m8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5M3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8m10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0m-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0m9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707M4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708"/></svg>',
    colors: {
      "--bg-primary": "#f4f4f5",
      "--bg-card": "#ffffff",
      "--border-color": "#d4d4d8",
      "--divider-color": "rgba(0, 0, 0, 0.08)",
      "--text-primary": "#18181b",
      "--text-muted": "#52525b",
      "--accent": "#4f46e5",
      "--badge-bg": "#e4e4e7",
      "--badge-text": "#27272a",
      "--track-bg": "#d4d4d8",
      "--thumb-bg": "#4f46e5",
      "--error-text": "#dc2626"
    }
  },
  black: {
    label: "Black",
    next: "dark",
    icon: '<svg viewBox="0 0 16 16" class="svg-icon"><path fill="currentColor" fill-rule="evenodd" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm1.1 1.5a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4Z"/></svg>',
    colors: {
      "--bg-primary": "#000000",
      "--bg-card": "#0a0a0c",
      "--border-color": "#222228",
      "--divider-color": "rgba(255, 255, 255, 0.08)",
      "--text-primary": "#f4f4f5",
      "--text-muted": "#8e8e98",
      "--accent": "#6366f1",
      "--badge-bg": "#18181d",
      "--badge-text": "#e4e4f7",
      "--track-bg": "#27272c",
      "--thumb-bg": "#ffffff",
      "--error-text": "#f87171"
    }
  }
};

const baseDefaults =
  typeof DefaultExtensionOptions !== "undefined" ? DefaultExtensionOptions : {};

function buildPresetSettings(overrides) {
  return Object.assign({}, baseDefaults, overrides);
}

const DEFAULT_PRESETS = [
  {
    id: "bullet",
    name: "Bullet",
    summary: "D8 · 1.25s · 200ms",
    settings: buildPresetSettings({
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
    settings: buildPresetSettings({
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
    settings: buildPresetSettings({
      "option-depth": 16,
      "option-legit-auto-move": true
    }),
    customEngineOptions: {}
  },
  {
    id: "puzzles",
    name: "Puzzles",
    summary: "D14 · Queue · Hints",
    settings: buildPresetSettings({
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
    settings: buildPresetSettings({
      "option-depth": 14,
      "option-show-hints": false,
      "option-move-analysis": false,
      "option-legit-auto-move": true,
      "option-human-like-moves": false
    }),
    customEngineOptions: {}
  }
];

let currentTheme = "dark";
let activeThemeColors = null;
let activeConfigName = null;
let customConfigsCache = [];
let presetOverridesCache = [];
let popoverMode = null;
let statusTimer = null;
let themeInitialized = false;
let configInitialized = false;
let goStopInitialized = false;

const ZERO_OFF_SLIDER_KEYS = new Set([
  "option-depth",
  "option-go-movetime",
  "option-go-nodes",
  "option-go-mate",
  "option-go-movestogo",
  "option-go-infinite-timeout"
]);

const optionKeys =
  typeof DefaultExtensionOptions !== "undefined" ? Object.keys(DefaultExtensionOptions) : [];
const fields = {};

function formatBadgeValue(key, value) {
  const num = Number(value);
  if (ZERO_OFF_SLIDER_KEYS.has(key) && num === 0) return "Off";
  if (key === "option-go-nodes" && !Number.isNaN(num)) {
    return num.toLocaleString("en-US");
  }
  return value;
}

const editableBadgesBound = new WeakSet();

function normalizeRangeInput(rangeInput, rawText, key = null) {
  const trimmed = String(rawText ?? "").trim().replace(/,/g, "");
  if (!trimmed) return null;

  let parsed;
  if (key && ZERO_OFF_SLIDER_KEYS.has(key) && trimmed.toLowerCase() === "off") {
    parsed = 0;
  } else {
    parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
  }

  const rawMin = parseFloat(rangeInput.min);
  const rawMax = parseFloat(rangeInput.max);
  const min = Number.isNaN(rawMin) ? 0 : rawMin;
  const max = Number.isNaN(rawMax) ? 100 : rawMax;
  const clamped = Math.min(max, Math.max(min, parsed));

  const rawStep = parseFloat(rangeInput.step);
  const step = Number.isNaN(rawStep) || rawStep <= 0 ? 1 : rawStep;
  const stepStr = String(rangeInput.step || "");
  const dotIdx = stepStr.indexOf(".");
  const decimals = dotIdx === -1 ? 0 : stepStr.length - dotIdx - 1;
  const snapped = Math.min(max, Math.max(min, min + Math.round((clamped - min) / step) * step));
  return decimals > 0 ? Number(snapped.toFixed(decimals)) : Math.round(snapped);
}

function bindEditableBadge(badge, rangeInput, { key = null, onCommit } = {}) {
  if (!badge || !rangeInput || editableBadgesBound.has(badge)) return;
  editableBadgesBound.add(badge);
  badge.title = "Click to edit";

  badge.addEventListener("click", (event) => {
    event?.stopPropagation?.();
    const parent = badge.parentNode;
    if (!parent || badge.classList?.contains("hidden")) return;

    const editor = createEl("input", {
      type: "text",
      className: "badge-input",
      value: String(rangeInput.value ?? "0"),
      spellcheck: false,
      autocomplete: "off"
    });
    editor.setAttribute?.("inputmode", "decimal");

    badge.classList?.add("hidden");
    parent.appendChild(editor);
    editor.focus?.();
    editor.select?.();

    let finished = false;
    const finish = (shouldCommit) => {
      if (finished) return;
      finished = true;
      if (shouldCommit) {
        const nextVal = normalizeRangeInput(rangeInput, editor.value, key);
        if (nextVal !== null) {
          rangeInput.value = String(nextVal);
          badge.textContent = key ? formatBadgeValue(key, rangeInput.value) : String(rangeInput.value);
          onCommit?.(nextVal);
        }
      }
      editor.remove?.();
      badge.classList?.remove("hidden");
    };

    editor.addEventListener("keydown", (e) => {
      if (e?.key === "Enter") {
        e.preventDefault?.();
        finish(true);
      } else if (e?.key === "Escape") {
        e.preventDefault?.();
        finish(false);
      }
    });
    editor.addEventListener("blur", () => finish(true));
  });
}

function parseSearchMovesTokens(raw) {
  const seen = new Set();
  const out = [];
  for (const token of String(raw || "").trim().toLowerCase().split(/\s+/)) {
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token) && !seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

function buildGoPreviewCommand(options) {
  const opts = options || readCurrentSettings();
  const searchmoves = parseSearchMovesTokens(opts["option-go-searchmoves"]);
  if (opts["option-go-infinite"]) {
    const parts = ["go", "infinite"];
    if (searchmoves.length > 0) parts.push("searchmoves", ...searchmoves);
    return parts.join(" ");
  }

  const parts = ["go"];
  const depth = parseInt(opts["option-depth"], 10) || 0;
  const movetime = parseInt(opts["option-go-movetime"], 10) || 0;
  const nodes = parseInt(opts["option-go-nodes"], 10) || 0;
  const mate = parseInt(opts["option-go-mate"], 10) || 0;
  const clockSync = Boolean(opts["option-go-clock-sync"]);
  const clockInc = parseInt(opts["option-go-clock-inc"], 10) || 0;
  const movestogo = parseInt(opts["option-go-movestogo"], 10) || 0;
  let hasBound = false;

  if (depth > 0) {
    parts.push("depth", String(depth));
    hasBound = true;
  }
  if (movetime > 0) {
    parts.push("movetime", String(movetime));
    hasBound = true;
  }
  if (nodes > 0) {
    parts.push("nodes", String(nodes));
    hasBound = true;
  }
  if (mate > 0) {
    parts.push("mate", String(mate));
    hasBound = true;
  }
  if (clockSync) {
    parts.push("wtime", "<W>", "btime", "<B>");
    if (clockInc > 0) {
      parts.push("winc", String(clockInc), "binc", String(clockInc));
    }
    if (movestogo > 0) {
      parts.push("movestogo", String(movestogo));
    }
    hasBound = true;
  }
  if (!hasBound) {
    parts.push("depth", "1");
  }
  if (searchmoves.length > 0) {
    parts.push("searchmoves", ...searchmoves);
  }
  return parts.join(" ");
}

function updateGoPreview(options = null) {
  const el = document.getElementById("go-command-preview");
  if (el) {
    el.textContent = buildGoPreviewCommand(options);
  }
}

function getCurrentThemeColors() {
  const palette = Object.assign({}, THEMES[currentTheme]?.colors || THEMES.dark.colors);
  const root = document.documentElement;
  if (root) {
    const computed =
      typeof window !== "undefined" && typeof window.getComputedStyle === "function"
        ? window.getComputedStyle(root)
        : null;
    for (const v of THEME_COLOR_VARS) {
      const override = activeThemeColors?.[v] || root.style?.getPropertyValue?.(v);
      const val = (override || computed?.getPropertyValue?.(v) || "").trim();
      if (val) palette[v] = val;
    }
  }
  return palette;
}

function applyTheme(theme, customColors = null) {
  const key = THEMES[theme] ? theme : "dark";
  currentTheme = key;
  const root = document.documentElement;
  if (root) {
    root.dataset.theme = key;
    if (customColors && typeof customColors === "object") {
      const cleanColors = {};
      for (const v of THEME_COLOR_VARS) {
        if (typeof customColors[v] === "string" && customColors[v].trim()) {
          cleanColors[v] = customColors[v].trim();
          root.style?.setProperty?.(v, cleanColors[v]);
        } else {
          root.style?.removeProperty?.(v);
        }
      }
      activeThemeColors = Object.keys(cleanColors).length ? cleanColors : null;
    } else {
      activeThemeColors = null;
      for (const v of THEME_COLOR_VARS) {
        root.style?.removeProperty?.(v);
      }
    }
  }
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    const meta = THEMES[key];
    btn.innerHTML = meta.icon;
    btn.title = `Theme: ${meta.label}`;
    btn.setAttribute?.("aria-label", `Theme: ${meta.label}`);
  }
}

function InitTheme() {
  applyTheme("dark");
  chrome.storage?.local?.get(["theme", "themeColors"], (res) => {
    if (res?.theme) {
      applyTheme(res.theme, res.themeColors || null);
    } else if (res?.themeColors) {
      applyTheme("dark", res.themeColors);
    }
  });
  if (themeInitialized) return;
  themeInitialized = true;
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const next = THEMES[currentTheme]?.next || "dark";
    applyTheme(next, null);
    chrome.storage?.local?.set({ theme: next, themeColors: null });
  });
}

const VISIBILITY_GROUPS = [
  ["option-go-clock-sync", "go-clock-group"],
  ["option-go-infinite", "go-infinite-group"],
  ["option-auto-queue", "auto-queue-group"],
  ["option-legit-auto-move", "pacing-group"],
  ["option-human-like-moves", "human-pace-group"]
];

function UpdateVisibility() {
  for (const [toggleId, groupId] of VISIBILITY_GROUPS) {
    const toggle = document.getElementById(toggleId);
    const group = document.getElementById(groupId);
    if (toggle && group) {
      group.classList.toggle("hidden", !toggle.checked);
    }
  }
}

function parseUciOptionLine(line) {
  if (!line || typeof line !== "string" || !line.startsWith("option name ")) return null;
  const rest = line.slice(12);
  const typeIndex = rest.indexOf(" type ");
  if (typeIndex === -1) return null;
  const name = rest.slice(0, typeIndex).trim();
  const afterType = rest.slice(typeIndex + 6);
  const tokens = afterType.split(" ");
  const type = tokens[0];

  let defVal = "";
  let minVal = null;
  let maxVal = null;
  const vars = [];

  const keywords = new Set(["default", "min", "max", "var"]);
  let currentKey = null;
  let currentWords = [];

  const flush = () => {
    if (!currentKey) return;
    const value = currentWords.join(" ").trim();
    if (currentKey === "default") {
      defVal = value;
    } else if (currentKey === "min") {
      minVal = value ? parseInt(value, 10) : null;
    } else if (currentKey === "max") {
      maxVal = value ? parseInt(value, 10) : null;
    } else if (currentKey === "var") {
      if (value) vars.push(value);
    }
    currentWords = [];
  };

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (keywords.has(token)) {
      flush();
      currentKey = token;
    } else if (currentKey) {
      currentWords.push(token);
    }
  }
  flush();

  return { name, type, default: defVal, min: minVal, max: maxVal, vars };
}

function createEl(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined && v !== null) el[k] = v;
  }
  for (const child of children) {
    if (child) el.appendChild(child);
  }
  return el;
}

const uciRenderers = {
  spin(opt, currentVal, onOptionChange) {
    const badge = createEl("span", { className: "badge", textContent: currentVal });
    const input = createEl("input", {
      type: "range",
      className: "range-slider",
      min: opt.min ?? 0,
      max: opt.max ?? 100,
      value: currentVal
    });
    input.addEventListener("input", () => {
      badge.textContent = input.value;
      onOptionChange?.(opt.name, parseInt(input.value, 10), false);
    });
    bindEditableBadge(badge, input, {
      onCommit: (val) => onOptionChange?.(opt.name, parseInt(val, 10), false)
    });
    return createEl("div", { className: "control-col" }, [
      createEl("div", { className: "slider-header" }, [
        createEl("span", { className: "title", textContent: opt.name }),
        badge
      ]),
      input
    ]);
  },
  check(opt, currentVal, onOptionChange) {
    const input = createEl("input", {
      type: "checkbox",
      className: "toggle-input",
      checked: currentVal === true || currentVal === "true"
    });
    input.addEventListener("change", () => {
      onOptionChange?.(opt.name, input.checked, false);
    });
    return createEl("label", { className: "control-row" }, [
      createEl("span", { className: "control-label-text", textContent: opt.name }),
      input,
      createEl("span", { className: "toggle-slider" })
    ]);
  },
  combo(opt, currentVal, onOptionChange) {
    const select = createEl(
      "select",
      { className: "select-input" },
      (opt.vars || []).map((v) =>
        createEl("option", { value: v, textContent: v, selected: v === String(currentVal) })
      )
    );
    select.addEventListener("change", () => {
      onOptionChange?.(opt.name, select.value, false);
    });
    return createEl("div", { className: "control-col" }, [
      createEl("label", { className: "control-label-text", textContent: opt.name }),
      select
    ]);
  },
  string(opt, currentVal, onOptionChange) {
    const input = createEl("input", {
      type: "text",
      className: "text-input",
      value: String(currentVal ?? ""),
      spellcheck: false,
      autocomplete: "off"
    });
    input.addEventListener("change", () => {
      onOptionChange?.(opt.name, input.value.trim(), false);
    });
    return createEl("div", { className: "control-col" }, [
      createEl("label", { className: "control-label-text", textContent: opt.name }),
      input
    ]);
  },
  button(opt, _currentVal, onOptionChange) {
    const btn = createEl("button", { type: "button", className: "action-btn", textContent: "Execute" });
    btn.addEventListener("click", () => {
      onOptionChange?.(opt.name, "", true);
    });
    return createEl("div", { className: "control-row" }, [
      createEl("span", { className: "control-label-text", textContent: opt.name }),
      btn
    ]);
  }
};

function renderDynamicUciOptions(optionsList, savedValues, container, onOptionChange) {
  if (!container) return;
  container.innerHTML = "";
  if (!optionsList || optionsList.length === 0) {
    container.innerHTML = '<span class="status-text">No configurable options reported by engine.</span>';
    return;
  }

  const target =
    typeof document !== "undefined" && typeof document.createDocumentFragment === "function"
      ? document.createDocumentFragment()
      : container;

  optionsList.forEach((opt) => {
    const renderer = uciRenderers[opt.type];
    if (!renderer) return;
    const currentVal = savedValues?.[opt.name] ?? opt.default;
    target.appendChild(renderer(opt, currentVal, onOptionChange));
  });

  if (target !== container) {
    container.appendChild(target);
  }
}

let activeProbeWs = null;
let probeTimeout = null;
let probedUrl = null;
let lastProbedOptions = [];

function setEngineOptionsStatus(msg) {
  const container = document.getElementById("engine-options-container");
  if (!container) return;
  container.innerHTML = "";
  container.appendChild(createEl("span", { className: "status-text", textContent: msg }));
}

function resetProbe() {
  if (probeTimeout) {
    clearTimeout(probeTimeout);
    probeTimeout = null;
  }
  if (activeProbeWs) {
    const ws = activeProbeWs;
    activeProbeWs = null;
    try { ws.close(); } catch {}
  }
}

function probeEngine(url, onComplete = loadAndRenderEngineOptions) {
  const container = document.getElementById("engine-options-container");
  if (!container) return;
  resetProbe();

  if (!url || typeof WebSocket === "undefined") {
    setEngineOptionsStatus("Invalid WebSocket URL.");
    return;
  }

  setEngineOptionsStatus("Connecting to engine...");
  const discovered = [];
  let lastErrorLine = "";
  try {
    const ws = new WebSocket(url);
    activeProbeWs = ws;
    probeTimeout = setTimeout(() => {
      if (activeProbeWs !== ws) return;
      resetProbe();
      setEngineOptionsStatus("Connection timed out.");
    }, PROBE_TIMEOUT_MS);

    ws.addEventListener("open", () => {
      if (activeProbeWs !== ws) return;
      if (probeTimeout) clearTimeout(probeTimeout);
      probeTimeout = setTimeout(() => {
        if (activeProbeWs !== ws) return;
        resetProbe();
        setEngineOptionsStatus("Engine handshake timed out.");
      }, PROBE_TIMEOUT_MS);
      ws.send("uci\n");
    });

    ws.addEventListener("message", (event) => {
      if (activeProbeWs !== ws) return;
      if (!event.data) return;
      const lines = String(event.data).split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("info string Error:")) {
          lastErrorLine = trimmed.slice("info string ".length);
        }
        const opt = parseUciOptionLine(trimmed);
        if (opt) {
          discovered.push(opt);
        } else if (trimmed === "uciok") {
          probedUrl = url;
          lastProbedOptions = discovered.slice();
          resetProbe();
          onComplete(url, discovered, container);
          return;
        }
      }
    });

    ws.addEventListener("close", () => {
      if (activeProbeWs !== ws) return;
      resetProbe();
      setEngineOptionsStatus(lastErrorLine || "Engine connection closed before handshake.");
    });

    ws.addEventListener("error", () => {
      if (activeProbeWs !== ws) return;
      resetProbe();
      setEngineOptionsStatus("Unable to connect to engine.");
    });
  } catch {
    resetProbe();
    setEngineOptionsStatus("Failed to initialize engine socket.");
  }
}

function invalidateEngineProbe(url) {
  probedUrl = null;
  lastProbedOptions = [];
  resetProbe();
  if (document.getElementById("engine-options-details")?.open) {
    if (url) probeEngine(url);
  } else {
    setEngineOptionsStatus("Expand to load engine options.");
  }
}

let engineOptsSyncTimer = null;
let pendingEngineOpts = null;

function flushPendingEngineOpts() {
  if (!pendingEngineOpts) return;
  if (engineOptsSyncTimer) {
    clearTimeout(engineOptsSyncTimer);
    engineOptsSyncTimer = null;
  }
  const { key, data } = pendingEngineOpts;
  pendingEngineOpts = null;
  chrome.storage?.local?.set({ [key]: data });
  notifyTabs({ customEngineOptions: data });
}

function loadAndRenderEngineOptions(url, optionsList, container) {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    renderDynamicUciOptions(optionsList, {}, container, null);
    return;
  }
  const storageKey = getEngineOptionsStorageKey(url);
  chrome.storage.local.get([storageKey], (result) => {
    const saved = Object.assign({}, result?.[storageKey] || {});
    renderDynamicUciOptions(optionsList, saved, container, (name, val, isButton) => {
      if (isButton) {
        notifyTabs({ uciButton: name });
        return;
      }
      saved[name] = val;
      setActiveConfigName(null);
      pendingEngineOpts = { key: storageKey, data: saved };
      if (engineOptsSyncTimer) clearTimeout(engineOptsSyncTimer);
      engineOptsSyncTimer = setTimeout(flushPendingEngineOpts, ENGINE_OPTS_DEBOUNCE_MS);
    });
  });
}

function notifyTabs(data) {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) return;
  chrome.tabs.query({ url: "*://*.chess.com/*" }, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, { type: "UpdateOptions", data })?.catch?.(() => {});
    });
  });
}

function probeIfExpanded() {
  const details = document.getElementById("engine-options-details");
  if (!details?.open) return;
  const url = fields["option-url-api-stockfish"]?.value?.trim();
  if (!url) {
    resetProbe();
    setEngineOptionsStatus("Invalid WebSocket URL.");
    return;
  }
  if (probedUrl !== url) {
    probeEngine(url);
  }
}

function readCurrentSettings() {
  const options = {};
  optionKeys.forEach((key) => {
    const field = fields[key];
    if (!field) {
      options[key] = baseDefaults[key];
      return;
    }
    if (field.type === "checkbox") {
      options[key] = Boolean(field.checked);
    } else if (field.type === "range") {
      const val = parseFloat(field.value);
      options[key] = Number.isNaN(val) ? 0 : val;
    } else {
      options[key] = String(field.value ?? "").trim();
    }
  });
  return options;
}

function normalizeSettings(raw) {
  const normalized = {};
  optionKeys.forEach((key) => {
    const defVal = baseDefaults[key];
    const incoming = raw && Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : defVal;
    if (typeof defVal === "boolean") {
      normalized[key] = Boolean(incoming);
    } else if (typeof defVal === "number") {
      const num = parseFloat(incoming);
      normalized[key] = Number.isNaN(num) ? defVal : num;
    } else {
      normalized[key] = String(incoming ?? defVal ?? "").trim();
    }
  });
  return normalized;
}

function applySettingsToDom(options) {
  optionKeys.forEach((key) => {
    const field = fields[key];
    if (!field) return;
    const val = options[key] ?? baseDefaults[key];
    if (field.type === "checkbox") {
      field.checked = Boolean(val);
    } else {
      field.value = val;
      if (field.type === "range") {
        const badge = document.getElementById("badge-" + key);
        if (badge) badge.textContent = formatBadgeValue(key, val);
      }
    }
  });
  UpdateVisibility();
  updateGoPreview(options);
}

function setActiveConfigName(name) {
  activeConfigName = name || null;
  chrome.storage?.local?.set({ activeConfigName });
}

function getEffectivePresets() {
  return DEFAULT_PRESETS.map((preset) => {
    const override = presetOverridesCache.find((p) => p.id === preset.id);
    if (!override) return preset;
    return {
      id: preset.id,
      name: preset.name,
      summary: preset.summary,
      settings: normalizeSettings(override.settings || preset.settings),
      customEngineOptions: Object.assign({}, override.customEngineOptions || {})
    };
  });
}

function setConfigStatus(msg, isError = false) {
  const el = document.getElementById("config-status");
  if (!el) return;
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  el.textContent = msg || "";
  el.classList?.toggle("is-error", Boolean(isError));
  el.classList?.toggle("hidden", !msg);
  if (msg) {
    statusTimer = setTimeout(() => {
      el.textContent = "";
      el.classList?.add("hidden");
      statusTimer = null;
    }, CONFIG_STATUS_DURATION_MS);
  }
}

function sanitizeFilename(name) {
  const clean = String(name || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-")
    .replace(/\s+/g, " ");
  return clean || "config";
}

function stripMintExtension(filename) {
  return String(filename || "").replace(/\.mint$/i, "").trim();
}

function getExportFilename(name = activeConfigName) {
  return name ? `${sanitizeFilename(name)}.mint` : "config.mint";
}

function applyConfigProfile(rawSettings, customEngineOptions = {}, { name = null, markSaved = false } = {}) {
  const prevUrl = fields["option-url-api-stockfish"]?.value?.trim();
  const nextSettings = normalizeSettings(rawSettings);
  const nextEngineOpts =
    customEngineOptions && typeof customEngineOptions === "object"
      ? Object.assign({}, customEngineOptions)
      : {};

  pendingEngineOpts = null;
  if (engineOptsSyncTimer) {
    clearTimeout(engineOptsSyncTimer);
    engineOptsSyncTimer = null;
  }

  applySettingsToDom(nextSettings);
  setActiveConfigName(markSaved ? name : null);

  const nextUrl = nextSettings["option-url-api-stockfish"];
  const engineKey =
    typeof getEngineOptionsStorageKey === "function" ? getEngineOptionsStorageKey(nextUrl) : null;
  if (engineKey) {
    chrome.storage?.local?.set({ [engineKey]: nextEngineOpts });
  }
  chrome.storage?.sync?.set(nextSettings);

  if (prevUrl !== nextUrl) {
    invalidateEngineProbe(nextUrl);
  } else if (document.getElementById("engine-options-details")?.open && probedUrl === nextUrl) {
    const container = document.getElementById("engine-options-container");
    if (container && lastProbedOptions.length > 0) {
      loadAndRenderEngineOptions(nextUrl, lastProbedOptions, container);
    }
  }

  notifyTabs(Object.assign({}, nextSettings, { customEngineOptions: nextEngineOpts }));
  return nextSettings;
}

function saveCustomConfigEntry(name, settings, customEngineOptions) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  const entry = {
    name: trimmed,
    settings: normalizeSettings(settings),
    customEngineOptions: Object.assign({}, customEngineOptions || {}),
    updatedAt: Date.now()
  };
  const filtered = customConfigsCache.filter(
    (item) => item.name.toLowerCase() !== trimmed.toLowerCase()
  );
  customConfigsCache = [entry, ...filtered];
  chrome.storage?.local?.set({ customConfigs: customConfigsCache });
  return entry;
}

function deleteCustomConfigEntry(name) {
  customConfigsCache = customConfigsCache.filter((item) => item.name !== name);
  const updates = { customConfigs: customConfigsCache };
  if (activeConfigName === name) {
    activeConfigName = null;
    updates.activeConfigName = null;
  }
  chrome.storage?.local?.set(updates);
}

function formatConfigSummary(settings) {
  const depth = settings?.["option-depth"] ?? baseDefaults["option-depth"];
  const pace = settings?.["option-move-pace"] ?? baseDefaults["option-move-pace"];
  const auto = settings?.["option-legit-auto-move"] ? "Auto" : "Manual";
  return `D${depth} · ${auto} · ${pace}s`;
}

function renderLoadList() {
  const list = document.getElementById("config-load-list");
  if (!list) return;
  list.innerHTML = "";

  list.appendChild(createEl("div", { className: "config-section-label", textContent: "Presets" }));
  getEffectivePresets().forEach((preset) => {
    const btn = createEl("button", { type: "button", className: "config-item-btn" }, [
      createEl("span", { className: "config-item-name", textContent: preset.name }),
      createEl("span", { className: "config-item-meta", textContent: preset.summary })
    ]);
    btn.addEventListener("click", () => {
      applyConfigProfile(preset.settings, preset.customEngineOptions, { markSaved: false });
      setConfigPopoverMode(null);
      setConfigStatus(`Loaded ${preset.name}`);
    });
    list.appendChild(createEl("div", { className: "config-item-row config-item" }, [btn]));
  });

  list.appendChild(createEl("div", { className: "config-section-label", textContent: "Custom" }));
  if (customConfigsCache.length === 0) {
    list.appendChild(
      createEl("div", { className: "config-empty", textContent: "No saved configs yet." })
    );
    return;
  }

  customConfigsCache.forEach((entry) => {
    const isActive = activeConfigName === entry.name;
    const selectBtn = createEl(
      "button",
      {
        type: "button",
        className: isActive ? "config-item-btn is-active" : "config-item-btn"
      },
      [
        createEl("span", { className: "config-item-name", textContent: entry.name }),
        createEl("span", {
          className: "config-item-meta",
          textContent: formatConfigSummary(entry.settings)
        })
      ]
    );
    selectBtn.addEventListener("click", () => {
      applyConfigProfile(entry.settings, entry.customEngineOptions, {
        name: entry.name,
        markSaved: true
      });
      setConfigPopoverMode(null);
      setConfigStatus(`Loaded ${entry.name}`);
    });

    const deleteBtn = createEl("button", {
      type: "button",
      className: "config-delete-btn",
      title: `Delete ${entry.name}`,
      textContent: "×"
    });
    deleteBtn.setAttribute?.("aria-label", `Delete ${entry.name}`);
    deleteBtn.addEventListener("click", (event) => {
      event?.stopPropagation?.();
      deleteCustomConfigEntry(entry.name);
      renderLoadList();
    });

    list.appendChild(
      createEl("div", { className: "config-item-row config-item" }, [selectBtn, deleteBtn])
    );
  });
}

function setConfigPopoverMode(mode) {
  popoverMode = mode || null;
  const popover = document.getElementById("config-popover");
  const toggleBtn = document.getElementById("config-toggle");
  const menu = document.getElementById("config-menu");
  const loadPanel = document.getElementById("config-load-panel");
  const savePanel = document.getElementById("config-save-panel");
  const saveError = document.getElementById("config-save-error");

  if (toggleBtn) {
    toggleBtn.setAttribute?.("aria-expanded", String(Boolean(popoverMode)));
  }
  if (!popover) return;

  popover.classList?.toggle("hidden", !popoverMode);
  popover.classList?.toggle("is-wide", popoverMode === "load" || popoverMode === "save");
  menu?.classList?.toggle("hidden", popoverMode !== "menu");
  loadPanel?.classList?.toggle("hidden", popoverMode !== "load");
  savePanel?.classList?.toggle("hidden", popoverMode !== "save");
  saveError?.classList?.add("hidden");

  if (popoverMode === "load") {
    refreshConfigStorage(() => renderLoadList());
  } else if (popoverMode === "save") {
    const input = document.getElementById("config-save-name");
    if (input) {
      input.value = activeConfigName || "";
      input.focus?.();
      input.select?.();
    }
  }
}

function refreshConfigStorage(cb) {
  const url = fields["option-url-api-stockfish"]?.value?.trim() || baseDefaults["option-url-api-stockfish"];
  const engineKey =
    typeof getEngineOptionsStorageKey === "function" ? getEngineOptionsStorageKey(url) : null;
  const keys = ["customConfigs", "presetOverrides", "activeConfigName"];
  if (engineKey) keys.push(engineKey);

  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    cb?.({ customConfigs: customConfigsCache, customEngineOptions: {} });
    return;
  }

  chrome.storage.local.get(keys, (res) => {
    if (Array.isArray(res?.customConfigs)) customConfigsCache = res.customConfigs;
    if (Array.isArray(res?.presetOverrides)) presetOverridesCache = res.presetOverrides;
    if (Object.prototype.hasOwnProperty.call(res || {}, "activeConfigName")) {
      activeConfigName = res.activeConfigName || null;
    }
    const storedEngineOpts = engineKey ? res?.[engineKey] || {} : {};
    const liveEngineOpts =
      pendingEngineOpts && pendingEngineOpts.key === engineKey
        ? pendingEngineOpts.data
        : storedEngineOpts;
    cb?.({
      customConfigs: customConfigsCache,
      presetOverrides: presetOverridesCache,
      activeConfigName,
      customEngineOptions: Object.assign({}, liveEngineOpts)
    });
  });
}

function buildExportSnapshot(cb) {
  const settings = readCurrentSettings();
  refreshConfigStorage((state) => {
    const snapshot = {
      format: "bettermint-config",
      version: 2,
      name: state.activeConfigName || null,
      exportedAt: new Date().toISOString(),
      settings,
      customEngineOptions: state.customEngineOptions || {},
      theme: {
        id: currentTheme,
        colors: getCurrentThemeColors()
      },
      presets: getEffectivePresets().map((preset) => ({
        id: preset.id,
        name: preset.name,
        settings: preset.settings,
        customEngineOptions: preset.customEngineOptions || {}
      })),
      customConfigs: state.customConfigs.map((entry) => ({
        name: entry.name,
        settings: entry.settings,
        customEngineOptions: entry.customEngineOptions || {},
        updatedAt: entry.updatedAt
      }))
    };
    cb?.(snapshot, getExportFilename(state.activeConfigName));
  });
}

function triggerFileDownload(filename, content) {
  if (typeof Blob === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) return;
  const blob = new Blob([content], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const link = createEl("a", {
    href: objectUrl,
    download: filename,
    className: "hidden"
  });
  document.body?.appendChild?.(link);
  link.click?.();
  link.remove?.();
  URL.revokeObjectURL?.(objectUrl);
}

function exportCurrentConfig() {
  flushPendingEngineOpts();
  buildExportSnapshot((snapshot, filename) => {
    triggerFileDownload(filename, JSON.stringify(snapshot, null, 2));
    setConfigPopoverMode(null);
    setConfigStatus(`Exported ${filename}`);
  });
}

function handleSaveSubmit() {
  const input = document.getElementById("config-save-name");
  const errorEl = document.getElementById("config-save-error");
  const name = input?.value?.trim() || "";
  if (!name) {
    if (errorEl) {
      errorEl.textContent = "Enter a config name.";
      errorEl.classList?.remove("hidden");
    }
    input?.focus?.();
    return;
  }

  flushPendingEngineOpts();
  const settings = readCurrentSettings();
  refreshConfigStorage((state) => {
    saveCustomConfigEntry(name, settings, state.customEngineOptions);
    setActiveConfigName(name);
    setConfigPopoverMode(null);
    setConfigStatus(`Saved ${name}`);
  });
}

function importMintText(rawText, filename = "config.mint") {
  let parsed;
  try {
    parsed = JSON.parse(String(rawText || ""));
  } catch {
    return { ok: false, error: "Invalid .mint file." };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Invalid .mint payload." };
  }

  const rawSettings =
    parsed.settings && typeof parsed.settings === "object"
      ? parsed.settings
      : optionKeys.some((k) => Object.prototype.hasOwnProperty.call(parsed, k))
        ? parsed
        : null;

  if (!rawSettings) {
    return { ok: false, error: "No valid settings in .mint file." };
  }

  if (Array.isArray(parsed.presets)) {
    const validPresets = parsed.presets.filter(
      (p) => p && typeof p.id === "string" && p.settings && typeof p.settings === "object"
    );
    if (validPresets.length > 0) {
      presetOverridesCache = validPresets.map((p) => ({
        id: p.id,
        settings: normalizeSettings(p.settings),
        customEngineOptions:
          p.customEngineOptions && typeof p.customEngineOptions === "object"
            ? Object.assign({}, p.customEngineOptions)
            : {}
      }));
      chrome.storage?.local?.set({ presetOverrides: presetOverridesCache });
    }
  }

  if (Array.isArray(parsed.customConfigs)) {
    parsed.customConfigs.forEach((entry) => {
      if (entry && typeof entry.name === "string" && entry.name.trim() && entry.settings) {
        saveCustomConfigEntry(entry.name, entry.settings, entry.customEngineOptions);
      }
    });
  }

  if (parsed.theme) {
    const themeId = typeof parsed.theme === "string" ? parsed.theme : parsed.theme.id;
    const themeColors =
      typeof parsed.theme === "object" && parsed.theme.colors && typeof parsed.theme.colors === "object"
        ? parsed.theme.colors
        : null;
    applyTheme(themeId || currentTheme, themeColors);
    chrome.storage?.local?.set({ theme: currentTheme, themeColors: activeThemeColors });
  }

  const importedName =
    (typeof parsed.name === "string" && parsed.name.trim()) ||
    stripMintExtension(filename) ||
    "Imported Config";
  const engineOpts =
    parsed.customEngineOptions && typeof parsed.customEngineOptions === "object"
      ? parsed.customEngineOptions
      : {};

  saveCustomConfigEntry(importedName, rawSettings, engineOpts);
  applyConfigProfile(rawSettings, engineOpts, { name: importedName, markSaved: true });

  return { ok: true, name: importedName };
}

function InitConfigSystem() {
  refreshConfigStorage();
  if (configInitialized) return;
  configInitialized = true;

  document.getElementById("config-toggle")?.addEventListener("click", (event) => {
    event?.stopPropagation?.();
    setConfigPopoverMode(popoverMode ? null : "menu");
  });

  document.getElementById("config-action-load")?.addEventListener("click", () => {
    setConfigPopoverMode("load");
  });

  document.getElementById("config-action-save")?.addEventListener("click", () => {
    setConfigPopoverMode("save");
  });

  document.getElementById("config-action-export")?.addEventListener("click", () => {
    exportCurrentConfig();
  });

  const importInput = document.getElementById("config-import-input");
  document.getElementById("config-action-import")?.addEventListener("click", () => {
    setConfigPopoverMode(null);
    if (importInput) {
      importInput.value = "";
      importInput.click?.();
    }
  });

  importInput?.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (!file) return;
    file.text().then(
      (text) => {
        const result = importMintText(text, file.name);
        setConfigStatus(result.ok ? `Imported ${result.name}` : result.error, !result.ok);
      },
      () => setConfigStatus("Failed to read .mint file.", true)
    );
  });

  for (const closeId of ["config-load-close", "config-save-close", "config-save-cancel"]) {
    document.getElementById(closeId)?.addEventListener("click", () => setConfigPopoverMode(null));
  }
  document.getElementById("config-save-confirm")?.addEventListener("click", handleSaveSubmit);

  document.getElementById("config-save-name")?.addEventListener("keydown", (event) => {
    if (event?.key === "Enter") {
      event.preventDefault?.();
      handleSaveSubmit();
    }
  });

  document.addEventListener?.("click", (event) => {
    if (!popoverMode) return;
    const popover = document.getElementById("config-popover");
    const toggleBtn = document.getElementById("config-toggle");
    const target = event?.target;
    if (popover?.contains?.(target) || toggleBtn?.contains?.(target)) return;
    setConfigPopoverMode(null);
  });

  document.addEventListener?.("keydown", (event) => {
    if (event?.key === "Escape" && popoverMode) {
      setConfigPopoverMode(null);
    }
  });
}

function RestoreOptions() {
  if (typeof chrome === "undefined" || !chrome.storage?.sync) {
    UpdateVisibility();
    return;
  }
  chrome.storage.sync.get(DefaultExtensionOptions, (opts) => {
    applySettingsToDom(opts || {});
    probeIfExpanded();
  });
}

function OnOptionsChange(changedKey) {
  const options = readCurrentSettings();

  UpdateVisibility();
  updateGoPreview(options);
  setActiveConfigName(null);

  if (changedKey === "option-url-api-stockfish") {
    invalidateEngineProbe(options["option-url-api-stockfish"]);
  }

  chrome.storage?.sync?.set(options);
  notifyTabs(changedKey ? { [changedKey]: options[changedKey] } : options);
}

function InitOptions() {
  optionKeys.forEach((key) => {
    const field = document.getElementById(key);
    if (!field) return;
    fields[key] = field;

    if (field.type === "range") {
      const badge = document.getElementById("badge-" + key);
      field.addEventListener("input", () => {
        if (badge) badge.textContent = formatBadgeValue(key, field.value);
        if (key === "option-depth" || key.startsWith("option-go-")) {
          updateGoPreview();
        }
      });
      if (badge) {
        bindEditableBadge(badge, field, {
          key,
          onCommit: () => OnOptionsChange(key)
        });
      }
    } else if (key === "option-go-searchmoves") {
      field.addEventListener("input", () => updateGoPreview());
    }
    field.addEventListener("change", () => OnOptionsChange(key));
  });

  if (!goStopInitialized) {
    goStopInitialized = true;
    document.getElementById("go-stop-btn")?.addEventListener("click", () => {
      notifyTabs({ stopSearch: true });
      setConfigStatus("Stop sent");
    });
  }

  document.getElementById("engine-options-details")?.addEventListener("toggle", probeIfExpanded);
  InitTheme();
  InitConfigSystem();
  RestoreOptions();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPendingEngineOpts);

  window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("github-link")?.addEventListener("click", () => {
      chrome.tabs?.create({ url: "https://github.com/y9felix/BetterMint" });
    });

    InitOptions();
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    THEMES,
    DEFAULT_PRESETS,
    formatBadgeValue,
    buildGoPreviewCommand,
    applyTheme,
    getCurrentThemeColors,
    getExportFilename,
    applyConfigProfile,
    buildExportSnapshot,
    importMintText,
    saveCustomConfigEntry,
    deleteCustomConfigEntry,
    setConfigPopoverMode,
    parseUciOptionLine,
    renderDynamicUciOptions,
    probeEngine,
    InitOptions,
    OnOptionsChange,
    resetProbedUrlForTesting: () => {
      probedUrl = null;
      lastProbedOptions = [];
      activeConfigName = null;
      customConfigsCache = [];
      presetOverridesCache = [];
      popoverMode = null;
      activeThemeColors = null;
    }
  };
}
