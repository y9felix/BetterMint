"use strict";

const DEFAULT_EXTENSION_OPTIONS = {
  "option-url-api-stockfish": "ws://localhost:8000/ws",
  "option-depth": 3,
  "option-go-movetime": 0,
  "option-go-nodes": 0,
  "option-go-mate": 0,
  "option-go-searchmoves": "",
  "option-go-clock-sync": false,
  "option-go-clock-inc": 0,
  "option-go-movestogo": 0,
  "option-go-infinite": false,
  "option-go-infinite-timeout": 0,
  "option-go-eval-stable": false,
  "option-evaluation-bar": true,
  "option-show-hints": true,
  "option-move-analysis": true,
  "option-auto-queue": false,
  "option-rematch-first": false,
  "option-legit-auto-move": false,
  "option-human-like-moves": true,
  "option-move-pace": 12.5,
  "option-physical-floor": 600,
  "option-timing-spread": 0.80,
  "option-fast-recaptures": true,
  "option-recapture-multiplier": 0.25,
  "option-fast-forced-moves": true,
  "option-forced-multiplier": 0.15,
  "option-fast-opening": true,
  "option-opening-moves-threshold": 10,
  "option-opening-multiplier": 0.40,
  "option-clock-scaling": true,
  "option-clock-threshold": 180,
  "option-clock-min-multiplier": 0.20
};

function getEngineOptionsStorageKey(engineUrl) {
  return engineUrl
    ? "engine_opts_" + encodeURIComponent(engineUrl).replace(/[^a-zA-Z0-9_-]/g, "_")
    : null;
}

function injectPageScript(scriptRelativePath) {
  const scriptElement = document.createElement("script");
  scriptElement.src = chrome.runtime.getURL(scriptRelativePath);
  scriptElement.onload = () => scriptElement.remove();
  (document.head || document.documentElement).prepend(scriptElement);
}

const isExtensionPage =
  typeof window !== "undefined" &&
  window.location?.protocol === "chrome-extension:";

function dispatchOptionsWithEngineSettings(extensionOptions, onReady) {
  const engineUrl = extensionOptions?.["option-url-api-stockfish"];
  const engineOptionsStorageKey = getEngineOptionsStorageKey(engineUrl);
  if (engineUrl && !extensionOptions.customEngineOptions && engineOptionsStorageKey && chrome.storage?.local) {
    chrome.storage.local.get([engineOptionsStorageKey], (storedEngineResult) => {
      if (chrome.runtime?.lastError) {
        console.warn(
          "[BetterMint] Failed to read engine options:",
          chrome.runtime.lastError.message || chrome.runtime.lastError
        );
      }
      onReady(
        Object.assign({}, extensionOptions, {
          customEngineOptions: storedEngineResult?.[engineOptionsStorageKey] || {}
        })
      );
    });
    return;
  }
  onReady(extensionOptions);
}

if (typeof window !== "undefined" && !isExtensionPage && typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (!message?.extensionOptions) return;
    dispatchOptionsWithEngineSettings(message.extensionOptions, (mergedExtensionOptions) => {
      window.dispatchEvent(new CustomEvent("BetterMintUpdateOptions", { detail: mergedExtensionOptions }));
    });
  });

  window.addEventListener("BetterMintGetOptions", (requestEvent) => {
    chrome.storage.sync.get(DEFAULT_EXTENSION_OPTIONS, (extensionOptions) => {
      if (chrome.runtime?.lastError) {
        console.warn(
          "[BetterMint] Failed to read sync options:",
          chrome.runtime.lastError.message || chrome.runtime.lastError
        );
      }
      dispatchOptionsWithEngineSettings(
        extensionOptions || DEFAULT_EXTENSION_OPTIONS,
        (mergedExtensionOptions) => {
          window.dispatchEvent(
            new CustomEvent("BetterMintSendOptions", {
              detail: {
                requestId: requestEvent.detail?.requestId,
                extensionOptions: mergedExtensionOptions
              }
            })
          );
        }
      );
    });
  });

  injectPageScript("js/Mint.js");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { DEFAULT_EXTENSION_OPTIONS, getEngineOptionsStorageKey };
}
