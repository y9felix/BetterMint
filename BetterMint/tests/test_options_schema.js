const assert = require("assert");
const fs = require("fs");

const loaderPath = "BetterMint/js/loader.js";
assert.ok(fs.existsSync(loaderPath), "js/loader.js must exist");

const loaderSrc = fs.readFileSync(loaderPath, "utf8");
const optionsSrc = fs.readFileSync("BetterMint/js/options.js", "utf8");
const manifest = JSON.parse(fs.readFileSync("BetterMint/manifest.json", "utf8"));
const html = fs.readFileSync("BetterMint/html/options.html", "utf8");

const match = loaderSrc.match(/const DefaultExtensionOptions = \{([\s\S]*?)\};/);
assert.ok(match, "DefaultExtensionOptions declared in js/loader.js");
const keys = [...match[1].matchAll(/"([^"]+)":/g)].map((m) => m[1]).sort();

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
assert.ok(!optionsSrc.includes("inputObjects"), "options.js must not duplicate the defaults table");
assert.deepStrictEqual(manifest.content_scripts[0].js, ["js/loader.js"]);

const scriptOrder = [...html.matchAll(/<script src="\.\.\/js\/([^"]+)"/g)].map((m) => m[1]);
assert.ok(scriptOrder.indexOf("loader.js") < scriptOrder.indexOf("options.js"), "loader.js must load first");

for (const key of keys) {
  assert.ok(html.includes(`id="${key}"`), "No control for " + key);
}

console.log("Options schema tests passed.");
