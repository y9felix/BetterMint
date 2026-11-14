"use strict";

function injectScript(file) {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL(file);
  script.onload = () => script.remove();
  (document.head || document.documentElement).prepend(script);
}

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
    const storageKey = url ? "engine_opts_" + encodeURIComponent(url).replace(/[^a-zA-Z0-9_-]/g, "_") : null;
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
