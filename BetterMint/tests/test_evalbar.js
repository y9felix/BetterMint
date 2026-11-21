const assert = require("assert");
const fs = require("fs");
const path = require("path");

const extensionRootDir = path.join(__dirname, "..");
const evalBarCss = fs.readFileSync(path.join(extensionRootDir, "css/evalbar.css"), "utf8");

assert.ok(
  !/\b\d*\.?\d+r?em\b/.test(evalBarCss),
  "evalbar.css must use pixel units rather than font-scaled em or rem"
);
assert.ok(
  evalBarCss.includes("border-radius: 3px;"),
  "evalbar.css must use pixel-locked 3px border-radius"
);
assert.ok(
  !evalBarCss.includes('"Montserrat"'),
  "evalbar.css must use Chess.com system UI font stack rather than tall Montserrat"
);
assert.ok(
  !evalBarCss.includes(".bettermint-evalbar-fill::after"),
  "evalbar.css must not darken white bar edges with an inset border"
);
assert.ok(
  !evalBarCss.includes(".bettermint-evalbar-draw"),
  "evalbar.css must not render a center midpoint line"
);
assert.ok(
  evalBarCss.includes("padding: 7px 0;"),
  "evalbar.css desktop scoreAbbreviated must match Chess.com vertical edge spacing"
);
assert.ok(evalBarCss.includes("width: 20px;"), "evalbar.css must default to 20px compact width");
assert.ok(
  evalBarCss.includes("@media all and (min-width: 960px)"),
  "evalbar.css must match Mint.js 960px desktop breakpoint"
);
assert.ok(evalBarCss.includes("width: 30px;"), "evalbar.css must expand to 30px desktop width");
assert.ok(
  evalBarCss.includes("transition: transform 1s ease;"),
  "evalbar.css must use 1s (1000ms) fill transition"
);
assert.ok(
  evalBarCss.includes("pointer-events: none;"),
  "evalbar.css must keep eval bar non-interactive"
);
assert.ok(
  !evalBarCss.includes(".bettermint-evalbar-score "),
  "evalbar.css must not include hover tooltip score rules"
);
assert.ok(
  !evalBarCss.includes(".bettermint-evalbar:hover"),
  "evalbar.css must not include hover tooltip rules"
);

global.document = {
  documentElement: {},
  body: {
    children: [],
    appendChild(childElement) {
      this.children.push(childElement);
    }
  },
  createElement(tagName) {
    const classSet = new Set();
    const element = {
      tagName: tagName.toUpperCase(),
      style: {},
      textContent: "",
      _innerHTML: "",
      classList: {
        add: (...classNames) => classNames.forEach((className) => classSet.add(className)),
        remove: (...classNames) => classNames.forEach((className) => classSet.delete(className)),
        toggle: (className, shouldForce) => {
          if (shouldForce === undefined) {
            if (classSet.has(className)) classSet.delete(className);
            else classSet.add(className);
          } else if (shouldForce) {
            classSet.add(className);
          } else {
            classSet.delete(className);
          }
        },
        contains: (className) => classSet.has(className)
      },
      remove() {},
      querySelector(selector) {
        if (selector === ".bettermint-evalbar-white") return element._whiteFill;
        if (selector === ".bettermint-evalbar-scoreAbbreviated") return element._abbrLabel;
        return null;
      }
    };
    const createChildStub = (initialClassNames) => {
      const childClassSet = new Set(initialClassNames);
      return {
        style: {},
        textContent: "",
        classList: {
          toggle: (className, shouldForce) => {
            if (shouldForce) childClassSet.add(className);
            else childClassSet.delete(className);
          },
          contains: (className) => childClassSet.has(className)
        }
      };
    };
    Object.defineProperty(element, "innerHTML", {
      get: () => element._innerHTML,
      set: (htmlString) => {
        element._innerHTML = htmlString;
        element._whiteFill = createChildStub(["bettermint-evalbar-white"]);
        element._abbrLabel = createChildStub([
          "bettermint-evalbar-scoreAbbreviated",
          "bettermint-evalbar-dark"
        ]);
      }
    });
    return element;
  },
  querySelector: () => null
};

global.MutationObserver = class {
  observe() {}
  disconnect() {}
};

global.window = {
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {}
};

const {
  GameController,
  EXTENSION_OPTION_KEY,
  formatEvaluationDisplay,
  getEvalBarOffsetPx,
  setExtensionOptionsForTesting
} = require(path.join(extensionRootDir, "js/Mint.js"));

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

setExtensionOptionsForTesting({ [EXTENSION_OPTION_KEY.EvaluationBar]: true });
const gameController = Object.create(GameController.prototype);
gameController.chessboardElement = {
  isConnected: true,
  getBoundingClientRect: () => ({
    left: 200,
    top: 80,
    right: 680,
    bottom: 560,
    width: 480,
    height: 480
  })
};
gameController.boardOptions = { flipped: false };
gameController.evalBarElement = null;
gameController.evalBarAnimationFrameId = null;
gameController.evalBarResizeObserver = null;
gameController.evalBarSyncHandler = null;

gameController.createAnalysisTools();
assert.ok(gameController.evalBarElement, "createAnalysisTools must mount evalBarElement");
assert.ok(
  !gameController.evalBarElement.innerHTML.includes("bettermint-evalbar-draw"),
  "Eval bar shell must not include a center divider line"
);
assert.ok(
  !gameController.evalBarElement.innerHTML.includes("bettermint-evalbar-score "),
  "Eval bar shell must not include a hover tooltip element"
);
assert.strictEqual(
  gameController.evalBarElement.style.left,
  "160px",
  "Desktop viewport must offset bar by 40px"
);

global.window.innerWidth = 720;
gameController.evalBarSyncHandler();
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
gameController.evalBarSyncHandler();
assert.strictEqual(
  gameController.evalBarElement.style.display,
  "none",
  "Eval bar must hide when the board disconnects during SPA navigation"
);

console.log("Eval bar visual parity tests passed.");
