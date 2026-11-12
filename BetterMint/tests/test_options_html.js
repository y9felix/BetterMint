const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("BetterMint/html/options.html", "utf8");

const expectedInputs = [
  "option-url-api-stockfish",
  "option-depth",
  "option-evaluation-bar",
  "option-show-hints",
  "option-move-analysis",
  "option-auto-queue",
  "option-notifications",
  "option-legit-auto-move",
  "option-human-like-moves",
  "option-move-pace",
  "option-advanced-timing",
  "option-physical-floor",
  "option-timing-spread",
  "option-fast-recaptures",
  "option-recapture-multiplier",
  "option-fast-forced-moves",
  "option-forced-multiplier",
  "option-fast-opening",
  "option-opening-moves-threshold",
  "option-opening-multiplier",
  "option-clock-scaling",
  "option-clock-threshold",
  "option-clock-min-multiplier"
];

for (const id of expectedInputs) {
  assert.ok(html.includes(`id="${id}"`), `Missing expected input: ${id}`);
}

const prunedInputs = [
  "option-api-stockfish",
  "option-num-cores",
  "option-hashtable-ram",
  "option-multipv",
  "option-highmatechance",
  "option-mate-finder-value",
  "option-text-to-speech",
  "option-best-move-chance",
  "option-random-best-move",
  "option-max-legit-auto-move-depth"
];

for (const id of prunedInputs) {
  assert.ok(!html.includes(`id="${id}"`), `Pruned input still present in HTML: ${id}`);
}

const cardCount = (html.match(/<section class="card">/g) || []).length;
assert.strictEqual(cardCount, 3, `Expected exactly 3 cards, found ${cardCount}`);

console.log("HTML structure tests passed.");
