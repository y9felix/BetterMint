"use strict";

const PROBE_TIMEOUT_MS = 4000;
const ENGINE_OPTS_DEBOUNCE_MS = 150;

const optionKeys =
  typeof DefaultExtensionOptions !== "undefined" ? Object.keys(DefaultExtensionOptions) : [];
const fields = {};

function UpdateVisibility() {
  const legitAutoMove = document.getElementById("option-legit-auto-move");
  const pacingGroup = document.getElementById("pacing-group");
  if (legitAutoMove && pacingGroup) {
    pacingGroup.classList.toggle("hidden", !legitAutoMove.checked);
  }

  const humanLike = document.getElementById("option-human-like-moves");
  const humanPaceGroup = document.getElementById("human-pace-group");
  if (humanLike && humanPaceGroup) {
    humanPaceGroup.classList.toggle("hidden", !humanLike.checked);
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

const uciRenderers = {
  spin(opt, currentVal, onOptionChange) {
    const col = document.createElement("div");
    col.className = "control-col options-slider";
    const header = document.createElement("div");
    header.className = "slider-header";
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = opt.name;
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = currentVal;
    header.appendChild(title);
    header.appendChild(badge);
    col.appendChild(header);

    const input = document.createElement("input");
    input.type = "range";
    input.className = "range-slider";
    input.min = opt.min ?? 0;
    input.max = opt.max ?? 100;
    input.value = currentVal;
    input.addEventListener("input", () => {
      badge.textContent = input.value;
      onOptionChange?.(opt.name, parseInt(input.value, 10), false);
    });
    col.appendChild(input);
    return col;
  },
  check(opt, currentVal, onOptionChange) {
    const label = document.createElement("label");
    label.className = "control-row options-checkbox";
    const labelText = document.createElement("span");
    labelText.className = "control-label-text";
    labelText.textContent = opt.name;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "toggle-input";
    input.checked = currentVal === true || currentVal === "true";
    const slider = document.createElement("span");
    slider.className = "toggle-slider";
    input.addEventListener("change", () => {
      onOptionChange?.(opt.name, input.checked, false);
    });
    label.appendChild(labelText);
    label.appendChild(input);
    label.appendChild(slider);
    return label;
  },
  combo(opt, currentVal, onOptionChange) {
    const col = document.createElement("div");
    col.className = "control-col";
    const label = document.createElement("label");
    label.className = "control-label-text";
    label.textContent = opt.name;
    const select = document.createElement("select");
    select.className = "select-input";
    (opt.vars || []).forEach((v) => {
      const option = document.createElement("option");
      option.value = v;
      option.textContent = v;
      if (v === String(currentVal)) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener("change", () => {
      onOptionChange?.(opt.name, select.value, false);
    });
    col.appendChild(label);
    col.appendChild(select);
    return col;
  },
  string(opt, currentVal, onOptionChange) {
    const col = document.createElement("div");
    col.className = "control-col options-text";
    const label = document.createElement("label");
    label.className = "control-label-text";
    label.textContent = opt.name;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "text-input";
    input.value = String(currentVal ?? "");
    input.spellcheck = false;
    input.autocomplete = "off";
    input.addEventListener("change", () => {
      onOptionChange?.(opt.name, input.value.trim(), false);
    });
    col.appendChild(label);
    col.appendChild(input);
    return col;
  },
  button(opt, _currentVal, onOptionChange) {
    const row = document.createElement("div");
    row.className = "control-row";
    const label = document.createElement("span");
    label.className = "control-label-text";
    label.textContent = opt.name;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-btn";
    btn.textContent = "Execute";
    btn.addEventListener("click", () => {
      onOptionChange?.(opt.name, "", true);
    });
    row.appendChild(label);
    row.appendChild(btn);
    return row;
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
    const el = renderer(opt, currentVal, onOptionChange);
    if (el) target.appendChild(el);
  });

  if (target !== container) {
    container.appendChild(target);
  }
}

let activeProbeWs = null;
let probeTimeout = null;
let probedUrl = null;

function setEngineOptionsStatus(msg) {
  const container = document.getElementById("engine-options-container");
  if (!container) return;
  container.innerHTML = "";
  const span = document.createElement("span");
  span.className = "status-text";
  span.textContent = msg;
  container.appendChild(span);
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
  const setStatus = setEngineOptionsStatus;

  if (!url || typeof WebSocket === "undefined") {
    setStatus("Invalid WebSocket URL.");
    return;
  }

  setStatus("Connecting to engine...");
  const discovered = [];
  let lastErrorLine = "";
  try {
    const ws = new WebSocket(url);
    activeProbeWs = ws;
    probeTimeout = setTimeout(() => {
      if (activeProbeWs !== ws) return;
      resetProbe();
      setStatus("Connection timed out.");
    }, PROBE_TIMEOUT_MS);

    ws.addEventListener("open", () => {
      if (activeProbeWs !== ws) return;
      if (probeTimeout) clearTimeout(probeTimeout);
      probeTimeout = setTimeout(() => {
        if (activeProbeWs !== ws) return;
        resetProbe();
        setStatus("Engine handshake timed out.");
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
          resetProbe();
          onComplete(url, discovered, container);
          return;
        }
      }
    });

    ws.addEventListener("close", () => {
      if (activeProbeWs !== ws) return;
      resetProbe();
      setStatus(lastErrorLine || "Engine connection closed before handshake.");
    });

    ws.addEventListener("error", () => {
      if (activeProbeWs !== ws) return;
      resetProbe();
      setStatus("Unable to connect to engine.");
    });
  } catch {
    resetProbe();
    setStatus("Failed to initialize engine socket.");
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

function RestoreOptions() {
  if (typeof chrome === "undefined" || !chrome.storage?.sync) {
    UpdateVisibility();
    return;
  }
  chrome.storage.sync.get(DefaultExtensionOptions, (opts) => {
    const options = opts || {};
    optionKeys.forEach((key) => {
      const field = fields[key];
      if (!field) return;

      const val = options[key] ?? DefaultExtensionOptions[key];
      if (field.type === "checkbox") {
        field.checked = Boolean(val);
      } else {
        field.value = val;
        if (field.type === "range") {
          const badge = document.getElementById("badge-" + key);
          if (badge) badge.textContent = val;
        }
      }
    });
    UpdateVisibility();
    probeIfExpanded();
  });
}

function OnOptionsChange(changedKey) {
  const options = {};
  optionKeys.forEach((key) => {
    const field = fields[key];
    if (!field) return;

    if (field.type === "checkbox") {
      options[key] = field.checked;
    } else if (field.type === "range") {
      const val = parseFloat(field.value);
      options[key] = Number.isNaN(val) ? 0 : val;
    } else if (field.type === "text") {
      options[key] = field.value.trim();
    }
  });

  UpdateVisibility();
  if (changedKey === "option-url-api-stockfish") {
    probedUrl = null;
    resetProbe();
    if (document.getElementById("engine-options-details")?.open) {
      if (options["option-url-api-stockfish"]) probeEngine(options["option-url-api-stockfish"]);
    } else {
      setEngineOptionsStatus("Expand to load engine options.");
    }
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
        if (badge) badge.textContent = field.value;
      });
    }
    field.addEventListener("change", () => OnOptionsChange(key));
  });

  document.getElementById("engine-options-details")?.addEventListener("toggle", probeIfExpanded);
  RestoreOptions();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPendingEngineOpts);

  window.addEventListener("DOMContentLoaded", () => {
    const githubLink = document.getElementById("github-link");
    githubLink?.addEventListener("click", (event) => {
      event.preventDefault();
      chrome.tabs?.create({ url: "https://github.com/y9felix/BetterMint" });
    });

    InitOptions();
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseUciOptionLine,
    uciRenderers,
    renderDynamicUciOptions,
    probeEngine,
    resetProbe,
    loadAndRenderEngineOptions,
    InitOptions,
    OnOptionsChange,
    resetProbedUrlForTesting: () => { probedUrl = null; }
  };
}
