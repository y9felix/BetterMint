# Dead Code Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every unreachable file, code path, and CSS rule from the extension, and collapse its two duplicated tables into one source each.

**Architecture:** Delete-only change set with one addition: `BetterMint/js/defaults.js` holds `DefaultExtensionOptions` once and is loaded by both the content script and the options page. The engine stops parsing UCI option metadata it never reads, keeping a `Set` of names.

**Tech Stack:** Chrome MV3 extension, plain ES5/ES2017 JS (no build step), Node `assert`-based tests, CSS.

**Spec:** `docs/superpowers/specs/2026-11-14-dead-code-removal-design.md`

## Global Constraints

- No build step, no bundler, no new dependencies, no new files beyond `js/defaults.js`.
- Behavior in every reachable path is unchanged; `EngineWS/`, `rules.json`, and `BetterMint/html/options.html` markup are untouched.
- `Mint.js` runs in the page world and must not reference extension globals (`DefaultExtensionOptions`).
- All tests run from the repo root: `for t in BetterMint/tests/*.js; do node "$t"; done`
- Every commit message describes the removal, not the process.

## Review Focus

- An engine that sends a malformed `option name` line with no ` type ` token: must be skipped without throwing (`Mint.js`, `options.js`).
- An option name containing spaces (`Clear Hash`): the name must be stored whole so `customEngineOptions` lookup still matches.
- `chrome.storage.sync` returning a key the extension no longer defaults: the popup must still render every field with its default.
- Script order in `options.html`: `defaults.js` must evaluate before `options.js`, or the popup throws `DefaultExtensionOptions is not defined` on first interaction.
- An engine that reports zero options: `UpdateOptions()` must still forward `customEngineOptions` (`size === 0` branch).

---

### Task 1: Retarget the line-number-sliced tests

**Files:**
- Modify: `BetterMint/tests/test_live_engine_switching.js:13-14`
- Modify: `BetterMint/tests/test_dynamic_uci_ui.js:105-107`

**Interfaces:**
- Consumes: nothing.
- Produces: `classCode` = exact source between `class StockfishEngine {` and `class BetterMint {`; `uciSection` = exact source between `function parseUciOptionLine` and `function loadAndRenderEngineOptions`. Later tasks delete lines freely.

- [ ] **Step 1: Record the current pass state**

Run: `for t in BetterMint/tests/*.js; do node "$t"; done`
Expected: eight PASS lines (no output from passing `node`, exit 0 each).

- [ ] **Step 2: Replace the slice in `test_live_engine_switching.js`**

```js
const start = src.indexOf("class StockfishEngine {");
const end = src.indexOf("class BetterMint {");
assert.ok(start !== -1 && end > start, "StockfishEngine class must be locatable");
const classCode = src.slice(start, end);
```

- [ ] **Step 3: Replace the slice in `test_dynamic_uci_ui.js`**

```js
const uciStart = jsSource.indexOf("function parseUciOptionLine");
const uciEnd = jsSource.indexOf("function loadAndRenderEngineOptions");
assert.ok(uciStart !== -1 && uciEnd > uciStart, "UCI option section must be locatable");
const uciSection = jsSource.slice(uciStart, uciEnd);
```

- [ ] **Step 4: Run the suite**

Run: `for t in BetterMint/tests/*.js; do node "$t"; done`
Expected: all pass, identical to Step 1.

- [ ] **Step 5: Commit**

```bash
git add BetterMint/tests/test_live_engine_switching.js BetterMint/tests/test_dynamic_uci_ui.js
git commit -m "test: locate engine and UCI sections by marker instead of line number"
```

---

### Task 2: Single source for extension defaults

**Files:**
- Create: `BetterMint/js/defaults.js`
- Modify: `BetterMint/manifest.json` (`content_scripts[0].js`)
- Modify: `BetterMint/html/options.html:7`
- Modify: `BetterMint/js/loader.js:3-31` (delete)
- Modify: `BetterMint/js/options.js:3-31` (delete), `:33-45`, `:329-352`, `:354-384`, `:386-389`
- Test: `BetterMint/tests/test_options_schema.js` (rewrite)

**Interfaces:**
- Consumes: nothing.
- Produces: global `const DefaultExtensionOptions` — an object of 24 `"option-*": default` pairs, exactly as listed below. Visible to `loader.js` and `options.js` and to no other file.

- [ ] **Step 1: Write the failing test**

Replace `test_options_schema.js` with a version that reads `BetterMint/js/defaults.js`, `BetterMint/js/loader.js`, `BetterMint/js/options.js`, `BetterMint/manifest.json`, and `BetterMint/html/options.html`, and asserts:

```js
const match = defaultsSrc.match(/const DefaultExtensionOptions = \{([\s\S]*?)\};/);
assert.ok(match, "DefaultExtensionOptions declared in js/defaults.js");
const re = /"([^"]+)":/g;
const keys = [...match[1].matchAll(re)].map((m) => m[1]).sort();
assert.deepStrictEqual(keys, expectedKeys, "Defaults must match the active key set");
assert.ok(!loaderSrc.includes("inputObjects"), "loader.js must not duplicate the defaults table");
assert.ok(!optionsSrc.includes("inputObjects"), "options.js must not duplicate the defaults table");
const manifest = JSON.parse(fs.readFileSync("BetterMint/manifest.json", "utf8"));
assert.deepStrictEqual(manifest.content_scripts[0].js, ["js/defaults.js", "js/loader.js"]);
const scriptOrder = [...html.matchAll(/<script src="\.\.\/js\/([^"]+)"/g)].map((m) => m[1]);
assert.ok(scriptOrder.indexOf("defaults.js") < scriptOrder.indexOf("options.js"), "defaults.js must load first");
for (const key of keys) assert.ok(html.includes(`id="${key}"`), "No control for " + key);
```

`expectedKeys` stays the existing sorted list of 24 keys. Final line: `console.log("Options schema tests passed.");`

- [ ] **Step 2: Run it to verify it fails**

Run: `node BetterMint/tests/test_options_schema.js`
Expected: FAIL — `defaults.js` missing / `inputObjects` still present.

- [ ] **Step 3: Create `BetterMint/js/defaults.js`**

```js
"use strict";

const DefaultExtensionOptions = {
  "option-url-api-stockfish": "ws://localhost:8000/ws",
  "option-depth": 3,
  "option-evaluation-bar": true,
  "option-show-hints": true,
  "option-move-analysis": true,
  "option-notifications": false,
  "option-auto-queue": false,
  "option-legit-auto-move": false,
  "option-human-like-moves": true,
  "option-move-pace": 1.5,
  "option-physical-floor": 200,
  "option-timing-spread": 0.80,
  "option-fast-recaptures": true,
  "option-recapture-multiplier": 0.50,
  "option-fast-forced-moves": true,
  "option-forced-multiplier": 0.35,
  "option-fast-opening": true,
  "option-opening-moves-threshold": 8,
  "option-opening-multiplier": 0.35,
  "option-clock-scaling": true,
  "option-clock-threshold": 60,
  "option-clock-min-multiplier": 0.30
};
```

- [ ] **Step 4: Wire it into both contexts**

`manifest.json`: `content_scripts[0].js` becomes `["js/defaults.js", "js/loader.js"]`.
`options.html`: `defaults.js` gets its own `<script src="../js/defaults.js" defer></script>` immediately before the `options.js` line.

- [ ] **Step 5: Delete the duplicate in `loader.js`**

Remove `inputObjects` and the `for (let key in inputObjects)` loop; leave `"use strict";` and everything from `function injectScript` down.

- [ ] **Step 6: Delete the duplicate in `options.js` and drive the UI from it**

Remove `inputObjects` and the derivation loop. Append after `"use strict";`:

```js
const optionKeys = Object.keys(DefaultExtensionOptions);
let fields = {};
```

In `InitOptions()`, replace the population loop with:

```js
optionKeys.forEach(function (key) {
  fields[key] = document.getElementById(key);
});
```

In `RestoreOptions()` and `OnOptionsChange()`, replace every `for (let key in inputObjects)` / `inputObjects[key].inputField` / `inputObjects[key].default_value` with `optionKeys.forEach` / `fields[key]` / `DefaultExtensionOptions[key]`. Keep `chrome.storage.sync.get(DefaultExtensionOptions, ...)` as is. The `urlField` lookup becomes `fields["option-url-api-stockfish"]`.

- [ ] **Step 7: Run the suite**

Run: `for t in BetterMint/tests/*.js; do node "$t"; done`
Expected: all pass, including `Options schema tests passed.`

- [ ] **Step 8: Commit**

```bash
git add BetterMint/js/defaults.js BetterMint/js/loader.js BetterMint/js/options.js BetterMint/manifest.json BetterMint/html/options.html BetterMint/tests/test_options_schema.js
git commit -m "refactor: single source for extension defaults"
```

---

### Task 3: Delete orphan assets and dead CSS

**Files:**
- Delete: `BetterMint/css/button.css`, `BetterMint/css/styles.css`, `BetterMint/css/evalvaluetext.css`, `BetterMint/css/material-icon.css`
- Delete: `BetterMint/js/interfaces.js`
- Delete: `BetterMint/img/16.png`, `32.png`, `48.png`, `64.png`, `256.png`, `logo-big.png`, `logo-h.png`
- Modify: `BetterMint/manifest.json` (`content_scripts[0].css`)
- Modify: `BetterMint/css/evalbar.css` (7 rule deletions)
- Modify: `BetterMint/css/options.css:8`
- Test: `BetterMint/tests/test_options_html.js` (add reference-integrity block)

**Interfaces:**
- Consumes: nothing.
- Produces: manifest content-script CSS list `["css/evalbar.css"]`.

- [ ] **Step 1: Write the failing test**

Append to `test_options_html.js` before its final `console.log`:

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node BetterMint/tests/test_options_html.js`
Expected: FAIL on `Only evalbar.css may be injected`.

- [ ] **Step 3: Delete the files and update the manifest**

Remove the 4 CSS files, `js/interfaces.js`, and the 7 images listed above. Set `content_scripts[0].css` to `["css/evalbar.css"]`.

- [ ] **Step 4: Delete dead rules in `evalbar.css`**

Remove: `.evaluation-bar-bar.evaluation-bar-clickable`, `.evaluation-bar-bar .evaluation-bar-loader`, `.evaluation-bar-bar .evaluation-bar-loading-message`, `.evaluation-bar-bar:hover .evaluation-bar-score-long`, `.evaluation-bar-bar .evaluation-bar-score.evaluation-bar-draw`, `.evaluation-bar-bar .evaluation-bar-scoreAbbreviated.evaluation-bar-draw`. Reduce the flipped rule's selector list to `.evaluation-bar-bar.evaluation-bar-flipped` and `.evaluation-bar-bar.evaluation-bar-flipped .evaluation-bar-scoreAbbreviated`. Leave every `.evaluation-bar-color`, `-white`, `-black`, `-draw` (the fill div), `-fill`, `-score`, `-scoreAbbreviated`, `-dark`, `-light` rule intact.

- [ ] **Step 5: Delete `--accent-hover` from `options.css`**

- [ ] **Step 6: Run the suite and check for dangling references**

```bash
for t in BetterMint/tests/*.js; do node "$t"; done
grep -rn "material-icon\|interfaces.js\|button.css\|styles.css\|evalvaluetext\|logo-big\|logo-h.png\|img/16\|img/32\|img/48\|img/64\|img/256" BetterMint || true
```
Expected: all tests pass; grep returns nothing.

- [ ] **Step 7: Commit**

```bash
git add -A BetterMint
git commit -m "chore: delete unreferenced stylesheets, stub, and images"
```

---

### Task 4: Remove shadowed paths from `Mint.js`

**Files:**
- Modify: `BetterMint/js/Mint.js` (multiple blocks, listed below)
- Modify: `BetterMint/js/loader.js` (`window.Config`)

**Interfaces:**
- Consumes: nothing.
- Produces: `requestOptions()` — zero-argument function returning `Promise<options>`, replacing `ChromeRequest.getData()`. No `Config`, `context`, `eTable`, or `isInTheory` remains.

- [ ] **Step 1: Assert the removals in a test**

Append to `test_engine_pipeline.js`, following its existing style:

```js
for (const gone of ["__awaiter", "ChromeRequest", "pathToEcoJson", "threadedEnginePaths", "isInTheory", "executeReadyCallbacks", "restartGame", "checkEventOne", "top_pv_moves", "getPlayingAs() {"]) {
  assert.ok(!src.includes(gone), gone + " must be removed");
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node BetterMint/tests/test_engine_pipeline.js`
Expected: FAIL on `__awaiter must be removed`.

- [ ] **Step 3: Delete the transpiler shim and the request IIFE**

Remove `var __awaiter = ...` (through the closing `};` and blank line). Replace the `var ChromeRequest = (function () { ... })();` block with a plain function keeping the same body:

```js
var requestId = 0;
function requestOptions() {
  var id = requestId++;
  return new Promise(function (resolve) {
    var listener = function (evt) {
      if (evt.detail.requestId == id) {
        window.removeEventListener("BetterMintSendOptions", listener);
        resolve(evt.detail.data);
      }
    };
    window.addEventListener("BetterMintSendOptions", listener);
    window.dispatchEvent(new CustomEvent("BetterMintGetOptions", { detail: { id: id } }));
  });
}
```

Update both call sites (`tempOptions` bootstrap and `InitBetterMint`) from `ChromeRequest.getData()` to `requestOptions()`.

- [ ] **Step 4: Delete the ECO/book path**

Remove `var Config`, `var context`, `var eTable`; the `fetch(Config.pathToEcoJson)...` block in `InitBetterMint`; `this.isInTheory` in the `StockfishEngine` constructor; the `if (isNewGame) this.isInTheory = ...` / `if (this.isInTheory) {...}` block in `MoveAndGo`; the `if (this.isInTheory) { this.lastMoveScore = "Book"; } else if (...)` wrapper in `AnalyzeLastMove` (keep the `lastTopMoves.length > 0` body); the `Book: "#a88865",` highlight color. In `loader.js`, delete `window.Config` entirely.

- [ ] **Step 5: Delete the dead members**

Remove `enumOptions.AdvancedTiming`, `GameController.getPlayingAs()`, `StockfishEngine`'s `this.options = { "Slow Mover": "10", "MultiPV": "1" }` (keep `this.depth`; note `test_engine_pipeline.js` asserts the string `"MultiPV": "1"`, so move that key into the `customEngineOptions` initializer: `this.customEngineOptions = { "MultiPV": "1" };`), `restartGame()`, `executeReadyCallbacks()`, `let checkEventOne = false;` with its assignment and the 1100 ms fallback timer, the `controller.onAll(...)` debug logger, `window.top_pv_moves = [];`, the trailing `window.addEventListener("bm", ...)` block, and the `/* The above code defines ... */` comment.

- [ ] **Step 6: Tidy two stray arguments**

`new TopMove(pv, depth, cpScore, mateScore, multipv)` → drop `multipv` (also delete the now-unused `let multipv = ...` line). `getGradientColor("#ff0000", "#0000ff", x, 1)` → drop the `1`.

- [ ] **Step 7: Run the suite**

Run: `for t in BetterMint/tests/*.js; do node "$t"; done`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add BetterMint/js/Mint.js BetterMint/js/loader.js
git commit -m "refactor: remove transpiler shim, ECO path, and dead members from Mint.js"
```

---

### Task 5: Remove the WebRTC fingerprinting block

**Files:**
- Modify: `BetterMint/js/Mint.js` (tail of file, from `// Get the current WebRTC configuration`)

**Interfaces:**
- Consumes: nothing.
- Produces: file ends at the `MutationObserver` block.

- [ ] **Step 1: Assert the removal**

Append to `test_engine_pipeline.js`:

```js
assert.ok(!src.includes("RTCPeerConnection"), "WebRTC block must be removed");
assert.ok(!src.includes("iceServers"), "WebRTC config must be removed");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node BetterMint/tests/test_engine_pipeline.js`
Expected: FAIL on `WebRTC block must be removed`.

- [ ] **Step 3: Delete the block**

Remove everything from the `// Get the current WebRTC configuration of the browser` comment to the end of the file: `config`, `constraints`, `Object.assign`, the `oldPeerConnection` wrapper, and the `"bm"` listener if still present.

- [ ] **Step 4: Run the suite**

Run: `for t in BetterMint/tests/*.js; do node "$t"; done`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add BetterMint/js/Mint.js BetterMint/tests/test_engine_pipeline.js
git commit -m "refactor: delete inert WebRTC interception block"
```

---

### Task 6: Keep UCI option names only

**Files:**
- Modify: `BetterMint/js/Mint.js` (`ProcessMessage`, constructor, `switchEngine`, `UpdateOptions`)
- Test: `BetterMint/tests/test_live_engine_switching.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `engineUciOptions` is a `Set<string>` of exact option names; `UpdateOptions(options = null)` unchanged externally.

- [ ] **Step 1: Retarget the existing assertions**

In `test_live_engine_switching.js`, replace the three `deepStrictEqual(JSON.parse(JSON.stringify(engine.engineUciOptions["..."])))` blocks with:

```js
assert.ok(engine.engineUciOptions instanceof Set, "engineUciOptions must be a Set");
...
assert.ok(engine.engineUciOptions.has("Hash"));
assert.ok(engine.engineUciOptions.has("MultiPV"));
assert.ok(engine.engineUciOptions.has("Style"));
assert.strictEqual(engine.engineUciOptions.size, 3);
engine.ProcessMessage("option name Broken");
assert.strictEqual(engine.engineUciOptions.size, 3, "A line without a type token must be ignored");
engine.ProcessMessage("option name Clear Hash type button");
assert.ok(engine.engineUciOptions.has("Clear Hash"), "Names with spaces must be kept whole");
```

Insert the `instanceof Set` assertion immediately after `createEngine(...)`, the three `has` calls and `size` where the old `Style` deep-equal stood, and the two malformed/space cases right after.

At the very end of the file, before the final `console.log`, add the empty-set case:

```js
MockWebSocket.instances = [];
const fresh = createEngine(masterMock);
MockWebSocket.instances[0].triggerOpen();
fresh.UpdateOptions({ Foo: 1 });
assert.ok(MockWebSocket.instances[0].sent.includes("setoption name Foo value 1"), "Empty option set must forward custom options");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node BetterMint/tests/test_live_engine_switching.js`
Expected: FAIL — `engineUciOptions` is a plain object.

- [ ] **Step 3: Implement the Set**

Constructor and `switchEngine` reset: `this.engineUciOptions = new Set();`.
In `ProcessMessage`, replace the `option name` branch body with:

```js
if (line && typeof line === "string" && line.startsWith("option name ")) {
  const typeIndex = line.indexOf(" type ");
  if (typeIndex !== -1) {
    this.engineUciOptions.add(line.substring("option name ".length, typeIndex).trim());
  }
  return;
}
```

In `UpdateOptions`, the gate becomes `if (this.engineUciOptions.size === 0 || this.engineUciOptions.has(key))`.

- [ ] **Step 4: Run the suite**

Run: `for t in BetterMint/tests/*.js; do node "$t"; done`
Expected: all pass.

- [ ] **Step 5: Record the result**

```bash
wc -l BetterMint/js/Mint.js BetterMint/js/loader.js BetterMint/js/options.js BetterMint/css/*.css
git diff --stat 8420ba3
```
Expected: `Mint.js` under 1250 lines, `loader.js` under 60, and the diff stat shows ≥ 400 deletions.

- [ ] **Step 6: Commit**

```bash
git add BetterMint/js/Mint.js BetterMint/tests/test_live_engine_switching.js
git commit -m "refactor: track engine UCI option names only"
```

---

## Manual verification after Task 6

1. `brave-nightly --load-extension=~/documents/extensions/BetterMint/BetterMint` (temporary profile), open a chess.com game.
2. Eval bar renders on both sides of a fresh game and flips after a promotion; hint arrows render; auto-move fires when enabled.
3. Popup restores all 24 fields, shows the engine UCI option list, and writes a changed value back.
4. DevTools → Network filtered on `gstatic` shows no requests from the extension.
