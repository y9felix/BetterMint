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
  GoMate: "option-go-mate",
  GoSearchmoves: "option-go-searchmoves",
  GoClockSync: "option-go-clock-sync",
  GoClockInc: "option-go-clock-inc",
  GoMovestogo: "option-go-movestogo",
  GoInfinite: "option-go-infinite",
  GoInfiniteTimeout: "option-go-infinite-timeout",
  GoEvalStable: "option-go-eval-stable",
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

const SEARCH_GO_OPTION_KEYS = new Set([
  EXTENSION_OPTION_KEY.Depth,
  EXTENSION_OPTION_KEY.GoMovetime,
  EXTENSION_OPTION_KEY.GoNodes,
  EXTENSION_OPTION_KEY.GoMate,
  EXTENSION_OPTION_KEY.GoSearchmoves,
  EXTENSION_OPTION_KEY.GoClockSync,
  EXTENSION_OPTION_KEY.GoClockInc,
  EXTENSION_OPTION_KEY.GoMovestogo,
  EXTENSION_OPTION_KEY.GoInfinite,
  EXTENSION_OPTION_KEY.GoInfiniteTimeout,
  EXTENSION_OPTION_KEY.GoEvalStable
]);

const CLOCK_BOTTOM_SELECTOR =
  ".clock-component.clock-bottom, .clock-button-component.clock-bottom, .clock.clock-bottom, .clock-bottom";
const CLOCK_TOP_SELECTOR =
  ".clock-component.clock-top, .clock-button-component.clock-top, .clock.clock-top, .clock-top";

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
    const shortText = "M" + String(Math.abs(scoreValue));
    return {
      percentage: scoreValue < 0 ? 100 : 0,
      abbreviated: shortText,
      full: (scoreValue < 0 ? "-" : "+") + shortText,
      isDark: scoreValue >= 0
    };
  }
  const pawnAdvantage = scoreValue / 100;
  const absPawnAdvantage = Math.abs(pawnAdvantage);
  const percentage = Math.max(
    5,
    Math.min(95, (1 - centipawnsToWinProbability(scoreValue)) * 100)
  );
  const full =
    absPawnAdvantage < 0.005
      ? "0.00"
      : (pawnAdvantage > 0 ? "+" : "") + pawnAdvantage.toFixed(2);
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
    full,
    isDark: scoreValue >= 0
  };
}

function parseClockElementSeconds(clockSelector) {
  const clockElement =
    typeof document !== "undefined" ? document.querySelector(clockSelector) : null;
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

function getRemainingPlayerTimeSeconds() {
  return parseClockElementSeconds(CLOCK_BOTTOM_SELECTOR);
}

function getClockSyncTimesMs(chessComGame) {
  const bottomClockSeconds = parseClockElementSeconds(CLOCK_BOTTOM_SELECTOR);
  const topClockSeconds = parseClockElementSeconds(CLOCK_TOP_SELECTOR);
  if (bottomClockSeconds === null || topClockSeconds === null) return null;
  const isPlayingAsBlack = chessComGame?.getPlayingAs?.() === CHESSCOM_BLACK_TURN;
  const whiteSeconds = isPlayingAsBlack ? topClockSeconds : bottomClockSeconds;
  const blackSeconds = isPlayingAsBlack ? bottomClockSeconds : topClockSeconds;
  return {
    wtime: Math.max(100, Math.round(whiteSeconds * 1000)),
    btime: Math.max(100, Math.round(blackSeconds * 1000))
  };
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
  return (
    legalMoves.find(
      (legalMove) =>
        legalMove.from === candidateMove.from &&
        legalMove.to === candidateMove.to &&
        (!candidateMove.promotion ||
          !legalMove.promotion ||
          legalMove.promotion === candidateMove.promotion)
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
    "play again",
    "new opponent",
    "next game",
    "new game",
    "rematch",
    "new"
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

  constructor(extension, chessboardElement) {
    this.extension = extension;
    this.chessboardElement = chessboardElement;
    this.chessComGame = chessboardElement.game;
    this.boardOptions = this.chessComGame.getOptions();
    this.evalBarElement = null;
    this.evalBarWhiteFill = null;
    this.evalScoreElement = null;
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

    this.chessComGame.on("Move", () => {
      if (this.isDestroyed) return;
      this.clearAutoMoveTimer();
      this.removeCurrentHintMarkings();
      if (this.chessComGame.getPlayingAs() === this.chessComGame.getTurn()) {
        this.turnStartTimestampMs = performance.now();
      }
      this.updateEnginePosition(false);
    });

    if (this.evalBarElement == null && getExtensionOption(EXTENSION_OPTION_KEY.EvaluationBar)) {
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
        this.removeCurrentHintMarkings();
        this.handleGameOver();
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
      if (optionsEvent?.data?.flipped !== undefined && this.evalBarElement != null) {
        this.evalBarElement.classList.toggle(
          "bettermint-evalbar-flipped",
          Boolean(this.boardOptions?.flipped)
        );
      }
      this.setupAutoQueueObserver();
    });

    this.setupAutoQueueObserver();
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

  dispatchSimulatedClick(targetElement) {
    const boundingRect = targetElement.getBoundingClientRect();
    const pointerEventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: boundingRect.left + boundingRect.width / 2,
      clientY: boundingRect.top + boundingRect.height / 2
    };
    targetElement.dispatchEvent(new PointerEvent("pointerdown", pointerEventOptions));
    targetElement.dispatchEvent(new MouseEvent("mousedown", pointerEventOptions));
    targetElement.dispatchEvent(new PointerEvent("pointerup", pointerEventOptions));
    targetElement.dispatchEvent(new MouseEvent("mouseup", pointerEventOptions));
    targetElement.click();
  }

  triggerAutoQueue() {
    if (!getExtensionOption(EXTENSION_OPTION_KEY.AutoQueue)) return false;
    if (this.chessComGame?.getMode?.() === "playing") return false;
    const nowMs = Date.now();
    if (this.lastAutoQueueClickMs && nowMs - this.lastAutoQueueClickMs < AUTO_QUEUE_COOLDOWN_MS) {
      return false;
    }

    const matchesQueueKeyword = (buttonText, shouldMatchLeadingNew) =>
      GameController.AUTO_QUEUE_KEYWORDS.some((keyword) => {
        if (keyword === "new") {
          return shouldMatchLeadingNew ? /^new\b/.test(buttonText) : /\bnew\b/.test(buttonText);
        }
        return buttonText.includes(keyword);
      });

    const findAndClickMatchingButton = (buttonSelector, labelPredicate) => {
      const candidateButtons = document.querySelectorAll(buttonSelector);
      for (const candidateButton of candidateButtons) {
        if (candidateButton.disabled) continue;
        const buttonText = candidateButton.textContent?.trim().toLowerCase();
        if (!buttonText || !labelPredicate(buttonText)) {
          continue;
        }
        if (candidateButton.offsetWidth > 0 && candidateButton.offsetHeight > 0) {
          this.lastAutoQueueClickMs = nowMs;
          this.dispatchSimulatedClick(candidateButton);
          return true;
        }
      }
      return false;
    };

    const genericButtonSelector = "button:not([disabled]), [role='button']:not([disabled])";
    if (getExtensionOption(EXTENSION_OPTION_KEY.RematchFirst)) {
      const isRematchButton = (buttonText) => buttonText.includes("rematch");
      if (findAndClickMatchingButton(GameController.AUTO_QUEUE_SELECTORS, isRematchButton)) {
        return true;
      }
      if (findAndClickMatchingButton(genericButtonSelector, isRematchButton)) return true;
    }

    if (
      findAndClickMatchingButton(GameController.AUTO_QUEUE_SELECTORS, (buttonText) =>
        matchesQueueKeyword(buttonText, false)
      )
    ) {
      return true;
    }
    return findAndClickMatchingButton(genericButtonSelector, (buttonText) =>
      matchesQueueKeyword(buttonText, true)
    );
  }

  setupAutoQueueObserver() {
    if (this.autoQueueMutationObserver) {
      if (!getExtensionOption(EXTENSION_OPTION_KEY.AutoQueue)) {
        this.autoQueueMutationObserver.disconnect();
        this.autoQueueMutationObserver = null;
      }
      return;
    }

    if (!getExtensionOption(EXTENSION_OPTION_KEY.AutoQueue)) return;
    const observeRoot =
      typeof document !== "undefined" ? document.body || document.documentElement : null;
    if (!observeRoot) return;

    let lastScanTimestampMs = 0;
    this.autoQueueMutationObserver = new MutationObserver((mutationRecords) => {
      if (this.chessComGame?.getMode?.() === "playing") return;
      if (Array.isArray(mutationRecords) && !hasAddedElementMutation(mutationRecords)) return;
      const nowMs = Date.now();
      if (nowMs - lastScanTimestampMs < 250) return;
      lastScanTimestampMs = nowMs;
      this.triggerAutoQueue();
    });

    this.autoQueueMutationObserver.observe(observeRoot, { childList: true, subtree: true });
    this.triggerAutoQueue();
  }

  handleGameOver() {
    if (!getExtensionOption(EXTENSION_OPTION_KEY.AutoQueue)) return;
    this.setupAutoQueueObserver();
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
    if (this.evalBarAnimationFrameId != null && typeof cancelAnimationFrame === "function") {
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
    this.evalScoreElement = null;
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
      this.evalBarElement != null
    ) {
      this.removeEvaluationBar();
    }

    this.setupAutoQueueObserver();
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
    if (this.autoQueueMutationObserver) {
      this.autoQueueMutationObserver.disconnect();
      this.autoQueueMutationObserver = null;
    }
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
    if (!getExtensionOption(EXTENSION_OPTION_KEY.EvaluationBar) || this.evalBarElement != null) {
      return;
    }
    const documentBody = document.body || document.documentElement;
    if (!documentBody) return;

    const evalBarElement = document.createElement("div");
    evalBarElement.className = "bettermint-evalbar";
    evalBarElement.innerHTML = `<span class="bettermint-evalbar-scoreAbbreviated bettermint-evalbar-dark">0.0</span><span class="bettermint-evalbar-score bettermint-evalbar-dark">0.00</span><div class="bettermint-evalbar-fill"><div class="bettermint-evalbar-color bettermint-evalbar-black"></div><div class="bettermint-evalbar-color bettermint-evalbar-white" style="transform: translate3d(0px, 50%, 0px);"></div></div>`;
    documentBody.appendChild(evalBarElement);

    this.evalBarElement = evalBarElement;
    this.evalBarWhiteFill = evalBarElement.querySelector(".bettermint-evalbar-white");
    this.evalScoreElement = evalBarElement.querySelector(".bettermint-evalbar-score");
    this.evalScoreAbbreviatedElement = evalBarElement.querySelector(
      ".bettermint-evalbar-scoreAbbreviated"
    );

    const measureBoardRect = () => {
      const innerBoardElement =
        this.chessboardElement.querySelector?.(".board, chess-board, svg.coordinates") ||
        this.chessboardElement.shadowRoot?.querySelector?.(".board, svg.coordinates");
      const boundingRect = (innerBoardElement || this.chessboardElement).getBoundingClientRect();
      if (boundingRect.width > boundingRect.height + 2 && boundingRect.height >= 50) {
        const boardSideLength = boundingRect.height;
        const horizontalInset = (boundingRect.width - boardSideLength) / 2;
        return {
          left: boundingRect.left + horizontalInset,
          right: boundingRect.right - horizontalInset,
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
      if (!this.evalBarElement || !this.chessboardElement?.isConnected) return;
      const boardRect = measureBoardRect();
      if (
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
      const offsetPx = getEvalBarOffsetPx(
        typeof window !== "undefined" ? window.innerWidth : undefined
      );
      const topPx = Math.round(boardRect.top);
      const heightPx = Math.round(boardRect.height);
      const leftPx = Math.max(4, Math.round(boardRect.left - offsetPx));
      const isOverlappingBoard = boardRect.left < offsetPx;
      const nextLayoutSignature = `${topPx}:${heightPx}:${leftPx}:${offsetPx}:${isOverlappingBoard ? 1 : 0}`;
      if (nextLayoutSignature === lastLayoutSignature) return;
      lastLayoutSignature = nextLayoutSignature;

      this.evalBarElement.style.display = "block";
      this.evalBarElement.style.top = `${topPx}px`;
      this.evalBarElement.style.height = `${heightPx}px`;
      this.evalBarElement.style.left = `${leftPx}px`;
      this.evalBarElement.style.pointerEvents = isOverlappingBoard ? "none" : "";
    };

    const scheduleSyncPosition = () => {
      if (typeof requestAnimationFrame !== "function") {
        syncEvalBarPosition();
        return;
      }
      if (this.evalBarAnimationFrameId != null) return;
      this.evalBarAnimationFrameId = requestAnimationFrame(() => {
        this.evalBarAnimationFrameId = null;
        syncEvalBarPosition();
      });
    };

    syncEvalBarPosition();
    if (typeof ResizeObserver !== "undefined") {
      this.evalBarResizeObserver = new ResizeObserver(scheduleSyncPosition);
      this.evalBarResizeObserver.observe(this.chessboardElement);
      if (this.chessboardElement.parentElement) {
        this.evalBarResizeObserver.observe(this.chessboardElement.parentElement);
      }
      if (document.body) {
        this.evalBarResizeObserver.observe(document.body);
      }
    }
    this.evalBarSyncHandler = scheduleSyncPosition;
    window.addEventListener("scroll", scheduleSyncPosition, { passive: true, capture: true });
    window.addEventListener("resize", scheduleSyncPosition, { passive: true });

    if (this.boardOptions?.flipped) {
      this.evalBarElement.classList.add("bettermint-evalbar-flipped");
    }
    if (this.extension?.engineClient?.candidateMoves?.length > 0) {
      this.extension.engineClient.ensureCandidateMovesSorted?.();
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

  updateEnginePosition(isNewGame) {
    if (!this.extension?.engineClient) return;
    const fen = this.chessComGame.getFEN();
    this.extension.engineClient.updatePosition(fen, isNewGame);
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
        marking.data.square != null
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
        const isSquareCoordinate = (squareName) =>
          typeof squareName === "string" && /^[a-h][1-8]$/.test(squareName);
        const arrowColors = this.boardOptions?.arrowColors || {};
        const seenMateEffectSquares = new Set();
        const nextMarkings = [];
        let hintSignature = "";

        candidateMoves.forEach((candidateMove, rankIndex) => {
          const resolvedMove = resolveLegalMove(legalMoves, candidateMove);
          const fromSquare = resolvedMove ? resolvedMove.from : candidateMove.from;
          const toSquare = resolvedMove ? resolvedMove.to : candidateMove.to;
          if (
            !isSquareCoordinate(fromSquare) ||
            !isSquareCoordinate(toSquare) ||
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
    if (this.evalBarElement == null) return;
    const { percentage, abbreviated, full, isDark } = formatEvaluationDisplay(
      scoreValue,
      isMateScore
    );
    this.evalBarWhiteFill.style.transform = `translate3d(0px, ${percentage}%, 0px)`;
    this.evalScoreElement.textContent = full;
    this.evalScoreAbbreviatedElement.textContent = abbreviated;
    this.evalScoreElement.classList.toggle("bettermint-evalbar-dark", isDark);
    this.evalScoreElement.classList.toggle("bettermint-evalbar-light", !isDark);
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
  static INFO_MULTIPV_RE = /\bmultipv (\d+)/;
  static INFO_SCORE_RE = /\bscore (cp|mate) (-?\d+)/;
  static INFO_PV_RE = /\bpv ([a-h][1-8][a-h][1-8][qrbn]?(?: [a-h][1-8][a-h][1-8][qrbn]?)*)/;
  static BESTMOVE_RE = /^bestmove ([a-h][1-8][a-h][1-8][qrbn]?|\(none\))/;

  static parseUciOptionLine(uciLine) {
    if (!uciLine || typeof uciLine !== "string" || !uciLine.startsWith("option name ")) return null;
    const declarationBody = uciLine.slice(12);
    const typeDelimiterIndex = declarationBody.indexOf(" type ");
    if (typeDelimiterIndex === -1) return null;
    const optionName = declarationBody.slice(0, typeDelimiterIndex).trim();
    if (!optionName) return null;

    const typeAndAttributes = declarationBody.slice(typeDelimiterIndex + 6).trim();
    const attributeTokens = typeAndAttributes.split(/\s+/);
    const optionType = attributeTokens[0];
    if (!optionType) return null;

    if (optionType === "button") {
      return { name: optionName, type: optionType, hasDefault: false, default: null };
    }

    if (optionType === "string") {
      const stringDefaultMatch = typeAndAttributes.match(/^string\s+default\s*(.*)$/);
      if (!stringDefaultMatch) {
        return { name: optionName, type: optionType, hasDefault: false, default: null };
      }
      const rawDefaultText = stringDefaultMatch[1].trim();
      return {
        name: optionName,
        type: optionType,
        hasDefault: true,
        default: rawDefaultText === "<empty>" ? "" : rawDefaultText
      };
    }

    const uciKeywords = new Set(["default", "min", "max", "var"]);
    let activeAttributeKeyword = null;
    let collectedValueWords = [];
    let hasDefault = false;
    let defaultValue = "";

    const commitActiveAttribute = () => {
      if (activeAttributeKeyword === "default") {
        hasDefault = true;
        defaultValue = collectedValueWords.join(" ").trim();
      }
      collectedValueWords = [];
    };

    for (let tokenIndex = 1; tokenIndex < attributeTokens.length; tokenIndex++) {
      const token = attributeTokens[tokenIndex];
      if (uciKeywords.has(token)) {
        commitActiveAttribute();
        activeAttributeKeyword = token;
      } else if (activeAttributeKeyword) {
        collectedValueWords.push(token);
      }
    }
    commitActiveAttribute();

    return {
      name: optionName,
      type: optionType,
      hasDefault,
      default: hasDefault ? defaultValue : null
    };
  }

  constructor(extension) {
    this.extension = extension;
    this.isEngineLoaded = false;
    this.isEngineReady = false;
    this.isEvaluating = false;
    this.hasRequestedStop = false;
    this.isFinishingSearch = false;
    this.infiniteSearchTimeoutId = null;
    this.isInfiniteSearchActive = false;
    this.evalStabilityHistory = [];
    this.readyCallbacks = [];
    this.stopCompletionCallbacks = [];
    this.stopFallbackTimeoutId = null;
    this.candidateMoves = [];
    this.hasUnsortedCandidateMoves = false;
    this.previousPositionCandidateMoves = [];
    this.currentPositionFen = null;
    this.lastAutoMovedFen = null;
    this.searchDepth = getNonNegativeIntOption(EXTENSION_OPTION_KEY.Depth, 15);
    this.currentEngineUrl = getExtensionOption(EXTENSION_OPTION_KEY.EngineWebSocketUrl);
    this.targetEngineUrl = this.currentEngineUrl;
    this.isSwitchingEngine = false;
    this.onEngineSwitchedCallback = null;
    this.supportedUciOptions = new Set();
    this.uciOptionDefaults = new Map();
    this.appliedUciOptions = {};
    this.pendingReadyCount = 0;
    this.hasSentIsReady = false;
    this.uciOptionOverrides = Object.assign(
      {},
      extension?.extensionOptions?.customEngineOptions
    );
    this.initialReconnectDelayMs = 500;
    this.maxReconnectDelayMs = 30000;
    this.reconnectAttempts = 0;
    this.reconnectTimerId = null;
    this.fatalErrorMessage = null;
    this.staleBestMovesToIgnore = 0;
    this.pendingPositionUpdate = null;

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

  initializeWebSocket(engineUrl) {
    try {
      this.websocket = new WebSocket(engineUrl);
    } catch (socketError) {
      console.error("Failed to initialize WebSocket:", socketError);
      this.handleDisconnect();
      return;
    }

    const activeSocket = this.websocket;
    activeSocket.addEventListener("open", () => {
      if (this.websocket !== activeSocket) return;
      this.isEngineLoaded = false;
      this.isEngineReady = false;
      this.pendingReadyCount = 0;
      this.hasSentIsReady = false;
      this.appliedUciOptions = {};
      this.staleBestMovesToIgnore = 0;
      this.sendUciCommand("uci");
      this.onReady(() => {
        this.isEngineReady = false;
        this.hasSentIsReady = false;
        this.sendUciCommand("ucinewgame");
        this.onReady(() => {
          if (this.onEngineSwitchedCallback) {
            const onSwitchedCallback = this.onEngineSwitchedCallback;
            this.onEngineSwitchedCallback = null;
            onSwitchedCallback();
          } else {
            const chessComGame = this.extension?.gameController?.chessComGame;
            if (
              chessComGame &&
              chessComGame.getMode?.() !== "gameOver" &&
              typeof chessComGame.getFEN === "function"
            ) {
              this.extension.gameController.updateEnginePosition(false);
            }
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
      if (this.stopFallbackTimeoutId !== null) {
        clearTimeout(this.stopFallbackTimeoutId);
        this.stopFallbackTimeoutId = null;
      }
      if (this.websocket) {
        const previousSocket = this.websocket;
        this.websocket = null;
        try {
          previousSocket.close();
        } catch (closeError) {
          console.warn("[BetterMint] Failed to close previous engine WebSocket:", closeError);
        }
      }
      this.clearInfiniteSearchGuards();
      this.currentEngineUrl = nextEngineUrl;
      this.isEvaluating = false;
      this.hasRequestedStop = false;
      this.isFinishingSearch = false;
      this.isEngineReady = false;
      this.isEngineLoaded = false;
      this.pendingReadyCount = 0;
      this.hasSentIsReady = false;
      this.fatalErrorMessage = null;
      this.staleBestMovesToIgnore = 0;
      this.pendingPositionUpdate = null;
      this.readyCallbacks = [];
      this.stopCompletionCallbacks = [];
      this.isSwitchingEngine = false;
      this.supportedUciOptions = new Set();
      this.uciOptionDefaults = new Map();
      this.appliedUciOptions = {};
      this.onEngineSwitchedCallback = () => {
        const gameController = this.extension?.gameController;
        if (gameController && gameController.chessComGame?.getMode?.() !== "gameOver") {
          gameController.updateEnginePosition(false);
        }
      };
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

  clearInfiniteSearchGuards() {
    if (this.infiniteSearchTimeoutId != null) {
      clearTimeout(this.infiniteSearchTimeoutId);
      this.infiniteSearchTimeoutId = null;
    }
    this.isInfiniteSearchActive = false;
    this.evalStabilityHistory = [];
  }

  buildGoCommand() {
    const rawSearchMovesText = String(
      getExtensionOption(EXTENSION_OPTION_KEY.GoSearchmoves) || ""
    ).trim();
    const validSearchMoves = [];
    if (rawSearchMovesText) {
      const seenMoves = new Set();
      const legalMoves = this.extension?.gameController?.chessComGame?.getLegalMoves?.();
      for (const moveToken of rawSearchMovesText.toLowerCase().split(/\s+/)) {
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(moveToken) || seenMoves.has(moveToken)) {
          continue;
        }
        if (Array.isArray(legalMoves)) {
          const matchedLegalMove = resolveLegalMove(legalMoves, {
            from: moveToken.slice(0, 2),
            to: moveToken.slice(2, 4),
            promotion: moveToken.length > 4 ? moveToken[4] : null
          });
          if (!matchedLegalMove) continue;
        }
        seenMoves.add(moveToken);
        validSearchMoves.push(moveToken);
      }
    }

    if (getExtensionOption(EXTENSION_OPTION_KEY.GoInfinite)) {
      const commandParts = ["go", "infinite"];
      if (validSearchMoves.length > 0) {
        commandParts.push("searchmoves", ...validSearchMoves);
      }
      return { command: commandParts.join(" "), isInfinite: true };
    }

    const commandParts = ["go"];
    const depth =
      this.searchDepth !== undefined
        ? this.searchDepth
        : getNonNegativeIntOption(EXTENSION_OPTION_KEY.Depth, 15);
    const movetimeMs = getNonNegativeIntOption(EXTENSION_OPTION_KEY.GoMovetime, 0);
    const nodeLimit = getNonNegativeIntOption(EXTENSION_OPTION_KEY.GoNodes, 0);
    const mateDepth = getNonNegativeIntOption(EXTENSION_OPTION_KEY.GoMate, 0);
    const isClockSyncEnabled = Boolean(getExtensionOption(EXTENSION_OPTION_KEY.GoClockSync));
    const clockIncrementMs = getNonNegativeIntOption(EXTENSION_OPTION_KEY.GoClockInc, 0);
    const movesToGo = getNonNegativeIntOption(EXTENSION_OPTION_KEY.GoMovestogo, 0);
    let hasSearchBound = false;

    if (depth > 0) {
      commandParts.push("depth", String(depth));
      hasSearchBound = true;
    }
    if (movetimeMs > 0) {
      commandParts.push("movetime", String(movetimeMs));
      hasSearchBound = true;
    }
    if (nodeLimit > 0) {
      commandParts.push("nodes", String(nodeLimit));
      hasSearchBound = true;
    }
    if (mateDepth > 0) {
      commandParts.push("mate", String(mateDepth));
      hasSearchBound = true;
    }
    if (isClockSyncEnabled) {
      const clockTimesMs = getClockSyncTimesMs(this.extension?.gameController?.chessComGame);
      if (clockTimesMs) {
        commandParts.push("wtime", String(clockTimesMs.wtime), "btime", String(clockTimesMs.btime));
        if (clockIncrementMs > 0) {
          commandParts.push("winc", String(clockIncrementMs), "binc", String(clockIncrementMs));
        }
        if (movesToGo > 0) {
          commandParts.push("movestogo", String(movesToGo));
        }
        hasSearchBound = true;
      }
    }
    if (!hasSearchBound) {
      commandParts.push("depth", "1");
    }
    if (validSearchMoves.length > 0) {
      commandParts.push("searchmoves", ...validSearchMoves);
    }

    return { command: commandParts.join(" "), isInfinite: false };
  }

  finishSearch() {
    this.clearInfiniteSearchGuards();
    if (!this.isEvaluating || this.hasRequestedStop || this.isFinishingSearch) return;
    this.isFinishingSearch = true;
    this.sendUciCommand("stop");
  }

  trackEvalStability(primaryCandidateMove, centipawns, mateInMoves) {
    if (!this.isInfiniteSearchActive || !getExtensionOption(EXTENSION_OPTION_KEY.GoEvalStable)) {
      return;
    }
    if (
      this.hasRequestedStop ||
      this.isFinishingSearch ||
      !primaryCandidateMove ||
      primaryCandidateMove.searchDepth < 10
    ) {
      return;
    }

    const boundedScoreCp =
      mateInMoves !== null ? (mateInMoves > 0 ? 10000 : -10000) : centipawns;
    if (boundedScoreCp === null || boundedScoreCp === undefined) return;

    if (!Array.isArray(this.evalStabilityHistory)) {
      this.evalStabilityHistory = [];
    }
    const latestEntry = this.evalStabilityHistory[this.evalStabilityHistory.length - 1];
    if (latestEntry && latestEntry.depth === primaryCandidateMove.searchDepth) {
      this.evalStabilityHistory[this.evalStabilityHistory.length - 1] = {
        depth: primaryCandidateMove.searchDepth,
        uciMove: primaryCandidateMove.uciMove,
        scoreCp: boundedScoreCp
      };
    } else if (!latestEntry || primaryCandidateMove.searchDepth > latestEntry.depth) {
      this.evalStabilityHistory.push({
        depth: primaryCandidateMove.searchDepth,
        uciMove: primaryCandidateMove.uciMove,
        scoreCp: boundedScoreCp
      });
      if (this.evalStabilityHistory.length > 3) {
        this.evalStabilityHistory.shift();
      }
    }

    if (this.evalStabilityHistory.length === 3) {
      const firstDepthMove = this.evalStabilityHistory[0].uciMove;
      const isSameBestMove = this.evalStabilityHistory.every(
        (depthSample) => depthSample.uciMove === firstDepthMove
      );
      const recentScoresCp = this.evalStabilityHistory.map((depthSample) => depthSample.scoreCp);
      const scoreSpreadCp = Math.max(...recentScoresCp) - Math.min(...recentScoresCp);
      if (isSameBestMove && scoreSpreadCp <= 15) {
        this.finishSearch();
      }
    }
  }

  startSearch() {
    this.onReady(() => {
      this.stopEvaluation(() => {
        if (this.isEvaluating) return;
        this.clearInfiniteSearchGuards();
        this.isFinishingSearch = false;
        this.isEvaluating = true;
        const { command, isInfinite } = this.buildGoCommand();
        this.isInfiniteSearchActive = isInfinite;
        this.sendUciCommand(command);
        if (isInfinite) {
          const infiniteTimeoutMs = getNonNegativeIntOption(
            EXTENSION_OPTION_KEY.GoInfiniteTimeout,
            0
          );
          if (infiniteTimeoutMs > 0) {
            this.infiniteSearchTimeoutId = setTimeout(() => {
              this.infiniteSearchTimeoutId = null;
              this.finishSearch();
            }, infiniteTimeoutMs);
          }
        }
      });
    });
  }

  handleDisconnect() {
    this.clearInfiniteSearchGuards();
    this.isEngineReady = false;
    this.isEngineLoaded = false;
    this.pendingReadyCount = 0;
    this.hasSentIsReady = false;
    this.appliedUciOptions = {};
    this.isEvaluating = false;
    this.hasRequestedStop = false;
    this.isFinishingSearch = false;
    this.staleBestMovesToIgnore = 0;
    this.pendingPositionUpdate = null;
    this.readyCallbacks = [];
    this.stopCompletionCallbacks = [];
    if (this.stopFallbackTimeoutId !== null) {
      clearTimeout(this.stopFallbackTimeoutId);
      this.stopFallbackTimeoutId = null;
    }
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

  sendIsReady() {
    if (!this.isEngineLoaded || !this.isWebSocketOpen() || this.hasSentIsReady) return;
    this.hasSentIsReady = true;
    this.pendingReadyCount = (this.pendingReadyCount || 0) + 1;
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
    this.clearInfiniteSearchGuards();
    if (!this.isEvaluating) {
      this.isFinishingSearch = false;
      if (typeof callback === "function") callback();
      return;
    }
    if (typeof callback === "function") {
      this.stopCompletionCallbacks.push(callback);
    }
    const hadAlreadySentStop = Boolean(this.isFinishingSearch);
    this.isFinishingSearch = false;
    if (!this.hasRequestedStop) {
      this.hasRequestedStop = true;
      if (!hadAlreadySentStop) {
        this.sendUciCommand("stop");
      }
      this.stopFallbackTimeoutId = setTimeout(() => {
        this.stopFallbackTimeoutId = null;
        if (this.hasRequestedStop) {
          this.staleBestMovesToIgnore = (this.staleBestMovesToIgnore || 0) + 1;
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

    if (getExtensionOption(EXTENSION_OPTION_KEY.FastForcedMoves) && legalMoves?.length === 1) {
      medianThinkMs *= getPositiveFloatOption(EXTENSION_OPTION_KEY.ForcedMultiplier, 0.15);
    } else if (
      getExtensionOption(EXTENSION_OPTION_KEY.FastRecaptures) &&
      lastPlayedMove &&
      bestCandidateMove &&
      bestCandidateMove.to === lastPlayedMove.to
    ) {
      medianThinkMs *= getPositiveFloatOption(EXTENSION_OPTION_KEY.RecaptureMultiplier, 0.25);
    } else if (getExtensionOption(EXTENSION_OPTION_KEY.FastOpening)) {
      const openingMoveThreshold = getPositiveFloatOption(
        EXTENSION_OPTION_KEY.OpeningMovesThreshold,
        10
      );
      const fullMoveNumber = parseInt((chessComGame.getFEN() || "").split(" ")[5], 10) || 1;
      if (fullMoveNumber <= openingMoveThreshold) {
        medianThinkMs *= getPositiveFloatOption(EXTENSION_OPTION_KEY.OpeningMultiplier, 0.40);
      }
    }

    if (getExtensionOption(EXTENSION_OPTION_KEY.ClockScaling)) {
      const remainingClockSeconds = getRemainingPlayerTimeSeconds();
      const clockThresholdSeconds = getPositiveFloatOption(
        EXTENSION_OPTION_KEY.ClockThreshold,
        180
      );
      if (remainingClockSeconds != null && remainingClockSeconds < clockThresholdSeconds) {
        const minClockMultiplier = getPositiveFloatOption(
          EXTENSION_OPTION_KEY.ClockMinMultiplier,
          0.20
        );
        medianThinkMs *= Math.max(
          minClockMultiplier,
          remainingClockSeconds / clockThresholdSeconds
        );
      }
    }

    const uniformSampleOne = Math.max(1e-7, Math.random());
    const uniformSampleTwo = Math.random();
    const standardNormalSample =
      Math.sqrt(-2.0 * Math.log(uniformSampleOne)) * Math.cos(2.0 * Math.PI * uniformSampleTwo);
    const logMedianDelayMs = Math.log(Math.max(50, medianThinkMs - physicalFloorMs));
    return Math.round(physicalFloorMs + Math.exp(logMedianDelayMs + timingSpread * standardNormalSample));
  }

  updatePosition(fen = null, isNewGame = true) {
    if (this.isSwitchingEngine) return;
    if (!this.isWebSocketOpen() || !this.isEngineLoaded) {
      this.reconnectNow();
      return;
    }
    const hadPendingPosition = this.pendingPositionUpdate !== null;
    this.pendingPositionUpdate = {
      fen,
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
        this.setPositionAndSearch(queuedPosition.fen, queuedPosition.isNewGame);
      });
    });
  }

  applyExtensionOptions(optionUpdates = {}) {
    if (Object.prototype.hasOwnProperty.call(optionUpdates, EXTENSION_OPTION_KEY.Depth)) {
      this.searchDepth = getNonNegativeIntOption(EXTENSION_OPTION_KEY.Depth, 15);
    }

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
      this.stopEvaluation(() => {
        if (this.supportedUciOptions.size === 0 || this.supportedUciOptions.has(buttonOptionName)) {
          this.sendUciCommand(`setoption name ${buttonOptionName}`);
          this.isEngineReady = false;
          this.hasSentIsReady = false;
        }
        if (this.extension && this.extension.gameController) {
          this.extension.gameController.updateEnginePosition(false);
        }
      });
      return;
    }

    const incomingUciOverrides = optionUpdates.customEngineOptions;
    if (incomingUciOverrides && typeof incomingUciOverrides === "object") {
      this.uciOptionOverrides = Object.assign({}, incomingUciOverrides);
      this.stopEvaluation(() => {
        this.applyUciOptions(this.uciOptionOverrides);
        if (this.extension && this.extension.gameController) {
          this.extension.gameController.updateEnginePosition(false);
        }
      });
      return;
    }

    if (optionUpdates.shouldStopSearch) {
      this.finishSearch();
      return;
    }

    const hasGoSettingsChanged = Object.keys(optionUpdates).some((optionKey) =>
      SEARCH_GO_OPTION_KEYS.has(optionKey)
    );

    if (hasGoSettingsChanged && this.extension && this.extension.gameController) {
      this.extension.gameController.updateEnginePosition(false);
      return;
    }

    if (this.candidateMoves.length > 0) {
      this.handleCandidateMoveUpdate(null, !this.isEvaluating);
    } else if (
      getExtensionOption(EXTENSION_OPTION_KEY.LegitAutoMove) &&
      !this.isEvaluating &&
      this.isWebSocketOpen() &&
      this.extension &&
      this.extension.gameController
    ) {
      this.extension.gameController.updateEnginePosition(false);
    }
  }

  applyUciOptions(uciOptionsMap = null) {
    const targetUciOptions = uciOptionsMap || this.uciOptionOverrides;
    if (!targetUciOptions || typeof targetUciOptions !== "object") return;
    if (!this.appliedUciOptions || typeof this.appliedUciOptions !== "object") {
      this.appliedUciOptions = {};
    }
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

      if (this.uciOptionDefaults?.has(previousOptionName)) {
        const defaultValue = this.uciOptionDefaults.get(previousOptionName);
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
      this.isEngineReady = false;
      this.hasSentIsReady = false;
    }
  }

  processEngineMessage(messageEvent) {
    const rawMessage =
      messageEvent && typeof messageEvent === "object" ? messageEvent.data : messageEvent;
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
        this.supportedUciOptions.add(parsedUciOption.name);
        if (parsedUciOption.hasDefault && this.uciOptionDefaults) {
          this.uciOptionDefaults.set(parsedUciOption.name, parsedUciOption.default);
        }
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
    } else if (typeof uciLine === "string" && uciLine.startsWith("info string Error:")) {
      this.fatalErrorMessage = uciLine.slice("info string ".length);
      console.error(`[BetterMint] ${this.fatalErrorMessage}`);
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
    } else if (typeof uciLine === "string" && uciLine.startsWith("info ")) {
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
      const multiPvMatch = uciLine.match(UciEngineClient.INFO_MULTIPV_RE);
      const isPrimaryPv = !multiPvMatch || parseInt(multiPvMatch[1], 10) === 1;

      const candidateMove = new CandidateMove(pvMatch[1], searchDepth, centipawns, mateInMoves);
      this.handleCandidateMoveUpdate(candidateMove, false);
      if (isPrimaryPv) {
        this.trackEvalStability(candidateMove, centipawns, mateInMoves);
      }
    } else if (typeof uciLine === "string" && uciLine.startsWith("bestmove ")) {
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
        this.clearInfiniteSearchGuards();
        this.isEvaluating = false;
        this.isFinishingSearch = false;
        const hadRequestedStop = this.hasRequestedStop;
        this.hasRequestedStop = false;

        const completionCallbacks = this.stopCompletionCallbacks;
        this.stopCompletionCallbacks = [];
        completionCallbacks.forEach((completionCallback) => completionCallback());

        const bestUciMove = bestMoveMatch[1];
        if (!hadRequestedStop && bestUciMove !== "(none)") {
          const existingIndex = this.candidateMoves.findIndex(
            (candidate) => candidate.uciMove === bestUciMove
          );

          if (existingIndex < 0) {
            console.warn(
              `The engine returned the best move "${bestUciMove}" but it's not in the top move list.`
            );
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

  setPositionAndSearch(fen = null, isNewGame = true) {
    const startSearchForPosition = () => {
      const isSamePosition = !isNewGame && fen !== null && fen === this.currentPositionFen;
      if (isNewGame) {
        this.previousPositionCandidateMoves = [];
        this.lastAutoMovedFen = null;
      } else if (!isSamePosition) {
        this.ensureCandidateMovesSorted();
        this.previousPositionCandidateMoves = this.candidateMoves;
        this.lastAutoMovedFen = null;
      }
      this.currentPositionFen = fen;
      this.candidateMoves = [];
      this.hasUnsortedCandidateMoves = false;
      if (fen !== null) this.sendUciCommand(`position fen ${fen}`);
      this.startSearch();
    };
    this.onReady(() => {
      if (isNewGame) {
        this.isEngineReady = false;
        this.hasSentIsReady = false;
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

    let moveQuality = null;
    if (this.previousPositionCandidateMoves.length > 0 && this.candidateMoves.length > 0) {
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

  ensureCandidateMovesSorted() {
    if (this.hasUnsortedCandidateMoves) {
      this.candidateMoves.sort(UciEngineClient.compareCandidateMoves);
      this.hasUnsortedCandidateMoves = false;
    }
    return this.candidateMoves;
  }

  handleCandidateMoveUpdate(candidateMove = null, isBestMove = false) {
    let hasSelectedBestMove = false;
    if (candidateMove !== null) {
      const existingIndex = this.candidateMoves.findIndex(
        (existingMove) => existingMove.uciMove === candidateMove.uciMove
      );
      if (existingIndex === -1) {
        this.candidateMoves.push(candidateMove);
        this.hasUnsortedCandidateMoves = true;
      } else if (
        !isBestMove &&
        candidateMove.searchDepth >= this.candidateMoves[existingIndex].searchDepth
      ) {
        this.candidateMoves[existingIndex] = candidateMove;
        this.hasUnsortedCandidateMoves = true;
      }
      if (isBestMove) hasSelectedBestMove = true;
    } else if (isBestMove && this.candidateMoves.length > 0) {
      hasSelectedBestMove = true;
    }

    const multiPvCount = Math.max(1, parseInt(this.uciOptionOverrides?.["MultiPV"], 10) || 1);

    if (!hasSelectedBestMove && candidateMove !== null) {
      if (this.extension?.gameController?.renderMoveHints) {
        const liveTopCandidates = [...this.candidateMoves]
          .sort(UciEngineClient.compareCandidateMoves)
          .slice(0, multiPvCount);
        this.extension.gameController.renderMoveHints(liveTopCandidates);
      }
      return;
    }

    this.ensureCandidateMovesSorted();
    if (hasSelectedBestMove && candidateMove !== null) {
      const bestMoveIndex = this.candidateMoves.indexOf(candidateMove);
      if (bestMoveIndex > 0) {
        this.candidateMoves.splice(bestMoveIndex, 1);
        this.candidateMoves.unshift(candidateMove);
      }
    }
    const topCandidateMoves = this.candidateMoves.slice(0, multiPvCount);

    if (topCandidateMoves.length > 0) {
      this.extension.gameController.renderMoveHints(topCandidateMoves);

      if (hasSelectedBestMove && getExtensionOption(EXTENSION_OPTION_KEY.MoveAnalysis)) {
        this.analyzeLastMove();
      }
    }

    if (hasSelectedBestMove && topCandidateMoves[0]) {
      this.scheduleAutoMove(topCandidateMoves[0]);
    }
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
      gameController.turnStartTimestampMs != null
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
    this.gameController = new GameController(this, chessboardElement);
    this.engineClient = new UciEngineClient(this);
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
      const targetBoardElement = pendingBoardElement || chessboardElement;
      try {
        fallbackExtensionOptions = loadedOptions;
        if (activeExtension) {
          attachBoardController(targetBoardElement);
        } else {
          activeExtension = new BetterMintExtension(targetBoardElement, loadedOptions);
        }
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
      const detectedBoard = document.querySelector("wc-chess-board, chess-board");
      if (detectedBoard && detectedBoard !== activeBoardElement) {
        watchForBoardGameReady(detectedBoard);
      }
    });
  };

  const boardObserver = new MutationObserver((mutationRecords) => {
    if (activeBoardElement?.isConnected || !hasAddedElementMutation(mutationRecords)) return;
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
    UciEngineClient,
    GameController,
    CandidateMove,
    EXTENSION_OPTION_KEY,
    resolveLegalMove,
    formatEvaluationDisplay,
    getEvalBarOffsetPx,
    setExtensionOptionsForTesting: (extensionOptions) => {
      fallbackExtensionOptions = extensionOptions;
    }
  };
}
})();
