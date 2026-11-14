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

assert.ok(html.includes('id="engine-options-details"'), "Missing engine-options-details element");
assert.ok(html.includes('id="advanced-timing-details"'), "Missing advanced-timing-details element");
assert.ok(!html.includes('id="option-advanced-timing"'), "Former toggle switch must be replaced by details");
assert.ok(!html.includes("data-min="), "options.html must not contain dead data-min attributes");
assert.ok(!html.includes("data-max="), "options.html must not contain dead data-max attributes");

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

const manifest = JSON.parse(fs.readFileSync("BetterMint/manifest.json", "utf8"));
const script = manifest.content_scripts[0];
assert.deepStrictEqual(script.css, ["css/evalbar.css"], "Only evalbar.css may be injected");
const refs = []
  .concat(script.js, script.css)
  .concat([manifest.action.default_popup])
  .concat(Object.values(manifest.icons));
for (const rel of refs) assert.ok(fs.existsSync("BetterMint/" + rel), "Missing manifest asset: " + rel);
for (const m of html.matchAll(/(?:href|src)="\.\.\/([^"]+)"/g)) {
  assert.ok(fs.existsSync("BetterMint/" + m[1]), "Missing page asset: " + m[1]);
}

console.log("HTML structure tests passed.");
