const assert = require("assert");
const fs = require("fs");

const src = fs.readFileSync("BetterMint/js/Mint.js", "utf8");

assert.ok(!src.includes("speechSynthesis"), "speechSynthesis should be completely removed");
assert.ok(!src.includes("initializeWorker"), "initializeWorker should be completely removed");
assert.ok(!src.includes("HighMateChance"), "HighMateChance should be removed");
assert.ok(!src.includes("RandomBestMove"), "RandomBestMove should be removed");
assert.ok(!src.includes("BestMoveChance"), "BestMoveChance should be removed");
assert.ok(!src.includes("MaxLegitAutoMoveDepth"), "MaxLegitAutoMoveDepth should be removed");

assert.ok(src.includes('"MultiPV": "1"'), 'MultiPV must be locked to "1"');
assert.ok(!src.includes("requestAnimationFrame"), "requestAnimationFrame must remain removed from automove");

for (const gone of ["__awaiter", "ChromeRequest", "pathToEcoJson", "threadedEnginePaths", "isInTheory", "executeReadyCallbacks", "restartGame", "checkEventOne", "window.top_pv_moves", "getPlayingAs() {"]) {
  assert.ok(!src.includes(gone), gone + " must be removed");
}

console.log("Engine pipeline tests passed.");
