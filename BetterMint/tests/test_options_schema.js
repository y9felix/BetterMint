const assert = require("assert");
const fs = require("fs");
const path = require("path");

const extRoot = path.join(__dirname, "..");
const { DefaultExtensionOptions } = require(path.join(extRoot, "js/loader.js"));
const manifest = JSON.parse(fs.readFileSync(path.join(extRoot, "manifest.json"), "utf8"));
const html = fs.readFileSync(path.join(extRoot, "html/options.html"), "utf8");

const keys = Object.keys(DefaultExtensionOptions).sort();

const expectedKeys = [
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

assert.deepStrictEqual(keys, expectedKeys, "Defaults must match the active key set");
assert.deepStrictEqual(manifest.content_scripts[0].js, ["js/loader.js"]);

const scriptOrder = [...html.matchAll(/<script src="\.\.\/js\/([^"]+)"/g)].map((m) => m[1]);
assert.ok(scriptOrder.indexOf("loader.js") < scriptOrder.indexOf("options.js"), "loader.js must load first");

for (const key of keys) {
  assert.ok(html.includes(`id="${key}"`), "No control for " + key);
}

console.log("Options schema tests passed.");
