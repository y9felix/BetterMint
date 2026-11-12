"use strict";

let inputObjects = {
  "option-api-stockfish": { default_value: true },
  "option-url-api-stockfish": { default_value: "ws://localhost:8000/ws" },
  "option-depth": { default_value: 3 },
  "option-multipv": { default_value: 3 },
  "option-hashtable-ram": { default_value: 1024 },
  "option-num-cores": { default_value: 1 },
  "option-highmatechance": { default_value: false },
  "option-mate-finder-value": { default_value: 5 },
  "option-evaluation-bar": { default_value: true },
  "option-show-hints": { default_value: true },
  "option-move-analysis": { default_value: true },
  "option-text-to-speech": { default_value: false },
  "option-notifications": { default_value: false },
  "option-auto-queue": { default_value: false },
  "option-legit-auto-move": { default_value: false },
  "option-random-best-move": { default_value: false },
  "option-best-move-chance": { default_value: 30 },
  "option-max-legit-auto-move-depth": { default_value: 10 },
  "option-human-like-moves": { default_value: true },
  "option-move-pace": { default_value: 1.5 },
  "option-advanced-timing": { default_value: false },
  "option-physical-floor": { default_value: 200 },
  "option-timing-spread": { default_value: 0.45 },
  "option-fast-recaptures": { default_value: true },
  "option-recapture-multiplier": { default_value: 0.50 },
  "option-fast-forced-moves": { default_value: true },
  "option-forced-multiplier": { default_value: 0.35 },
  "option-fast-opening": { default_value: true },
  "option-opening-moves-threshold": { default_value: 7 },
  "option-opening-multiplier": { default_value: 0.65 },
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

  const advancedTiming = document.getElementById("option-advanced-timing");
  const advancedPanel = document.getElementById("advanced-timing-panel");
  if (advancedTiming && advancedPanel) {
    advancedPanel.classList.toggle("hidden", !advancedTiming.checked);
  }
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
  });
}

function OnOptionsChange() {
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
      OnOptionsChange();
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
