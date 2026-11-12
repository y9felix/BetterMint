const assert = require("assert");
const fs = require("fs");

const loaderSrc = fs.readFileSync("BetterMint/js/loader.js", "utf8");
const optionsSrc = fs.readFileSync("BetterMint/js/options.js", "utf8");

function extractKeys(src) {
  const match = src.match(/let inputObjects = \{([\s\S]*?)\};/);
  assert.ok(match, "inputObjects definition found");
  const keys = [];
  const re = /"([^"]+)":/g;
  let m;
  while ((m = re.exec(match[1])) !== null) {
    keys.push(m[1]);
  }
  return keys.sort();
}

const loaderKeys = extractKeys(loaderSrc);
const optionsKeys = extractKeys(optionsSrc);

assert.deepStrictEqual(loaderKeys, optionsKeys, "loader.js and options.js keys must match");

const expectedKeys = [
  "option-advanced-timing",
  "option-auto-queue",
  "option-clock-min-multiplier",
  "option-clock-scaling",
  "option-clock-threshold",
  "option-depth",
  "option-evaluation-bar",
  "option-fast-forced-moves",
  "option-fast-opening",
  "option-fast-recaptures",
  "option-forced-multiplier",
  "option-human-like-moves",
  "option-legit-auto-move",
  "option-move-analysis",
  "option-move-pace",
  "option-notifications",
  "option-opening-moves-threshold",
  "option-opening-multiplier",
  "option-physical-floor",
  "option-recapture-multiplier",
  "option-show-hints",
  "option-timing-spread",
  "option-url-api-stockfish"
].sort();

assert.deepStrictEqual(loaderKeys, expectedKeys, "Active keys must match expected pruned schema");
console.log("Schema tests passed.");
