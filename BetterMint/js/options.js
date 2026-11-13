"use strict";

let inputObjects = {
  "option-url-api-stockfish": { default_value: "ws://localhost:8000/ws" },
  "option-depth": { default_value: 3 },
  "option-evaluation-bar": { default_value: true },
  "option-show-hints": { default_value: true },
  "option-move-analysis": { default_value: true },
  "option-notifications": { default_value: false },
  "option-auto-queue": { default_value: false },
  "option-legit-auto-move": { default_value: false },
  "option-human-like-moves": { default_value: true },
  "option-move-pace": { default_value: 1.5 },
  "option-physical-floor": { default_value: 200 },
  "option-timing-spread": { default_value: 0.80 },
  "option-fast-recaptures": { default_value: true },
  "option-recapture-multiplier": { default_value: 0.50 },
  "option-fast-forced-moves": { default_value: true },
  "option-forced-multiplier": { default_value: 0.35 },
  "option-fast-opening": { default_value: true },
  "option-opening-moves-threshold": { default_value: 8 },
  "option-opening-multiplier": { default_value: 0.35 },
  "option-clock-scaling": { default_value: true },
  "option-clock-threshold": { default_value: 60 },
  "option-clock-min-multiplier": { default_value: 0.30 }
};

let DefaultExtensionOptions = {};
for (let key in inputObjects) {
  DefaultExtensionOptions[key] = inputObjects[key].default_value;
}

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
      const min = opt.min !== null ? opt.min : 0;
      const max = opt.max !== null ? opt.max : 100;
      col.innerHTML = `
        <div class="slider-header">
          <span class="title">${opt.name}</span>
          <span class="badge">${currentVal}</span>
        </div>
        <input type="range" min="${min}" max="${max}" value="${currentVal}" class="range-slider" />
      `;
      const input = col.querySelector("input");
      const badge = col.querySelector(".badge");
      input.addEventListener("input", function () {
        badge.textContent = input.value;
        if (typeof onOptionChange === "function") {
          onOptionChange(opt.name, parseInt(input.value, 10));
        }
      });
      container.appendChild(col);
    } else if (opt.type === "check") {
      const label = document.createElement("label");
      label.className = "control-row options-checkbox";
      const isChecked = currentVal === true || currentVal === "true";
      label.innerHTML = `
        <span class="control-label-text">${opt.name}</span>
        <input type="checkbox" class="toggle-input"${isChecked ? " checked" : ""} />
        <span class="toggle-slider"></span>
      `;
      const input = label.querySelector("input");
      input.addEventListener("change", function () {
        if (typeof onOptionChange === "function") {
          onOptionChange(opt.name, input.checked);
        }
      });
      container.appendChild(label);
    } else if (opt.type === "combo") {
      const col = document.createElement("div");
      col.className = "control-col";
      col.innerHTML = `
        <label class="control-label-text">${opt.name}</label>
        <select class="select-input"></select>
      `;
      const select = col.querySelector("select");
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
      container.appendChild(col);
    } else if (opt.type === "string") {
      const col = document.createElement("div");
      col.className = "control-col options-text";
      col.innerHTML = `
        <label class="control-label-text">${opt.name}</label>
        <input type="text" class="text-input" value="${currentVal || ""}" spellcheck="false" autocomplete="off" />
      `;
      const input = col.querySelector("input");
      input.addEventListener("change", function () {
        if (typeof onOptionChange === "function") {
          onOptionChange(opt.name, input.value.trim());
        }
      });
      container.appendChild(col);
    } else if (opt.type === "button") {
      const row = document.createElement("div");
      row.className = "control-row";
      row.innerHTML = `
        <span class="control-label-text">${opt.name}</span>
        <button type="button" class="action-btn">Execute</button>
      `;
      const btn = row.querySelector("button");
      btn.addEventListener("click", function () {
        if (typeof onOptionChange === "function") {
          onOptionChange(opt.name, "");
        }
      });
      container.appendChild(row);
    }
  });
}

let activeProbeWs = null;
function probeEngine(url) {
  const container = document.getElementById("engine-options-container");
  if (!container) return;
  if (activeProbeWs) {
    try { activeProbeWs.close(); } catch (e) {}
    activeProbeWs = null;
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
    const timeout = setTimeout(function () {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        container.innerHTML = '<span class="status-text">Connection timed out.</span>';
      }
    }, 4000);

    ws.addEventListener("open", function () {
      clearTimeout(timeout);
      ws.send("uci\n");
    });

    ws.addEventListener("message", function (event) {
      const line = event.data;
      if (!line) return;
      const opt = parseUciOptionLine(line);
      if (opt) {
        discovered.push(opt);
      } else if (line.trim() === "uciok") {
        ws.close();
        loadAndRenderEngineOptions(url, discovered, container);
      }
    });

    ws.addEventListener("error", function () {
      clearTimeout(timeout);
      container.innerHTML = '<span class="status-text">Unable to connect to engine.</span>';
    });
  } catch (err) {
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
    for (let key in inputObjects) {
      const field = inputObjects[key].inputField;
      if (!field) continue;

      if (field.type === "checkbox") {
        field.checked = options[key] !== undefined ? Boolean(options[key]) : Boolean(inputObjects[key].default_value);
      } else if (field.type === "range") {
        field.value = options[key] !== undefined ? options[key] : inputObjects[key].default_value;
        const badge = document.getElementById("badge-" + key);
        if (badge) badge.textContent = field.value;
      } else if (field.type === "text") {
        field.value = options[key] !== undefined ? options[key] : inputObjects[key].default_value;
      }
    }
    UpdateVisibility();
    const urlField = inputObjects["option-url-api-stockfish"] && inputObjects["option-url-api-stockfish"].inputField;
    if (urlField && urlField.value) {
      probeEngine(urlField.value.trim());
    }
  });
}

function OnOptionsChange(changedKey) {
  let options = {};
  for (let key in inputObjects) {
    const field = inputObjects[key].inputField;
    if (!field) continue;

    if (field.type === "checkbox") {
      options[key] = field.checked;
    } else if (field.type === "range") {
      const val = parseFloat(field.value);
      options[key] = isNaN(val) ? 0 : val;
    } else if (field.type === "text") {
      options[key] = field.value.trim();
    }
  }

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
  for (let key in inputObjects) {
    inputObjects[key].inputField = document.getElementById(key);
  }

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
      chrome.tabs.create({ url: "https://github.com/BotSolvers/BetterMint" });
    });
  }

  InitOptions();
});
