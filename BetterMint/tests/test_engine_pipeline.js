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

console.log("Engine pipeline tests passed.");
