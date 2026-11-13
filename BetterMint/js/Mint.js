"use strict";
var requestId = 0;
function requestOptions() {
  var id = requestId++;
  return new Promise(function (resolve) {
    var listener = function (evt) {
      if (evt.detail.requestId == id) {
        window.removeEventListener("BetterMintSendOptions", listener);
        resolve(evt.detail.data);
      }
    };
    window.addEventListener("BetterMintSendOptions", listener);
    window.dispatchEvent(
      new CustomEvent("BetterMintGetOptions", { detail: { id: id } })
    );
  });
}

function getGradientColor(start_color, end_color, percent) {
  // strip the leading # if it's there
  start_color = start_color.replace(/^\s*#|\s*$/g, "");
  end_color = end_color.replace(/^\s*#|\s*$/g, "");

  // convert 3 char codes --> 6, e.g. `E0F` --> `EE00FF`
  if (start_color.length == 3) {
    start_color = start_color.replace(/(.)/g, "$1$1");
  }

  if (end_color.length == 3) {
    end_color = end_color.replace(/(.)/g, "$1$1");
  }

  // get colors
  var start_red = parseInt(start_color.substr(0, 2), 16),
    start_green = parseInt(start_color.substr(2, 2), 16),
    start_blue = parseInt(start_color.substr(4, 2), 16);

  var end_red = parseInt(end_color.substr(0, 2), 16),
    end_green = parseInt(end_color.substr(2, 2), 16),
    end_blue = parseInt(end_color.substr(4, 2), 16);

  // calculate new color
  var diff_red = end_red - start_red;
  var diff_green = end_green - start_green;
  var diff_blue = end_blue - start_blue;

  diff_red = (diff_red * percent + start_red).toString(16).split(".")[0];
  diff_green = (diff_green * percent + start_green).toString(16).split(".")[0];
  diff_blue = (diff_blue * percent + start_blue).toString(16).split(".")[0];

  // ensure 2 digits by color
  if (diff_red.length == 1) diff_red = "0" + diff_red;
  if (diff_green.length == 1) diff_green = "0" + diff_green;
  if (diff_blue.length == 1) diff_blue = "0" + diff_blue;

  return "#" + diff_red + diff_green + diff_blue;
}

var enumOptions = {
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

// helper to parse remaining time for current player
function getRemainingPlayerTimeSeconds() {
  const selectors = [
    '.clock-component.clock-bottom',
    '.clock-button-component.clock-bottom',
    '.clock.clock-bottom',
    '.clock-bottom',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent) {
      const text = el.textContent.trim();
      // Extract time like 1:23, 10:15, 0:05, 1:02:15
      const match = text.match(/\d{1,2}(:\d{2}){1,2}/);
      if (!match) continue;
      const parts = match[0].split(':').map(Number);
      let seconds = 0;
      if (parts.length === 3) {
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        seconds = parts[0] * 60 + parts[1];
      } else if (parts.length === 1) {
        seconds = parts[0];
      }
      return seconds;
    }
  }
  return null;
}

var BetterMintmaster;

var tempOptions = {};
requestOptions().then(function (options) {
  tempOptions = options;
});
function getValueConfig(key) {
  if (BetterMintmaster == undefined) return tempOptions[key];
  return BetterMintmaster.options[key];
}

class TopMove {
  constructor(line, depth, cp, mate) {
    this.line = line.split(" ");
    this.move = this.line[0];
    this.promotion = this.move.length > 4 ? this.move.substring(4, 5) : null;
    this.from = this.move.substring(0, 2);
    this.to = this.move.substring(2, 4);
    this.cp = cp;
    this.mate = mate;
    this.depth = depth;
  }
}

class GameController {
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
    this.controller.on("Move", (event) => {
      if (this.autoMoveTimer !== null) {
        clearTimeout(this.autoMoveTimer);
        this.autoMoveTimer = null;
      }
      if (this.controller.getPlayingAs() === this.controller.getTurn()) {
        this.turnStartTime = performance.now();
      }
      this.UpdateEngine(false);
    });
    // check if a new game has started
    if (this.evalBar == null && getValueConfig(enumOptions.EvaluationBar)) {
      this.CreateAnalysisTools();
    }
    this.controller.on('ModeChanged', (event) => {
      if (event.data === "playing") {
        // Delay slightly to let chess.com update the board state before we read it
        setTimeout(() => {
          this.ResetGame();
          BetterMintmaster.game.RefreshEvalutionBar();
        }, 100);
      } else if (event.data === "gameOver") {
        this.handleGameOver();
      }
    });
    this.controller.on("RendererSet", (event) => {
      this.ResetGame();
      this.RefreshEvalutionBar();
    });
    this.controller.on("ResetGame", (event) => {
      // Defer slightly to let chess.com update the board visually first
      setTimeout(() => {
        this.UpdateEngine(true);
        this.RefreshEvalutionBar();
      }, 50);
    });

    this.controller.on("UpdateOptions", (event) => {
      this.options = this.controller.getOptions();
      if (event.data.flipped != undefined && this.evalBar != null) {
        if (event.data.flipped)
          this.evalBar.classList.add("evaluation-bar-flipped");
        else this.evalBar.classList.remove("evaluation-bar-flipped");
      }
      // handle auto queue toggle dynamically
      this.setupAutoQueueObserver();
    });

    this.lastAutoQueueClick = 0;
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

    const selectors = [
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
    ];

    const keywords = ["play again", "new opponent", "next game", "new game", "rematch", "new 1 min", "new 3 min", "new 5 min", "new 10 min", "new 15 min", "new 30 min", "new"];

    for (const sel of selectors) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0 && !el.disabled) {
          const text = el.textContent.trim().toLowerCase();
          if (keywords.some(kw => text.includes(kw))) {
            this.lastAutoQueueClick = now;
            this.dispatchButtonClick(el);
            return true;
          }
        }
      }
    }

    const fallbackButtons = document.querySelectorAll("button:not([disabled]), [role='button']:not([disabled])");
    for (const btn of fallbackButtons) {
      if (btn && btn.offsetWidth > 0 && btn.offsetHeight > 0) {
        const text = btn.textContent.trim().toLowerCase();
        if (text && (text === "new" || text === "play again" || text === "next game" || text === "rematch" || text.startsWith("new "))) {
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
    let attempts = 0;
    const intervalId = setInterval(() => {
      attempts++;
      if (attempts > 60 || this.triggerAutoQueue()) {
        clearInterval(intervalId);
      }
    }, 500);
  }
  UpdateExtensionOptions() {
    if (getValueConfig(enumOptions.EvaluationBar) && this.evalBar == null)
      this.CreateAnalysisTools();
    else if (
      !getValueConfig(enumOptions.EvaluationBar) &&
      this.evalBar != null
    ) {
      this.evalBar.remove();
      this.evalBar = null;
    }
    // Start or stop auto queue observer based on updated option
    this.setupAutoQueueObserver();
    if (!getValueConfig(enumOptions.ShowHints)) {
      this.RemoveCurrentMarkings();
    }
    if (!getValueConfig(enumOptions.MoveAnalysis)) {
      let lastMove = this.controller.getLastMove();
      if (lastMove) {
        this.controller.markings.removeOne(`effect|${lastMove.to}`);
      }
    }
  }
  CreateAnalysisTools() {
    // we must wait for a little bit because at this point the chessboard has not
    // been added to chessboard layout (#board-layout-main)
    let interval1 = setInterval(() => {
      let layoutChessboard = this.chessboard.parentElement;
      if (layoutChessboard == null) return;
      let layoutMain = layoutChessboard.parentElement;
      if (layoutMain == null) return;

      clearInterval(interval1);

      if (getValueConfig(enumOptions.EvaluationBar) && this.evalBar == null) {
        // create eval bar
        let evalBar = document.createElement("div");
        evalBar.style.flex = "1 1 auto;";
        evalBar.innerHTML = `
                <div class="evaluation-bar-bar">
                    <span class="evaluation-bar-scoreAbbreviated evaluation-bar-dark">0.0</span>
                    <span class="evaluation-bar-score evaluation-bar-dark ">+0.00</span>
                    <div class="evaluation-bar-fill">
                    <div class="evaluation-bar-color evaluation-bar-black"></div>
                    <div class="evaluation-bar-color evaluation-bar-draw"></div>
                    <div class="evaluation-bar-color evaluation-bar-white" style="transform: translate3d(0px, 50%, 0px);"></div>
                    </div>
                </div>`;
        let layoutEvaluation = layoutChessboard.querySelector(
          "#board-layout-evaluation"
        );
        if (layoutEvaluation == null) {
          layoutEvaluation = document.createElement("div");
          layoutEvaluation.classList.add("board-layout-evaluation");
          layoutChessboard.insertBefore(
            layoutEvaluation,
            layoutChessboard.firstElementChild
          );
        }
        layoutEvaluation.innerHTML = "";
        layoutEvaluation.appendChild(evalBar);
        this.evalBar = layoutEvaluation.querySelector(".evaluation-bar-bar");
        this.evalBarFill = layoutEvaluation.querySelector(
          ".evaluation-bar-white"
        );
        this.evalScore = layoutEvaluation.querySelector(
          ".evaluation-bar-score"
        );
        this.evalScoreAbbreviated = layoutEvaluation.querySelector(
          ".evaluation-bar-scoreAbbreviated"
        );
        if (!this.options.isWhiteOnBottom && this.options.flipped)
          this.evalBar.classList.add("evaluation-bar-flipped");
      }
    }, 10);
  }
  RefreshEvalutionBar(){
    // Rest evaluation bar
    if(getValueConfig(enumOptions.EvaluationBar)){
      if (this.evalBar == null){
        this.CreateAnalysisTools();
      } else if (this.evalBar != null) {
        this.evalBar.remove();
        this.evalBar = null;
        this.CreateAnalysisTools();
      }
    }
  }
  UpdateEngine(isNewGame) {
    let FENs = this.controller.getFEN();
    this.BetterMintmaster.engine.UpdatePosition(FENs, isNewGame);
  }
  ResetGame() {
    this.lastAutoQueueClick = 0;
    if (this.autoMoveTimer !== null) {
      clearTimeout(this.autoMoveTimer);
      this.autoMoveTimer = null;
    }
    this.options = this.controller.getOptions();
    if (this.controller.getPlayingAs() === this.controller.getTurn()) {
      this.turnStartTime = performance.now();
    }
    this.UpdateEngine(true);
    BetterMintmaster.game.RefreshEvalutionBar();
  }
  RemoveCurrentMarkings() {
    this.currentMarkings.forEach((marking) => {
      let key = marking.type + "|";
      if (marking.data.square != null) key += marking.data.square;
      else key += `${marking.data.from}${marking.data.to}`;
      this.controller.markings.removeOne(key);
    });
    this.currentMarkings = [];
  }
  HintMoves(topMoves, lastTopMoves, isBestMove) {
    let bestMove = topMoves[0];
    if (getValueConfig(enumOptions.ShowHints)) {
      this.RemoveCurrentMarkings();
      topMoves.forEach((move, idx) => {
        // isBestMove means final evaluation, don't include the moves that has less
        // depth than the best move
        if (isBestMove && move.depth != bestMove.depth) return;

        // Add fast check evalution
        if (idx != 0 && move.cp != null && move.mate == null) {
          let hlColor = getGradientColor(
            "#ff0000",
            "#0000ff",
            Math.min(((move.cp + 250) / 500) ** 4)
          );
          this.currentMarkings.push({
            data: {
              opacity: 0.4,
              color: hlColor,
              square: move.to,
            },
            node: true,
            persistent: true,
            type: "highlight",
          });
        }

        // Draw arror
        let color =
          idx == 0
            ? this.options.arrowColors.alt
            : idx >= 1 && idx <= 2
            ? this.options.arrowColors.shift
            : idx >= 3 && idx <= 5
            ? this.options.arrowColors.default
            : this.options.arrowColors.ctrl;
        this.currentMarkings.push({
          data: {
            from: move.from,
            color: color,
            opacity: 0.8,
            to: move.to,
          },
          node: true,
          persistent: true,
          type: "arrow",
        });
        if (move.mate != null) {
          this.currentMarkings.push({
            data: {
              square: move.to,
              type: move.mate < 0 ? "ResignWhite" : "WinnerWhite",
            },
            node: true,
            persistent: true,
            type: "effect",
          });
        }
      });
      // reverse the markings to make the best move arrow appear on top
      this.currentMarkings.reverse();
      this.controller.markings.addMany(this.currentMarkings);
    }
    if (getValueConfig(enumOptions.EvaluationBar)) {
      let score = bestMove.mate != null ? bestMove.mate : bestMove.cp;
      if (this.controller.getTurn() == 2) score *= -1;
      this.SetEvaluation(score, bestMove.mate != null);
    }
  }
  SetEvaluation(score, isMate) {
    if (this.evalBar == null) return;
    var percentage, textNumber, textScoreAbb;
    if (!isMate) {
      let eval_max = 500;
      let eval_min = -500;
      let smallScore = score / 100;
      percentage =
        90 - ((score - eval_min) / (eval_max - eval_min)) * (95 - 5) + 5;
      if (percentage < 5) percentage = 5;
      else if (percentage > 95) percentage = 95;
      textNumber = (score >= 0 ? "+" : "") + smallScore.toFixed(2);
      textScoreAbb = Math.abs(smallScore).toFixed(1);
    } else {
      percentage = score < 0 ? 100 : 0;
      textNumber = "M" + Math.abs(score).toString();
      textScoreAbb = textNumber;
    }
    this.evalBarFill.style.transform = `translate3d(0px, ${percentage}%, 0px)`;
    this.evalScore.innerText = textNumber;
    this.evalScoreAbbreviated.innerText = textScoreAbb;
    let classSideAdd =
      score >= 0 ? "evaluation-bar-dark" : "evaluation-bar-light";
    let classSideRemove =
      score >= 0 ? "evaluation-bar-light" : "evaluation-bar-dark";
    this.evalScore.classList.remove(classSideRemove);
    this.evalScoreAbbreviated.classList.remove(classSideRemove);
    this.evalScore.classList.add(classSideAdd);
    this.evalScoreAbbreviated.classList.add(classSideAdd);
  }
}

class StockfishEngine {
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
    this.depth = getValueConfig(enumOptions.Depth);
    this.currentUrl = getValueConfig(enumOptions.UrlApiStockfish);
    this.targetUrl = this.currentUrl;
    this.isSwitching = false;
    this.onEngineSwitchedCallback = null;
    this.engineUciOptions = {};
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
          oldWs.onopen = null;
          oldWs.onmessage = null;
          oldWs.onclose = null;
          oldWs.onerror = null;
          oldWs.close();
        } catch (e) {}
      }
      this.currentUrl = newUrl;
      this.ready = false;
      this.loaded = false;
      this.isSwitching = false;
      this.engineUciOptions = {};
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
    return this.stockfish && this.stockfish.readyState === WebSocket.OPEN;
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

    if (getValueConfig(enumOptions.FastForcedMoves) && legalMoves && legalMoves.length === 1) {
      const forcedMult = parseFloat(getValueConfig(enumOptions.ForcedMultiplier)) || 0.35;
      median *= forcedMult;
    } else if (getValueConfig(enumOptions.FastRecaptures) && lastMove && bestMove && bestMove.to === lastMove.to) {
      const recapMult = parseFloat(getValueConfig(enumOptions.RecaptureMultiplier)) || 0.50;
      median *= recapMult;
    } else if (getValueConfig(enumOptions.FastOpening)) {
      const openingThreshold = parseInt(getValueConfig(enumOptions.OpeningMovesThreshold), 10) || 8;
      const fenParts = controller.getFEN().split(" ");
      const fullMoveNumber = parseInt(fenParts[5], 10) || 1;
      if (fullMoveNumber <= openingThreshold) {
        const openingMult = parseFloat(getValueConfig(enumOptions.OpeningMultiplier)) || 0.35;
        median *= openingMult;
      }
    }

    if (getValueConfig(enumOptions.ClockScaling)) {
      const remainingSeconds = getRemainingPlayerTimeSeconds();
      const clockThreshold = parseInt(getValueConfig(enumOptions.ClockThreshold), 10) || 60;
      if (remainingSeconds !== null && remainingSeconds !== undefined && remainingSeconds < clockThreshold) {
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

  UpdateExtensionOptions(options) {
    if (options == null) options = {};
    let newUrl = options[enumOptions.UrlApiStockfish];
    if (newUrl && newUrl !== this.currentUrl) {
      this.switchEngine(newUrl);
      return;
    }
    let custom = options.customEngineOptions;
    if (custom && typeof custom === "object") {
      this.customEngineOptions = Object.assign(this.customEngineOptions, custom);
      this.UpdateOptions(this.customEngineOptions);
    }
    this.depth = getValueConfig(enumOptions.Depth);
    if (this.topMoves.length > 0) this.onTopMoves(null, !this.isEvaluating);
  }

  UpdateOptions(options = null) {
    let opts = options || this.customEngineOptions;
    if (!opts || typeof opts !== "object") return;
    Object.keys(opts).forEach((key) => {
      if (Object.keys(this.engineUciOptions).length === 0 || this.engineUciOptions[key]) {
        this.send(`setoption name ${key} value ${opts[key]}`);
      }
    });
  }
  ProcessMessage(event) {
    this.ready = false;
    let line = event && typeof event === "object" ? event.data : event;

    if (line && typeof line === "string" && line.startsWith("option name ")) {
      const rest = line.substring("option name ".length);
      const typeIndex = rest.indexOf(" type ");
      if (typeIndex !== -1) {
        const name = rest.substring(0, typeIndex).trim();
        const tokens = rest.substring(typeIndex + " type ".length).split(" ");
        const type = tokens[0];
        let defVal = "";
        let minVal = null;
        let maxVal = null;
        let vars = [];
        for (let i = 1; i < tokens.length; i++) {
          if (tokens[i] === "default") {
            i++;
            defVal = tokens[i] !== undefined ? tokens[i] : "";
          } else if (tokens[i] === "min") {
            i++;
            minVal = tokens[i] !== undefined ? parseInt(tokens[i], 10) : null;
          } else if (tokens[i] === "max") {
            i++;
            maxVal = tokens[i] !== undefined ? parseInt(tokens[i], 10) : null;
          } else if (tokens[i] === "var") {
            i++;
            if (tokens[i] !== undefined) vars.push(tokens[i]);
          }
        }
        this.engineUciOptions[name] = {
          type: type,
          default: defVal,
          min: minVal,
          max: maxVal,
          vars: vars
        };
        return;
      }
    }

    if (line === "uciok") {
      this.loaded = true;
      this.UpdateOptions();
      this.BetterMintmaster.onEngineLoaded();
    } else if (line === "readyok") {
      this.ready = true;
      if (this.readyCallbacks.length > 0) {
        let copy = this.readyCallbacks;
        this.readyCallbacks = [];
        copy.forEach(function (callback) {
          callback();
        });
      }
    } else if (this.isEvaluating && line === "Load eval file success: 1") {
      this.isEvaluating = false;
      this.isRequestedStop = false;
      if (this.goDoneCallbacks.length > 0) {
        let copy = this.goDoneCallbacks;
        this.goDoneCallbacks = [];
        copy.forEach(function (callback) {
          callback();
        });
      }
    } else {
      let depthMatch = line.match(/^info .*?depth (\d+)/);
      let scoreMatch = line.match(/^info .*?score (\w+) (-?\d+)/);
      let pvMatch = line.match(/^info .*?pv ([a-h][1-8][a-h][1-8][qrbn]?(?: [a-h][1-8][a-h][1-8][qrbn]?)*)(?: .*)?/);
      let bestMoveMatch = line.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)(?: ponder ([a-h][1-8][a-h][1-8][qrbn]?))?/);

      if (depthMatch && scoreMatch && pvMatch) {
        let depth = parseInt(depthMatch[1]);
        let scoreType = scoreMatch[1];
        let score = parseInt(scoreMatch[2]);
        let pv = pvMatch[1];

        let cpScore = scoreType === "cp" ? score : null;
        let mateScore = scoreType === "mate" ? score : null;

        if (!this.isRequestedStop) {
          let move = new TopMove(pv, depth, cpScore, mateScore);
          this.onTopMoves(move, false);
        }
      } else if (bestMoveMatch) {
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
          const ponderMove = bestMoveMatch[2];
          const index = this.topMoves.findIndex((object) => object.move === bestMove);

          if (index < 0) {
            console.warn(`The engine returned the best move "${bestMove}" but it's not in the top move list.`);
            let bestMoveOnTop = new TopMove(
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
    // let it go, let it gooo
    let go = () => {
      this.lastTopMoves = isNewGame ? [] : this.topMoves;
      this.lastMoveScore = null;
      this.topMoves = [];
      if (FENs != null) this.send(`position fen ${FENs}`);
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
    let lastMove = this.BetterMintmaster.game.controller.getLastMove();
    if (lastMove === undefined) return;
    if (this.lastTopMoves.length > 0) {
      let lastBestMove = this.lastTopMoves[0];
      // check if last move is the best move
      if (
        lastBestMove.from === lastMove.from &&
        lastBestMove.to === lastMove.to
      ) {
        this.lastMoveScore = "BestMove";
      } else {
        let bestMove = this.topMoves[0];
        if (lastBestMove.mate != null) {
          // if last move is losing mate, this move just escapes a mate
          // if last move is winning mate, this move is a missed win
          if (bestMove.mate == null) {
            this.lastMoveScore =
              lastBestMove.mate > 0 ? "MissedWin" : "Brilliant";
          } else {
            // both move are mate
            this.lastMoveScore =
              lastBestMove.mate > 0 ? "Excellent" : "ResignWhite";
          }
        } else if (bestMove.mate != null) {
          // brilliant if it found a mate, blunder if it moved into a mate
          this.lastMoveScore = bestMove.mate < 0 ? "Brilliant" : "Blunder";
        } else if (bestMove.cp != null && lastBestMove.cp != null) {
          let evalDiff = -(bestMove.cp + lastBestMove.cp);
          if (evalDiff > 100) this.lastMoveScore = "Brilliant";
          else if (evalDiff > 0) this.lastMoveScore = "GreatFind";
          else if (evalDiff > -10) this.lastMoveScore = "BestMove";
          else if (evalDiff > -25) this.lastMoveScore = "Excellent";
          else if (evalDiff > -50) this.lastMoveScore = "Good";
          else if (evalDiff > -100) this.lastMoveScore = "Inaccuracy";
          else if (evalDiff > -250) this.lastMoveScore = "Mistake";
          else this.lastMoveScore = "Blunder";
        } else {
          console.assert(false, "Error while analyzing last move");
        }
      }
    }
    // add highlight and effect
    if (this.lastMoveScore != null) {
      const highlightColors = {
        Brilliant: "#1baca6",
        GreatFind: "#5c8bb0",
        BestMove: "#9eba5a",
        Excellent: "#96bc4b",
        Good: "#96af8b",
        Inaccuracy: "#f0c15c",
        Mistake: "#e6912c",
        Blunder: "#b33430",
        MissedWin: "#dbac16",
      };
      let hlColor = highlightColors[this.lastMoveScore];
      if (hlColor != null) {
        this.BetterMintmaster.game.controller.markings.addOne({
          data: {
            opacity: 0.5,
            color: hlColor,
            square: lastMove.to,
          },
          node: true,
          persistent: true,
          type: "highlight",
        });
      }
      // this.BetterMintmaster.game.controller.markings.removeOne(`effect|${lastMove.to}`);
      this.BetterMintmaster.game.controller.markings.addOne({
        data: {
          square: lastMove.to,
          type: this.lastMoveScore,
        },
        node: true,
        persistent: true,
        type: "effect",
      });
    }
  }

  onTopMoves(move = null, isBestMove = false) {
    let bestMoveSelected = false;
    if (move != null) {
      const index = this.topMoves.findIndex(
        (object) => object.move === move.move
      );
      if (isBestMove) {
        bestMoveSelected = true;
        if (index === -1) {
          this.topMoves.push(move);
          this.SortTopMoves();
        }
      } else {
        if (index === -1) {
          this.topMoves.push(move);
          this.SortTopMoves();
        } else {
          if (move.depth >= this.topMoves[index].depth) {
            this.topMoves[index] = move;
            this.SortTopMoves();
          }
        }
      }
    }

    let top_pv_moves = this.topMoves.slice(0, 1);

    if (bestMoveSelected) {
      this.BetterMintmaster.game.HintMoves(
        top_pv_moves,
        this.lastTopMoves,
        isBestMove
      );

      if (getValueConfig(enumOptions.MoveAnalysis)) {
        this.AnalyzeLastMove();
      }
    }

    if (
      bestMoveSelected &&
      getValueConfig(enumOptions.LegitAutoMove) &&
      this.BetterMintmaster.game.controller.getPlayingAs() ===
        this.BetterMintmaster.game.controller.getTurn()
    ) {
      const bestMove = top_pv_moves[0];
      if (!bestMove) return;
      const legalMoves = this.BetterMintmaster.game.controller.getLegalMoves();
      const index = legalMoves.findIndex(
        (move) => move.from === bestMove.from && move.to === bestMove.to
      );
      console.assert(index !== -1, "Illegal best move");
      if (index === -1) return;
      const moveData = legalMoves[index];
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
          duration: (parseFloat(secondsTillAutoMove) + 1) * 1000,
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
          },
        });
      }

      const controller = this.BetterMintmaster.game.controller;
      if (this.BetterMintmaster.game.autoMoveTimer !== null) {
        clearTimeout(this.BetterMintmaster.game.autoMoveTimer);
        this.BetterMintmaster.game.autoMoveTimer = null;
      }

      if (remainingDelay <= 0) {
        controller.move(moveData);
      } else {
        this.BetterMintmaster.game.autoMoveTimer = setTimeout(() => {
          this.BetterMintmaster.game.autoMoveTimer = null;
          controller.move(moveData);
        }, remainingDelay);
      }
    }
  }
  SortTopMoves() {
    // sort the top move list to bring the best moves on top (index 0)
    this.topMoves.sort(function (a, b) {
      if (a.mate !== null && b.mate === null) {
        return a.mate < 0 ? 1 : -1;
      }
      if (a.mate === null && b.mate !== null) {
        return b.mate > 0 ? 1 : -1;
      }
      // both moves has no mate, compare the depth first than centipawn
      if (a.mate === null && b.mate === null) {
        if (a.depth === b.depth) {
          if (a.cp === b.cp) return 0;
          return a.cp > b.cp ? -1 : 1;
        }
        return a.depth > b.depth ? -1 : 1;
      }
      // If both are check mate

      if (a.mate < 0 && b.mate < 0) {
        if (a.line.length === b.line.length) return 0;
        return a.line.length < b.line.length ? 1 : -1;
      }
      if (a.mate > 0 && b.mate > 0) {
        if (a.line.length === b.line.length) return 0;
        return a.line.length > b.line.length ? 1 : -1;
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
        // Pass the updated options explicitly
        this.engine.UpdateExtensionOptions(this.options);

        // show a notification when the settings is updated, but only if the previous
        // notification has gone
        if (
          getValueConfig(enumOptions.Notifications) &&
          window.toaster &&
          window.toaster.notifications.findIndex(
            (noti) => noti.id == "BetterMint-settings-updated"
          ) == -1
        ) {
          window.toaster.add({
            id: "BetterMint-settings-updated",
            duration: 2000,
            icon: "circle-gearwheel",
            message: `Settings updated!`,
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
        content: `Mint V2.0 is enabled!`,
      });
    }
  }
}

function InitBetterMint(chessboard) {
  // Get the extension options
  requestOptions().then(function (options) {
    try {
      BetterMintmaster = new BetterMint(chessboard, options);

      // Add hotkeys
      document.addEventListener("keypress", function (e) {
        if (e.key === "q") {
          BetterMintmaster.game.controller.moveBackward();
        }
        if (e.key === "e") {
          BetterMintmaster.game.controller.moveForward();
        }
        if (e.key === "r") {
          BetterMintmaster.game.controller.resetGame();
        }
        if (e.key === "w") {
          BetterMintmaster.game.ResetGame();
          BetterMintmaster.game.RefreshEvalutionBar();
        }
      });
    } catch (e) {
      console.error("Oh noes! BetterMintmaster didn't load");
      console.error("Error details:", e);
      console.error("Stack:", e.stack);
    }
  });
}

const observer = new MutationObserver(async function (mutations) {
  mutations.forEach(async function (mutation) {
    mutation.addedNodes.forEach(async function (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName == "WC-CHESS-BOARD" || node.tagName == "CHESS-BOARD") {
          if (Object.hasOwn(node, "game")) {
            InitBetterMint(node);
            observer.disconnect();
          }
        }
      }
    })
  })
});

observer.observe(document, {
  childList: true,
  subtree: true
});
