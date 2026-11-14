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
    window.dispatchEvent(
      new CustomEvent("BetterMintSendOptions", {
        detail: {
          requestId: evt.detail?.id,
          data: opts,
        },
      })
    );
  });
});

injectScript("js/Mint.js");
