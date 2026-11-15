const assert = require("assert");
const path = require("path");
const {
  StockfishEngine,
  TopMove,
  enumOptions,
  resolveLegalMove,
  setOptionsForTesting
} = require(path.join(__dirname, "../js/Mint.js"));

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    this.listeners = {};
    this.sent = [];
  }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSED = 3;
global.WebSocket = MockWebSocket;

setOptionsForTesting({
  [enumOptions.UrlApiStockfish]: "ws://localhost:8000/ws",
  [enumOptions.Depth]: 10,
  [enumOptions.ShowHints]: true,
  [enumOptions.EvaluationBar]: false,
  [enumOptions.MoveAnalysis]: false,
  [enumOptions.LegitAutoMove]: false
});

let hintedMoves = [];
const masterMock = {
  options: {
    [enumOptions.UrlApiStockfish]: "ws://localhost:8000/ws",
    [enumOptions.Depth]: 10,
    [enumOptions.ShowHints]: true,
    customEngineOptions: { MultiPV: 2 }
  },
  onEngineLoaded: () => {},
  game: {
    HintMoves: (moves) => {
      hintedMoves = moves;
    },
    UpdateEngine: () => {},
    controller: {
      getPlayingAs: () => 1,
      getTurn: () => 2
    }
  }
};

const engine = new StockfishEngine(masterMock);
engine.loaded = true;
engine.ready = true;
engine.isEvaluating = true;

engine.UpdatePosition("fen_1", false);
engine.UpdatePosition("fen_2", true);
engine.UpdatePosition("fen_3", false);

assert.deepStrictEqual(
  engine.pendingPosition,
  { FENs: "fen_3", isNewGame: true },
  "UpdatePosition must coalesce intermediate FENs and preserve isNewGame=true"
);

engine.ProcessMessage("bestmove e2e4");
assert.strictEqual(engine.pendingPosition, null, "Coalesced position must flush once stop completes");
assert.ok(engine.stockfish.sent.includes("ucinewgame"), "Coalesced isNewGame must send ucinewgame");

engine.ProcessMessage("readyok");
assert.ok(engine.stockfish.sent.includes("position fen fen_3"), "Must send latest coalesced FEN");
assert.ok(engine.stockfish.sent.includes("go depth 10"), "Must start search for latest FEN");

engine.ProcessMessage("info depth 8 score cp 35 pv e2e4 e7e5");
engine.ProcessMessage("info depth 10 score cp 120 pv d2d4 d7d5");
engine.ProcessMessage("info depth 10 score mate 3 pv f1c4 e7e5 d1h5");
assert.strictEqual(engine.topMovesDirty, true, "topMovesDirty must be marked on new info lines");

const sorted = engine.ensureTopMovesSorted();
assert.strictEqual(engine.topMovesDirty, false);
assert.strictEqual(sorted[0].move, "f1c4", "Mate-in-3 must sort ahead of centipawn moves");
assert.strictEqual(sorted[1].move, "d2d4", "Depth 10 cp 120 must sort ahead of depth 8");

engine.ProcessMessage("bestmove f1c4");
assert.strictEqual(hintedMoves.length, 2, "MultiPV=2 must slice top 2 moves for hints");

const standardLegal = [
  { from: "e1", to: "g1", san: "O-O", flags: "k" },
  { from: "e1", to: "c1", san: "O-O-O", flags: "q" }
];
assert.strictEqual(
  resolveLegalMove(standardLegal, new TopMove("e1h1", 10, 0, null))?.to,
  "g1",
  "Chess960 king-takes-rook e1h1 must resolve to standard e1g1 castling"
);
assert.strictEqual(
  resolveLegalMove(standardLegal, new TopMove("e1a1", 10, 0, null))?.to,
  "c1",
  "Chess960 king-takes-rook e1a1 must resolve to standard e1c1 castling"
);

console.log("Engine pipeline tests passed.");
