"use strict";

const DEFAULT_EXTENSION_OPTIONS = {
  "option-url-api-stockfish": "ws://localhost:8000/ws",
  "option-depth": 3,
  "option-go-movetime": 0,
  "option-go-nodes": 0,
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
  "option-reflex-multiplier": 0.25,
  "option-opening-moves-threshold": 10,
  "option-opening-multiplier": 0.40,
  "option-clock-threshold": 180
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

function isExtensionContextValid() {
  return (
    typeof chrome !== "undefined" &&
    Boolean(chrome.runtime?.id) &&
    Boolean(chrome.storage?.sync)
  );
}

function dispatchOptionsWithEngineSettings(extensionOptions, onReady) {
  const engineUrl = extensionOptions?.["option-url-api-stockfish"];
  const engineOptionsStorageKey = getEngineOptionsStorageKey(engineUrl);
  if (
    engineOptionsStorageKey &&
    !extensionOptions.customEngineOptions &&
    chrome.runtime?.id &&
    chrome.storage?.local
  ) {
    try {
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
    } catch {
      onReady(extensionOptions);
      return;
    }
  }
  onReady(extensionOptions);
}

if (typeof window !== "undefined" && !isExtensionPage && typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "UpdateOptions" || !message?.extensionOptions) return;
    dispatchOptionsWithEngineSettings(message.extensionOptions, (mergedExtensionOptions) => {
      window.dispatchEvent(new CustomEvent("BetterMintUpdateOptions", { detail: mergedExtensionOptions }));
    });
    sendResponse?.({ ok: true });
  });

  const handleGetOptionsRequest = (requestEvent) => {
    if (!isExtensionContextValid()) {
      window.removeEventListener("BetterMintGetOptions", handleGetOptionsRequest);
      return;
    }
    try {
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
    } catch {
      window.removeEventListener("BetterMintGetOptions", handleGetOptionsRequest);
    }
  };

  window.addEventListener("BetterMintGetOptions", handleGetOptionsRequest);

  injectPageScript("js/Mint.js");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { DEFAULT_EXTENSION_OPTIONS, getEngineOptionsStorageKey };
}
