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

function injectScript(file) {
  let script = document.createElement("script");
  script.src = chrome.runtime.getURL(file);
  let doc = document.head || document.documentElement;
  doc.insertBefore(script, doc.firstElementChild);
  script.onload = function () {
    script.remove();
  };
}

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

injectScript("js/Mint.js");
