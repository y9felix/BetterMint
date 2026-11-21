const assert = require("assert");
const fs = require("fs");
const path = require("path");

const extRoot = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(extRoot, "html/options.html"), "utf8");

const expectedInputs = [
  "option-url-api-stockfish",
  "option-depth",
  "option-go-movetime",
  "option-go-nodes",
  "option-evaluation-bar",
  "option-show-hints",
  "option-move-analysis",
  "option-auto-queue",
  "option-rematch-first",
  "option-legit-auto-move",
  "option-human-like-moves",
  "option-move-pace",
  "option-physical-floor",
  "option-timing-spread",
  "option-reflex-multiplier",
  "option-opening-moves-threshold",
  "option-opening-multiplier",
  "option-clock-threshold"
];

for (const id of expectedInputs) {
  assert.ok(html.includes(`id="${id}"`), `Missing expected input: ${id}`);
}

assert.ok(html.includes('id="go-command-details"'), "Missing go-command-details element");
assert.ok(html.includes('id="engine-options-details"'), "Missing engine-options-details element");
assert.ok(html.includes('id="advanced-timing-details"'), "Missing advanced-timing-details element");
assert.ok(!html.includes('id="option-advanced-timing"'), "Former toggle switch must be replaced by details");
assert.ok(!html.includes("data-min="), "options.html must not contain dead data-min attributes");
assert.ok(!html.includes("data-max="), "options.html must not contain dead data-max attributes");

const goIdx = html.indexOf('id="go-command-details"');
const depthIdx = html.indexOf('id="option-depth"');
const uciIdx = html.indexOf('id="engine-options-details"');
assert.ok(goIdx !== -1 && depthIdx !== -1 && uciIdx !== -1, "Missing Engine Server disclosure sections");
assert.ok(goIdx < depthIdx && depthIdx < uciIdx, "Search Depth must live inside Search Options menu before UCI Options");
assert.ok(html.includes(">Search Options<"), "Missing Search Options summary label");
assert.ok(html.includes(">UCI Options<"), "Missing UCI Options summary label");
assert.ok(html.includes('id="option-depth" type="range" min="0" max="50"'), "Search Depth slider must allow 0 (Off) through 50");
const searchSection = html.slice(goIdx, uciIdx);
for (const [id, step] of [
  ["option-depth", "1"],
  ["option-go-movetime", "50"],
  ["option-go-nodes", "10000"]
]) {
  assert.ok(
    new RegExp(`id="${id}"[^>]*step="${step}"`).test(searchSection),
    `Search Options slider ${id} must restore step="${step}"`
  );
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
  "option-max-legit-auto-move-depth",
  "option-notifications",
  "option-go-mate",
  "option-go-searchmoves",
  "option-go-clock-sync",
  "option-go-clock-inc",
  "option-go-movestogo",
  "option-go-infinite",
  "option-go-infinite-timeout",
  "option-go-eval-stable",
  "go-stop-btn",
  "option-fast-recaptures",
  "option-recapture-multiplier",
  "option-fast-forced-moves",
  "option-forced-multiplier",
  "option-fast-opening",
  "option-clock-scaling",
  "option-clock-min-multiplier",
  "go-command-preview",
  "config-menu",
  "config-action-load",
  "config-action-save",
  "config-load-panel",
  "config-save-panel",
  "config-action-import",
  "config-action-export",
  "config-import-input"
];

for (const id of prunedInputs) {
  assert.ok(!html.includes(`id="${id}"`), `Pruned element still present in HTML: ${id}`);
}

const cardCount = (html.match(/<section class="card">/g) || []).length;
assert.strictEqual(cardCount, 3, `Expected exactly 3 cards, found ${cardCount}`);

assert.ok(html.includes('id="theme-toggle"'), "Missing theme-toggle button");
assert.ok(html.includes('id="config-toggle"'), "Missing config-toggle gear button");
assert.ok(html.includes('id="config-popover"'), "Missing config-popover element");
assert.ok(html.includes('id="config-save-name"'), "Missing config-save-name input");
assert.ok(html.includes('id="config-save-confirm"'), "Missing config-save-confirm button");
assert.ok(html.includes('id="config-load-list"'), "Missing config-load-list container");
assert.ok(html.includes('id="option-physical-floor" type="range" min="50" max="1000"'), "Physical floor max must accommodate 600ms default");
assert.ok(html.includes('id="option-clock-threshold" type="range" min="0" max="300"'), "Clock threshold must allow 0 (Off) through 300s");
assert.ok(html.includes('id="option-opening-moves-threshold" type="range" min="0" max="15"'), "Opening moves must allow 0 (Off) through 15");
assert.ok(html.includes('id="option-move-pace" type="range" min="0.5" max="30.0" step="0.05"'), "Move pace step must support 0.05s precision");
assert.ok(html.includes('class="footer-actions"'), "Missing footer-actions wrapper");
const css = fs.readFileSync(path.join(extRoot, "css/options.css"), "utf8");
assert.ok(css.includes('[data-theme="dark"]'), "Missing dark theme CSS variables");
assert.ok(css.includes('[data-theme="light"]'), "Missing light theme CSS variables");
assert.ok(css.includes('[data-theme="black"]'), "Missing black theme CSS variables");
assert.ok(css.includes('[data-theme="chesscom"]'), "Missing chesscom theme CSS variables");
assert.ok(html.includes('>Auto Queue<'), "Missing Auto Queue label");
assert.ok(html.includes('id="auto-queue-group"'), "Missing auto-queue-group wrapper");
assert.ok(html.includes('>Rematch first<'), "Missing Rematch first label");
assert.ok(!html.includes("Auto Queue New Game"), "Old Auto Queue New Game label must be renamed");
assert.ok(html.includes(">Engine<"), "First section must be titled Engine");
assert.ok(html.includes(">Display<"), "Second section must be titled Display");
assert.ok(html.includes(">Automation<"), "Third section must be titled Automation");
assert.ok(!html.includes(">Auto Move Pacing<"), "Old Auto Move Pacing section title must be renamed");
assert.ok(html.includes(">Show Hints<"), "Missing Show Hints label");
assert.ok(html.includes(">Auto Move<"), "Missing Auto Move label");
const automationIdx = html.indexOf(">Automation<");
const autoQueueIdx = html.indexOf('id="option-auto-queue"');
const rematchIdx = html.indexOf('id="option-rematch-first"');
const autoMoveIdx = html.indexOf('id="option-legit-auto-move"');
assert.ok(
  automationIdx !== -1 &&
    automationIdx < autoQueueIdx &&
    autoQueueIdx < rematchIdx &&
    rematchIdx < autoMoveIdx,
  "Auto Queue and Rematch first must appear before Auto Move inside Automation"
);
assert.ok(css.includes(".config-popover"), "Missing config popover styles");
assert.ok(!css.includes(".go-preview-row"), "Unused go-preview-row styles must be removed");
assert.ok(css.includes(".badge-input"), "Missing badge-input styles");
assert.ok(css.includes("max-height: 580px"), "Popup shell must stay within Chrome 600px height limit");
assert.ok(css.includes("prefers-reduced-motion: reduce"), "Stylesheet must respect prefers-reduced-motion");
assert.ok(!css.includes(".uci-skeleton"), "UCI loading skeleton styles must be removed");
assert.ok(css.includes("--slider-progress"), "Range sliders must render accent progress fill");
assert.ok(!css.includes(".uci-retry-row"), "UCI retry button styles must be removed");
assert.ok(html.includes('<label class="title" for="option-depth">'), "Range sliders must have explicit label associations");
assert.ok(html.includes('<button type="button" class="badge" id="badge-option-depth"'), "Editable slider badges must be keyboard-accessible buttons");
assert.ok(html.includes('id="badge-option-move-pace" aria-label="Edit Move Pace value">12.50</button>'), "Move Pace badge must render two fixed decimal places");
assert.ok(html.includes('id="config-status" class="config-status hidden" role="status" aria-live="polite"'), "Config status must use polite live region");
assert.ok(!html.includes('id="config-save-error"'), "Unused config-save-error element must be removed");
assert.ok(!css.includes(".config-error"), "Unused config-error styles must be removed");
assert.ok(
  html.includes('id="config-save-confirm" type="button" class="btn-primary" disabled'),
  "Config save button must start disabled when input is empty"
);
assert.ok(html.includes('aria-controls="config-popover"'), "Config toggle must reference popover via aria-controls");

const manifest = JSON.parse(fs.readFileSync(path.join(extRoot, "manifest.json"), "utf8"));
const script = manifest.content_scripts[0];
assert.deepStrictEqual(script.css, ["css/evalbar.css"], "Only evalbar.css may be injected");
const refs = []
  .concat(script.js, script.css)
  .concat([manifest.action.default_popup])
  .concat(Object.values(manifest.icons));
for (const rel of refs) assert.ok(fs.existsSync(path.join(extRoot, rel)), "Missing manifest asset: " + rel);
for (const m of html.matchAll(/(?:href|src)="\.\.\/([^"]+)"/g)) {
  assert.ok(fs.existsSync(path.join(extRoot, m[1])), "Missing page asset: " + m[1]);
}

console.log("HTML structure tests passed.");
