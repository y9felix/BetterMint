(() => {
"use strict";

let requestId = 0;

function requestOptions() {
  const id = requestId++;
  return new Promise((resolve) => {
    const listener = (evt) => {
      if (evt.detail.requestId === id) {
        window.removeEventListener("BetterMintSendOptions", listener);
        resolve(evt.detail.data);
      }
    };
    window.addEventListener("BetterMintSendOptions", listener);
    window.dispatchEvent(
      new CustomEvent("BetterMintGetOptions", { detail: { id } })
    );
  });
}

const enumOptions = {
  UrlApiStockfish: "option-url-api-stockfish",
  Depth: "option-depth",
  EvaluationBar: "option-evaluation-bar",
  ShowHints: "option-show-hints",
  MoveAnalysis: "option-move-analysis",
  AutoQueue: "option-auto-queue",
  Notifications: "option-notifications",
  LegitAutoMove: "option-legit-auto-move",
  HumanLikeMoves: "option-human-like-moves",
  MovePace: "option-move-pace",
  PhysicalFloor: "option-physical-floor",
  TimingSpread: "option-timing-spread",
  FastRecaptures: "option-fast-recaptures",
  RecaptureMultiplier: "option-recapture-multiplier",
  FastForcedMoves: "option-fast-forced-moves",
  ForcedMultiplier: "option-forced-multiplier",
  FastOpening: "option-fast-opening",
  OpeningMovesThreshold: "option-opening-moves-threshold",
  OpeningMultiplier: "option-opening-multiplier",
  ClockScaling: "option-clock-scaling",
  ClockThreshold: "option-clock-threshold",
  ClockMinMultiplier: "option-clock-min-multiplier"
};

const CLOCK_SELECTOR = ".clock-component.clock-bottom, .clock-button-component.clock-bottom, .clock.clock-bottom, .clock-bottom";

function getRemainingPlayerTimeSeconds() {
  const el = typeof document !== "undefined" ? document.querySelector(CLOCK_SELECTOR) : null;
  if (el && el.textContent) {
    const match = el.textContent.trim().match(/\d{1,2}(:\d{2}){1,2}/);
    if (match) {
      return match[0].split(":").map(Number).reduce((acc, val) => acc * 60 + val, 0);
    }
  }
  return null;
}

let BetterMintmaster;
let tempOptions = {};

if (typeof window !== "undefined") {
  requestOptions().then((options) => {
    tempOptions = options;
  });
}

function getValueConfig(key) {
  return (BetterMintmaster ? BetterMintmaster.options : tempOptions)[key];
}

class TopMove {
  constructor(line, depth, cp, mate) {
    this.line = line.split(" ");
    this.move = this.line[0];
    this.promotion = this.move.length > 4 ? this.move[4] : null;
    this.from = this.move.slice(0, 2);
    this.to = this.move.slice(2, 4);
    this.cp = cp;
    this.mate = mate;
    this.depth = depth;
  }
}

class GameController {
  static AUTO_QUEUE_SELECTORS = [
    ".game-over-button-primary",
    ".game-over-button-button",
    ".game-over-buttons-playAgain",
    '[data-action="next-game"]',
    '[data-testid="next-game"]',
    "button.game-over-button",
    ".game-over-modal-container button",
    ".board-modal-container button",
    ".game-over-modal button",
    ".game-over-dialog button",
    ".game-over-buttons-component button",
    ".ui_v5-button-component.ui_v5-button-primary",
    ".cc-button-primary"
  ].join(", ");

  static AUTO_QUEUE_KEYWORDS = [
    "play again", "new opponent", "next game", "new game", "rematch",
    "new 1 min", "new 3 min", "new 5 min", "new 10 min", "new 15 min", "new 30 min", "new"
  ];

  constructor(BetterMintmaster, chessboard) {
    this.BetterMintmaster = BetterMintmaster;
    this.chessboard = chessboard;
    this.controller = chessboard.game;
    this.options = this.controller.getOptions();
    this.evalBar = null;
    this.evalBarFill = null;
    this.evalScore = null;
    this.evalScoreAbbreviated = null;
    this.currentMarkings = [];
    this.turnStartTime = performance.now();
    this.autoMoveTimer = null;
    this.gameOverInterval = null;
    this.analysisToolsObserver = null;
    this.lastAutoQueueClick = 0;

    this.controller.on("Move", () => {
      if (this.autoMoveTimer !== null) {
        clearTimeout(this.autoMoveTimer);
        this.autoMoveTimer = null;
      }
      if (this.controller.getPlayingAs() === this.controller.getTurn()) {
        this.turnStartTime = performance.now();
      }
      this.UpdateEngine(false);
    });

    if (this.evalBar == null && getValueConfig(enumOptions.EvaluationBar)) {
      this.CreateAnalysisTools();
    }

    this.controller.on("ModeChanged", (event) => {
      if (event.data === "playing") {
        setTimeout(() => {
          this.ResetGame();
        }, 100);
      } else if (event.data === "gameOver") {
        this.handleGameOver();
      }
    });

    this.controller.on("RendererSet", () => {
      this.ResetGame();
    });

    this.controller.on("ResetGame", () => {
      setTimeout(() => {
        this.UpdateEngine(true);
        this.RefreshEvalutionBar();
      }, 50);
    });

    this.controller.on("UpdateOptions", (event) => {
      this.options = this.controller.getOptions();
      if (event.data.flipped != undefined && this.evalBar != null) {
        this.evalBar.classList.toggle("evaluation-bar-flipped", Boolean(event.data.flipped));
      }
      this.setupAutoQueueObserver();
    });

    this.setupAutoQueueObserver();
  }

  dispatchButtonClick(element) {
    const rect = element.getBoundingClientRect();
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };
    element.dispatchEvent(new PointerEvent("pointerdown", opts));
    element.dispatchEvent(new MouseEvent("mousedown", opts));
    element.dispatchEvent(new PointerEvent("pointerup", opts));
    element.dispatchEvent(new MouseEvent("mouseup", opts));
    element.click();
  }

  triggerAutoQueue() {
    if (!getValueConfig(enumOptions.AutoQueue)) return false;
    const now = Date.now();
    if (this.lastAutoQueueClick && now - this.lastAutoQueueClick < 4000) return false;

    const isVisible = (el) => el && el.offsetWidth > 0 && el.offsetHeight > 0 && !el.disabled;
    const elements = document.querySelectorAll(GameController.AUTO_QUEUE_SELECTORS);
    for (const el of elements) {
      if (isVisible(el)) {
        const text = el.textContent.trim().toLowerCase();
        if (GameController.AUTO_QUEUE_KEYWORDS.some((kw) => text.includes(kw))) {
          this.lastAutoQueueClick = now;
          this.dispatchButtonClick(el);
          return true;
        }
      }
    }

    const fallbackButtons = document.querySelectorAll("button:not([disabled]), [role='button']:not([disabled])");
    for (const btn of fallbackButtons) {
      if (isVisible(btn)) {
        const text = btn.textContent.trim().toLowerCase();
        if (text && GameController.AUTO_QUEUE_KEYWORDS.some((kw) => text.includes(kw))) {
          this.lastAutoQueueClick = now;
          this.dispatchButtonClick(btn);
          return true;
        }
      }
    }
    return false;
  }

  setupAutoQueueObserver() {
    if (this.autoQueueObserver) {
      if (!getValueConfig(enumOptions.AutoQueue)) {
        this.autoQueueObserver.disconnect();
        this.autoQueueObserver = null;
      }
      return;
    }

    if (!getValueConfig(enumOptions.AutoQueue)) return;

    let lastCheckTime = 0;
    this.autoQueueObserver = new MutationObserver(() => {
      const now = Date.now();
      if (now - lastCheckTime < 250) return;
      lastCheckTime = now;
      this.triggerAutoQueue();
    });

    this.autoQueueObserver.observe(document.body, { childList: true, subtree: true });
  }

  handleGameOver() {
    if (!getValueConfig(enumOptions.AutoQueue)) return;
    if (this.gameOverInterval !== null) {
      clearInterval(this.gameOverInterval);
    }
    let attempts = 0;
    this.gameOverInterval = setInterval(() => {
      attempts++;
      if (attempts > 60 || this.triggerAutoQueue()) {
        clearInterval(this.gameOverInterval);
        this.gameOverInterval = null;
      }
    }, 500);
  }

  UpdateExtensionOptions() {
    if (getValueConfig(enumOptions.EvaluationBar) && this.evalBar == null) {
      this.CreateAnalysisTools();
    } else if (!getValueConfig(enumOptions.EvaluationBar) && this.evalBar != null) {
      this.evalBar.remove();
      this.evalBar = null;
    }

    this.setupAutoQueueObserver();
    if (!getValueConfig(enumOptions.ShowHints)) {
      this.RemoveCurrentMarkings();
    }
    if (!getValueConfig(enumOptions.MoveAnalysis)) {
      const lastMove = this.controller.getLastMove();
      if (lastMove) {
        this.controller.markings.removeOne(`effect|${lastMove.to}`);
      }
    }
  }

  CreateAnalysisTools() {
    if (this.analysisToolsObserver) {
      this.analysisToolsObserver.disconnect();
      this.analysisToolsObserver = null;
    }

    const mount = () => {
      const layoutChessboard = this.chessboard.parentElement;
      if (!layoutChessboard?.parentElement) return false;

      if (getValueConfig(enumOptions.EvaluationBar) && this.evalBar == null) {
        const evalBar = document.createElement("div");
        evalBar.style.flex = "1 1 auto";
        evalBar.innerHTML = `<div class="evaluation-bar-bar"><span class="evaluation-bar-scoreAbbreviated evaluation-bar-dark">0.0</span><span class="evaluation-bar-score evaluation-bar-dark">+0.00</span><div class="evaluation-bar-fill"><div class="evaluation-bar-color evaluation-bar-black"></div><div class="evaluation-bar-color evaluation-bar-draw"></div><div class="evaluation-bar-color evaluation-bar-white" style="transform: translate3d(0px, 50%, 0px);"></div></div></div>`;
        let layoutEvaluation = layoutChessboard.querySelector("#board-layout-evaluation, .board-layout-evaluation");
        if (!layoutEvaluation) {
          layoutEvaluation = document.createElement("div");
          layoutEvaluation.id = "board-layout-evaluation";
          layoutEvaluation.className = "board-layout-evaluation";
          layoutChessboard.insertBefore(layoutEvaluation, layoutChessboard.firstElementChild);
        }
        layoutEvaluation.replaceChildren(evalBar);
        this.evalBar = layoutEvaluation.querySelector(".evaluation-bar-bar");
        this.evalBarFill = layoutEvaluation.querySelector(".evaluation-bar-white");
        this.evalScore = layoutEvaluation.querySelector(".evaluation-bar-score");
        this.evalScoreAbbreviated = layoutEvaluation.querySelector(".evaluation-bar-scoreAbbreviated");
        if (!this.options.isWhiteOnBottom && this.options.flipped) {
          this.evalBar.classList.add("evaluation-bar-flipped");
        }
      }
      return true;
    };

    if (mount()) return;

    this.analysisToolsObserver = new MutationObserver(() => {
      if (mount()) {
        if (this.analysisToolsObserver) {
          this.analysisToolsObserver.disconnect();
          this.analysisToolsObserver = null;
        }
      }
    });
    const target = this.chessboard.parentElement || document.body;
    this.analysisToolsObserver.observe(target, { childList: true, subtree: true });
  }

  RefreshEvalutionBar() {
    if (getValueConfig(enumOptions.EvaluationBar)) {
      if (this.evalBar != null) {
        this.evalBar.remove();
        this.evalBar = null;
      }
      this.CreateAnalysisTools();
    }
  }

  UpdateEngine(isNewGame) {
    const FENs = this.controller.getFEN();
    this.BetterMintmaster.engine.UpdatePosition(FENs, isNewGame);
  }

  ResetGame() {
    this.lastAutoQueueClick = 0;
    if (this.autoMoveTimer !== null) {
      clearTimeout(this.autoMoveTimer);
      this.autoMoveTimer = null;
    }
    if (this.gameOverInterval !== null) {
      clearInterval(this.gameOverInterval);
      this.gameOverInterval = null;
    }
    if (this.analysisToolsObserver) {
      this.analysisToolsObserver.disconnect();
      this.analysisToolsObserver = null;
    }
    this.options = this.controller.getOptions();
    if (this.controller.getPlayingAs() === this.controller.getTurn()) {
      this.turnStartTime = performance.now();
    }
    this.UpdateEngine(true);
    this.RefreshEvalutionBar();
  }

  RemoveCurrentMarkings() {
    this.currentMarkings.forEach((marking) => {
      const target = marking.data.square != null ? marking.data.square : `${marking.data.from}${marking.data.to}`;
      this.controller.markings.removeOne(`${marking.type}|${target}`);
    });
    this.currentMarkings = [];
  }

  HintMoves(topMoves, lastTopMoves, isBestMove) {
    const bestMove = topMoves[0];
    if (getValueConfig(enumOptions.ShowHints)) {
      this.RemoveCurrentMarkings();
      topMoves.forEach((move, idx) => {
        if (isBestMove && move.depth !== bestMove.depth) return;

        const color =
          idx === 0
            ? this.options.arrowColors.alt
            : idx <= 2
            ? this.options.arrowColors.shift
            : idx <= 5
            ? this.options.arrowColors.default
            : this.options.arrowColors.ctrl;

        this.currentMarkings.push({
          data: {
            from: move.from,
            color: color,
            opacity: 0.8,
            to: move.to
          },
          node: true,
          persistent: true,
          type: "arrow"
        });

        if (move.mate !== null) {
          this.currentMarkings.push({
            data: {
              square: move.to,
              type: move.mate < 0 ? "ResignWhite" : "WinnerWhite"
            },
            node: true,
            persistent: true,
            type: "effect"
          });
        }
      });
      this.currentMarkings.reverse();
      this.controller.markings.addMany(this.currentMarkings);
    }

    if (getValueConfig(enumOptions.EvaluationBar)) {
      let score = bestMove.mate !== null ? bestMove.mate : bestMove.cp;
      if (this.controller.getTurn() === 2) score *= -1;
      this.SetEvaluation(score, bestMove.mate !== null);
    }
  }

  SetEvaluation(score, isMate) {
    if (this.evalBar == null) return;
    let percentage;
    let textNumber;
    let textScoreAbb;
    if (!isMate) {
      const smallScore = score / 100;
      percentage = Math.max(5, Math.min(95, 90 - ((score + 500) / 1000) * 90 + 5));
      textNumber = (score >= 0 ? "+" : "") + smallScore.toFixed(2);
      textScoreAbb = Math.abs(smallScore).toFixed(1);
    } else {
      percentage = score < 0 ? 100 : 0;
      textNumber = "M" + Math.abs(score).toString();
      textScoreAbb = textNumber;
    }
    this.evalBarFill.style.transform = `translate3d(0px, ${percentage}%, 0px)`;
    this.evalScore.textContent = textNumber;
    this.evalScoreAbbreviated.textContent = textScoreAbb;
    const isDark = score >= 0;
    this.evalScore.classList.toggle("evaluation-bar-dark", isDark);
    this.evalScore.classList.toggle("evaluation-bar-light", !isDark);
    this.evalScoreAbbreviated.classList.toggle("evaluation-bar-dark", isDark);
    this.evalScoreAbbreviated.classList.toggle("evaluation-bar-light", !isDark);
  }
}

class StockfishEngine {
  static HIGHLIGHT_COLORS = Object.freeze({
    Brilliant: "#1baca6",
    GreatFind: "#5c8bb0",
    BestMove: "#9eba5a",
    Excellent: "#96bc4b",
    Good: "#96af8b",
    Inaccuracy: "#f0c15c",
    Mistake: "#e6912c",
    Blunder: "#b33430",
    MissedWin: "#dbac16"
  });

  static EVAL_THRESHOLDS = Object.freeze([
    [100, "Brilliant"],
    [0, "GreatFind"],
    [-10, "BestMove"],
    [-25, "Excellent"],
    [-50, "Good"],
    [-100, "Inaccuracy"],
    [-250, "Mistake"]
  ]);

  constructor(BetterMintmaster) {
    this.BetterMintmaster = BetterMintmaster;
    this.loaded = false;
    this.stopInFlight = false;
    this.ready = false;
    this.isEvaluating = false;
    this.isRequestedStop = false;
    this.readyCallbacks = [];
    this.goDoneCallbacks = [];
    this.stopTimeout = null;
    this.topMoves = [];
    this.lastTopMoves = [];
    this.lastMoveScore = null;
    this.depth = getValueConfig(enumOptions.Depth) ?? 15;
    this.currentUrl = getValueConfig(enumOptions.UrlApiStockfish);
    this.targetUrl = this.currentUrl;
    this.isSwitching = false;
    this.onEngineSwitchedCallback = null;
    this.engineUciOptions = new Set();
    this.customEngineOptions = { "MultiPV": "1" };

    this.initializeWebSocket(this.currentUrl);

    this.reconnectDelay = 500;
    this.maxReconnectDelay = 3000;
    this.reconnectAttempts = 5;
  }

  initializeWebSocket(url) {
    try {
      this.stockfish = new WebSocket(url);
    } catch (e) {
      console.error("Failed to initialize WebSocket:", e);
      this.handleDisconnect();
      return;
    }

    const ws = this.stockfish;
    ws.addEventListener("open", () => {
      if (this.stockfish !== ws) return;
      console.log("WebSocket connection opened.");
      this.reconnectAttempts = 0;
      this.send("uci");
      this.onReady(() => {
        this.UpdateOptions();
        this.send("ucinewgame");
        if (this.onEngineSwitchedCallback) {
          const cb = this.onEngineSwitchedCallback;
          this.onEngineSwitchedCallback = null;
          cb();
        }
      });
    });

    ws.addEventListener("message", (event) => {
      if (this.stockfish !== ws) return;
      this.ProcessMessage(event.data);
    });

    ws.addEventListener("close", () => {
      if (this.stockfish !== ws || this.isSwitching) return;
      console.error("WebSocket connection closed.");
      this.handleDisconnect();
    });

    ws.addEventListener("error", (error) => {
      if (this.stockfish !== ws) return;
      console.error("WebSocket error:", error);
    });
  }

  switchEngine(newUrl) {
    if (!newUrl || newUrl === this.targetUrl) return;
    this.targetUrl = newUrl;
    this.isSwitching = true;
    this.stopEvaluation(() => {
      if (this.stockfish) {
        const oldWs = this.stockfish;
        this.stockfish = null;
        try {
          oldWs.close();
        } catch (e) {}
      }
      this.currentUrl = newUrl;
      this.ready = false;
      this.loaded = false;
      this.isSwitching = false;
      this.engineUciOptions = new Set();
      this.onEngineSwitchedCallback = () => {
        if (this.BetterMintmaster && this.BetterMintmaster.game) {
          this.BetterMintmaster.game.UpdateEngine(false);
        }
      };
      this.initializeWebSocket(newUrl);
    });
  }

  send(cmd) {
    if (this.isWebSocketOpen()) {
      this.stockfish.send(cmd);
    } else {
      console.warn("Attempted to send command while WebSocket is not open.");
    }
  }

  isWebSocketOpen() {
    return Boolean(this.stockfish && this.stockfish.readyState === WebSocket.OPEN);
  }

  go() {
    this.onReady(() => {
      this.stopEvaluation(() => {
        if (this.isEvaluating) return;
        this.isEvaluating = true;
        this.send(`go depth ${this.depth}`);
      });
    });
  }

  handleDisconnect() {
    this.ready = false;
    this.loaded = false;
    this.isEvaluating = false;
    this.stopInFlight = false;
    this.isRequestedStop = false;
    if (this.stopTimeout !== null) {
      clearTimeout(this.stopTimeout);
      this.stopTimeout = null;
    }
    this.attemptReconnect();
  }

  attemptReconnect() {
    if (this.reconnectAttempts < 5) {
      this.reconnectAttempts++;
      const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, this.maxReconnectDelay);
      console.log(`Attempting to reconnect in ${delay / 1000} seconds...`);
      setTimeout(() => {
        this.initializeWebSocket(getValueConfig(enumOptions.UrlApiStockfish));
      }, delay);
    } else {
      console.error("Max reconnect attempts reached. Please check the connection.");
    }
  }

  onReady(callback) {
    if (this.ready) {
      callback();
    } else {
      this.readyCallbacks.push(callback);
      this.send("isready");
    }
  }

  stopEvaluation(callback) {
    if (this.isEvaluating) {
      if (typeof callback === "function") {
        this.goDoneCallbacks.push(callback);
      }
      if (!this.stopInFlight) {
        this.stopInFlight = true;
        this.isRequestedStop = true;
        this.send("stop");
        if (this.stopTimeout !== null) {
          clearTimeout(this.stopTimeout);
        }
        this.stopTimeout = setTimeout(() => {
          this.stopTimeout = null;
          if (this.stopInFlight) {
            this.stopInFlight = false;
            this.isRequestedStop = false;
            this.isEvaluating = false;
            const callbacks = this.goDoneCallbacks;
            this.goDoneCallbacks = [];
            callbacks.forEach((cb) => cb());
          }
        }, 150);
      }
    } else {
      if (typeof callback === "function") {
        callback();
      }
    }
  }

  calculateTargetDelay(bestMove) {
    if (!getValueConfig(enumOptions.HumanLikeMoves)) {
      return 0;
    }
    const movePace = parseFloat(getValueConfig(enumOptions.MovePace)) || 1.5;
    const physicalFloor = parseInt(getValueConfig(enumOptions.PhysicalFloor), 10) || 200;
    const timingSpread = parseFloat(getValueConfig(enumOptions.TimingSpread)) || 0.80;

    let median = movePace * 1000;

    const controller = this.BetterMintmaster.game.controller;
    const legalMoves = controller.getLegalMoves();
    const lastMove = controller.getLastMove();

    if (getValueConfig(enumOptions.FastForcedMoves) && legalMoves?.length === 1) {
      const forcedMult = parseFloat(getValueConfig(enumOptions.ForcedMultiplier)) || 0.35;
      median *= forcedMult;
    } else if (getValueConfig(enumOptions.FastRecaptures) && lastMove && bestMove && bestMove.to === lastMove.to) {
      const recapMult = parseFloat(getValueConfig(enumOptions.RecaptureMultiplier)) || 0.50;
      median *= recapMult;
    } else if (getValueConfig(enumOptions.FastOpening)) {
      const openingThreshold = parseInt(getValueConfig(enumOptions.OpeningMovesThreshold), 10) || 8;
      const fullMoveNumber = parseInt(controller.getFEN().split(" ")[5], 10) || 1;
      if (fullMoveNumber <= openingThreshold) {
        const openingMult = parseFloat(getValueConfig(enumOptions.OpeningMultiplier)) || 0.35;
        median *= openingMult;
      }
    }

    if (getValueConfig(enumOptions.ClockScaling)) {
      const remainingSeconds = getRemainingPlayerTimeSeconds();
      const clockThreshold = parseInt(getValueConfig(enumOptions.ClockThreshold), 10) || 60;
      if (remainingSeconds != null && remainingSeconds < clockThreshold) {
        const minMult = parseFloat(getValueConfig(enumOptions.ClockMinMultiplier)) || 0.30;
        const factor = Math.max(minMult, remainingSeconds / clockThreshold);
        median *= factor;
      }
    }

    const u1 = Math.max(1e-7, Math.random());
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const mu = Math.log(Math.max(50, median - physicalFloor));
    return Math.round(physicalFloor + Math.exp(mu + timingSpread * z));
  }

  UpdatePosition(FENs = null, isNewGame = true) {
    this.onReady(() => {
      this.stopEvaluation(() => {
        this.MoveAndGo(FENs, isNewGame);
      });
    });
  }

  UpdateExtensionOptions(options = {}) {
    const newUrl = options[enumOptions.UrlApiStockfish];
    if (newUrl && newUrl !== this.currentUrl) {
      this.switchEngine(newUrl);
      return;
    }
    const custom = options.customEngineOptions;
    if (custom && typeof custom === "object") {
      Object.assign(this.customEngineOptions, custom);
      this.UpdateOptions(this.customEngineOptions);
    }
    this.depth = getValueConfig(enumOptions.Depth) ?? 15;
    if (this.topMoves.length > 0) this.onTopMoves(null, !this.isEvaluating);
  }

  UpdateOptions(options = null) {
    const opts = options || this.customEngineOptions;
    if (!opts || typeof opts !== "object") return;
    for (const [key, value] of Object.entries(opts)) {
      if (this.engineUciOptions.size === 0 || this.engineUciOptions.has(key)) {
        this.send(`setoption name ${key} value ${value}`);
      }
    }
  }

  ProcessMessage(event) {
    this.ready = false;
    const line = event && typeof event === "object" ? event.data : event;

    if (line && typeof line === "string" && line.startsWith("option name ")) {
      const typeIndex = line.indexOf(" type ");
      if (typeIndex !== -1) {
        this.engineUciOptions.add(line.substring("option name ".length, typeIndex).trim());
      }
      return;
    }

    if (line === "uciok") {
      this.loaded = true;
      this.UpdateOptions();
      this.BetterMintmaster.onEngineLoaded();
    } else if (line === "readyok") {
      this.ready = true;
      const callbacks = this.readyCallbacks;
      this.readyCallbacks = [];
      callbacks.forEach((cb) => cb());
    } else if (this.isEvaluating && line === "Load eval file success: 1") {
      this.isEvaluating = false;
      this.isRequestedStop = false;
      const callbacks = this.goDoneCallbacks;
      this.goDoneCallbacks = [];
      callbacks.forEach((cb) => cb());
    } else if (typeof line === "string" && line.startsWith("info ")) {
      const depthMatch = line.match(/depth (\d+)/);
      const scoreMatch = line.match(/score (\w+) (-?\d+)/);
      const pvMatch = line.match(/pv ([a-h][1-8][a-h][1-8][qrbn]?(?: [a-h][1-8][a-h][1-8][qrbn]?)*)/);

      if (depthMatch && scoreMatch && pvMatch) {
        const depth = parseInt(depthMatch[1], 10);
        const scoreType = scoreMatch[1];
        const score = parseInt(scoreMatch[2], 10);
        const pv = pvMatch[1];

        const cpScore = scoreType === "cp" ? score : null;
        const mateScore = scoreType === "mate" ? score : null;

        if (!this.isRequestedStop) {
          const move = new TopMove(pv, depth, cpScore, mateScore);
          this.onTopMoves(move, false);
        }
      }
    } else if (typeof line === "string" && line.startsWith("bestmove ")) {
      const bestMoveMatch = line.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/);
      if (bestMoveMatch) {
        if (this.stopTimeout !== null) {
          clearTimeout(this.stopTimeout);
          this.stopTimeout = null;
        }
        this.isEvaluating = false;
        const wasRequestedStop = this.isRequestedStop;
        this.isRequestedStop = false;
        this.stopInFlight = false;

        const callbacks = this.goDoneCallbacks;
        this.goDoneCallbacks = [];
        callbacks.forEach((cb) => cb());

        if (!wasRequestedStop && bestMoveMatch[1] !== undefined) {
          const bestMove = bestMoveMatch[1];
          const index = this.topMoves.findIndex((object) => object.move === bestMove);

          if (index < 0) {
            console.warn(`The engine returned the best move "${bestMove}" but it's not in the top move list.`);
            const bestMoveOnTop = new TopMove(
              bestMove,
              getValueConfig(enumOptions.Depth),
              100,
              null
            );
            this.onTopMoves(bestMoveOnTop, true);
          } else {
            this.onTopMoves(this.topMoves[index], true);
          }
        }
      }
    }
  }

  MoveAndGo(FENs = null, isNewGame = true) {
    const go = () => {
      this.lastTopMoves = isNewGame ? [] : this.topMoves;
      this.lastMoveScore = null;
      this.topMoves = [];
      if (FENs !== null) this.send(`position fen ${FENs}`);
      this.go();
    };
    this.onReady(() => {
      if (isNewGame) {
        this.send("ucinewgame");
        this.onReady(go);
      } else {
        go();
      }
    });
  }

  AnalyzeLastMove() {
    this.lastMoveScore = null;
    const controller = this.BetterMintmaster.game.controller;
    const lastMove = controller.getLastMove();
    if (!lastMove) return;
    if (this.lastTopMoves.length > 0) {
      const lastBestMove = this.lastTopMoves[0];
      if (lastBestMove.from === lastMove.from && lastBestMove.to === lastMove.to) {
        this.lastMoveScore = "BestMove";
      } else {
        const bestMove = this.topMoves[0];
        if (lastBestMove.mate !== null) {
          if (bestMove.mate === null) {
            this.lastMoveScore = lastBestMove.mate > 0 ? "MissedWin" : "Brilliant";
          } else {
            this.lastMoveScore = lastBestMove.mate > 0 ? "Excellent" : "ResignWhite";
          }
        } else if (bestMove.mate !== null) {
          this.lastMoveScore = bestMove.mate < 0 ? "Brilliant" : "Blunder";
        } else if (bestMove.cp !== null && lastBestMove.cp !== null) {
          const evalDiff = -(bestMove.cp + lastBestMove.cp);
          const match = StockfishEngine.EVAL_THRESHOLDS.find(([th]) => evalDiff > th);
          this.lastMoveScore = match ? match[1] : "Blunder";
        } else {
          console.assert(false, "Error while analyzing last move");
        }
      }
    }
    if (this.lastMoveScore !== null) {
      const hlColor = StockfishEngine.HIGHLIGHT_COLORS[this.lastMoveScore];
      if (hlColor) {
        controller.markings.addOne({
          data: {
            opacity: 0.5,
            color: hlColor,
            square: lastMove.to
          },
          node: true,
          persistent: true,
          type: "highlight"
        });
      }
      controller.markings.addOne({
        data: {
          square: lastMove.to,
          type: this.lastMoveScore
        },
        node: true,
        persistent: true,
        type: "effect"
      });
    }
  }

  onTopMoves(move = null, isBestMove = false) {
    let bestMoveSelected = false;
    if (move !== null) {
      const index = this.topMoves.findIndex((object) => object.move === move.move);
      if (index === -1) {
        this.topMoves.push(move);
        this.SortTopMoves();
      } else if (!isBestMove && move.depth >= this.topMoves[index].depth) {
        this.topMoves[index] = move;
        this.SortTopMoves();
      }
      if (isBestMove) bestMoveSelected = true;
    }

    const topPvMoves = this.topMoves.slice(0, 1);

    if (bestMoveSelected) {
      this.BetterMintmaster.game.HintMoves(topPvMoves, this.lastTopMoves, isBestMove);

      if (getValueConfig(enumOptions.MoveAnalysis)) {
        this.AnalyzeLastMove();
      }
    }

    if (
      bestMoveSelected &&
      getValueConfig(enumOptions.LegitAutoMove) &&
      this.BetterMintmaster.game.controller.getPlayingAs() === this.BetterMintmaster.game.controller.getTurn()
    ) {
      const bestMove = topPvMoves[0];
      if (!bestMove) return;
      const legalMoves = this.BetterMintmaster.game.controller.getLegalMoves();
      const moveData = legalMoves.find((m) => m.from === bestMove.from && m.to === bestMove.to);
      console.assert(Boolean(moveData), "Illegal best move");
      if (!moveData) return;
      moveData.userGenerated = true;
      if (bestMove.promotion !== null) {
        moveData.promotion = bestMove.promotion;
      }

      const targetDelay = this.calculateTargetDelay(bestMove);
      const elapsed = performance.now() - (this.BetterMintmaster.game.turnStartTime || performance.now());
      const remainingDelay = Math.max(0, targetDelay - elapsed);

      const secondsTillAutoMove = (remainingDelay / 1000).toFixed(1);
      if (getValueConfig(enumOptions.Notifications) && window.toaster && remainingDelay > 0) {
        window.toaster.add({
          id: "chess.com",
          duration: remainingDelay + 1000,
          icon: "circle-info",
          message: `BetterMint: Auto move in ${secondsTillAutoMove}s`,
          style: {
            position: "fixed",
            bottom: "60px",
            right: "30px",
            backgroundColor: "black",
            color: "white",
            fontSize: "14px",
            padding: "12px 16px",
            zIndex: "10000",
            border: "1px solid #ffffff"
          }
        });
      }

      const game = this.BetterMintmaster.game;
      const controller = game.controller;
      if (game.autoMoveTimer !== null) {
        clearTimeout(game.autoMoveTimer);
        game.autoMoveTimer = null;
      }

      if (remainingDelay <= 0) {
        controller.move(moveData);
      } else {
        game.autoMoveTimer = setTimeout(() => {
          game.autoMoveTimer = null;
          controller.move(moveData);
        }, remainingDelay);
      }
    }
  }

  SortTopMoves() {
    this.topMoves.sort((a, b) => {
      if (a.mate !== null && b.mate === null) {
        return a.mate < 0 ? 1 : -1;
      }
      if (a.mate === null && b.mate !== null) {
        return b.mate > 0 ? 1 : -1;
      }
      if (a.mate === null && b.mate === null) {
        if (a.depth === b.depth) return b.cp - a.cp;
        return b.depth - a.depth;
      }
      if ((a.mate < 0 && b.mate < 0) || (a.mate > 0 && b.mate > 0)) {
        return a.line.length - b.line.length;
      }
      return a.mate < b.mate ? 1 : -1;
    });
  }
}

class BetterMint {
  constructor(chessboard, options) {
    this.options = options;
    this.game = new GameController(this, chessboard);
    this.engine = new StockfishEngine(this);
    window.addEventListener(
      "BetterMintUpdateOptions",
      (event) => {
        this.options = event.detail;
        this.game.UpdateExtensionOptions();
        this.engine.UpdateExtensionOptions(this.options);

        if (
          getValueConfig(enumOptions.Notifications) &&
          window.toaster &&
          !window.toaster.notifications?.some((noti) => noti.id === "BetterMint-settings-updated")
        ) {
          window.toaster.add({
            id: "BetterMint-settings-updated",
            duration: 2000,
            icon: "circle-gearwheel",
            message: "Settings updated!",
            style: {
              position: "fixed",
              bottom: "60px",
              right: "30px",
              backgroundColor: "#3498db",
              color: "white",
              fontSize: "14px",
              padding: "12px 16px",
              zIndex: "10000"
            }
          });
        }
      },
      false
    );
  }

  onEngineLoaded() {
    if (getValueConfig(enumOptions.Notifications) && window.toaster) {
      window.toaster.add({
        id: "chess.com",
        duration: 3000,
        icon: "circle-info",
        content: "BetterMint is enabled!"
      });
    }
  }
}

function InitBetterMint(chessboard) {
  requestOptions().then((options) => {
    try {
      BetterMintmaster = new BetterMint(chessboard, options);

      const hotkeys = {
        q: () => BetterMintmaster.game.controller.moveBackward(),
        e: () => BetterMintmaster.game.controller.moveForward(),
        r: () => BetterMintmaster.game.controller.resetGame(),
        w: () => BetterMintmaster.game.ResetGame()
      };

      document.addEventListener("keypress", (e) => {
        hotkeys[e.key]?.();
      });
    } catch (e) {
      console.error("Oh noes! BetterMintmaster didn't load", e);
    }
  });
}

if (typeof document !== "undefined") {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && (node.tagName === "WC-CHESS-BOARD" || node.tagName === "CHESS-BOARD") && Object.hasOwn(node, "game")) {
          InitBetterMint(node);
          observer.disconnect();
          return;
        }
      }
    }
  });

  const existingBoard = document.querySelector("wc-chess-board, chess-board");
  if (existingBoard && Object.hasOwn(existingBoard, "game")) {
    InitBetterMint(existingBoard);
  } else {
    observer.observe(document, {
      childList: true,
      subtree: true
    });
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    StockfishEngine,
    GameController,
    TopMove,
    enumOptions,
    getValueConfig,
    setOptionsForTesting: (opts) => { tempOptions = opts; }
  };
}
})();
