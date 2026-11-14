"use strict";

const optionKeys = Object.keys(DefaultExtensionOptions);
let fields = {};

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
  const rest = line.substring("option name ".length);
  const typeIndex = rest.indexOf(" type ");
  if (typeIndex === -1) return null;
  const name = rest.substring(0, typeIndex).trim();
  const afterType = rest.substring(typeIndex + " type ".length);
  const tokens = afterType.split(" ");
  const type = tokens[0];

  let defVal = "";
  let minVal = null;
  let maxVal = null;
  let vars = [];

  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === "default") {
      i++;
      defVal = tokens[i] !== undefined ? tokens[i] : "";
    } else if (tokens[i] === "min") {
      i++;
      minVal = tokens[i] !== undefined ? parseInt(tokens[i], 10) : null;
    } else if (tokens[i] === "max") {
      i++;
      maxVal = tokens[i] !== undefined ? parseInt(tokens[i], 10) : null;
    } else if (tokens[i] === "var") {
      i++;
      if (tokens[i] !== undefined) vars.push(tokens[i]);
    }
  }

  return {
    name: name,
    type: type,
    default: defVal,
    min: minVal,
    max: maxVal,
    vars: vars
  };
}

function renderDynamicUciOptions(optionsList, savedValues, container, onOptionChange) {
  if (!container) return;
  container.innerHTML = "";
  if (!optionsList || optionsList.length === 0) {
    container.innerHTML = '<span class="status-text">No configurable options reported by engine.</span>';
    return;
  }

  optionsList.forEach(function (opt) {
    const currentVal = savedValues && savedValues[opt.name] !== undefined ? savedValues[opt.name] : opt.default;

    if (opt.type === "spin") {
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
      input.min = opt.min !== null ? opt.min : 0;
      input.max = opt.max !== null ? opt.max : 100;
      input.value = currentVal;
      input.addEventListener("input", function () {
        badge.textContent = input.value;
        if (typeof onOptionChange === "function") {
          onOptionChange(opt.name, parseInt(input.value, 10));
        }
      });
      col.appendChild(input);
      container.appendChild(col);
    } else if (opt.type === "check") {
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
      input.addEventListener("change", function () {
        if (typeof onOptionChange === "function") {
          onOptionChange(opt.name, input.checked);
        }
      });
      label.appendChild(labelText);
      label.appendChild(input);
      label.appendChild(slider);
      container.appendChild(label);
    } else if (opt.type === "combo") {
      const col = document.createElement("div");
      col.className = "control-col";
      const label = document.createElement("label");
      label.className = "control-label-text";
      label.textContent = opt.name;
      const select = document.createElement("select");
      select.className = "select-input";
      opt.vars.forEach(function (v) {
        const option = document.createElement("option");
        option.value = v;
        option.textContent = v;
        if (v === String(currentVal)) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener("change", function () {
        if (typeof onOptionChange === "function") {
          onOptionChange(opt.name, select.value);
        }
      });
      col.appendChild(label);
      col.appendChild(select);
      container.appendChild(col);
    } else if (opt.type === "string") {
      const col = document.createElement("div");
      col.className = "control-col options-text";
      const label = document.createElement("label");
      label.className = "control-label-text";
      label.textContent = opt.name;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "text-input";
      input.value = currentVal != null ? String(currentVal) : "";
      input.spellcheck = false;
      input.autocomplete = "off";
      input.addEventListener("change", function () {
        if (typeof onOptionChange === "function") {
          onOptionChange(opt.name, input.value.trim());
        }
      });
      col.appendChild(label);
      col.appendChild(input);
      container.appendChild(col);
    } else if (opt.type === "button") {
      const row = document.createElement("div");
      row.className = "control-row";
      const label = document.createElement("span");
      label.className = "control-label-text";
      label.textContent = opt.name;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "action-btn";
      btn.textContent = "Execute";
      btn.addEventListener("click", function () {
        if (typeof onOptionChange === "function") {
          onOptionChange(opt.name, "");
        }
      });
      row.appendChild(label);
      row.appendChild(btn);
      container.appendChild(row);
    }
  });
}

let activeProbeWs = null;
let probeTimeout = null;

function probeEngine(url) {
  const container = document.getElementById("engine-options-container");
  if (!container) return;
  if (probeTimeout) {
    clearTimeout(probeTimeout);
    probeTimeout = null;
  }
  if (activeProbeWs) {
    const oldProbe = activeProbeWs;
    activeProbeWs = null;
    oldProbe.onopen = null;
    oldProbe.onmessage = null;
    oldProbe.onclose = null;
    oldProbe.onerror = null;
    try { oldProbe.close(); } catch (e) {}
  }
  if (!url || typeof WebSocket === "undefined") {
    container.innerHTML = '<span class="status-text">Invalid WebSocket URL.</span>';
    return;
  }

  container.innerHTML = '<span class="status-text">Connecting to engine...</span>';
  const discovered = [];
  try {
    const ws = new WebSocket(url);
    activeProbeWs = ws;
    probeTimeout = setTimeout(function () {
      if (activeProbeWs !== ws) return;
      activeProbeWs = null;
      try { ws.close(); } catch (e) {}
      container.innerHTML = '<span class="status-text">Connection timed out.</span>';
    }, 4000);

    ws.addEventListener("open", function () {
      if (activeProbeWs !== ws) return;
      if (probeTimeout) clearTimeout(probeTimeout);
      probeTimeout = setTimeout(function () {
        if (activeProbeWs !== ws) return;
        activeProbeWs = null;
        try { ws.close(); } catch (e) {}
        container.innerHTML = '<span class="status-text">Engine handshake timed out.</span>';
      }, 4000);
      ws.send("uci\n");
    });

    ws.addEventListener("message", function (event) {
      if (activeProbeWs !== ws) return;
      const line = event.data;
      if (!line) return;
      const opt = parseUciOptionLine(line);
      if (opt) {
        discovered.push(opt);
      } else if (line.trim() === "uciok") {
        if (probeTimeout) {
          clearTimeout(probeTimeout);
          probeTimeout = null;
        }
        activeProbeWs = null;
        try { ws.close(); } catch (e) {}
        loadAndRenderEngineOptions(url, discovered, container);
      }
    });

    ws.addEventListener("error", function () {
      if (activeProbeWs !== ws) return;
      if (probeTimeout) {
        clearTimeout(probeTimeout);
        probeTimeout = null;
      }
      activeProbeWs = null;
      container.innerHTML = '<span class="status-text">Unable to connect to engine.</span>';
    });
  } catch (err) {
    if (probeTimeout) {
      clearTimeout(probeTimeout);
      probeTimeout = null;
    }
    activeProbeWs = null;
    container.innerHTML = '<span class="status-text">Failed to initialize engine socket.</span>';
  }
}

function loadAndRenderEngineOptions(url, optionsList, container) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
    renderDynamicUciOptions(optionsList, {}, container, null);
    return;
  }
  const storageKey = "engine_opts_" + btoa(url).replace(/=/g, "");
  chrome.storage.local.get([storageKey], function (result) {
    const saved = (result && result[storageKey]) || {};
    renderDynamicUciOptions(optionsList, saved, container, function (name, val) {
      saved[name] = val;
      const update = {};
      update[storageKey] = saved;
      chrome.storage.local.set(update);
      notifyTabsOfEngineOptions(saved);
    });
  });
}

function notifyTabsOfEngineOptions(customOptions) {
  if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) return;
  chrome.tabs.query({ url: "*://*.chess.com/*" }, function (tabs) {
    tabs.forEach(function (tab) {
      chrome.tabs.sendMessage(tab.id, {
        type: "UpdateOptions",
        data: { customEngineOptions: customOptions }
      }).catch(function () {});
    });
  });
}

function RestoreOptions() {
  chrome.storage.sync.get(DefaultExtensionOptions, function (opts) {
    let options = opts || {};
    optionKeys.forEach(function (key) {
      const field = fields[key];
      if (!field) return;

      if (field.type === "checkbox") {
        field.checked = options[key] !== undefined ? Boolean(options[key]) : Boolean(DefaultExtensionOptions[key]);
      } else if (field.type === "range") {
        field.value = options[key] !== undefined ? options[key] : DefaultExtensionOptions[key];
        const badge = document.getElementById("badge-" + key);
        if (badge) badge.textContent = field.value;
      } else if (field.type === "text") {
        field.value = options[key] !== undefined ? options[key] : DefaultExtensionOptions[key];
      }
    });
    UpdateVisibility();
    const urlField = fields["option-url-api-stockfish"];
    if (urlField && urlField.value) {
      probeEngine(urlField.value.trim());
    }
  });
}

function OnOptionsChange(changedKey) {
  let options = {};
  optionKeys.forEach(function (key) {
    const field = fields[key];
    if (!field) return;

    if (field.type === "checkbox") {
      options[key] = field.checked;
    } else if (field.type === "range") {
      const val = parseFloat(field.value);
      options[key] = isNaN(val) ? 0 : val;
    } else if (field.type === "text") {
      options[key] = field.value.trim();
    }
  });

  UpdateVisibility();
  if (changedKey === "option-url-api-stockfish" && options["option-url-api-stockfish"]) {
    probeEngine(options["option-url-api-stockfish"]);
  }

  chrome.storage.sync.set(options);
  chrome.tabs.query({ url: "*://*.chess.com/*" }, function (tabs) {
    tabs.forEach(function (tab) {
      chrome.tabs.sendMessage(tab.id, {
        type: "UpdateOptions",
        data: options,
      }).catch(function () {});
    });
  });
}

function InitOptions() {
  optionKeys.forEach(function (key) {
    fields[key] = document.getElementById(key);
  });

  document.querySelectorAll(".options-slider").forEach(function (slider) {
    const input = slider.querySelector("input[type='range']");
    const badge = slider.querySelector(".badge");
    if (!input) return;

    const min = slider.getAttribute("data-min");
    const max = slider.getAttribute("data-max");
    if (min) input.min = min;
    if (max) input.max = max;

    input.addEventListener("input", function (event) {
      if (badge) badge.textContent = input.value;
      if (!event.disableUpdate) {
        OnOptionsChange();
      }
    });
  });

  document.querySelectorAll(".options-checkbox input[type='checkbox']").forEach(function (checkbox) {
    checkbox.addEventListener("change", function () {
      OnOptionsChange();
    });
  });

  document.querySelectorAll(".options-text input[type='text']").forEach(function (text) {
    text.addEventListener("change", function () {
      OnOptionsChange(text.id);
    });
  });

  RestoreOptions();
}

window.addEventListener("DOMContentLoaded", function () {
  const githubLink = document.getElementById("github-link");
  if (githubLink) {
    githubLink.addEventListener("click", function (event) {
      event.preventDefault();
      chrome.tabs.create({ url: "https://github.com/y9felix/BetterMint" });
    });
  }

  InitOptions();
});
