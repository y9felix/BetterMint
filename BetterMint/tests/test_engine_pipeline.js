const assert = require("assert");
const fs = require("fs");

const src = fs.readFileSync("BetterMint/js/Mint.js", "utf8");

assert.ok(!src.includes("speechSynthesis"), "speechSynthesis should be completely removed");
assert.ok(!src.includes("initializeWorker"), "initializeWorker should be completely removed");
assert.ok(!src.includes("HighMateChance"), "HighMateChance should be removed");
assert.ok(!src.includes("RandomBestMove"), "RandomBestMove should be removed");
assert.ok(!src.includes("BestMoveChance"), "BestMoveChance should be removed");
assert.ok(!src.includes("MaxLegitAutoMoveDepth"), "MaxLegitAutoMoveDepth should be removed");

assert.ok(!src.includes('this.customEngineOptions = { "MultiPV": "1" };'), "MultiPV must not be hardcoded to 1");
assert.ok(src.includes("this.customEngineOptions?.MultiPV") || src.includes('this.customEngineOptions?.["MultiPV"]'), "MultiPV must be resolved dynamically");
assert.ok(!src.includes("requestAnimationFrame"), "requestAnimationFrame must remain removed from automove");

for (const gone of ["__awaiter", "ChromeRequest", "pathToEcoJson", "threadedEnginePaths", "isInTheory", "executeReadyCallbacks", "restartGame", "checkEventOne", "window.top_pv_moves", "getPlayingAs() {"]) {
  assert.ok(!src.includes(gone), gone + " must be removed");
}

assert.ok(!src.includes("RTCPeerConnection"), "WebRTC block must be removed");
assert.ok(!src.includes("iceServers"), "WebRTC config must be removed");
assert.ok(!src.includes("keypress"), "Global keypress listeners must be completely removed");
assert.ok(!src.includes("hotkeys ="), "hotkeys object must be completely removed");

assert.ok(src.trim().startsWith("(() => {") && src.trim().endsWith("})();"), "Mint.js must be encapsulated in an IIFE");
assert.ok(!src.includes("this.analysisToolsInterval = setInterval("), "CreateAnalysisTools must not use setInterval polling");

assert.ok(src.includes("const optionsPromise ="), "Startup options promise must be cached");
const requestCalls = src.match(/(?<!function\s)requestOptions\(\)/g) || [];
assert.strictEqual(requestCalls.length, 1, "requestOptions must only be called once via cached promise");

console.log("Engine pipeline tests passed.");
