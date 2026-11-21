const assert = require("assert");
const path = require("path");
const {
  BetterMintExtension,
  UciEngineClient,
  EXTENSION_OPTION_KEY,
  setExtensionOptionsForTesting
} = require(path.join(__dirname, "../js/Mint.js"));

class MockWebSocket {
  constructor(engineUrl) {
    if (engineUrl.startsWith("invalid://")) {
      throw new Error("Invalid URL");
    }
    this.url = engineUrl;
    this.readyState = MockWebSocket.CONNECTING;
    this.listeners = {};
    this.sentMessages = [];
    this.isClosed = false;
    MockWebSocket.instances.push(this);
  }

  addEventListener(eventName, listener) {
    if (!this.listeners[eventName]) this.listeners[eventName] = [];
    this.listeners[eventName].push(listener);
  }

  send(messageText) {
    this.sentMessages.push(messageText);
  }

  close() {
    this.isClosed = true;
    this.readyState = MockWebSocket.CLOSED;
    this.trigger("close");
  }

  trigger(eventName, messagePayload) {
    const eventListeners = (this.listeners[eventName] || []).slice();
    eventListeners.forEach((listener) =>
      listener(messagePayload ? { data: messagePayload } : {})
    );
  }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.trigger("open");
  }
}
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSED = 3;
MockWebSocket.instances = [];

global.WebSocket = MockWebSocket;

setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/engineA",
  [EXTENSION_OPTION_KEY.Depth]: 3
});

function createEngineClient(extensionStub) {
  MockWebSocket.instances = [];
  return new UciEngineClient(extensionStub || {});
}

let enginePositionUpdateCount = 0;
const extensionStub = {
  gameController: {
    updateEnginePosition: () => {
      enginePositionUpdateCount++;
    }
  }
};

const engineClient = createEngineClient(extensionStub);
assert.ok(
  engineClient.supportedUciOptions instanceof Map,
  "supportedUciOptions must be a Map"
);
assert.strictEqual(MockWebSocket.instances.length, 1);
const initialSocket = MockWebSocket.instances[0];
assert.strictEqual(initialSocket.url, "ws://localhost:8000/engineA");

initialSocket.triggerOpen();
assert.deepStrictEqual(
  initialSocket.sentMessages,
  ["uci"],
  "isready must be deferred until after uciok"
);

engineClient.processEngineMessage("option name Hash type spin min 1 max 33554432 default 16");
assert.ok(engineClient.supportedUciOptions.has("Hash"));
assert.strictEqual(engineClient.supportedUciOptions.get("Hash"), "16");

engineClient.processEngineMessage("option name MultiPV type spin default 1 min 1 max 500");
assert.ok(engineClient.supportedUciOptions.has("MultiPV"));
assert.strictEqual(engineClient.supportedUciOptions.get("MultiPV"), "1");

engineClient.processEngineMessage(
  "option name Style type combo default Normal var Solid var Normal var Risky"
);
assert.ok(engineClient.supportedUciOptions.has("Style"));
assert.strictEqual(engineClient.supportedUciOptions.get("Style"), "Normal");

engineClient.processEngineMessage("option name Ponder type check default false");
assert.ok(engineClient.supportedUciOptions.has("Ponder"));
assert.strictEqual(engineClient.supportedUciOptions.get("Ponder"), "false");

engineClient.processEngineMessage("option name SyzygyPath type string default <empty>");
assert.ok(engineClient.supportedUciOptions.has("SyzygyPath"));
assert.strictEqual(engineClient.supportedUciOptions.get("SyzygyPath"), "");

engineClient.processEngineMessage(
  "option name PlayStyle type combo default Very Solid var Very Solid var Risk Taking"
);
assert.strictEqual(engineClient.supportedUciOptions.get("PlayStyle"), "Very Solid");

engineClient.processEngineMessage(
  "option name EvalFile type string default /opt/min max var/model.nnue"
);
assert.strictEqual(
  engineClient.supportedUciOptions.get("EvalFile"),
  "/opt/min max var/model.nnue"
);

assert.strictEqual(engineClient.supportedUciOptions.size, 7);
engineClient.processEngineMessage("option name Broken");
assert.strictEqual(
  engineClient.supportedUciOptions.size,
  7,
  "A line without a type token must be ignored"
);
engineClient.processEngineMessage("option name Clear Hash type button");
assert.ok(
  engineClient.supportedUciOptions.has("Clear Hash"),
  "Names with spaces must be kept whole"
);
assert.strictEqual(
  engineClient.supportedUciOptions.get("Clear Hash"),
  undefined,
  "Button options must not record a default"
);

engineClient.processEngineMessage("uciok");
assert.strictEqual(engineClient.isEngineLoaded, true);
assert.ok(
  initialSocket.sentMessages.includes("isready"),
  "isready must be sent once uciok completes"
);

engineClient.processEngineMessage("readyok");
assert.ok(
  initialSocket.sentMessages.includes("ucinewgame"),
  "First readyok must dispatch ucinewgame"
);
assert.strictEqual(
  engineClient.isEngineReady,
  false,
  "Engine must wait for second readyok after ucinewgame"
);

engineClient.processEngineMessage("readyok");
assert.strictEqual(
  engineClient.isEngineReady,
  true,
  "Second readyok after ucinewgame must mark engine ready"
);
assert.strictEqual(
  enginePositionUpdateCount,
  1,
  "Initial handshake must trigger updateEnginePosition after post-ucinewgame readyok"
);

enginePositionUpdateCount = 0;
engineClient.isEvaluating = true;
engineClient.switchEngine("ws://localhost:8000/engineB");

assert.strictEqual(engineClient.targetEngineUrl, "ws://localhost:8000/engineB");
assert.strictEqual(engineClient.isSwitchingEngine, true);
assert.ok(initialSocket.sentMessages.includes("stop"));
assert.strictEqual(
  MockWebSocket.instances.length,
  1,
  "New socket must not be created until evaluation stops"
);

engineClient.switchEngine("ws://localhost:8000/engineB");
assert.strictEqual(MockWebSocket.instances.length, 1);

engineClient.processEngineMessage("bestmove e2e4");
assert.strictEqual(engineClient.isEvaluating, false);
assert.strictEqual(MockWebSocket.instances.length, 2, "Second socket must now be initialized");

const switchedSocket = MockWebSocket.instances[1];
assert.strictEqual(switchedSocket.url, "ws://localhost:8000/engineB");
assert.strictEqual(initialSocket.isClosed, true);
assert.strictEqual(engineClient.currentEngineUrl, "ws://localhost:8000/engineB");
assert.strictEqual(engineClient.isEngineReady, false);
assert.strictEqual(engineClient.isEngineLoaded, false);

switchedSocket.triggerOpen();
assert.deepStrictEqual(
  switchedSocket.sentMessages,
  ["uci"],
  "Switched engine must defer isready until uciok"
);
engineClient.processEngineMessage("uciok");
assert.deepStrictEqual(switchedSocket.sentMessages, ["uci", "isready"]);
assert.strictEqual(
  enginePositionUpdateCount,
  0,
  "updateEnginePosition must not be called before ucinewgame"
);

engineClient.processEngineMessage("readyok");
assert.strictEqual(
  switchedSocket.sentMessages.filter((uciCommand) => uciCommand === "ucinewgame").length,
  1
);
assert.strictEqual(
  enginePositionUpdateCount,
  0,
  "updateEnginePosition must wait for readyok after ucinewgame"
);

engineClient.processEngineMessage("readyok");
assert.strictEqual(engineClient.isEngineReady, true);
assert.strictEqual(
  enginePositionUpdateCount,
  1,
  "updateEnginePosition must be called after post-ucinewgame readyok"
);

const reconnectAttemptsBeforeError = engineClient.reconnectAttempts;
switchedSocket.trigger("error", new Error("Simulated network blip"));
assert.strictEqual(
  engineClient.reconnectAttempts,
  reconnectAttemptsBeforeError,
  "Error event must not increment reconnectAttempts"
);

assert.doesNotThrow(() => {
  engineClient.initializeWebSocket("invalid://bad-scheme");
});
if (engineClient.reconnectTimerId !== null) {
  clearTimeout(engineClient.reconnectTimerId);
  engineClient.reconnectTimerId = null;
}

const unprobedClient = createEngineClient(extensionStub);
MockWebSocket.instances[0].triggerOpen();
unprobedClient.applyUciOptions({ Foo: 1 });
assert.ok(
  MockWebSocket.instances[0].sentMessages.includes("setoption name Foo value 1"),
  "Empty option set must forward custom options"
);

const midSearchClient = createEngineClient(extensionStub);
MockWebSocket.instances[0].triggerOpen();
midSearchClient.isEvaluating = true;
let hasRestartedSearch = false;
extensionStub.gameController.updateEnginePosition = () => {
  hasRestartedSearch = true;
};

midSearchClient.applyExtensionOptions({ customEngineOptions: { MultiPV: 3 } });
assert.strictEqual(
  MockWebSocket.instances[0].sentMessages.includes("stop"),
  true,
  "Must issue stop before setoption mid-evaluation"
);
assert.strictEqual(hasRestartedSearch, false, "Must not restart engine before stop finishes");

midSearchClient.processEngineMessage("bestmove (none)");
assert.strictEqual(
  midSearchClient.isEvaluating,
  false,
  "bestmove (none) must reset isEvaluating to false"
);
assert.strictEqual(hasRestartedSearch, true, "Must restart engine evaluation after options applied");

const reconnectClient = createEngineClient(extensionStub);
for (let attemptIndex = 0; attemptIndex < 6; attemptIndex++) {
  MockWebSocket.instances[MockWebSocket.instances.length - 1].close();
  assert.ok(
    reconnectClient.reconnectTimerId !== null,
    `Must keep scheduling reconnect after attempt ${attemptIndex + 1}`
  );
  clearTimeout(reconnectClient.reconnectTimerId);
  reconnectClient.reconnectTimerId = null;
  reconnectClient.initializeWebSocket("ws://localhost:8000/engineA");
}
assert.strictEqual(reconnectClient.reconnectAttempts, 6);

MockWebSocket.instances[MockWebSocket.instances.length - 1].close();
assert.ok(reconnectClient.reconnectTimerId !== null);
const socketCountBeforeWake = MockWebSocket.instances.length;
reconnectClient.updatePosition(
  {
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    positionCommand: "position startpos"
  },
  false
);
assert.strictEqual(
  MockWebSocket.instances.length,
  socketCountBeforeWake + 1,
  "updatePosition while disconnected must trigger reconnectNow"
);
assert.strictEqual(reconnectClient.reconnectTimerId, null);

const crashLoopClient = createEngineClient(extensionStub);
for (let crashIndex = 0; crashIndex < 3; crashIndex++) {
  const socket = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  socket.triggerOpen();
  socket.close();
  clearTimeout(crashLoopClient.reconnectTimerId);
  crashLoopClient.reconnectTimerId = null;
  crashLoopClient.initializeWebSocket("ws://localhost:8000/engineA");
}
assert.strictEqual(
  crashLoopClient.reconnectAttempts,
  3,
  "Opening socket without uciok must not reset reconnectAttempts during a crash loop"
);

const healthySocket = MockWebSocket.instances[MockWebSocket.instances.length - 1];
healthySocket.triggerOpen();
crashLoopClient.processEngineMessage("uciok");
assert.strictEqual(
  crashLoopClient.reconnectAttempts,
  0,
  "Successful uciok handshake must reset reconnectAttempts"
);

crashLoopClient.processEngineMessage("info string Error: Engine binary 'bad' not found");
healthySocket.close();
assert.strictEqual(crashLoopClient.fatalErrorMessage, "Error: Engine binary 'bad' not found");
assert.strictEqual(
  crashLoopClient.reconnectTimerId,
  null,
  "Fatal engine error must prevent background reconnect loop"
);

const socketCountBeforeManualRecovery = MockWebSocket.instances.length;
crashLoopClient.reconnectNow();
assert.strictEqual(crashLoopClient.fatalErrorMessage, null);
assert.strictEqual(
  MockWebSocket.instances.length,
  socketCountBeforeManualRecovery + 1,
  "Manual reconnectNow must clear fatalErrorMessage and retry"
);

const profileSwitchClient = createEngineClient(extensionStub);
MockWebSocket.instances[0].triggerOpen();
setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/engineA",
  [EXTENSION_OPTION_KEY.Depth]: 16
});
profileSwitchClient.applyExtensionOptions({
  [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/engineA",
  [EXTENSION_OPTION_KEY.Depth]: 16,
  customEngineOptions: {}
});
assert.strictEqual(
  profileSwitchClient.buildGoCommand(),
  "go depth 16",
  "Same-URL profile switch must use updated depth even when customEngineOptions is present"
);
assert.deepStrictEqual(
  profileSwitchClient.uciOptionOverrides,
  {},
  "Profile switch must replace previous uciOptionOverrides cleanly"
);

setExtensionOptionsForTesting({
  [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/sync",
  [EXTENSION_OPTION_KEY.Depth]: 16
});
let syncedPositionUpdateCount = 0;
const syncExtensionStub = {
  extensionOptions: {
    [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/sync",
    customEngineOptions: { MultiPV: 3, Threads: 4, Ponder: true, Style: "Risky", SyzygyPath: "/tb" }
  },
  gameController: {
    chessComGame: {
      getMode: () => "playing",
      getFEN: () => "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    },
    updateEnginePosition: () => {
      syncedPositionUpdateCount++;
    }
  }
};
const syncEngineClient = createEngineClient(syncExtensionStub);
const syncSocket = MockWebSocket.instances[0];
syncSocket.triggerOpen();
syncEngineClient.processEngineMessage("option name MultiPV type spin default 1 min 1 max 500");
syncEngineClient.processEngineMessage("option name Threads type spin default 1 min 1 max 512");
syncEngineClient.processEngineMessage("option name Ponder type check default false");
syncEngineClient.processEngineMessage(
  "option name Style type combo default Normal var Solid var Normal var Risky"
);
syncEngineClient.processEngineMessage("option name SyzygyPath type string default <empty>");
syncEngineClient.processEngineMessage("uciok");
syncEngineClient.processEngineMessage("readyok");
assert.strictEqual(
  syncedPositionUpdateCount,
  0,
  "Initial updateEnginePosition must wait for post-ucinewgame readyok"
);
syncEngineClient.processEngineMessage("readyok");
assert.strictEqual(syncEngineClient.isEngineReady, true);
assert.strictEqual(syncedPositionUpdateCount, 1);

syncSocket.sentMessages.length = 0;
syncEngineClient.applyExtensionOptions({
  [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/sync",
  customEngineOptions: { Threads: 2 }
});

assert.ok(
  syncSocket.sentMessages.includes("setoption name MultiPV value 1"),
  "Omitted MultiPV must reset to default 1"
);
assert.ok(
  syncSocket.sentMessages.includes("setoption name Ponder value false"),
  "Omitted Ponder must reset to default false"
);
assert.ok(
  syncSocket.sentMessages.includes("setoption name Style value Normal"),
  "Omitted Style must reset to default Normal"
);
assert.ok(
  syncSocket.sentMessages.includes("setoption name SyzygyPath value"),
  "Omitted SyzygyPath must reset to empty string default"
);
assert.ok(
  syncSocket.sentMessages.includes("setoption name Threads value 2"),
  "Remaining Threads option must update to 2"
);
assert.strictEqual(
  syncEngineClient.isEngineReady,
  false,
  "Resetting options must mark engine unready until next isready/readyok"
);

syncSocket.sentMessages.length = 0;
syncEngineClient.applyExtensionOptions({
  [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/sync",
  customEngineOptions: {}
});
assert.deepStrictEqual(
  syncSocket.sentMessages,
  ["setoption name Threads value 1"],
  "Switching to empty preset must only reset remaining Threads override without re-sending already-reset options"
);

profileSwitchClient.isEvaluating = true;
profileSwitchClient.switchEngine("ws://localhost:8000/engineB");
assert.strictEqual(profileSwitchClient.targetEngineUrl, "ws://localhost:8000/engineB");
profileSwitchClient.applyExtensionOptions({
  [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/engineA",
  customEngineOptions: {}
});
assert.strictEqual(
  profileSwitchClient.targetEngineUrl,
  "ws://localhost:8000/engineA",
  "Switching back to currentEngineUrl while another switch is in-flight must update targetEngineUrl"
);

const overlapReadyClient = createEngineClient(extensionStub);
const overlapSocket = MockWebSocket.instances[0];
overlapSocket.triggerOpen();
overlapSocket.sentMessages.length = 0;
overlapReadyClient.processEngineMessage("uciok");
let overlapCallbackRan = false;
overlapReadyClient.onReady(() => {
  overlapCallbackRan = true;
});
overlapReadyClient.applyUciOptions({ Foo: 1 });
overlapReadyClient.sendIsReady();
assert.strictEqual(overlapReadyClient.pendingReadyCount, 2);
assert.strictEqual(overlapSocket.sentMessages.filter((cmd) => cmd === "isready").length, 2);
overlapReadyClient.processEngineMessage("readyok");
assert.strictEqual(overlapReadyClient.pendingReadyCount, 1);
assert.strictEqual(overlapCallbackRan, false);
assert.strictEqual(
  overlapSocket.sentMessages.filter((cmd) => cmd === "isready").length,
  2,
  "Intermediate readyok must wait without sending extra isready"
);
overlapReadyClient.processEngineMessage("readyok");
assert.strictEqual(overlapReadyClient.pendingReadyCount, 1);
assert.strictEqual(overlapCallbackRan, false);
overlapReadyClient.processEngineMessage("readyok");
assert.strictEqual(overlapReadyClient.pendingReadyCount, 0);
assert.strictEqual(overlapCallbackRan, true);

// Overlapping updatePosition + switchEngine must not leak isEvaluating onto the next engine
const raceClient = createEngineClient(extensionStub);
const raceSocketA = MockWebSocket.instances[0];
raceSocketA.triggerOpen();
raceClient.processEngineMessage("uciok\r\n");
raceClient.processEngineMessage("readyok\nreadyok\r\n");
assert.strictEqual(raceClient.isEngineReady, true, "Multi-line/CRLF frames must advance handshake");

raceClient.isEvaluating = true;
raceClient.updatePosition(
  {
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    positionCommand: "position startpos moves e2e4"
  },
  false
);
raceClient.switchEngine("ws://localhost:8000/raceB");
raceClient.switchEngine("ws://localhost:8000/raceC");
const socketsBeforeBestmove = MockWebSocket.instances.length;
raceClient.processEngineMessage("bestmove e2e4");
assert.strictEqual(
  MockWebSocket.instances.length,
  socketsBeforeBestmove + 1,
  "Superseded intermediate switchEngine target must not spawn an extra WebSocket"
);
const raceSocketC = MockWebSocket.instances[MockWebSocket.instances.length - 1];
assert.strictEqual(raceSocketC.url, "ws://localhost:8000/raceC");
assert.strictEqual(
  raceClient.isEvaluating,
  false,
  "Switching engine must reset isEvaluating cleanly even when position updates overlapped"
);

const sameUrlReconnectClient = createEngineClient(extensionStub);
const reconnectSocket1 = MockWebSocket.instances[0];
reconnectSocket1.triggerOpen();
sameUrlReconnectClient.processEngineMessage("option name StockfishOnly type spin default 1 min 1 max 10");
sameUrlReconnectClient.processEngineMessage("uciok");
assert.strictEqual(sameUrlReconnectClient.supportedUciOptions.has("StockfishOnly"), true);
sameUrlReconnectClient.uciOptionOverrides = { StockfishOnly: 5, CommonOpt: 2 };
reconnectSocket1.close();
if (sameUrlReconnectClient.reconnectTimerId !== null) {
  clearTimeout(sameUrlReconnectClient.reconnectTimerId);
  sameUrlReconnectClient.reconnectTimerId = null;
}
sameUrlReconnectClient.initializeWebSocket("ws://localhost:8000/engineA");
const reconnectSocket2 = MockWebSocket.instances[1];
reconnectSocket2.triggerOpen();
assert.strictEqual(
  sameUrlReconnectClient.supportedUciOptions.size,
  0,
  "Reconnecting to the same URL must clear stale supportedUciOptions from the previous engine"
);
sameUrlReconnectClient.processEngineMessage("option name CommonOpt type spin default 1 min 1 max 10");
sameUrlReconnectClient.processEngineMessage("uciok");
assert.strictEqual(
  reconnectSocket2.sentMessages.includes("setoption name StockfishOnly value 5"),
  false,
  "Reconnected engine must not receive unsupported options from prior session"
);
assert.strictEqual(
  reconnectSocket2.sentMessages.includes("setoption name CommonOpt value 2"),
  true,
  "Reconnected engine must receive supported options"
);

let serializedPosCalls = 0;
const serializedExtensionStub = {
  gameController: {
    updateEnginePosition: () => {
      serializedPosCalls++;
    }
  }
};
const serializedClient = createEngineClient(serializedExtensionStub);
const serializedSocket = MockWebSocket.instances[0];
serializedSocket.triggerOpen();
serializedClient.processEngineMessage("option name MultiPV type spin default 1 min 1 max 500");
serializedClient.processEngineMessage("uciok");
serializedClient.processEngineMessage("readyok");
serializedClient.processEngineMessage("readyok");
serializedSocket.sentMessages.length = 0;
serializedPosCalls = 0;

serializedClient.isEvaluating = true;
serializedClient.updatePosition(
  {
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    positionCommand: "position startpos moves e2e4"
  },
  false
);
serializedClient.applyExtensionOptions({ customEngineOptions: { MultiPV: 3 } });
serializedClient.processEngineMessage("bestmove e2e4");
assert.strictEqual(
  serializedSocket.sentMessages.some((cmd) => cmd.startsWith("setoption name MultiPV")),
  false,
  "Must not send setoption while coalesced updatePosition immediately started a new search"
);
assert.strictEqual(
  serializedSocket.sentMessages.filter((cmd) => cmd === "stop").length,
  2,
  "Deferred setoption callback must issue a follow-up stop when another search started first"
);
serializedClient.processEngineMessage("bestmove e7e5");
assert.strictEqual(
  serializedSocket.sentMessages.includes("setoption name MultiPV value 3"),
  true,
  "setoption must be sent once follow-up search finishes"
);
assert.strictEqual(serializedPosCalls, 1, "Must re-evaluate position after deferred setoption");

const prevWindow = global.window;
global.window = { addEventListener: () => {}, removeEventListener: () => {} };
setExtensionOptionsForTesting({});
MockWebSocket.instances = [];
const bootExtension = new BetterMintExtension(
  {
    game: {
      getOptions: () => ({ flipped: false }),
      getPlayingAs: () => 1,
      getTurn: () => 1,
      getFEN: () => "startpos",
      getLastMove: () => null,
      markings: { removeOne: () => {}, addOne: () => {}, addMany: () => {} },
      on: () => {}
    }
  },
  {
    [EXTENSION_OPTION_KEY.EngineWebSocketUrl]: "ws://localhost:8000/ws/boot",
    [EXTENSION_OPTION_KEY.EvaluationBar]: false,
    [EXTENSION_OPTION_KEY.AutoQueue]: false
  }
);
assert.strictEqual(
  MockWebSocket.instances.length,
  1,
  "BetterMintExtension constructor must immediately open a WebSocket"
);
assert.strictEqual(
  MockWebSocket.instances[0].url,
  "ws://localhost:8000/ws/boot",
  "BetterMintExtension constructor must pass configured URL rather than undefined"
);
assert.strictEqual(bootExtension.engineClient.currentEngineUrl, "ws://localhost:8000/ws/boot");
bootExtension.gameController.destroy();
global.window = prevWindow;

const socketsBeforeEmptyUrl = MockWebSocket.instances.length;
serializedClient.initializeWebSocket(undefined);
serializedClient.initializeWebSocket("");
assert.strictEqual(
  MockWebSocket.instances.length,
  socketsBeforeEmptyUrl,
  "initializeWebSocket must not construct WebSocket for undefined or empty URL"
);

const nullMoveWarnings = [];
const originalWarn = console.warn;
console.warn = (...warnArgs) => nullMoveWarnings.push(warnArgs.join(" "));
let nullMoveHintCalls = 0;
const nullMoveClient = createEngineClient({
  gameController: {
    renderMoveHints: () => {
      nullMoveHintCalls++;
    },
    updateEnginePosition: () => {}
  }
});
nullMoveClient.isEvaluating = true;
nullMoveClient.processEngineMessage("bestmove a1a1");
assert.strictEqual(nullMoveClient.isEvaluating, false, "bestmove a1a1 must clear isEvaluating");
nullMoveClient.isEvaluating = true;
nullMoveClient.processEngineMessage("bestmove 0000");
assert.strictEqual(nullMoveClient.isEvaluating, false, "bestmove 0000 must clear isEvaluating");
console.warn = originalWarn;
assert.strictEqual(
  nullMoveWarnings.length,
  0,
  "Null bestmoves (a1a1 / 0000) must not emit top-move-list warnings"
);
assert.strictEqual(
  nullMoveHintCalls,
  0,
  "Null bestmoves (a1a1 / 0000) must not push fake moves to renderMoveHints"
);

console.log("All live engine switching behavioral tests passed.");
