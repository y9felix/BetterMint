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

// Function to inject the script (your extension script)
function injectScript(file) {
  let script = document.createElement("script");
  script.src = chrome.runtime.getURL(file);
  let doc = document.head || document.documentElement;
  doc.insertBefore(script, doc.firstElementChild);
  script.onload = function () {
    script.remove();
  };
}

// Listen for messages
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.data !== "popout") {
    window.dispatchEvent(
      new CustomEvent("BetterMintUpdateOptions", {
        detail: request.data,
      })
    );
  } else if (request.data == "popout") {
    window.postMessage("popout");
  }
});

// Respond to BetterMintGetOptions events
window.addEventListener("BetterMintGetOptions", function (evt) {
  chrome.storage.sync.get(DefaultExtensionOptions, function (opts) {
    let request = evt.detail;
    let response = {
      requestId: request.id,
      data: opts,
    };
    window.dispatchEvent(
      new CustomEvent("BetterMintSendOptions", {
        detail: response,
      })
    );
  });
});

// Initialize Config object for Mint.js
window.Config = {
  threadedEnginePaths: {
    stockfish: {
      multiThreaded: {
        loader: chrome.runtime.getURL("js/stockfish.js"),
        engine: "stockfish.wasm"
      },
      singleThreaded: {
        loader: chrome.runtime.getURL("js/stockfish.js"),
        engine: "stockfish.wasm"
      }
    }
  },
  pathToEcoJson: chrome.runtime.getURL("js/eco.json")
};

// Inject other necessary scripts automatically
injectScript("js/Mint.js"); // Injects Mint.js for web-side functionality
