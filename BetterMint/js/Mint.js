(() => {
"use strict";

const TURN_BLACK = 2;
const EVAL_BAR_OFFSET_PX = 34;
const AUTO_QUEUE_COOLDOWN_MS = 4000;
const AUTO_QUEUE_RETRY_MS = 500;
const AUTO_QUEUE_MAX_ATTEMPTS = 60;
const STOP_TIMEOUT_MS = 150;
const OPTIONS_REQUEST_TIMEOUT_MS = 5000;

let requestId = 0;

function requestOptions() {
  const id = requestId++;
  return new Promise((resolve) => {
    let timer = null;
    const listener = (evt) => {
      if (evt.detail?.requestId === id) {
        if (timer !== null) clearTimeout(timer);
        window.removeEventListener("BetterMintSendOptions", listener);
        resolve(evt.detail.data);
      }
    };
    timer = setTimeout(() => {
      window.removeEventListener("BetterMintSendOptions", listener);
      resolve({});
    }, OPTIONS_REQUEST_TIMEOUT_MS);
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

function cpToWinProbability(cp) {
  return 1 / (1 + Math.exp(-0.00368208 * cp));
}

function getRemainingPlayerTimeSeconds() {
  const el = typeof document !== "undefined" ? document.querySelector(CLOCK_SELECTOR) : null;
  const text = el?.textContent?.trim();
  if (!text) return null;
  const colonMatch = text.match(/(\d+):(\d{2})(?::(\d{2}))?(?:\.(\d+))?/);
  if (colonMatch) {
    const [, a, b, c, frac] = colonMatch;
    const base =
      c !== undefined
        ? Number(a) * 3600 + Number(b) * 60 + Number(c)
        : Number(a) * 60 + Number(b);
    return base + (frac ? Number(`0.${frac}`) : 0);
  }
  const secMatch = text.match(/^(\d+(?:\.\d+)?)$/);
  return secMatch ? Number(secMatch[1]) : null;
}

let BetterMintmaster;
let tempOptions = {};

function getValueConfig(key) {
  return (BetterMintmaster ? BetterMintmaster.options : tempOptions)[key];
}

function numConfig(key, fallback) {
  const n = parseFloat(getValueConfig(key));
  return n > 0 ? n : fallback;
}

function resolveLegalMove(legalMoves, bestMove) {
  if (!Array.isArray(legalMoves) || !bestMove) return null;
  return (
    legalMoves.find(
      (m) =>
        m.from === bestMove.from &&
        m.to === bestMove.to &&
        (!bestMove.promotion || !m.promotion || m.promotion === bestMove.promotion)
    ) || null
  );
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
    "play again", "new opponent", "next game", "new game", "rematch", "new"
  ];

  static HIGHLIGHT_COLORS = Object.freeze({
    BestMove: "#9eba5a",
    Excellent: "#96bc4b",
    Good: "#96af8b",
    Inaccuracy: "#f0c15c",
    Mistake: "#e6912c",
    Blunder: "#b33430",
    MissedWin: "#dbac16"
  });

  constructor(BetterMintmaster, chessboard) {
    this.BetterMintmaster = BetterMintmaster;
    this.chessboard = chessboard;
    this.controller = chessboard.game;
    this.boardOptions = this.controller.getOptions();
    this.evalBar = null;
    this.evalBarFill = null;
    this.evalScore = null;
    this.evalScoreAbbreviated = null;
    this.evalBarResizeObserver = null;
    this.evalBarSyncHandler = null;
    this.currentMarkings = [];
    this.lastHintSignature = "";
    this.lastAnalysisMarkings = [];
    this.turnStartTime = performance.now();
    this.autoMoveTimer = null;
    this.gameOverInterval = null;
    this.lastAutoQueueClick = 0;

    this.controller.on("Move", () => {
      if (this.autoMoveTimer !== null) {
        clearTimeout(this.autoMoveTimer);
        this.autoMoveTimer = null;
      }
      this.RemoveCurrentMarkings();
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
        if (this.autoMoveTimer !== null) {
          clearTimeout(this.autoMoveTimer);
          this.autoMoveTimer = null;
        }
        this.RemoveCurrentMarkings();
        this.handleGameOver();
      }
    });

    this.controller.on("RendererSet", () => {
      this.ResetGame();
    });

    this.controller.on("ResetGame", () => {
      setTimeout(() => {
        this.UpdateEngine(true);
        this.RefreshEvaluationBar();
      }, 50);
    });

    this.controller.on("UpdateOptions", (event) => {
      this.boardOptions = this.controller.getOptions();
      if (event.data.flipped !== undefined && this.evalBar != null) {
        this.evalBar.classList.toggle("bettermint-evalbar-flipped", Boolean(this.boardOptions?.flipped));
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
    if (this.lastAutoQueueClick && now - this.lastAutoQueueClick < AUTO_QUEUE_COOLDOWN_MS) return false;

    const matchesKeyword = (text, strictNew) =>
      GameController.AUTO_QUEUE_KEYWORDS.some((kw) => {
        if (kw === "new") {
          return strictNew ? /^new\b/.test(text) : /\bnew\b/.test(text);
        }
        return text.includes(kw);
      });

    const findAndClick = (selector, strictNew) => {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (el.disabled) continue;
        const text = el.textContent?.trim().toLowerCase();
        if (!text || !matchesKeyword(text, strictNew)) {
          continue;
        }
        if (el.offsetWidth > 0 && el.offsetHeight > 0) {
          this.lastAutoQueueClick = now;
          this.dispatchButtonClick(el);
          return true;
        }
      }
      return false;
    };

    if (findAndClick(GameController.AUTO_QUEUE_SELECTORS, false)) return true;
    return findAndClick("button:not([disabled]), [role='button']:not([disabled])", true);
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
    this.triggerAutoQueue();
  }

  handleGameOver() {
    if (!getValueConfig(enumOptions.AutoQueue)) return;
    this.setupAutoQueueObserver();
    if (this.gameOverInterval !== null) {
      clearInterval(this.gameOverInterval);
    }
    let attempts = 0;
    this.gameOverInterval = setInterval(() => {
      attempts++;
      if (attempts > AUTO_QUEUE_MAX_ATTEMPTS || this.triggerAutoQueue()) {
        clearInterval(this.gameOverInterval);
        this.gameOverInterval = null;
      }
    }, AUTO_QUEUE_RETRY_MS);
  }

  RemoveLastAnalysisMarkings() {
    if (this.lastAnalysisMarkings?.length > 0) {
      this.lastAnalysisMarkings.forEach((key) => {
        this.controller.markings.removeOne(key);
      });
      this.lastAnalysisMarkings = [];
    }
    const lastMove = this.controller.getLastMove();
    if (lastMove) {
      this.controller.markings.removeOne(`effect|${lastMove.to}`);
      this.controller.markings.removeOne(`highlight|${lastMove.to}`);
    }
  }

  ShowMoveAnalysis(square, moveScore) {
    this.RemoveLastAnalysisMarkings();
    if (!square || !moveScore) return;
    const hlColor = GameController.HIGHLIGHT_COLORS[moveScore];
    if (hlColor) {
      this.controller.markings.addOne({
        data: {
          opacity: 0.5,
          color: hlColor,
          square
        },
        node: true,
        persistent: true,
        type: "highlight"
      });
      this.lastAnalysisMarkings.push(`highlight|${square}`);
    }
    this.controller.markings.addOne({
      data: {
        square,
        type: moveScore
      },
      node: true,
      persistent: true,
      type: "effect"
    });
    this.lastAnalysisMarkings.push(`effect|${square}`);
  }

  removeEvaluationBar() {
    if (this.evalBarResizeObserver) {
      this.evalBarResizeObserver.disconnect();
      this.evalBarResizeObserver = null;
    }
    if (this.evalBarSyncHandler) {
      window.removeEventListener("scroll", this.evalBarSyncHandler, true);
      window.removeEventListener("resize", this.evalBarSyncHandler);
      this.evalBarSyncHandler = null;
    }
    if (this.evalBar) {
      this.evalBar.remove();
      this.evalBar = null;
    }
    this.evalBarFill = null;
    this.evalScore = null;
    this.evalScoreAbbreviated = null;
  }

  UpdateExtensionOptions() {
    if (getValueConfig(enumOptions.EvaluationBar) && (!this.evalBar || !this.evalBar.isConnected)) {
      this.evalBar = null;
      this.CreateAnalysisTools();
    } else if (!getValueConfig(enumOptions.EvaluationBar) && this.evalBar != null) {
      this.removeEvaluationBar();
    }

    this.setupAutoQueueObserver();
    if (!getValueConfig(enumOptions.ShowHints)) {
      this.RemoveCurrentMarkings();
    }
    if (!getValueConfig(enumOptions.MoveAnalysis)) {
      this.RemoveLastAnalysisMarkings();
    }
    if (!getValueConfig(enumOptions.LegitAutoMove) && this.autoMoveTimer !== null) {
      clearTimeout(this.autoMoveTimer);
      this.autoMoveTimer = null;
    }
  }

  destroy() {
    this.removeEvaluationBar();
    if (this.controller?.markings) {
      this.RemoveCurrentMarkings();
      this.RemoveLastAnalysisMarkings();
    }
    if (this.autoMoveTimer !== null) {
      clearTimeout(this.autoMoveTimer);
      this.autoMoveTimer = null;
    }
    if (this.gameOverInterval !== null) {
      clearInterval(this.gameOverInterval);
      this.gameOverInterval = null;
    }
    if (this.autoQueueObserver) {
      this.autoQueueObserver.disconnect();
      this.autoQueueObserver = null;
    }
  }

  updateEvaluationFromMove(move) {
    if (!move || (move.mate === null && move.cp === null)) return;
    let score = move.mate !== null ? move.mate : move.cp;
    if (this.controller.getTurn() === TURN_BLACK) score *= -1;
    this.SetEvaluation(score, move.mate !== null);
  }

  CreateAnalysisTools() {
    if (!getValueConfig(enumOptions.EvaluationBar) || this.evalBar != null) return;
    const body = document.body || document.documentElement;
    if (!body) return;

    const evalBar = document.createElement("div");
    evalBar.className = "bettermint-evalbar";
    evalBar.innerHTML = `<span class="bettermint-evalbar-scoreAbbreviated bettermint-evalbar-dark">0.0</span><span class="bettermint-evalbar-score bettermint-evalbar-dark">+0.00</span><div class="bettermint-evalbar-fill"><div class="bettermint-evalbar-color bettermint-evalbar-black"></div><div class="bettermint-evalbar-color bettermint-evalbar-white" style="transform: translate3d(0px, 50%, 0px);"></div></div>`;
    body.appendChild(evalBar);

    this.evalBar = evalBar;
    this.evalBarFill = evalBar.querySelector(".bettermint-evalbar-white");
    this.evalScore = evalBar.querySelector(".bettermint-evalbar-score");
    this.evalScoreAbbreviated = evalBar.querySelector(".bettermint-evalbar-scoreAbbreviated");

    const getBoardRect = () => {
      const inner =
        this.chessboard.querySelector?.(".board, chess-board, svg.coordinates") ||
        this.chessboard.shadowRoot?.querySelector?.(".board, svg.coordinates");
      const rect = (inner || this.chessboard).getBoundingClientRect();
      if (rect.width > rect.height + 2 && rect.height >= 50) {
        const side = rect.height;
        const insetX = (rect.width - side) / 2;
        return {
          left: rect.left + insetX,
          right: rect.right - insetX,
          top: rect.top,
          bottom: rect.bottom,
          width: side,
          height: side
        };
      }
      return rect;
    };

    let lastLayout = "";
    const syncPosition = () => {
      if (!this.evalBar || !this.chessboard?.isConnected) return;
      const rect = getBoardRect();
      if (rect.width < 50 || rect.height < 50 || rect.bottom <= 0 || rect.top >= window.innerHeight) {
        if (lastLayout !== "none") {
          this.evalBar.style.display = "none";
          lastLayout = "none";
        }
        return;
      }
      const top = Math.round(rect.top);
      const height = Math.round(rect.height);
      const left = Math.max(4, Math.round(rect.left - EVAL_BAR_OFFSET_PX));
      const overlapsBoard = rect.left < EVAL_BAR_OFFSET_PX;
      const layoutKey = `${top}:${height}:${left}:${overlapsBoard ? 1 : 0}`;
      if (layoutKey === lastLayout) return;
      lastLayout = layoutKey;

      this.evalBar.style.display = "block";
      this.evalBar.style.top = `${top}px`;
      this.evalBar.style.height = `${height}px`;
      this.evalBar.style.left = `${left}px`;
      this.evalBar.style.pointerEvents = overlapsBoard ? "none" : "";
    };

    syncPosition();
    if (typeof ResizeObserver !== "undefined") {
      this.evalBarResizeObserver = new ResizeObserver(syncPosition);
      this.evalBarResizeObserver.observe(this.chessboard);
      if (this.chessboard.parentElement) {
        this.evalBarResizeObserver.observe(this.chessboard.parentElement);
      }
      if (document.body) {
        this.evalBarResizeObserver.observe(document.body);
      }
    }
    this.evalBarSyncHandler = syncPosition;
    window.addEventListener("scroll", syncPosition, { passive: true, capture: true });
    window.addEventListener("resize", syncPosition, { passive: true });

    if (this.boardOptions?.flipped) {
      this.evalBar.classList.add("bettermint-evalbar-flipped");
    }
    if (this.BetterMintmaster?.engine?.topMoves?.length > 0) {
      this.BetterMintmaster.engine.ensureTopMovesSorted?.();
      this.updateEvaluationFromMove(this.BetterMintmaster.engine.topMoves[0]);
    }
  }

  RefreshEvaluationBar() {
    if (!getValueConfig(enumOptions.EvaluationBar)) return;
    if (this.evalBar?.isConnected) {
      this.evalBar.classList.toggle("bettermint-evalbar-flipped", Boolean(this.boardOptions?.flipped));
      this.SetEvaluation(0, false);
      this.evalBarSyncHandler?.();
    } else {
      this.removeEvaluationBar();
      this.CreateAnalysisTools();
    }
  }

  UpdateEngine(isNewGame) {
    if (!this.BetterMintmaster?.engine) return;
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
    this.RemoveCurrentMarkings();
    this.RemoveLastAnalysisMarkings();
    this.boardOptions = this.controller.getOptions();
    if (this.controller.getPlayingAs() === this.controller.getTurn()) {
      this.turnStartTime = performance.now();
    }
    this.UpdateEngine(true);
    this.RefreshEvaluationBar();
  }

  RemoveCurrentMarkings() {
    this.lastHintSignature = "";
    this.currentMarkings.forEach((marking) => {
      const target = marking.data.square != null ? marking.data.square : `${marking.data.from}${marking.data.to}`;
      const key = `${marking.type}|${target}`;
      if (marking.type === "effect" && this.lastAnalysisMarkings?.includes(key)) {
        return;
      }
      this.controller.markings.removeOne(key);
    });
    this.currentMarkings = [];
  }

  HintMoves(topMoves) {
    const bestMove = topMoves[0];
    if (!bestMove) return;

    if (getValueConfig(enumOptions.ShowHints)) {
      const legalMoves = this.controller.getLegalMoves?.();
      if (Array.isArray(legalMoves) && legalMoves.length === 0) {
        this.RemoveCurrentMarkings();
      } else {
        const isSquare = (sq) => typeof sq === "string" && /^[a-h][1-8]$/.test(sq);
        const arrowColors = this.boardOptions?.arrowColors || {};
        const seenEffects = new Set();
        const nextMarkings = [];
        let signature = "";

        topMoves.forEach((move, idx) => {
          const resolved = resolveLegalMove(legalMoves, move);
          const from = resolved ? resolved.from : move.from;
          const to = resolved ? resolved.to : move.to;
          if (!isSquare(from) || !isSquare(to) || from === to) return;

          const color =
            idx === 0
              ? (arrowColors.alt || "#15781b")
              : idx <= 2
              ? (arrowColors.shift || "#e68f00")
              : idx <= 5
              ? (arrowColors.default || "#003088")
              : (arrowColors.ctrl || "#882020");

          signature += `${from}${to}${color};`;
          nextMarkings.push({
            data: {
              from,
              color,
              opacity: 0.8,
              to
            },
            node: true,
            persistent: true,
            type: "arrow"
          });

          if (move.mate !== null && !seenEffects.has(to) && !this.lastAnalysisMarkings?.includes(`effect|${to}`)) {
            seenEffects.add(to);
            signature += `E:${to}:${move.mate < 0 ? 0 : 1};`;
            nextMarkings.push({
              data: {
                square: to,
                type: move.mate < 0 ? "ResignWhite" : "WinnerWhite"
              },
              node: true,
              persistent: true,
              type: "effect"
            });
          }
        });

        if (signature !== this.lastHintSignature) {
          this.RemoveCurrentMarkings();
          this.lastHintSignature = signature;
          this.currentMarkings = nextMarkings.reverse();
          if (this.currentMarkings.length > 0) {
            this.controller.markings.addMany(this.currentMarkings);
          }
        }
      }
    }

    if (getValueConfig(enumOptions.EvaluationBar)) {
      this.updateEvaluationFromMove(bestMove);
    }
  }

  SetEvaluation(score, isMate) {
    if (this.evalBar == null) return;
    let percentage;
    let textNumber;
    let textScoreAbb;
    if (!isMate) {
      const smallScore = score / 100;
      percentage = Math.max(5, Math.min(95, (1 - cpToWinProbability(score)) * 100));
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
    this.evalScore.classList.toggle("bettermint-evalbar-dark", isDark);
    this.evalScore.classList.toggle("bettermint-evalbar-light", !isDark);
    this.evalScoreAbbreviated.classList.toggle("bettermint-evalbar-dark", isDark);
    this.evalScoreAbbreviated.classList.toggle("bettermint-evalbar-light", !isDark);
  }
}

class StockfishEngine {
  static EP_THRESHOLDS = Object.freeze([
    [0, "BestMove"],
    [0.02, "Excellent"],
    [0.05, "Good"],
    [0.10, "Inaccuracy"],
    [0.20, "Mistake"]
  ]);

  static evalToExpectedPoints(move) {
    if (!move) return null;
    if (move.mate !== null) return move.mate > 0 ? 1 : 0;
    if (move.cp !== null) return cpToWinProbability(move.cp);
    return null;
  }

  static compareMoves(a, b) {
    if (a.mate !== null && b.mate === null) return a.mate < 0 ? 1 : -1;
    if (a.mate === null && b.mate !== null) return b.mate > 0 ? 1 : -1;
    if (a.mate === null && b.mate === null) {
      if (a.depth === b.depth) return (b.cp ?? -Infinity) - (a.cp ?? -Infinity);
      return b.depth - a.depth;
    }
    if ((a.mate < 0 && b.mate < 0) || (a.mate > 0 && b.mate > 0)) {
      if (a.mate !== b.mate) return a.mate - b.mate;
      return a.mate > 0 ? a.line.length - b.line.length : b.line.length - a.line.length;
    }
    return a.mate < b.mate ? 1 : -1;
  }

  static INFO_DEPTH_RE = /\bdepth (\d+)/;
  static INFO_SCORE_RE = /\bscore (cp|mate) (-?\d+)/;
  static INFO_PV_RE = /\bpv ([a-h][1-8][a-h][1-8][qrbn]?(?: [a-h][1-8][a-h][1-8][qrbn]?)*)/;
  static BESTMOVE_RE = /^bestmove ([a-h][1-8][a-h][1-8][qrbn]?|\(none\))/;

  constructor(BetterMintmaster) {
    this.BetterMintmaster = BetterMintmaster;
    this.loaded = false;
    this.ready = false;
    this.isEvaluating = false;
    this.isRequestedStop = false;
    this.readyCallbacks = [];
    this.goDoneCallbacks = [];
    this.stopTimeout = null;
    this.topMoves = [];
    this.topMovesDirty = false;
    this.lastTopMoves = [];
    this.currentPositionFen = null;
    this.lastAutoMovedFen = null;
    this.depth = getValueConfig(enumOptions.Depth) ?? 15;
    this.currentUrl = getValueConfig(enumOptions.UrlApiStockfish);
    this.targetUrl = this.currentUrl;
    this.isSwitching = false;
    this.onEngineSwitchedCallback = null;
    this.engineUciOptions = new Set();
    this.customEngineOptions = Object.assign({}, BetterMintmaster?.options?.customEngineOptions);
    this.reconnectDelay = 500;
    this.maxReconnectDelay = 30000;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.fatalError = null;
    this.staleBestMovesToIgnore = 0;
    this.pendingPosition = null;

    if (typeof window !== "undefined") {
      window.addEventListener("focus", () => this.reconnectNow());
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.reconnectNow();
        }
      });
    }

    this.initializeWebSocket(this.currentUrl);
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
      this.staleBestMovesToIgnore = 0;
      this.send("uci");
      this.onReady(() => {
        this.send("ucinewgame");
        if (this.onEngineSwitchedCallback) {
          this.ready = false;
          const cb = this.onEngineSwitchedCallback;
          this.onEngineSwitchedCallback = null;
          cb();
        } else {
          const controller = this.BetterMintmaster?.game?.controller;
          if (controller && controller.getMode?.() !== "gameOver" && typeof controller.getFEN === "function") {
            this.ready = false;
            this.BetterMintmaster.game.UpdateEngine(false);
          }
        }
      });
    });

    ws.addEventListener("message", (event) => {
      if (this.stockfish !== ws) return;
      this.ProcessMessage(event.data);
    });

    ws.addEventListener("close", () => {
      if (this.stockfish !== ws || this.isSwitching) return;
      if (this.reconnectAttempts === 0) {
        console.error("WebSocket connection closed.");
      }
      this.handleDisconnect();
    });

    ws.addEventListener("error", (error) => {
      if (this.stockfish !== ws) return;
      if (this.reconnectAttempts === 0) {
        console.error("WebSocket error:", error);
      }
    });
  }

  switchEngine(newUrl) {
    if (!newUrl || newUrl === this.targetUrl) return;
    this.targetUrl = newUrl;
    this.isSwitching = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
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
      this.fatalError = null;
      this.staleBestMovesToIgnore = 0;
      this.pendingPosition = null;
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
    const clean = typeof cmd === "string" ? cmd.replace(/[\r\n]+/g, " ").trim() : "";
    if (!clean) return;
    if (this.isWebSocketOpen()) {
      this.stockfish.send(clean);
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
    this.isRequestedStop = false;
    this.staleBestMovesToIgnore = 0;
    this.pendingPosition = null;
    this.readyCallbacks = [];
    this.goDoneCallbacks = [];
    if (this.stopTimeout !== null) {
      clearTimeout(this.stopTimeout);
      this.stopTimeout = null;
    }
    this.attemptReconnect();
  }

  reconnectNow() {
    if (this.isSwitching || this.isWebSocketOpen()) return;
    if (this.stockfish && this.stockfish.readyState === WebSocket.CONNECTING) return;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.fatalError = null;
    this.initializeWebSocket(this.targetUrl || this.currentUrl || getValueConfig(enumOptions.UrlApiStockfish));
  }

  attemptReconnect() {
    if (this.isSwitching || this.reconnectTimer !== null || this.fatalError) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
    if (this.reconnectAttempts === 1) {
      console.log(`Attempting to reconnect in ${delay / 1000} seconds...`);
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isSwitching && !this.fatalError) {
        this.initializeWebSocket(this.targetUrl || this.currentUrl || getValueConfig(enumOptions.UrlApiStockfish));
      }
    }, delay);
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
    if (!this.isEvaluating) {
      if (typeof callback === "function") callback();
      return;
    }
    if (typeof callback === "function") {
      this.goDoneCallbacks.push(callback);
    }
    if (!this.isRequestedStop) {
      this.isRequestedStop = true;
      this.send("stop");
      if (this.stopTimeout !== null) {
        clearTimeout(this.stopTimeout);
      }
      this.stopTimeout = setTimeout(() => {
        this.stopTimeout = null;
        if (this.isRequestedStop) {
          this.staleBestMovesToIgnore = (this.staleBestMovesToIgnore || 0) + 1;
          this.isRequestedStop = false;
          this.isEvaluating = false;
          const callbacks = this.goDoneCallbacks;
          this.goDoneCallbacks = [];
          callbacks.forEach((cb) => cb());
        }
      }, STOP_TIMEOUT_MS);
    }
  }

  calculateTargetDelay(bestMove) {
    if (!getValueConfig(enumOptions.HumanLikeMoves)) {
      return 0;
    }
    const movePace = numConfig(enumOptions.MovePace, 1.5);
    const physicalFloor = numConfig(enumOptions.PhysicalFloor, 200);
    const timingSpread = numConfig(enumOptions.TimingSpread, 0.80);

    let median = movePace * 1000;

    const controller = this.BetterMintmaster.game.controller;
    const legalMoves = controller.getLegalMoves();
    const lastMove = controller.getLastMove();

    if (getValueConfig(enumOptions.FastForcedMoves) && legalMoves?.length === 1) {
      median *= numConfig(enumOptions.ForcedMultiplier, 0.35);
    } else if (getValueConfig(enumOptions.FastRecaptures) && lastMove && bestMove && bestMove.to === lastMove.to) {
      median *= numConfig(enumOptions.RecaptureMultiplier, 0.50);
    } else if (getValueConfig(enumOptions.FastOpening)) {
      const openingThreshold = numConfig(enumOptions.OpeningMovesThreshold, 8);
      const fullMoveNumber = parseInt((controller.getFEN() || "").split(" ")[5], 10) || 1;
      if (fullMoveNumber <= openingThreshold) {
        median *= numConfig(enumOptions.OpeningMultiplier, 0.35);
      }
    }

    if (getValueConfig(enumOptions.ClockScaling)) {
      const remainingSeconds = getRemainingPlayerTimeSeconds();
      const clockThreshold = numConfig(enumOptions.ClockThreshold, 60);
      if (remainingSeconds != null && remainingSeconds < clockThreshold) {
        const minMult = numConfig(enumOptions.ClockMinMultiplier, 0.30);
        median *= Math.max(minMult, remainingSeconds / clockThreshold);
      }
    }

    const u1 = Math.max(1e-7, Math.random());
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const mu = Math.log(Math.max(50, median - physicalFloor));
    return Math.round(physicalFloor + Math.exp(mu + timingSpread * z));
  }

  UpdatePosition(FENs = null, isNewGame = true) {
    if (!this.isWebSocketOpen() || !this.loaded) {
      this.reconnectNow();
      return;
    }
    const wasPending = this.pendingPosition !== null;
    this.pendingPosition = {
      FENs,
      isNewGame: wasPending ? (this.pendingPosition.isNewGame || isNewGame) : isNewGame
    };
    if (wasPending) return;

    this.onReady(() => {
      this.stopEvaluation(() => {
        const next = this.pendingPosition;
        this.pendingPosition = null;
        if (!next) return;
        this.MoveAndGo(next.FENs, next.isNewGame);
      });
    });
  }

  UpdateExtensionOptions(options = {}) {
    const newUrl = options[enumOptions.UrlApiStockfish];
    if (newUrl && newUrl !== this.currentUrl) {
      this.customEngineOptions =
        options.customEngineOptions && typeof options.customEngineOptions === "object"
          ? Object.assign({}, options.customEngineOptions)
          : {};
      this.switchEngine(newUrl);
      return;
    }

    if (typeof options.uciButton === "string" && options.uciButton.length > 0) {
      const buttonName = options.uciButton;
      this.stopEvaluation(() => {
        if (this.engineUciOptions.size === 0 || this.engineUciOptions.has(buttonName)) {
          this.send(`setoption name ${buttonName}`);
          this.ready = false;
        }
        if (this.BetterMintmaster && this.BetterMintmaster.game) {
          this.BetterMintmaster.game.UpdateEngine(false);
        }
      });
      return;
    }

    const custom = options.customEngineOptions;
    if (custom && typeof custom === "object") {
      Object.assign(this.customEngineOptions, custom);
      this.stopEvaluation(() => {
        this.UpdateOptions(this.customEngineOptions);
        if (this.BetterMintmaster && this.BetterMintmaster.game) {
          this.BetterMintmaster.game.UpdateEngine(false);
        }
      });
      return;
    }

    const nextDepth = getValueConfig(enumOptions.Depth) ?? 15;
    const depthChanged = nextDepth !== this.depth;
    this.depth = nextDepth;

    if (depthChanged && this.BetterMintmaster && this.BetterMintmaster.game) {
      this.BetterMintmaster.game.UpdateEngine(false);
      return;
    }

    if (this.topMoves.length > 0) {
      this.onTopMoves(null, !this.isEvaluating);
    } else if (
      getValueConfig(enumOptions.LegitAutoMove) &&
      !this.isEvaluating &&
      this.isWebSocketOpen() &&
      this.BetterMintmaster &&
      this.BetterMintmaster.game
    ) {
      this.BetterMintmaster.game.UpdateEngine(false);
    }
  }

  UpdateOptions(options = null) {
    const opts = options || this.customEngineOptions;
    if (!opts || typeof opts !== "object") return;
    let sentAny = false;
    for (const [key, value] of Object.entries(opts)) {
      if (value === "" || value === undefined || value === null) continue;
      if (this.engineUciOptions.size === 0 || this.engineUciOptions.has(key)) {
        this.send(`setoption name ${key} value ${value}`);
        sentAny = true;
      }
    }
    if (sentAny) {
      this.ready = false;
    }
  }

  ProcessMessage(event) {
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
      this.reconnectAttempts = 0;
      this.fatalError = null;
      this.UpdateOptions();
    } else if (typeof line === "string" && line.startsWith("info string Error:")) {
      this.fatalError = line.slice("info string ".length);
      console.error(`[BetterMint] ${this.fatalError}`);
    } else if (line === "readyok") {
      this.ready = true;
      while (this.ready && this.readyCallbacks.length > 0) {
        const cb = this.readyCallbacks.shift();
        cb();
      }
      if (!this.ready && this.readyCallbacks.length > 0) {
        this.send("isready");
      }
    } else if (typeof line === "string" && line.startsWith("info ")) {
      if (this.isRequestedStop || !line.includes(" pv ") || /\b(?:upperbound|lowerbound)\b/.test(line)) return;

      const pvMatch = line.match(StockfishEngine.INFO_PV_RE);
      if (!pvMatch) return;
      const depthMatch = line.match(StockfishEngine.INFO_DEPTH_RE);
      const scoreMatch = line.match(StockfishEngine.INFO_SCORE_RE);
      if (!depthMatch || !scoreMatch) return;

      const depth = parseInt(depthMatch[1], 10);
      const scoreType = scoreMatch[1];
      const score = parseInt(scoreMatch[2], 10);
      const cpScore = scoreType === "cp" ? score : null;
      const mateScore = scoreType === "mate" ? score : null;

      this.onTopMoves(new TopMove(pvMatch[1], depth, cpScore, mateScore), false);
    } else if (typeof line === "string" && line.startsWith("bestmove ")) {
      const bestMoveMatch = line.match(StockfishEngine.BESTMOVE_RE);
      if (bestMoveMatch) {
        if (this.staleBestMovesToIgnore > 0) {
          this.staleBestMovesToIgnore--;
          return;
        }
        if (this.stopTimeout !== null) {
          clearTimeout(this.stopTimeout);
          this.stopTimeout = null;
        }
        this.isEvaluating = false;
        const wasRequestedStop = this.isRequestedStop;
        this.isRequestedStop = false;

        const callbacks = this.goDoneCallbacks;
        this.goDoneCallbacks = [];
        callbacks.forEach((cb) => cb());

        const bestMove = bestMoveMatch[1];
        if (!wasRequestedStop && bestMove !== "(none)") {
          const index = this.topMoves.findIndex((object) => object.move === bestMove);

          if (index < 0) {
            console.warn(`The engine returned the best move "${bestMove}" but it's not in the top move list.`);
            const bestMoveOnTop = new TopMove(
              bestMove,
              getValueConfig(enumOptions.Depth),
              null,
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
      const isSamePosition = !isNewGame && FENs !== null && FENs === this.currentPositionFen;
      if (isNewGame) {
        this.lastTopMoves = [];
        this.lastAutoMovedFen = null;
      } else if (!isSamePosition) {
        this.ensureTopMovesSorted();
        this.lastTopMoves = this.topMoves;
        this.lastAutoMovedFen = null;
      }
      this.currentPositionFen = FENs;
      this.topMoves = [];
      this.topMovesDirty = false;
      if (FENs !== null) this.send(`position fen ${FENs}`);
      this.go();
    };
    this.onReady(() => {
      if (isNewGame) {
        this.ready = false;
        this.send("ucinewgame");
        this.onReady(go);
      } else {
        go();
      }
    });
  }

  AnalyzeLastMove() {
    const game = this.BetterMintmaster.game;
    const lastMove = game.controller.getLastMove();
    if (!lastMove) return;

    let moveScore = null;
    if (this.lastTopMoves.length > 0 && this.topMoves.length > 0) {
      const lastBestMove = this.lastTopMoves[0];
      if (resolveLegalMove([lastMove], lastBestMove)) {
        moveScore = "BestMove";
      } else {
        const epBefore = StockfishEngine.evalToExpectedPoints(lastBestMove);
        const epOpponent = StockfishEngine.evalToExpectedPoints(this.topMoves[0]);
        if (epBefore !== null && epOpponent !== null) {
          const epAfter = 1 - epOpponent;
          const epLoss = epBefore - epAfter;
          if (epBefore >= 0.90 && epAfter >= 0.40 && epAfter <= 0.65) {
            moveScore = "MissedWin";
          } else {
            const match = StockfishEngine.EP_THRESHOLDS.find(([maxLoss]) => epLoss <= maxLoss);
            moveScore = match ? match[1] : "Blunder";
          }
        }
      }
    }
    game.ShowMoveAnalysis(lastMove.to, moveScore);
  }

  ensureTopMovesSorted() {
    if (this.topMovesDirty) {
      this.SortTopMoves();
      this.topMovesDirty = false;
    }
    return this.topMoves;
  }

  onTopMoves(move = null, isBestMove = false) {
    let bestMoveSelected = false;
    if (move !== null) {
      const index = this.topMoves.findIndex((object) => object.move === move.move);
      if (index === -1) {
        this.topMoves.push(move);
        this.topMovesDirty = true;
      } else if (!isBestMove && move.depth >= this.topMoves[index].depth) {
        this.topMoves[index] = move;
        this.topMovesDirty = true;
      }
      if (isBestMove) bestMoveSelected = true;
    } else if (isBestMove && this.topMoves.length > 0) {
      bestMoveSelected = true;
    }

    const multipvCount = Math.max(1, parseInt(this.customEngineOptions?.["MultiPV"], 10) || 1);

    if (!bestMoveSelected && move !== null) {
      if (this.topMoves.length > 0 && this.BetterMintmaster?.game?.HintMoves) {
        const liveTopMoves = [...this.topMoves].sort(StockfishEngine.compareMoves).slice(0, multipvCount);
        this.BetterMintmaster.game.HintMoves(liveTopMoves);
      }
      return;
    }

    this.ensureTopMovesSorted();
    if (bestMoveSelected && move !== null) {
      const bestIdx = this.topMoves.indexOf(move);
      if (bestIdx > 0) {
        this.topMoves.splice(bestIdx, 1);
        this.topMoves.unshift(move);
      }
    }
    const topPvMoves = this.topMoves.slice(0, multipvCount);

    if (topPvMoves.length > 0) {
      this.BetterMintmaster.game.HintMoves(topPvMoves);

      if (bestMoveSelected && getValueConfig(enumOptions.MoveAnalysis)) {
        this.AnalyzeLastMove();
      }
    }

    if (bestMoveSelected && topPvMoves[0]) {
      this.maybeAutoMove(topPvMoves[0]);
    }
  }

  maybeAutoMove(bestMove) {
    const game = this.BetterMintmaster.game;
    const controller = game.controller;
    if (
      !getValueConfig(enumOptions.LegitAutoMove) ||
      controller.getPlayingAs() !== controller.getTurn()
    ) {
      return;
    }
    const mode = controller.getMode?.();
    if (mode === "gameOver" || mode === "analysis" || mode === "review") {
      return;
    }

    const activeFen = controller.getFEN();
    if (this.currentPositionFen && this.currentPositionFen !== activeFen) {
      return;
    }
    if (game.autoMoveTimer !== null || this.lastAutoMovedFen === activeFen) {
      return;
    }

    const matchedMove = resolveLegalMove(controller.getLegalMoves(), bestMove);
    if (!matchedMove) return;

    const moveData = Object.assign({}, matchedMove, { userGenerated: true });
    if (bestMove.promotion) {
      moveData.promotion = bestMove.promotion;
    }

    const executeAutoMove = () => {
      const currentMode = controller.getMode?.();
      if (
        !getValueConfig(enumOptions.LegitAutoMove) ||
        controller.getPlayingAs() !== controller.getTurn() ||
        controller.getFEN() !== activeFen ||
        currentMode === "gameOver" ||
        currentMode === "analysis" ||
        currentMode === "review"
      ) {
        return;
      }
      try {
        const result = controller.move(moveData);
        if (result !== false && controller.getFEN() === activeFen) {
          this.lastAutoMovedFen = activeFen;
        }
      } catch (e) {
        console.error("Failed to execute auto move:", e);
      }
    };

    const targetDelay = this.calculateTargetDelay(bestMove);
    const elapsed = game.turnStartTime != null ? performance.now() - game.turnStartTime : 0;
    const remainingDelay = Math.max(0, targetDelay - elapsed);

    if (remainingDelay <= 0) {
      executeAutoMove();
    } else {
      game.autoMoveTimer = setTimeout(() => {
        game.autoMoveTimer = null;
        executeAutoMove();
      }, remainingDelay);
    }
  }

  SortTopMoves() {
    this.topMoves.sort(StockfishEngine.compareMoves);
  }
}

class BetterMint {
  constructor(chessboard, options) {
    this.options = Object.assign({}, options);
    this.game = new GameController(this, chessboard);
    this.engine = new StockfishEngine(this);
    window.addEventListener(
      "BetterMintUpdateOptions",
      (event) => {
        if (!event?.detail || typeof event.detail !== "object") return;
        this.options = Object.assign({}, this.options, event.detail);
        this.game.UpdateExtensionOptions();
        this.engine.UpdateExtensionOptions(event.detail);
      },
      false
    );
  }
}

function attachGame(chessboard) {
  BetterMintmaster.game?.destroy?.();
  BetterMintmaster.game = new GameController(BetterMintmaster, chessboard);
  BetterMintmaster.game.UpdateEngine(true);
}

function InitBetterMint(chessboard) {
  if (BetterMintmaster) {
    try {
      attachGame(chessboard);
    } catch (e) {
      console.error("Oh noes! BetterMintmaster didn't load", e);
    }
    return;
  }

  requestOptions().then((options) => {
    try {
      tempOptions = options;
      if (BetterMintmaster) {
        attachGame(chessboard);
      } else {
        BetterMintmaster = new BetterMint(chessboard, options);
      }
    } catch (e) {
      console.error("Oh noes! BetterMintmaster didn't load", e);
    }
  });
}

if (typeof document !== "undefined") {
  let activeBoard = null;
  let attachTimer = null;

  const tryAttachBoard = (board) => {
    if (!board || board === activeBoard) return false;
    if (board.game) {
      activeBoard = board;
      if (attachTimer !== null) {
        clearInterval(attachTimer);
        attachTimer = null;
      }
      InitBetterMint(board);
      return true;
    }
    return false;
  };

  const watchForGameReady = (board) => {
    if (tryAttachBoard(board) || attachTimer !== null) return;
    let checks = 0;
    attachTimer = setInterval(() => {
      checks++;
      const target = board.isConnected ? board : document.querySelector("wc-chess-board, chess-board");
      if (tryAttachBoard(target) || checks >= 200) {
        clearInterval(attachTimer);
        attachTimer = null;
      }
    }, 50);
  };

  const observer = new MutationObserver(() => {
    if (activeBoard?.isConnected) return;
    const board = document.querySelector("wc-chess-board, chess-board");
    if (board && board !== activeBoard) {
      watchForGameReady(board);
    }
  });

  const existingBoard = document.querySelector("wc-chess-board, chess-board");
  if (existingBoard) {
    watchForGameReady(existingBoard);
  }
  observer.observe(document, {
    childList: true,
    subtree: true
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    StockfishEngine,
    GameController,
    TopMove,
    enumOptions,
    getValueConfig,
    resolveLegalMove,
    setOptionsForTesting: (opts) => { tempOptions = opts; }
  };
}
})();
