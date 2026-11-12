"use strict";

let inputObjects = {
  "option-url-api-stockfish": {
    default_value: "ws://localhost:8000/ws",
  },
  "option-api-stockfish": {
    default_value: true,
  },
  "option-num-cores": {
    default_value: 1,
  },
  "option-hashtable-ram": {
    default_value: 1024,
  },
  "option-depth": {
    default_value: 3,
  },
  "option-mate-finder-value": {
    default_value: 5,
  },
  "option-multipv": {
    default_value: 3,
  },
  "option-highmatechance": {
    default_value: false,
  },
  "option-auto-move-time": {
    default_value: 0,
  },
  "option-auto-move-time-random": {
    default_value: 10000,
  },
  "option-auto-move-time-random-div": {
    default_value: 10,
  },
  "option-auto-move-time-random-multi": {
    default_value: 1000,
  },
  "option-max-legit-auto-move-depth": {
    default_value: 10,
  },
  "option-legit-auto-move": {
    default_value: false,
  },
  "option-best-move-chance": {
    default_value: 30,
  },
  "option-random-best-move": {
    default_value: false,
  },
  "option-show-hints": {
    default_value: true,
  },
  "option-text-to-speech": {
    default_value: false,
  },
  "option-move-analysis": {
    default_value: true,
  },
  "option-evaluation-bar": {
    default_value: true,
  },
  "option-auto-queue": {
    default_value: false,
  },
  "option-panic-mode": {
    default_value: false,
  },
  "option-panic-time": {
    default_value: 10,
  },
  "option-notifications": {
    default_value: true,
  },
  "option-fast-opening-moves": {
    default_value: false,
  },
  "option-fast-opening-speed": {
    default_value: 50,
  },
};

let DefaultExtensionOptions = {};
for (let key in inputObjects) {
  DefaultExtensionOptions[key] = inputObjects[key].default_value;
}

function RestoreOptions() {
  chrome.storage.sync.get(DefaultExtensionOptions, function (opts) {
    let options = opts || {};
    for (let key in inputObjects) {
      const field = inputObjects[key].inputField;
      if (!field) continue;

      if (field.type === "checkbox") {
        field.checked = Boolean(options[key]);
      } else if (field.type === "range") {
        field.value = options[key] !== undefined ? options[key] : inputObjects[key].default_value;
        const badge = document.getElementById("badge-" + key);
        if (badge) badge.textContent = field.value;
      } else if (field.type === "text") {
        field.value = options[key] !== undefined ? options[key] : inputObjects[key].default_value;
      }
    }
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
      options[key] = parseInt(field.value, 10);
    } else if (field.type === "text") {
      options[key] = field.value.trim();
    }
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
