"use strict";

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
