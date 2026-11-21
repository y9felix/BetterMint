const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { EXTENSION_ROOT_DIR, MockElement, withMockedGlobals } = require("./helpers");

// 1. High-signal CSS contracts (host-page font isolation, breakpoint parity, non-interactivity)
const evalBarCss = fs.readFileSync(path.join(EXTENSION_ROOT_DIR, "css/evalbar.css"), "utf8");
assert.ok(
  !/\b\d*\.?\d+r?em\b/.test(evalBarCss),
  "evalbar.css must use pixel units rather than em/rem so host page root font size cannot distort it"
);
assert.ok(
  evalBarCss.includes("@media all and (min-width: 960px)"),
  "evalbar.css must match Mint.js 960px desktop breakpoint"
);
assert.ok(
  evalBarCss.includes("pointer-events: none;"),
  "evalbar.css must keep eval bar non-interactive"
);

const {
  GameController,
  EXTENSION_OPTION_KEY,
  formatEvaluationDisplay,
  getEvalBarOffsetPx,
  setExtensionOptionsForTesting
} = require(path.join(EXTENSION_ROOT_DIR, "js/Mint.js"));

// 2. Pure offset and evaluation formatting math
assert.strictEqual(getEvalBarOffsetPx(1280), 40);
assert.strictEqual(getEvalBarOffsetPx(960), 40);
assert.strictEqual(getEvalBarOffsetPx(800), 30);

assert.deepStrictEqual(formatEvaluationDisplay(0, false), {
  percentage: 50,
  abbreviated: "0.0",
  isDark: true
});
assert.strictEqual(formatEvaluationDisplay(29, false).abbreviated, "0.3");
assert.strictEqual(formatEvaluationDisplay(-142, false).abbreviated, "1.4");
assert.strictEqual(formatEvaluationDisplay(-142, false).isDark, false);
assert.strictEqual(formatEvaluationDisplay(996, false).abbreviated, "10");
assert.strictEqual(formatEvaluationDisplay(-1240, false).abbreviated, "12");
assert.deepStrictEqual(formatEvaluationDisplay(3, true), {
  percentage: 0,
  abbreviated: "M3",
  isDark: true
});
assert.deepStrictEqual(formatEvaluationDisplay(-4, true), {
  percentage: 100,
  abbreviated: "M4",
  isDark: false
});

// 3. Sigmoid fill transform scaling and clamping
const sigmoidController = Object.create(GameController.prototype);
sigmoidController.evalBarElement = {};
sigmoidController.evalBarWhiteFill = { style: {} };
sigmoidController.evalScoreAbbreviatedElement = { classList: { toggle: () => {} } };

sigmoidController.setEvaluationDisplay(0, false);
assert.strictEqual(sigmoidController.evalBarWhiteFill.style.transform, "translate3d(0px, 50%, 0px)");

sigmoidController.setEvaluationDisplay(500, false);
const percentAtPlusFive = parseFloat(
  sigmoidController.evalBarWhiteFill.style.transform.match(/([0-9.]+)%/)[1]
);
assert.ok(
  percentAtPlusFive > 10 && percentAtPlusFive < 20,
  `Expected sigmoid ~13.7% at +5.0 pawns, got ${percentAtPlusFive}%`
);

sigmoidController.setEvaluationDisplay(1200, false);
assert.strictEqual(sigmoidController.evalBarWhiteFill.style.transform, "translate3d(0px, 5%, 0px)");

// 4. DOM mount, responsive offset recalculation, SPA disconnect hiding, and rAF coalescing
function createEvalBarElementStub(tagName) {
  const element = new MockElement(tagName);
  const originalQuerySelector = element.querySelector.bind(element);
  let whiteFill = null;
  let abbrLabel = null;

  Object.defineProperty(element, "innerHTML", {
    get: () => element._innerHTML,
    set: (htmlString) => {
      element._innerHTML = htmlString;
      whiteFill = new MockElement("div");
      whiteFill.classList.add("bettermint-evalbar-white");
      abbrLabel = new MockElement("span");
      abbrLabel.classList.add("bettermint-evalbar-scoreAbbreviated", "bettermint-evalbar-dark");
    }
  });
  element.querySelector = (selector) => {
    if (selector === ".bettermint-evalbar-white") return whiteFill;
    if (selector === ".bettermint-evalbar-scoreAbbreviated") return abbrLabel;
    return originalQuerySelector(selector);
  };
  return element;
}

let boardRectMeasurementCount = 0;
const animationFrameQueue = [];
const cancelledAnimationFrames = [];
const windowListeners = {};
let nextRafId = 1;

withMockedGlobals(
  {
    requestAnimationFrame: (callback) => {
      const frameId = nextRafId++;
      animationFrameQueue.push({ frameId, callback });
      return frameId;
    },
    cancelAnimationFrame: (frameId) => cancelledAnimationFrames.push(frameId),
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    window: {
      innerWidth: 1280,
      innerHeight: 800,
      addEventListener: (eventName, listener) => {
        windowListeners[eventName] = listener;
      },
      removeEventListener: (eventName, listener) => {
        if (windowListeners[eventName] === listener) delete windowListeners[eventName];
      },
      dispatchEvent: () => {}
    },
    document: {
      documentElement: {},
      body: new MockElement("body"),
      createElement: (tagName) => createEvalBarElementStub(tagName),
      querySelector: () => null
    }
  },
  () => {
    setExtensionOptionsForTesting({ [EXTENSION_OPTION_KEY.EvaluationBar]: true });
    const gameController = Object.create(GameController.prototype);
    gameController.chessboardElement = {
      isConnected: true,
      getBoundingClientRect: () => {
        boardRectMeasurementCount++;
        return { left: 200, top: 80, right: 680, bottom: 560, width: 480, height: 480 };
      }
    };
    gameController.boardOptions = { flipped: false };
    gameController.evalBarElement = null;
    gameController.evalBarAnimationFrameId = null;
    gameController.evalBarResizeObserver = null;
    gameController.evalBarSyncHandler = null;

    gameController.createAnalysisTools();
    assert.ok(gameController.evalBarElement, "createAnalysisTools must mount evalBarElement");
    assert.strictEqual(
      boardRectMeasurementCount,
      1,
      "Initial createAnalysisTools must measure board once synchronously"
    );
    assert.strictEqual(gameController.evalBarElement.style.left, "160px");

    global.window.innerWidth = 720;
    windowListeners.scroll();
    windowListeners.scroll();
    windowListeners.resize();
    assert.strictEqual(
      animationFrameQueue.length,
      1,
      "Burst scroll/resize events must coalesce into 1 pending rAF"
    );
    assert.strictEqual(
      boardRectMeasurementCount,
      1,
      "Coalesced burst must not force layout before animation frame"
    );

    animationFrameQueue.shift().callback();
    assert.strictEqual(boardRectMeasurementCount, 2);
    assert.strictEqual(
      gameController.evalBarElement.style.left,
      "170px",
      "Compact viewport (<960px) must offset bar by 30px"
    );

    gameController.setEvaluationDisplay(-1240, false);
    assert.strictEqual(gameController.evalScoreAbbreviatedElement.textContent, "12");
    assert.strictEqual(
      gameController.evalScoreAbbreviatedElement.classList.contains("bettermint-evalbar-light"),
      true
    );

    gameController.chessboardElement.isConnected = false;
    windowListeners.scroll();
    animationFrameQueue.shift().callback();
    assert.strictEqual(
      gameController.evalBarElement.style.display,
      "none",
      "Eval bar must hide when the board disconnects during SPA navigation"
    );

    windowListeners.scroll();
    assert.strictEqual(animationFrameQueue.length, 1);
    gameController.removeEvaluationBar();
    assert.deepStrictEqual(
      cancelledAnimationFrames,
      [3],
      "removeEvaluationBar must cancel pending animation frame"
    );
    assert.strictEqual(windowListeners.scroll, undefined);
    assert.strictEqual(windowListeners.resize, undefined);
  }
);

console.log("Eval bar tests passed.");
