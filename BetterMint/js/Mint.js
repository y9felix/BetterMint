(() => {
"use strict";

const CHESSCOM_BLACK_TURN = 2;
const EVAL_BAR_DESKTOP_MIN_WIDTH_PX = 960;
const EVAL_BAR_DESKTOP_WIDTH_PX = 30;
const EVAL_BAR_COMPACT_WIDTH_PX = 20;
const EVAL_BAR_GUTTER_PX = 10;
const AUTO_QUEUE_COOLDOWN_MS = 4000;
const AUTO_QUEUE_RETRY_MS = 500;
const AUTO_QUEUE_MAX_ATTEMPTS = 60;
const ENGINE_STOP_TIMEOUT_MS = 1000;
const OPTIONS_REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_SEARCH_DEPTH = 3;
const STANDARD_STARTPOS_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const UCI_MOVE_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const SQUARE_RE = /^[a-h][1-8]$/;

let nextOptionsRequestId = 0;

function requestExtensionOptions() {
  const pendingRequestId = nextOptionsRequestId++;
  return new Promise((resolve) => {
    let responseTimeoutId = null;
    const onOptionsResponse = (optionsEvent) => {
      if (optionsEvent.detail?.requestId === pendingRequestId) {
        if (responseTimeoutId !== null) clearTimeout(responseTimeoutId);
        window.removeEventListener("BetterMintSendOptions", onOptionsResponse);
        resolve(optionsEvent.detail.extensionOptions);
      }
    };
    responseTimeoutId = setTimeout(() => {
      window.removeEventListener("BetterMintSendOptions", onOptionsResponse);
      console.warn("[BetterMint] Timed out waiting for extension options; using fallback.");
      resolve({});
    }, OPTIONS_REQUEST_TIMEOUT_MS);
    window.addEventListener("BetterMintSendOptions", onOptionsResponse);
    window.dispatchEvent(
      new CustomEvent("BetterMintGetOptions", { detail: { requestId: pendingRequestId } })
    );
  });
}

const EXTENSION_OPTION_KEY = {
  EngineWebSocketUrl: "option-url-api-stockfish",
  Depth: "option-depth",
  GoMovetime: "option-go-movetime",
  GoNodes: "option-go-nodes",
  EvaluationBar: "option-evaluation-bar",
  ShowHints: "option-show-hints",
  MoveAnalysis: "option-move-analysis",
  AutoQueue: "option-auto-queue",
  RematchFirst: "option-rematch-first",
  LegitAutoMove: "option-legit-auto-move",
  HumanLikeMoves: "option-human-like-moves",
  MovePace: "option-move-pace",
  PhysicalFloor: "option-physical-floor",
  TimingSpread: "option-timing-spread",
  ReflexMultiplier: "option-reflex-multiplier",
  OpeningMovesThreshold: "option-opening-moves-threshold",
  OpeningMultiplier: "option-opening-multiplier",
  ClockThreshold: "option-clock-threshold"
};

const SEARCH_GO_OPTION_KEYS = new Set([
  EXTENSION_OPTION_KEY.Depth,
  EXTENSION_OPTION_KEY.GoMovetime,
  EXTENSION_OPTION_KEY.GoNodes
]);

const CLOCK_BOTTOM_SELECTOR = ".clock-bottom";

function centipawnsToWinProbability(centipawns) {
  return 1 / (1 + Math.exp(-0.00368208 * centipawns));
}

function getEvalBarOffsetPx(viewportWidth) {
  const effectiveWidth = Number.isFinite(viewportWidth)
    ? viewportWidth
    : EVAL_BAR_DESKTOP_MIN_WIDTH_PX;
  const barWidth =
    effectiveWidth >= EVAL_BAR_DESKTOP_MIN_WIDTH_PX
      ? EVAL_BAR_DESKTOP_WIDTH_PX
      : EVAL_BAR_COMPACT_WIDTH_PX;
  return barWidth + EVAL_BAR_GUTTER_PX;
}

function formatEvaluationDisplay(scoreValue, isMateScore) {
  if (isMateScore) {
    return {
      percentage: scoreValue < 0 ? 100 : 0,
      abbreviated: "M" + String(Math.abs(scoreValue)),
      isDark: scoreValue >= 0
    };
  }
  const absPawnAdvantage = Math.abs(scoreValue / 100);
  const percentage = Math.max(
    5,
    Math.min(95, (1 - centipawnsToWinProbability(scoreValue)) * 100)
  );
  let abbreviated;
  if (absPawnAdvantage < 0.05) {
    abbreviated = "0.0";
  } else if (absPawnAdvantage >= 9.95) {
    abbreviated = String(Math.round(absPawnAdvantage));
  } else {
    abbreviated = absPawnAdvantage.toFixed(1);
  }
  return {
    percentage,
    abbreviated,
    isDark: scoreValue >= 0
  };
}

function getRemainingPlayerTimeSeconds() {
  const clockElement =
    typeof document !== "undefined" ? document.querySelector(CLOCK_BOTTOM_SELECTOR) : null;
  const clockText = clockElement?.textContent?.trim();
  if (!clockText) return null;
  const colonMatch = clockText.match(/(\d+):(\d{2})(?::(\d{2}))?(?:\.(\d+))?/);
  if (colonMatch) {
    const [, firstUnit, secondUnit, thirdUnit, fractionDigits] = colonMatch;
    const baseSeconds =
      thirdUnit !== undefined
        ? Number(firstUnit) * 3600 + Number(secondUnit) * 60 + Number(thirdUnit)
        : Number(firstUnit) * 60 + Number(secondUnit);
    return baseSeconds + (fractionDigits ? Number(`0.${fractionDigits}`) : 0);
  }
  const secondsMatch = clockText.match(/^(\d+(?:\.\d+)?)$/);
  return secondsMatch ? Number(secondsMatch[1]) : null;
}

let activeExtension;
let fallbackExtensionOptions = {};

function getExtensionOption(optionKey) {
  return (activeExtension ? activeExtension.extensionOptions : fallbackExtensionOptions)[optionKey];
}

function getPositiveFloatOption(optionKey, fallbackValue) {
  const parsedValue = parseFloat(getExtensionOption(optionKey));
  return parsedValue > 0 ? parsedValue : fallbackValue;
}

function getNonNegativeIntOption(optionKey, fallbackValue = 0) {
  const rawValue = getExtensionOption(optionKey);
  if (rawValue === undefined || rawValue === null || rawValue === "") return fallbackValue;
  const parsedInt = parseInt(rawValue, 10);
  return Number.isNaN(parsedInt) || parsedInt < 0 ? fallbackValue : parsedInt;
}

function resolveLegalMove(legalMoves, candidateMove) {
  if (!Array.isArray(legalMoves) || !candidateMove) return null;
  const candidatePromotion =
    typeof candidateMove.promotion === "string" ? candidateMove.promotion.toLowerCase() : "";
  return (
    legalMoves.find(
      (legalMove) =>
        legalMove.from === candidateMove.from &&
        legalMove.to === candidateMove.to &&
        (!candidatePromotion ||
          !legalMove.promotion ||
          String(legalMove.promotion).toLowerCase() === candidatePromotion)
    ) || null
  );
}

function hasAddedElementMutation(mutationRecords) {
  for (const mutation of mutationRecords) {
    for (const addedNode of mutation.addedNodes) {
      if (addedNode.nodeType === 1) return true;
    }
  }
  return false;
}

function isStandardStartposFen(fen) {
  const trimmed = typeof fen === "string" ? fen.trim() : "";
  return trimmed === "startpos" || trimmed === STANDARD_STARTPOS_FEN;
}

function formatMoveToUci(moveRecord) {
  if (typeof moveRecord === "string") {
    const uciToken = moveRecord.trim().toLowerCase();
    return UCI_MOVE_RE.test(uciToken) ? uciToken : null;
  }
  if (!moveRecord || typeof moveRecord !== "object") return null;
  const from = typeof moveRecord.from === "string" ? moveRecord.from.trim().toLowerCase() : "";
  const to = typeof moveRecord.to === "string" ? moveRecord.to.trim().toLowerCase() : "";
  const promo =
    typeof moveRecord.promotion === "string" ? moveRecord.promotion.trim().toLowerCase() : "";
  const uciMove = `${from}${to}${/^[qrbn]$/.test(promo) ? promo : ""}`;
  return UCI_MOVE_RE.test(uciMove) ? uciMove : null;
}

function getFenPlyIndex(fen) {
  if (typeof fen !== "string") return null;
  const trimmed = fen.trim();
  if (trimmed === "startpos") return 0;
  const fields = trimmed.split(/\s+/);
  const fullMove = parseInt(fields[5], 10);
  if (fields.length < 6 || (fields[1] !== "w" && fields[1] !== "b") || fullMove < 1 || Number.isNaN(fullMove)) {
    return null;
  }
  return (fullMove - 1) * 2 + (fields[1] === "b" ? 1 : 0);
}

function getFenPlyDelta(fromFen, toFen) {
  const fromPly = getFenPlyIndex(fromFen);
  const toPly = getFenPlyIndex(toFen);
  return fromPly !== null && toPly !== null ? toPly - fromPly : null;
}

function extractBoardMoveHistory(chessComGame, currentFen) {
  if (!chessComGame || typeof currentFen !== "string") return null;
  const rawMoves =
    (typeof chessComGame.getHistory === "function" && chessComGame.getHistory()) ||
    (typeof chessComGame.getMoves === "function" && chessComGame.getMoves());
  if (!Array.isArray(rawMoves)) return null;

  const startingFen =
    (typeof chessComGame.getStartingFEN === "function" && chessComGame.getStartingFEN()) ||
    (typeof chessComGame.getInitialFEN === "function" && chessComGame.getInitialFEN()) ||
    STANDARD_STARTPOS_FEN;

  if (rawMoves.length === 0) {
    return currentFen === startingFen || isStandardStartposFen(currentFen)
      ? { anchorFen: startingFen, uciMoves: [] }
      : null;
  }

  const uciMoves = [];
  for (const moveEntry of rawMoves) {
    const uciMove = formatMoveToUci(moveEntry);
    if (!uciMove) return null;
    uciMoves.push(uciMove);
  }
  const lastEntry = rawMoves[rawMoves.length - 1];
  if (lastEntry && typeof lastEntry.fen === "string" && lastEntry.fen !== currentFen) {
    return null;
  }
  return getFenPlyDelta(startingFen, currentFen) === uciMoves.length
    ? { anchorFen: startingFen, uciMoves }
    : null;
}

function buildUciPositionCommand(anchorFen, uciMoves = []) {
  if (typeof anchorFen !== "string" || !anchorFen.trim()) return null;
  const basePosition = isStandardStartposFen(anchorFen)
    ? "position startpos"
    : `position fen ${anchorFen.trim()}`;
  return uciMoves.length > 0 ? `${basePosition} moves ${uciMoves.join(" ")}` : basePosition;
}

class CandidateMove {
  constructor(principalVariationLine, searchDepth, centipawns, mateInMoves) {
    this.principalVariation = principalVariationLine.split(" ");
    this.uciMove = this.principalVariation[0];
    this.promotion = this.uciMove.length > 4 ? this.uciMove[4] : null;
    this.from = this.uciMove.slice(0, 2);
    this.to = this.uciMove.slice(2, 4);
    this.centipawns = centipawns;
    this.mateInMoves = mateInMoves;
    this.searchDepth = searchDepth;
  }
}

class GameController {
  static AUTO_QUEUE_SELECTORS = [
    ".game-over-button-primary",
    ".game-over-button-button",
    '[data-action="next-game"]',
    '[data-testid="next-game"]',
    ".ui_v5-button-component.ui_v5-button-primary",
    ".cc-button-primary"
  ].join(", ");

  static AUTO_QUEUE_KEYWORDS = [
    "play again",
    "new opponent",
    "next game",
    "new game",
    "rematch",
    "new"
  ];

  static HIGHLIGHT_COLORS = Object.freeze({
    Book: "#a88865",
    BestMove: "#9eba5a",
    Excellent: "#96bc4b",
    Good: "#96af8b",
    Inaccuracy: "#f0c15c",
    Mistake: "#e6912c",
    Blunder: "#b33430",
    MissedWin: "#dbac16"
  });

  constructor(extension, chessboardElement) {
    this.extension = extension;
    this.chessboardElement = chessboardElement;
    this.chessComGame = chessboardElement.game;
    this.boardOptions = this.chessComGame.getOptions();
    this.evalBarElement = null;
    this.evalBarWhiteFill = null;
    this.evalScoreAbbreviatedElement = null;
    this.evalBarResizeObserver = null;
    this.evalBarSyncHandler = null;
    this.evalBarAnimationFrameId = null;
    this.activeHintMarkings = [];
    this.lastHintSignature = "";
    this.lastAnalysisMarkings = [];
    this.turnStartTimestampMs = performance.now();
    this.isDestroyed = false;
    this.modeResetTimeoutId = null;
    this.resetGameTimeoutId = null;
    this.autoMoveTimeoutId = null;
    this.gameOverRetryIntervalId = null;
    this.lastAutoQueueClickMs = 0;
    this.anchorPositionFen = null;
    this.recordedUciMoves = [];
    this.lastObservedFen = null;

    this.chessComGame.on("Move", () => {
      if (this.isDestroyed) return;
      this.clearAutoMoveTimer();
      this.removeCurrentHintMarkings();
      if (this.chessComGame.getPlayingAs() === this.chessComGame.getTurn()) {
        this.turnStartTimestampMs = performance.now();
      }
      this.updateEnginePosition(false);
    });

    if (getExtensionOption(EXTENSION_OPTION_KEY.EvaluationBar)) {
      this.createAnalysisTools();
    }

    this.chessComGame.on("ModeChanged", (modeEvent) => {
      if (this.isDestroyed) return;
      if (modeEvent?.data === "playing") {
        if (this.modeResetTimeoutId !== null) clearTimeout(this.modeResetTimeoutId);
        this.modeResetTimeoutId = setTimeout(() => {
          this.modeResetTimeoutId = null;
          if (this.isDestroyed) return;
          this.resetGame();
        }, 100);
      } else if (modeEvent?.data === "gameOver") {
        this.clearAutoMoveTimer();
        this.extension?.engineClient?.stopEvaluation?.();
        this.removeCurrentHintMarkings();
        this.syncAutoQueue(true);
      }
    });

    this.chessComGame.on("RendererSet", () => {
      if (this.isDestroyed) return;
      this.resetGame();
    });

    this.chessComGame.on("ResetGame", () => {
      if (this.isDestroyed) return;
      if (this.resetGameTimeoutId !== null) clearTimeout(this.resetGameTimeoutId);
      this.resetGameTimeoutId = setTimeout(() => {
        this.resetGameTimeoutId = null;
        if (this.isDestroyed) return;
        this.updateEnginePosition(true);
        this.refreshEvaluationBar();
      }, 50);
    });

    this.chessComGame.on("UpdateOptions", (optionsEvent) => {
      if (this.isDestroyed) return;
      this.boardOptions = this.chessComGame.getOptions();
      if (optionsEvent?.data?.flipped !== undefined && this.evalBarElement) {
        this.evalBarElement.classList.toggle(
          "bettermint-evalbar-flipped",
          Boolean(this.boardOptions?.flipped)
        );
      }
      this.syncAutoQueue();
    });

    this.syncAutoQueue();
    this.syncPositionHistory(true);
  }

  clearAutoMoveTimer() {
    if (this.autoMoveTimeoutId !== null) {
      clearTimeout(this.autoMoveTimeoutId);
      this.autoMoveTimeoutId = null;
    }
  }

  clearGameOverRetryInterval() {
    if (this.gameOverRetryIntervalId !== null) {
      clearInterval(this.gameOverRetryIntervalId);
      this.gameOverRetryIntervalId = null;
    }
  }

  triggerAutoQueue() {
    if (!getExtensionOption(EXTENSION_OPTION_KEY.AutoQueue)) return false;
    if (this.chessComGame?.getMode?.() === "playing") return false;
    const nowMs = Date.now();
    if (this.lastAutoQueueClickMs && nowMs - this.lastAutoQueueClickMs < AUTO_QUEUE_COOLDOWN_MS) {
      return false;
    }

    const matchesQueueKeyword = (buttonText, shouldMatchLeadingNew) =>
      GameController.AUTO_QUEUE_KEYWORDS.some((keyword) =>
        keyword === "new"
          ? (shouldMatchLeadingNew ? /^new\b/ : /\bnew\b/).test(buttonText)
          : buttonText.includes(keyword)
      );

    const findAndClick = (selector, predicate) => {
      for (const button of document.querySelectorAll(selector)) {
        if (button.disabled || button.offsetWidth <= 0 || button.offsetHeight <= 0) continue;
        const label = button.textContent?.trim().toLowerCase();
        if (label && predicate(label)) {
          this.lastAutoQueueClickMs = nowMs;
          button.click();
          return true;
        }
      }
      return false;
    };

    const genericSelector = "button:not([disabled]), [role='button']:not([disabled])";
    if (getExtensionOption(EXTENSION_OPTION_KEY.RematchFirst)) {
      const isRematch = (text) => text.includes("rematch");
      if (findAndClick(GameController.AUTO_QUEUE_SELECTORS, isRematch)) return true;
      if (findAndClick(genericSelector, isRematch)) return true;
    }

    return (
      findAndClick(GameController.AUTO_QUEUE_SELECTORS, (text) => matchesQueueKeyword(text, false)) ||
      findAndClick(genericSelector, (text) => matchesQueueKeyword(text, true))
    );
  }

  syncAutoQueue(isGameOverEvent = false) {
    if (!getExtensionOption(EXTENSION_OPTION_KEY.AutoQueue)) {
      this.clearGameOverRetryInterval();
      return;
    }
    if (!isGameOverEvent && this.chessComGame?.getMode?.() !== "gameOver") return;
    if (this.triggerAutoQueue()) {
      this.clearGameOverRetryInterval();
      return;
    }
    this.clearGameOverRetryInterval();
    let attemptCount = 0;
    this.gameOverRetryIntervalId = setInterval(() => {
      attemptCount++;
      if (attemptCount > AUTO_QUEUE_MAX_ATTEMPTS || this.triggerAutoQueue()) {
        this.clearGameOverRetryInterval();
      }
    }, AUTO_QUEUE_RETRY_MS);
  }

  removeLastAnalysisMarkings() {
    if (this.lastAnalysisMarkings?.length > 0) {
      this.lastAnalysisMarkings.forEach((markingKey) => {
        this.chessComGame.markings.removeOne(markingKey);
      });
      this.lastAnalysisMarkings = [];
    }
    const lastPlayedMove = this.chessComGame.getLastMove();
    if (lastPlayedMove) {
      this.chessComGame.markings.removeOne(`effect|${lastPlayedMove.to}`);
      this.chessComGame.markings.removeOne(`highlight|${lastPlayedMove.to}`);
    }
  }

  showMoveAnalysis(targetSquare, moveQuality) {
    this.removeLastAnalysisMarkings();
    if (!targetSquare || !moveQuality) return;
    const highlightColor = GameController.HIGHLIGHT_COLORS[moveQuality];
    if (highlightColor) {
      this.chessComGame.markings.addOne({
        data: {
          opacity: 0.5,
          color: highlightColor,
          square: targetSquare
        },
        node: true,
        persistent: true,
        type: "highlight"
      });
      this.lastAnalysisMarkings.push(`highlight|${targetSquare}`);
    }
    this.chessComGame.markings.addOne({
      data: {
        square: targetSquare,
        type: moveQuality
      },
      node: true,
      persistent: true,
      type: "effect"
    });
    this.lastAnalysisMarkings.push(`effect|${targetSquare}`);
  }

  removeEvaluationBar() {
    if (this.evalBarAnimationFrameId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.evalBarAnimationFrameId);
      this.evalBarAnimationFrameId = null;
    }
    if (this.evalBarResizeObserver) {
      this.evalBarResizeObserver.disconnect();
      this.evalBarResizeObserver = null;
    }
    if (this.evalBarSyncHandler) {
      window.removeEventListener("scroll", this.evalBarSyncHandler, true);
      window.removeEventListener("resize", this.evalBarSyncHandler);
      this.evalBarSyncHandler = null;
    }
    if (this.evalBarElement) {
      this.evalBarElement.remove();
      this.evalBarElement = null;
    }
    this.evalBarWhiteFill = null;
    this.evalScoreAbbreviatedElement = null;
  }

  applyExtensionOptions() {
    if (
      getExtensionOption(EXTENSION_OPTION_KEY.EvaluationBar) &&
      (!this.evalBarElement || !this.evalBarElement.isConnected)
    ) {
      this.removeEvaluationBar();
      this.createAnalysisTools();
    } else if (
      !getExtensionOption(EXTENSION_OPTION_KEY.EvaluationBar) &&
      this.evalBarElement
    ) {
      this.removeEvaluationBar();
    }

    this.syncAutoQueue();
    if (!getExtensionOption(EXTENSION_OPTION_KEY.ShowHints)) {
      this.removeCurrentHintMarkings();
    }
    if (!getExtensionOption(EXTENSION_OPTION_KEY.MoveAnalysis)) {
      this.removeLastAnalysisMarkings();
    }
    if (!getExtensionOption(EXTENSION_OPTION_KEY.LegitAutoMove)) {
      this.clearAutoMoveTimer();
    }
  }

  destroy() {
    this.isDestroyed = true;
    if (this.modeResetTimeoutId !== null) {
      clearTimeout(this.modeResetTimeoutId);
      this.modeResetTimeoutId = null;
    }
    if (this.resetGameTimeoutId !== null) {
      clearTimeout(this.resetGameTimeoutId);
      this.resetGameTimeoutId = null;
    }
    this.removeEvaluationBar();
    if (this.chessComGame?.markings) {
      this.removeCurrentHintMarkings();
      this.removeLastAnalysisMarkings();
    }
    this.clearAutoMoveTimer();
    this.clearGameOverRetryInterval();
  }

  updateEvaluationFromMove(candidateMove) {
    if (!candidateMove || (candidateMove.mateInMoves === null && candidateMove.centipawns === null)) {
      return;
    }
    let orientedScore =
      candidateMove.mateInMoves !== null ? candidateMove.mateInMoves : candidateMove.centipawns;
    if (this.chessComGame.getTurn() === CHESSCOM_BLACK_TURN) orientedScore *= -1;
    this.setEvaluationDisplay(orientedScore, candidateMove.mateInMoves !== null);
  }

  createAnalysisTools() {
    if (!getExtensionOption(EXTENSION_OPTION_KEY.EvaluationBar) || this.evalBarElement) {
      return;
    }
    const documentBody = document.body || document.documentElement;
    if (!documentBody) return;

    const evalBarElement = document.createElement("div");
    evalBarElement.className = "bettermint-evalbar";
    evalBarElement.innerHTML = `<span class="bettermint-evalbar-scoreAbbreviated bettermint-evalbar-dark">0.0</span><div class="bettermint-evalbar-fill"><div class="bettermint-evalbar-white" style="transform: translate3d(0px, 50%, 0px);"></div></div>`;
    documentBody.appendChild(evalBarElement);

    this.evalBarElement = evalBarElement;
    this.evalBarWhiteFill = evalBarElement.querySelector(".bettermint-evalbar-white");
    this.evalScoreAbbreviatedElement = evalBarElement.querySelector(
      ".bettermint-evalbar-scoreAbbreviated"
    );

    const measureBoardRect = () => {
      const innerBoardElement = this.chessboardElement.querySelector?.(
        ".board, chess-board, svg.coordinates"
      );
      const boundingRect = (innerBoardElement || this.chessboardElement).getBoundingClientRect();
      if (boundingRect.width > boundingRect.height + 2 && boundingRect.height >= 50) {
        const boardSideLength = boundingRect.height;
        return {
          left: boundingRect.left + (boundingRect.width - boardSideLength) / 2,
          top: boundingRect.top,
          bottom: boundingRect.bottom,
          width: boardSideLength,
          height: boardSideLength
        };
      }
      return boundingRect;
    };

    let lastLayoutSignature = "";
    const syncEvalBarPosition = () => {
      if (!this.evalBarElement) return;
      const boardRect = this.chessboardElement?.isConnected ? measureBoardRect() : null;
      if (
        !boardRect ||
        boardRect.width < 50 ||
        boardRect.height < 50 ||
        boardRect.bottom <= 0 ||
        boardRect.top >= window.innerHeight
      ) {
        if (lastLayoutSignature !== "none") {
          this.evalBarElement.style.display = "none";
          lastLayoutSignature = "none";
        }
        return;
      }
      const offsetPx = getEvalBarOffsetPx(window.innerWidth);
      const topPx = Math.round(boardRect.top);
      const heightPx = Math.round(boardRect.height);
      const leftPx = Math.max(4, Math.round(boardRect.left - offsetPx));
      const nextLayoutSignature = `${topPx}:${heightPx}:${leftPx}:${offsetPx}`;
      if (nextLayoutSignature === lastLayoutSignature) return;
      lastLayoutSignature = nextLayoutSignature;

      this.evalBarElement.style.display = "block";
      this.evalBarElement.style.top = `${topPx}px`;
      this.evalBarElement.style.height = `${heightPx}px`;
      this.evalBarElement.style.left = `${leftPx}px`;
    };

    const scheduleSyncPosition = () => {
      if (typeof requestAnimationFrame !== "function") {
        syncEvalBarPosition();
        return;
      }
      if (this.evalBarAnimationFrameId) return;
      this.evalBarAnimationFrameId = requestAnimationFrame(() => {
        this.evalBarAnimationFrameId = null;
        syncEvalBarPosition();
      });
    };

    syncEvalBarPosition();
    if (typeof ResizeObserver !== "undefined") {
      this.evalBarResizeObserver = new ResizeObserver(scheduleSyncPosition);
      this.evalBarResizeObserver.observe(this.chessboardElement);
      if (document.body) this.evalBarResizeObserver.observe(document.body);
    }
    this.evalBarSyncHandler = scheduleSyncPosition;
    window.addEventListener("scroll", scheduleSyncPosition, { passive: true, capture: true });
    window.addEventListener("resize", scheduleSyncPosition, { passive: true });

    if (this.boardOptions?.flipped) {
      this.evalBarElement.classList.add("bettermint-evalbar-flipped");
    }
    if (this.extension?.engineClient?.candidateMoves?.length > 0) {
      this.updateEvaluationFromMove(this.extension.engineClient.candidateMoves[0]);
    }
  }

  refreshEvaluationBar() {
    if (!getExtensionOption(EXTENSION_OPTION_KEY.EvaluationBar)) return;
    if (this.evalBarElement?.isConnected) {
      this.evalBarElement.classList.toggle(
        "bettermint-evalbar-flipped",
        Boolean(this.boardOptions?.flipped)
      );
      this.setEvaluationDisplay(0, false);
      this.evalBarSyncHandler?.();
    } else {
      this.removeEvaluationBar();
      this.createAnalysisTools();
    }
  }

  syncPositionHistory(isNewGame = false) {
    const currentFen = this.chessComGame?.getFEN?.() ?? null;
    if (typeof currentFen !== "string" || !currentFen) {
      return { fen: currentFen, positionCommand: null };
    }

    const boardHistory = extractBoardMoveHistory(this.chessComGame, currentFen);
    if (boardHistory) {
      this.anchorPositionFen = boardHistory.anchorFen;
      this.recordedUciMoves = boardHistory.uciMoves;
    } else if (!isNewGame && this.anchorPositionFen !== null) {
      if (currentFen !== this.lastObservedFen) {
        const plyDelta = getFenPlyDelta(this.lastObservedFen, currentFen);
        const lastPlayedUciMove = formatMoveToUci(this.chessComGame?.getLastMove?.());
        if (plyDelta === 1 && lastPlayedUciMove) {
          this.recordedUciMoves.push(lastPlayedUciMove);
        } else {
          this.anchorPositionFen = currentFen;
          this.recordedUciMoves = [];
        }
      }
    } else {
      this.anchorPositionFen = currentFen;
      this.recordedUciMoves = [];
    }

    this.lastObservedFen = currentFen;
    return {
      fen: currentFen,
      positionCommand: buildUciPositionCommand(this.anchorPositionFen, this.recordedUciMoves)
    };
  }

  updateEnginePosition(isNewGame) {
    if (this.isDestroyed) return;
    const positionState = this.syncPositionHistory(Boolean(isNewGame));
    if (!this.extension?.engineClient) return;
    this.extension.engineClient.updatePosition(positionState, isNewGame);
  }

  resetGame() {
    this.lastAutoQueueClickMs = 0;
    this.clearAutoMoveTimer();
    this.clearGameOverRetryInterval();
    this.removeCurrentHintMarkings();
    this.removeLastAnalysisMarkings();
    this.boardOptions = this.chessComGame.getOptions();
    if (this.chessComGame.getPlayingAs() === this.chessComGame.getTurn()) {
      this.turnStartTimestampMs = performance.now();
    }
    this.updateEnginePosition(true);
    this.refreshEvaluationBar();
  }

  removeCurrentHintMarkings() {
    this.lastHintSignature = "";
    this.activeHintMarkings.forEach((marking) => {
      const targetKey =
        marking.data.square !== undefined && marking.data.square !== null
          ? marking.data.square
          : `${marking.data.from}${marking.data.to}`;
      const markingId = `${marking.type}|${targetKey}`;
      if (marking.type === "effect" && this.lastAnalysisMarkings?.includes(markingId)) {
        return;
      }
      this.chessComGame.markings.removeOne(markingId);
    });
    this.activeHintMarkings = [];
  }

  renderMoveHints(candidateMoves) {
    const bestCandidateMove = candidateMoves[0];
    if (!bestCandidateMove) return;

    if (getExtensionOption(EXTENSION_OPTION_KEY.ShowHints)) {
      const legalMoves = this.chessComGame.getLegalMoves?.();
      if (Array.isArray(legalMoves) && legalMoves.length === 0) {
        this.removeCurrentHintMarkings();
      } else {
        const arrowColors = this.boardOptions?.arrowColors || {};
        const seenMateEffectSquares = new Set();
        const nextMarkings = [];
        let hintSignature = "";

        candidateMoves.forEach((candidateMove, rankIndex) => {
          const resolvedMove = resolveLegalMove(legalMoves, candidateMove);
          const fromSquare = resolvedMove ? resolvedMove.from : candidateMove.from;
          const toSquare = resolvedMove ? resolvedMove.to : candidateMove.to;
          if (
            typeof fromSquare !== "string" ||
            typeof toSquare !== "string" ||
            !SQUARE_RE.test(fromSquare) ||
            !SQUARE_RE.test(toSquare) ||
            fromSquare === toSquare
          ) {
            return;
          }

          const arrowColor =
            rankIndex === 0
              ? arrowColors.alt || "#15781b"
              : rankIndex <= 2
              ? arrowColors.shift || "#e68f00"
              : rankIndex <= 5
              ? arrowColors.default || "#003088"
              : arrowColors.ctrl || "#882020";

          hintSignature += `${fromSquare}${toSquare}${arrowColor};`;
          nextMarkings.push({
            data: {
              from: fromSquare,
              color: arrowColor,
              opacity: 0.8,
              to: toSquare
            },
            node: true,
            persistent: true,
            type: "arrow"
          });

          if (
            candidateMove.mateInMoves !== null &&
            !seenMateEffectSquares.has(toSquare) &&
            !this.lastAnalysisMarkings?.includes(`effect|${toSquare}`)
          ) {
            seenMateEffectSquares.add(toSquare);
            hintSignature += `E:${toSquare}:${candidateMove.mateInMoves < 0 ? 0 : 1};`;
            nextMarkings.push({
              data: {
                square: toSquare,
                type: candidateMove.mateInMoves < 0 ? "ResignWhite" : "WinnerWhite"
              },
              node: true,
              persistent: true,
              type: "effect"
            });
          }
        });

        if (hintSignature !== this.lastHintSignature) {
          this.removeCurrentHintMarkings();
          this.lastHintSignature = hintSignature;
          this.activeHintMarkings = nextMarkings.reverse();
          if (this.activeHintMarkings.length > 0) {
            this.chessComGame.markings.addMany(this.activeHintMarkings);
          }
        }
      }
    }

    if (getExtensionOption(EXTENSION_OPTION_KEY.EvaluationBar)) {
      this.updateEvaluationFromMove(bestCandidateMove);
    }
  }

  setEvaluationDisplay(scoreValue, isMateScore) {
    if (!this.evalBarElement) return;
    const { percentage, abbreviated, isDark } = formatEvaluationDisplay(scoreValue, isMateScore);
    this.evalBarWhiteFill.style.transform = `translate3d(0px, ${percentage}%, 0px)`;
    this.evalScoreAbbreviatedElement.textContent = abbreviated;
    this.evalScoreAbbreviatedElement.classList.toggle("bettermint-evalbar-dark", isDark);
    this.evalScoreAbbreviatedElement.classList.toggle("bettermint-evalbar-light", !isDark);
  }
}

class UciEngineClient {
  static NON_PLAYING_MODES = new Set(["gameOver", "analysis", "review"]);

  static EXPECTED_POINTS_LOSS_THRESHOLDS = Object.freeze([
    [0, "BestMove"],
    [0.02, "Excellent"],
    [0.05, "Good"],
    [0.10, "Inaccuracy"],
    [0.20, "Mistake"]
  ]);

  static evalToExpectedPoints(candidateMove) {
    if (!candidateMove) return null;
    if (candidateMove.mateInMoves !== null) return candidateMove.mateInMoves > 0 ? 1 : 0;
    if (candidateMove.centipawns !== null) {
      return centipawnsToWinProbability(candidateMove.centipawns);
    }
    return null;
  }

  static compareCandidateMoves(firstMove, secondMove) {
    if (firstMove.mateInMoves !== null && secondMove.mateInMoves === null) {
      return firstMove.mateInMoves < 0 ? 1 : -1;
    }
    if (firstMove.mateInMoves === null && secondMove.mateInMoves !== null) {
      return secondMove.mateInMoves > 0 ? 1 : -1;
    }
    if (firstMove.mateInMoves === null && secondMove.mateInMoves === null) {
      if (firstMove.searchDepth === secondMove.searchDepth) {
        return (secondMove.centipawns ?? -Infinity) - (firstMove.centipawns ?? -Infinity);
      }
      return secondMove.searchDepth - firstMove.searchDepth;
    }
    if (
      (firstMove.mateInMoves < 0 && secondMove.mateInMoves < 0) ||
      (firstMove.mateInMoves > 0 && secondMove.mateInMoves > 0)
    ) {
      if (firstMove.mateInMoves !== secondMove.mateInMoves) {
        return firstMove.mateInMoves - secondMove.mateInMoves;
      }
      return firstMove.mateInMoves > 0
        ? firstMove.principalVariation.length - secondMove.principalVariation.length
        : secondMove.principalVariation.length - firstMove.principalVariation.length;
    }
    return firstMove.mateInMoves < secondMove.mateInMoves ? 1 : -1;
  }

  static INFO_DEPTH_RE = /\bdepth (\d+)/;
  static INFO_SCORE_RE = /\bscore (cp|mate) (-?\d+)/;
  static INFO_PV_RE = /\bpv ([a-h][1-8][a-h][1-8][qrbn]?(?: [a-h][1-8][a-h][1-8][qrbn]?)*)/;
  static BESTMOVE_RE = /^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?|\(none\)|0000)/i;

  static parseUciOptionLine(uciLine) {
    if (typeof uciLine !== "string") return null;
    const headerMatch = uciLine.match(/^option name (.+?) type (\S+)(?:\s+(.*))?$/);
    if (!headerMatch) return null;
    const optionName = headerMatch[1].trim();
    const optionType = headerMatch[2];
    const attributes = (headerMatch[3] || "").trim();
    if (!optionName) return null;
    if (optionType === "button") {
      return { name: optionName, type: optionType, hasDefault: false, default: null };
    }
    const defaultMatch =
      optionType === "string"
        ? attributes.match(/^default(?:\s+(.*))?$/)
        : attributes.match(/(?:^|\s)default(?:\s+(.*?))?(?=\s+(?:min|max|var)\b|$)/);
    if (!defaultMatch) {
      return { name: optionName, type: optionType, hasDefault: false, default: null };
    }
    const rawDefault = (defaultMatch[1] || "").trim();
    return {
      name: optionName,
      type: optionType,
      hasDefault: true,
      default: optionType === "string" && rawDefault === "<empty>" ? "" : rawDefault
    };
  }

  constructor(extension) {
    this.extension = extension;
    this.stopFallbackTimeoutId = null;
    this.candidateMoves = [];
    this.previousPositionCandidateMoves = [];
    this.currentPositionFen = null;
    this.lastAutoMovedFen = null;
    this.currentEngineUrl =
      extension?.extensionOptions?.[EXTENSION_OPTION_KEY.EngineWebSocketUrl] ||
      getExtensionOption(EXTENSION_OPTION_KEY.EngineWebSocketUrl);
    this.targetEngineUrl = this.currentEngineUrl;
    this.isSwitchingEngine = false;
    this.supportedUciOptions = new Map();
    this.uciOptionOverrides = Object.assign(
      {},
      extension?.extensionOptions?.customEngineOptions
    );
    this.initialReconnectDelayMs = 500;
    this.maxReconnectDelayMs = 30000;
    this.reconnectAttempts = 0;
    this.reconnectTimerId = null;
    this.fatalErrorMessage = null;
    this.resetSessionState();

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("focus", () => this.reconnectNow());
    }
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.reconnectNow();
        }
      });
    }

    this.initializeWebSocket(this.currentEngineUrl);
  }

  resetSessionState({ clearCallbacks = true } = {}) {
    this.isEngineLoaded = false;
    this.isEngineReady = false;
    this.pendingReadyCount = 0;
    this.hasSentIsReady = false;
    this.supportedUciOptions.clear();
    this.appliedUciOptions = {};
    this.isEvaluating = false;
    this.hasRequestedStop = false;
    this.staleBestMovesToIgnore = 0;
    this.currentPositionBookMoves = new Set();
    this.previousPositionBookMoves = new Set();
    this.hasCurrentPositionBookHit = false;
    if (clearCallbacks) {
      this.pendingPositionUpdate = null;
      this.readyCallbacks = [];
      this.stopCompletionCallbacks = [];
      if (this.stopFallbackTimeoutId !== null) {
        clearTimeout(this.stopFallbackTimeoutId);
        this.stopFallbackTimeoutId = null;
      }
    }
  }

  initializeWebSocket(engineUrl) {
    const trimmedUrl = typeof engineUrl === "string" ? engineUrl.trim() : "";
    if (!/^wss?:\/\//i.test(trimmedUrl)) {
      if (trimmedUrl) {
        console.error("Failed to initialize WebSocket: Invalid WebSocket URL:", trimmedUrl);
      }
      return;
    }
    try {
      this.websocket = new WebSocket(trimmedUrl);
    } catch (socketError) {
      console.error("Failed to initialize WebSocket:", socketError);
      this.handleDisconnect();
      return;
    }

    const activeSocket = this.websocket;
    activeSocket.addEventListener("open", () => {
      if (this.websocket !== activeSocket) return;
      this.resetSessionState({ clearCallbacks: false });
      this.sendUciCommand("uci");
      this.onReady(() => {
        this.markEngineUnready();
        this.sendUciCommand("ucinewgame");
        this.onReady(() => {
          const gameController = this.extension?.gameController;
          if (gameController && gameController.chessComGame?.getMode?.() !== "gameOver") {
            gameController.updateEnginePosition(false);
          }
        });
      });
    });

    activeSocket.addEventListener("message", (messageEvent) => {
      if (this.websocket !== activeSocket) return;
      this.processEngineMessage(messageEvent.data);
    });

    activeSocket.addEventListener("close", () => {
      if (this.websocket !== activeSocket || this.isSwitchingEngine) return;
      if (this.reconnectAttempts === 0) {
        console.error("WebSocket connection closed.");
      }
      this.handleDisconnect();
    });

    activeSocket.addEventListener("error", (socketError) => {
      if (this.websocket !== activeSocket) return;
      if (this.reconnectAttempts === 0) {
        console.error("WebSocket error:", socketError);
      }
    });
  }

  switchEngine(nextEngineUrl) {
    if (!nextEngineUrl || nextEngineUrl === this.targetEngineUrl) return;
    this.targetEngineUrl = nextEngineUrl;
    this.isSwitchingEngine = true;
    if (this.reconnectTimerId !== null) {
      clearTimeout(this.reconnectTimerId);
      this.reconnectTimerId = null;
    }
    this.reconnectAttempts = 0;
    this.stopEvaluation(() => {
      if (this.targetEngineUrl !== nextEngineUrl) return;
      if (this.websocket) {
        const previousSocket = this.websocket;
        this.websocket = null;
        try {
          previousSocket.close();
        } catch (closeError) {
          console.warn("[BetterMint] Failed to close previous engine WebSocket:", closeError);
        }
      }
      this.currentEngineUrl = nextEngineUrl;
      this.fatalErrorMessage = null;
      this.isSwitchingEngine = false;
      this.resetSessionState();
      this.initializeWebSocket(nextEngineUrl);
    });
  }

  sendUciCommand(uciCommand) {
    const sanitizedCommand =
      typeof uciCommand === "string" ? uciCommand.replace(/[\r\n]+/g, " ").trim() : "";
    if (!sanitizedCommand) return;
    if (this.isWebSocketOpen()) {
      this.websocket.send(sanitizedCommand);
    } else {
      console.warn("Attempted to send command while WebSocket is not open.");
    }
  }

  isWebSocketOpen() {
    return Boolean(this.websocket && this.websocket.readyState === WebSocket.OPEN);
  }

  buildGoCommand() {
    const commandParts = ["go"];
    const depth = getNonNegativeIntOption(EXTENSION_OPTION_KEY.Depth, DEFAULT_SEARCH_DEPTH);
    const movetimeMs = getNonNegativeIntOption(EXTENSION_OPTION_KEY.GoMovetime, 0);
    const nodeLimit = getNonNegativeIntOption(EXTENSION_OPTION_KEY.GoNodes, 0);

    if (depth > 0) commandParts.push("depth", String(depth));
    if (movetimeMs > 0) commandParts.push("movetime", String(movetimeMs));
    if (nodeLimit > 0) commandParts.push("nodes", String(nodeLimit));
    if (commandParts.length === 1) commandParts.push("depth", "1");
    return commandParts.join(" ");
  }

  startSearch() {
    this.onReady(() => {
      this.stopEvaluation(() => {
        if (this.isEvaluating) return;
        this.isEvaluating = true;
        this.sendUciCommand(this.buildGoCommand());
      });
    });
  }

  handleDisconnect() {
    this.resetSessionState();
    this.attemptReconnect();
  }

  reconnectNow() {
    if (this.isSwitchingEngine || this.isWebSocketOpen()) return;
    if (this.websocket && this.websocket.readyState === WebSocket.CONNECTING) return;
    if (this.reconnectTimerId !== null) {
      clearTimeout(this.reconnectTimerId);
      this.reconnectTimerId = null;
    }
    this.reconnectAttempts = 0;
    this.fatalErrorMessage = null;
    this.initializeWebSocket(
      this.targetEngineUrl ||
        this.currentEngineUrl ||
        getExtensionOption(EXTENSION_OPTION_KEY.EngineWebSocketUrl)
    );
  }

  attemptReconnect() {
    if (this.isSwitchingEngine || this.reconnectTimerId !== null || this.fatalErrorMessage) {
      return;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    this.reconnectAttempts++;
    const reconnectDelayMs = Math.min(
      this.initialReconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelayMs
    );
    if (this.reconnectAttempts === 1) {
      console.log(`Attempting to reconnect in ${reconnectDelayMs / 1000} seconds...`);
    }
    this.reconnectTimerId = setTimeout(() => {
      this.reconnectTimerId = null;
      if (!this.isSwitchingEngine && !this.fatalErrorMessage) {
        this.initializeWebSocket(
          this.targetEngineUrl ||
            this.currentEngineUrl ||
            getExtensionOption(EXTENSION_OPTION_KEY.EngineWebSocketUrl)
        );
      }
    }, reconnectDelayMs);
  }

  markEngineUnready() {
    this.isEngineReady = false;
    this.hasSentIsReady = false;
  }

  sendIsReady() {
    if (!this.isEngineLoaded || !this.isWebSocketOpen() || this.hasSentIsReady) return;
    this.hasSentIsReady = true;
    this.pendingReadyCount++;
    this.sendUciCommand("isready");
  }

  onReady(callback) {
    if (this.isEngineReady) {
      callback();
    } else {
      this.readyCallbacks.push(callback);
      this.sendIsReady();
    }
  }

  stopEvaluation(callback) {
    if (!this.isEvaluating) {
      if (typeof callback === "function") callback();
      return;
    }
    if (typeof callback === "function") {
      this.stopCompletionCallbacks.push(callback);
    }
    if (!this.hasRequestedStop) {
      this.hasRequestedStop = true;
      this.sendUciCommand("stop");
      this.stopFallbackTimeoutId = setTimeout(() => {
        this.stopFallbackTimeoutId = null;
        if (this.hasRequestedStop) {
          this.staleBestMovesToIgnore++;
          this.hasRequestedStop = false;
          this.isEvaluating = false;
          const pendingCallbacks = this.stopCompletionCallbacks;
          this.stopCompletionCallbacks = [];
          pendingCallbacks.forEach((completionCallback) => completionCallback());
        }
      }, ENGINE_STOP_TIMEOUT_MS);
    }
  }

  calculateAutoMoveDelayMs(bestCandidateMove) {
    if (!getExtensionOption(EXTENSION_OPTION_KEY.HumanLikeMoves)) {
      return 0;
    }
    const movePaceSeconds = getPositiveFloatOption(EXTENSION_OPTION_KEY.MovePace, 12.5);
    const physicalFloorMs = getPositiveFloatOption(EXTENSION_OPTION_KEY.PhysicalFloor, 600);
    const timingSpread = getPositiveFloatOption(EXTENSION_OPTION_KEY.TimingSpread, 0.80);

    let medianThinkMs = movePaceSeconds * 1000;

    const chessComGame = this.extension.gameController.chessComGame;
    const legalMoves = chessComGame.getLegalMoves();
    const lastPlayedMove = chessComGame.getLastMove();

    const reflexMultiplier = getPositiveFloatOption(EXTENSION_OPTION_KEY.ReflexMultiplier, 0.25);
    const isForcedMove = legalMoves?.length === 1;
    const isRecapture = Boolean(
      lastPlayedMove && bestCandidateMove && bestCandidateMove.to === lastPlayedMove.to
    );

    if (reflexMultiplier < 1 && (isForcedMove || isRecapture)) {
      medianThinkMs *= reflexMultiplier;
    } else {
      const openingMoveThreshold = getNonNegativeIntOption(
        EXTENSION_OPTION_KEY.OpeningMovesThreshold,
        10
      );
      const openingMultiplier = getPositiveFloatOption(
        EXTENSION_OPTION_KEY.OpeningMultiplier,
        0.40
      );
      if (openingMoveThreshold > 0 && openingMultiplier < 1) {
        const fullMoveNumber = parseInt((chessComGame.getFEN() || "").split(" ")[5], 10) || 1;
        if (fullMoveNumber <= openingMoveThreshold) {
          medianThinkMs *= openingMultiplier;
        }
      }
    }

    const clockThresholdSeconds = getNonNegativeIntOption(
      EXTENSION_OPTION_KEY.ClockThreshold,
      180
    );
    if (clockThresholdSeconds > 0) {
      const remainingClockSeconds = getRemainingPlayerTimeSeconds();
      if (remainingClockSeconds !== null && remainingClockSeconds < clockThresholdSeconds) {
        medianThinkMs *= Math.max(0, remainingClockSeconds / clockThresholdSeconds);
      }
    }

    const uniformSampleOne = Math.max(1e-7, Math.random());
    const uniformSampleTwo = Math.random();
    const standardNormalSample =
      Math.sqrt(-2.0 * Math.log(uniformSampleOne)) * Math.cos(2.0 * Math.PI * uniformSampleTwo);
    const logMedianDelayMs = Math.log(Math.max(50, medianThinkMs - physicalFloorMs));
    return Math.round(physicalFloorMs + Math.exp(logMedianDelayMs + timingSpread * standardNormalSample));
  }

  updatePosition(positionState, isNewGame = true) {
    if (this.isSwitchingEngine) return;
    if (!this.isWebSocketOpen() || !this.isEngineLoaded) {
      this.reconnectNow();
      return;
    }
    const hadPendingPosition = this.pendingPositionUpdate !== null;
    this.pendingPositionUpdate = {
      fen: positionState?.fen ?? null,
      positionCommand: positionState?.positionCommand ?? null,
      isNewGame: hadPendingPosition
        ? this.pendingPositionUpdate.isNewGame || isNewGame
        : isNewGame
    };
    if (hadPendingPosition) return;

    this.onReady(() => {
      if (this.isSwitchingEngine) return;
      this.stopEvaluation(() => {
        if (this.isSwitchingEngine) return;
        const queuedPosition = this.pendingPositionUpdate;
        this.pendingPositionUpdate = null;
        if (!queuedPosition) return;
        this.setPositionAndSearch(
          queuedPosition.fen,
          queuedPosition.isNewGame,
          queuedPosition.positionCommand
        );
      });
    });
  }

  runWhenIdle(action) {
    const executeIfIdle = () => {
      if (this.isSwitchingEngine) return;
      if (this.isEvaluating) {
        this.stopEvaluation(executeIfIdle);
        return;
      }
      action();
    };
    this.stopEvaluation(executeIfIdle);
  }

  applyExtensionOptions(optionUpdates = {}) {
    const nextEngineUrl = optionUpdates[EXTENSION_OPTION_KEY.EngineWebSocketUrl];
    if (nextEngineUrl && nextEngineUrl !== (this.targetEngineUrl || this.currentEngineUrl)) {
      this.uciOptionOverrides =
        optionUpdates.customEngineOptions && typeof optionUpdates.customEngineOptions === "object"
          ? Object.assign({}, optionUpdates.customEngineOptions)
          : {};
      this.switchEngine(nextEngineUrl);
      return;
    }

    if (typeof optionUpdates.uciButton === "string" && optionUpdates.uciButton.length > 0) {
      const buttonOptionName = optionUpdates.uciButton;
      this.runWhenIdle(() => {
        if (this.supportedUciOptions.size === 0 || this.supportedUciOptions.has(buttonOptionName)) {
          this.sendUciCommand(`setoption name ${buttonOptionName}`);
          this.markEngineUnready();
        }
        this.extension?.gameController?.updateEnginePosition(false);
      });
      return;
    }

    const incomingUciOverrides = optionUpdates.customEngineOptions;
    if (incomingUciOverrides && typeof incomingUciOverrides === "object") {
      this.uciOptionOverrides = Object.assign({}, incomingUciOverrides);
      this.runWhenIdle(() => {
        this.applyUciOptions(this.uciOptionOverrides);
        this.extension?.gameController?.updateEnginePosition(false);
      });
      return;
    }

    if (Object.keys(optionUpdates).some((optionKey) => SEARCH_GO_OPTION_KEYS.has(optionKey))) {
      this.extension?.gameController?.updateEnginePosition(false);
      return;
    }

    if (this.candidateMoves.length > 0) {
      this.handleCandidateMoveUpdate(null, !this.isEvaluating);
    } else if (
      getExtensionOption(EXTENSION_OPTION_KEY.LegitAutoMove) &&
      !this.isEvaluating &&
      this.isWebSocketOpen()
    ) {
      this.extension?.gameController?.updateEnginePosition(false);
    }
  }

  applyUciOptions(uciOptionsMap = null) {
    const targetUciOptions = uciOptionsMap || this.uciOptionOverrides;
    if (!targetUciOptions || typeof targetUciOptions !== "object") return;
    let hasSentAnyUciOption = false;

    for (const [previousOptionName, previousOptionValue] of Object.entries(this.appliedUciOptions)) {
      const nextOptionValue = Object.prototype.hasOwnProperty.call(
        targetUciOptions,
        previousOptionName
      )
        ? targetUciOptions[previousOptionName]
        : undefined;
      const isOptionActive =
        nextOptionValue !== "" && nextOptionValue !== undefined && nextOptionValue !== null;
      if (isOptionActive) continue;

      const defaultValue = this.supportedUciOptions.get(previousOptionName);
      if (defaultValue !== undefined) {
        if (String(previousOptionValue) !== String(defaultValue)) {
          this.sendUciCommand(
            defaultValue === ""
              ? `setoption name ${previousOptionName} value`
              : `setoption name ${previousOptionName} value ${defaultValue}`
          );
          hasSentAnyUciOption = true;
        }
      }
      delete this.appliedUciOptions[previousOptionName];
    }

    for (const [optionName, optionValue] of Object.entries(targetUciOptions)) {
      if (optionValue === "" || optionValue === undefined || optionValue === null) continue;
      if (this.supportedUciOptions.size === 0 || this.supportedUciOptions.has(optionName)) {
        this.sendUciCommand(`setoption name ${optionName} value ${optionValue}`);
        this.appliedUciOptions[optionName] = optionValue;
        hasSentAnyUciOption = true;
      }
    }
    if (hasSentAnyUciOption) {
      this.markEngineUnready();
    }
  }

  processEngineMessage(rawMessage) {
    if (typeof rawMessage !== "string" || !rawMessage) return;

    for (const rawLine of rawMessage.split(/\r?\n/)) {
      const uciLine = rawLine.trim();
      if (uciLine) {
        this.processEngineLine(uciLine);
      }
    }
  }

  processEngineLine(uciLine) {
    if (uciLine.startsWith("option name ")) {
      const parsedUciOption = UciEngineClient.parseUciOptionLine(uciLine);
      if (parsedUciOption) {
        this.supportedUciOptions.set(
          parsedUciOption.name,
          parsedUciOption.hasDefault ? parsedUciOption.default : undefined
        );
      }
      return;
    }

    if (uciLine === "uciok") {
      this.isEngineLoaded = true;
      this.reconnectAttempts = 0;
      this.fatalErrorMessage = null;
      this.applyUciOptions();
      if (this.readyCallbacks.length > 0) {
        this.sendIsReady();
      }
    } else if (uciLine.startsWith("info string Error:")) {
      this.fatalErrorMessage = uciLine.slice("info string ".length);
      console.error(`[BetterMint] ${this.fatalErrorMessage}`);
    } else if (uciLine.startsWith("info string book ")) {
      if (this.hasRequestedStop) return;
      const bookMoveTokens = uciLine
        .slice("info string book ".length)
        .trim()
        .toLowerCase()
        .split(/\s+/);
      for (const bookMoveToken of bookMoveTokens) {
        if (UCI_MOVE_RE.test(bookMoveToken)) {
          this.currentPositionBookMoves.add(bookMoveToken);
        }
      }
      if (this.currentPositionBookMoves.size > 0) {
        this.hasCurrentPositionBookHit = true;
      }
    } else if (uciLine === "readyok") {
      if (this.pendingReadyCount > 0) {
        this.pendingReadyCount--;
      }
      if (this.pendingReadyCount > 0) {
        return;
      }
      this.hasSentIsReady = false;
      this.isEngineReady = true;
      while (this.isEngineReady && this.readyCallbacks.length > 0) {
        const readyCallback = this.readyCallbacks.shift();
        readyCallback();
      }
      if (!this.isEngineReady && this.readyCallbacks.length > 0) {
        this.sendIsReady();
      }
    } else if (uciLine.startsWith("info ")) {
      if (
        this.hasRequestedStop ||
        !uciLine.includes(" pv ") ||
        /\b(?:upperbound|lowerbound)\b/.test(uciLine)
      ) {
        return;
      }

      const pvMatch = uciLine.match(UciEngineClient.INFO_PV_RE);
      if (!pvMatch) return;
      const depthMatch = uciLine.match(UciEngineClient.INFO_DEPTH_RE);
      const scoreMatch = uciLine.match(UciEngineClient.INFO_SCORE_RE);
      if (!depthMatch || !scoreMatch) return;

      const searchDepth = parseInt(depthMatch[1], 10);
      const scoreUnit = scoreMatch[1];
      const numericScore = parseInt(scoreMatch[2], 10);
      const centipawns = scoreUnit === "cp" ? numericScore : null;
      const mateInMoves = scoreUnit === "mate" ? numericScore : null;
      const candidateMove = new CandidateMove(pvMatch[1], searchDepth, centipawns, mateInMoves);
      this.handleCandidateMoveUpdate(candidateMove, false);
    } else if (uciLine.startsWith("bestmove ")) {
      const bestMoveMatch = uciLine.match(UciEngineClient.BESTMOVE_RE);
      if (bestMoveMatch) {
        if (this.staleBestMovesToIgnore > 0) {
          this.staleBestMovesToIgnore--;
          return;
        }
        if (this.stopFallbackTimeoutId !== null) {
          clearTimeout(this.stopFallbackTimeoutId);
          this.stopFallbackTimeoutId = null;
        }
        this.isEvaluating = false;
        const hadRequestedStop = this.hasRequestedStop;
        this.hasRequestedStop = false;

        const completionCallbacks = this.stopCompletionCallbacks;
        this.stopCompletionCallbacks = [];
        completionCallbacks.forEach((completionCallback) => completionCallback());

        const bestUciMove = bestMoveMatch[1].toLowerCase();
        const isNullBestMove =
          bestUciMove === "(none)" ||
          bestUciMove === "0000" ||
          bestUciMove.slice(0, 2) === bestUciMove.slice(2, 4);
        if (!hadRequestedStop && !isNullBestMove) {
          const existingIndex = this.candidateMoves.findIndex(
            (candidate) => candidate.uciMove === bestUciMove
          );

          if (existingIndex < 0) {
            const fallbackBestCandidate = new CandidateMove(
              bestUciMove,
              getNonNegativeIntOption(EXTENSION_OPTION_KEY.Depth, 1) || 1,
              null,
              null
            );
            this.handleCandidateMoveUpdate(fallbackBestCandidate, true);
          } else {
            this.handleCandidateMoveUpdate(this.candidateMoves[existingIndex], true);
          }
        }
      }
    }
  }

  setPositionAndSearch(fen = null, isNewGame = true, positionCommand = null) {
    const startSearchForPosition = () => {
      const isSamePosition = !isNewGame && fen !== null && fen === this.currentPositionFen;
      if (isNewGame) {
        this.previousPositionCandidateMoves = [];
        this.previousPositionBookMoves = new Set();
        this.lastAutoMovedFen = null;
      } else if (!isSamePosition) {
        this.previousPositionCandidateMoves = this.candidateMoves;
        this.previousPositionBookMoves = new Set(this.currentPositionBookMoves);
        this.lastAutoMovedFen = null;
      }
      this.currentPositionFen = fen;
      this.candidateMoves = [];
      this.currentPositionBookMoves = new Set();
      this.hasCurrentPositionBookHit = false;
      const resolvedPositionCommand =
        positionCommand || (fen !== null ? `position fen ${fen}` : null);
      if (resolvedPositionCommand !== null) this.sendUciCommand(resolvedPositionCommand);
      this.startSearch();
    };
    this.onReady(() => {
      if (isNewGame) {
        this.markEngineUnready();
        this.sendUciCommand("ucinewgame");
        this.onReady(startSearchForPosition);
      } else {
        startSearchForPosition();
      }
    });
  }

  analyzeLastMove() {
    const gameController = this.extension.gameController;
    const lastPlayedMove = gameController.chessComGame.getLastMove();
    if (!lastPlayedMove) return;

    const lastPlayedUci = formatMoveToUci(lastPlayedMove);
    const isBookMove = Boolean(
      (lastPlayedUci && this.previousPositionBookMoves?.has(lastPlayedUci)) ||
      this.hasCurrentPositionBookHit
    );

    let moveQuality = isBookMove ? "Book" : null;
    if (!moveQuality && this.previousPositionCandidateMoves.length > 0 && this.candidateMoves.length > 0) {
      const previousBestMove = this.previousPositionCandidateMoves[0];
      if (resolveLegalMove([lastPlayedMove], previousBestMove)) {
        moveQuality = "BestMove";
      } else {
        const expectedPointsBefore = UciEngineClient.evalToExpectedPoints(previousBestMove);
        const expectedPointsOpponent = UciEngineClient.evalToExpectedPoints(this.candidateMoves[0]);
        if (expectedPointsBefore !== null && expectedPointsOpponent !== null) {
          const expectedPointsAfter = 1 - expectedPointsOpponent;
          const expectedPointsLoss = expectedPointsBefore - expectedPointsAfter;
          if (
            expectedPointsBefore >= 0.90 &&
            expectedPointsAfter >= 0.40 &&
            expectedPointsAfter <= 0.65
          ) {
            moveQuality = "MissedWin";
          } else {
            const matchedThreshold = UciEngineClient.EXPECTED_POINTS_LOSS_THRESHOLDS.find(
              ([maxExpectedPointsLoss]) => expectedPointsLoss <= maxExpectedPointsLoss
            );
            moveQuality = matchedThreshold ? matchedThreshold[1] : "Blunder";
          }
        }
      }
    }
    gameController.showMoveAnalysis(lastPlayedMove.to, moveQuality);
  }

  handleCandidateMoveUpdate(candidateMove = null, isBestMove = false) {
    let hasChangedCandidates = false;
    if (candidateMove !== null) {
      const existingIndex = this.candidateMoves.findIndex(
        (existingMove) => existingMove.uciMove === candidateMove.uciMove
      );
      if (existingIndex === -1) {
        this.candidateMoves.push(candidateMove);
        hasChangedCandidates = true;
      } else if (
        !isBestMove &&
        candidateMove.searchDepth >= this.candidateMoves[existingIndex].searchDepth
      ) {
        this.candidateMoves[existingIndex] = candidateMove;
        hasChangedCandidates = true;
      }
    }

    if (hasChangedCandidates) {
      this.candidateMoves.sort(UciEngineClient.compareCandidateMoves);
    }

    const hasSelectedBestMove = Boolean(
      isBestMove && (candidateMove !== null || this.candidateMoves.length > 0)
    );
    if (hasSelectedBestMove && candidateMove !== null) {
      const bestMoveIndex = this.candidateMoves.indexOf(candidateMove);
      if (bestMoveIndex > 0) {
        this.candidateMoves.splice(bestMoveIndex, 1);
        this.candidateMoves.unshift(candidateMove);
      }
    }

    const multiPvCount = Math.max(1, parseInt(this.uciOptionOverrides?.["MultiPV"], 10) || 1);
    const topCandidateMoves = this.candidateMoves.slice(0, multiPvCount);

    if (topCandidateMoves.length > 0) {
      this.extension?.gameController?.renderMoveHints?.(topCandidateMoves);
    }
    if (!hasSelectedBestMove || topCandidateMoves.length === 0) return;

    if (getExtensionOption(EXTENSION_OPTION_KEY.MoveAnalysis)) {
      this.analyzeLastMove();
    }
    this.scheduleAutoMove(topCandidateMoves[0]);
  }

  scheduleAutoMove(bestCandidateMove) {
    const gameController = this.extension.gameController;
    const chessComGame = gameController.chessComGame;
    const canExecuteAutoMove = () =>
      getExtensionOption(EXTENSION_OPTION_KEY.LegitAutoMove) &&
      chessComGame.getPlayingAs() === chessComGame.getTurn() &&
      !UciEngineClient.NON_PLAYING_MODES.has(chessComGame.getMode?.());

    if (!canExecuteAutoMove()) return;

    const activeBoardFen = chessComGame.getFEN();
    if (this.currentPositionFen && this.currentPositionFen !== activeBoardFen) {
      return;
    }
    if (gameController.autoMoveTimeoutId !== null || this.lastAutoMovedFen === activeBoardFen) {
      return;
    }

    const matchedLegalMove = resolveLegalMove(chessComGame.getLegalMoves(), bestCandidateMove);
    if (!matchedLegalMove) return;

    const movePayload = Object.assign({}, matchedLegalMove, { userGenerated: true });
    if (bestCandidateMove.promotion) {
      movePayload.promotion = bestCandidateMove.promotion;
    }

    const executeAutoMove = () => {
      if (!canExecuteAutoMove() || chessComGame.getFEN() !== activeBoardFen) {
        return;
      }
      try {
        const moveOutcome = chessComGame.move(movePayload);
        if (moveOutcome !== false && chessComGame.getFEN() === activeBoardFen) {
          this.lastAutoMovedFen = activeBoardFen;
        }
      } catch (moveError) {
        console.error("Failed to execute auto move:", moveError);
      }
    };

    const targetDelayMs = this.calculateAutoMoveDelayMs(bestCandidateMove);
    const elapsedTurnMs =
      typeof gameController.turnStartTimestampMs === "number"
        ? performance.now() - gameController.turnStartTimestampMs
        : 0;
    const remainingDelayMs = Math.max(0, targetDelayMs - elapsedTurnMs);

    if (remainingDelayMs <= 0) {
      executeAutoMove();
    } else {
      gameController.autoMoveTimeoutId = setTimeout(() => {
        gameController.autoMoveTimeoutId = null;
        executeAutoMove();
      }, remainingDelayMs);
    }
  }
}

class BetterMintExtension {
  constructor(chessboardElement, initialExtensionOptions) {
    this.extensionOptions = Object.assign({}, initialExtensionOptions);
    const previousExtension = activeExtension;
    activeExtension = this;
    try {
      this.gameController = new GameController(this, chessboardElement);
      this.engineClient = new UciEngineClient(this);
    } catch (initError) {
      activeExtension = previousExtension;
      throw initError;
    }
    window.addEventListener(
      "BetterMintUpdateOptions",
      (optionsEvent) => {
        if (!optionsEvent?.detail || typeof optionsEvent.detail !== "object") return;
        this.extensionOptions = Object.assign({}, this.extensionOptions, optionsEvent.detail);
        this.gameController.applyExtensionOptions();
        this.engineClient.applyExtensionOptions(optionsEvent.detail);
      },
      false
    );
  }
}

function attachBoardController(chessboardElement) {
  activeExtension.gameController?.destroy?.();
  activeExtension.gameController = new GameController(activeExtension, chessboardElement);
  activeExtension.gameController.updateEnginePosition(true);
}

let pendingBoardElement = null;
let pendingOptionsPromise = null;

function initializeBetterMintExtension(chessboardElement) {
  pendingBoardElement = chessboardElement;
  if (activeExtension) {
    try {
      attachBoardController(chessboardElement);
    } catch (initError) {
      console.error("Failed to attach BetterMint to board:", initError);
    }
    return;
  }

  if (!pendingOptionsPromise) {
    pendingOptionsPromise = requestExtensionOptions().then((loadedOptions) => {
      pendingOptionsPromise = null;
      const targetBoardElement = pendingBoardElement;
      pendingBoardElement = null;
      try {
        activeExtension = new BetterMintExtension(targetBoardElement, loadedOptions);
      } catch (initError) {
        console.error("Failed to initialize BetterMint:", initError);
      }
    });
  }
}

if (typeof document !== "undefined") {
  let activeBoardElement = null;
  let boardReadyIntervalId = null;

  const tryAttachBoard = (candidateBoard) => {
    if (!candidateBoard || candidateBoard === activeBoardElement) return false;
    if (candidateBoard.game) {
      activeBoardElement = candidateBoard;
      if (boardReadyIntervalId !== null) {
        clearInterval(boardReadyIntervalId);
        boardReadyIntervalId = null;
      }
      initializeBetterMintExtension(candidateBoard);
      return true;
    }
    return false;
  };

  const watchForBoardGameReady = (candidateBoard) => {
    if (tryAttachBoard(candidateBoard) || boardReadyIntervalId !== null) return;
    let pollAttempts = 0;
    boardReadyIntervalId = setInterval(() => {
      pollAttempts++;
      const currentBoard = candidateBoard.isConnected
        ? candidateBoard
        : document.querySelector("wc-chess-board, chess-board");
      if (tryAttachBoard(currentBoard) || pollAttempts >= 200) {
        clearInterval(boardReadyIntervalId);
        boardReadyIntervalId = null;
      }
    }, 50);
  };

  let isBoardScanScheduled = false;
  const scheduleBoardScan = () => {
    if (isBoardScanScheduled || activeBoardElement?.isConnected) return;
    isBoardScanScheduled = true;
    const scheduleScan =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (callback) => setTimeout(callback, 16);
    scheduleScan(() => {
      isBoardScanScheduled = false;
      if (activeBoardElement?.isConnected) return;
      const hadDisconnectedBoard = Boolean(activeBoardElement && !activeBoardElement.isConnected);
      if (hadDisconnectedBoard) {
        activeBoardElement = null;
        activeExtension?.gameController?.evalBarSyncHandler?.();
        activeExtension?.gameController?.clearAutoMoveTimer?.();
        activeExtension?.engineClient?.stopEvaluation?.();
      }
      const detectedBoard = document.querySelector("wc-chess-board, chess-board");
      if (detectedBoard && detectedBoard !== activeBoardElement) {
        watchForBoardGameReady(detectedBoard);
      }
    });
  };

  const boardObserver = new MutationObserver((mutationRecords) => {
    if (activeBoardElement?.isConnected) return;
    if (!activeBoardElement && !hasAddedElementMutation(mutationRecords)) return;
    scheduleBoardScan();
  });

  const existingBoardElement = document.querySelector("wc-chess-board, chess-board");
  if (existingBoardElement) {
    watchForBoardGameReady(existingBoardElement);
  }
  boardObserver.observe(document, {
    childList: true,
    subtree: true
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BetterMintExtension,
    UciEngineClient,
    GameController,
    CandidateMove,
    EXTENSION_OPTION_KEY,
    resolveLegalMove,
    formatMoveToUci,
    buildUciPositionCommand,
    STANDARD_STARTPOS_FEN,
    formatEvaluationDisplay,
    getEvalBarOffsetPx,
    setExtensionOptionsForTesting: (extensionOptions) => {
      activeExtension = undefined;
      fallbackExtensionOptions = extensionOptions;
    }
  };
}
})();
