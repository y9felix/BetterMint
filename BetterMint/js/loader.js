"use strict";

const DefaultExtensionOptions = {
  "option-url-api-stockfish": "ws://localhost:8000/ws",
  "option-depth": 3,
  "option-evaluation-bar": true,
  "option-show-hints": true,
  "option-move-analysis": true,
  "option-notifications": false,
  "option-auto-queue": false,
  "option-legit-auto-move": false,
  "option-human-like-moves": true,
  "option-move-pace": 1.5,
  "option-physical-floor": 200,
  "option-timing-spread": 0.80,
  "option-fast-recaptures": true,
  "option-recapture-multiplier": 0.50,
  "option-fast-forced-moves": true,
  "option-forced-multiplier": 0.35,
  "option-fast-opening": true,
  "option-opening-moves-threshold": 8,
  "option-opening-multiplier": 0.35,
  "option-clock-scaling": true,
  "option-clock-threshold": 60,
  "option-clock-min-multiplier": 0.30
};

function getEngineOptionsStorageKey(url) {
  return url ? "engine_opts_" + encodeURIComponent(url).replace(/[^a-zA-Z0-9_-]/g, "_") : null;
}

function injectScript(file) {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL(file);
  script.onload = () => script.remove();
  (document.head || document.documentElement).prepend(script);
}

const isExtensionPage =
  typeof window !== "undefined" &&
  window.location?.protocol === "chrome-extension:";

if (!isExtensionPage) {
  chrome.runtime.onMessage.addListener((request) => {
    if (request?.data) {
      window.dispatchEvent(
        new CustomEvent("BetterMintUpdateOptions", {
          detail: request.data,
        })
      );
    }
  });

  window.addEventListener("BetterMintGetOptions", (evt) => {
    chrome.storage.sync.get(DefaultExtensionOptions, (opts) => {
      const url = opts?.["option-url-api-stockfish"];
      const storageKey = getEngineOptionsStorageKey(url);
      if (storageKey && chrome.storage?.local) {
        chrome.storage.local.get([storageKey], (res) => {
          window.dispatchEvent(
            new CustomEvent("BetterMintSendOptions", {
              detail: {
                requestId: evt.detail?.id,
                data: Object.assign({}, opts, { customEngineOptions: res?.[storageKey] || {} })
              }
            })
          );
        });
      } else {
        window.dispatchEvent(
          new CustomEvent("BetterMintSendOptions", {
            detail: {
              requestId: evt.detail?.id,
              data: opts
            }
          })
        );
      }
    });
  });

  injectScript("js/Mint.js");
}
