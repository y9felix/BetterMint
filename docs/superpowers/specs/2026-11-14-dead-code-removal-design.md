# Dead code removal — design

2026-11-14

## Intent

A large refactor (WebSocket engine, dynamic UCI controls, pacing) replaced most of
the original Mint implementation. The superseded code was left behind. This work
removes it so the extension stays small and nothing can be mistaken for live
code.

Driving goal: smallest codebase, not elegance. Every deletion below is either
unreferenced or provably unreachable in the shipped extension.

## Goals

- Delete files, rules, functions, and config with no live reference.
- Collapse the two real duplications (defaults, UCI option parsing).
- Keep behavior identical in every reachable path.
- Keep the test suite meaningful after the deletions.

## Non-goals

- No new features, no renames for taste, no rewrite of the WebSocket lifecycle.
- No changes to `EngineWS/`, `rules.json`, or the options UI layout.
- No reduction of `options.html` or the `enumOptions` key map.

## Anti-goals

- Changing auto-move timing, stop/restart sequencing, or reconnect behavior.
- Weakening a test so it passes rather than retargeting it.

## Constraints

- MV3, no build step, no bundler.
- `loader.js` runs as a content script in the isolated world; `Mint.js` is
  injected into the page world; `options.js` runs as an extension page. Shared
  files must be loadable in both the content-script world and the options page.
- `tests/test_live_engine_switching.js` (`lines.slice(583, 1245)`) and
  `tests/test_dynamic_uci_ui.js` (`lines.slice(46, 297)`) select code by literal
  line numbers, so any deletion above those ranges breaks them silently. Both
  must be retargeted to markers.

## Approaches

**A — Pure deletion.** Only items with zero references: 4 orphan files, 7 unused
images, WebRTC block, dead methods/no-ops/globals, ECO/book path, dead CSS rules.
~380 SLOC. Zero behavior change, no test edits.

**B — Deletion + collapse duplication. Chosen.** A, plus one shared
`js/defaults.js` for the option defaults (currently copy-pasted in `loader.js`
and `options.js`), and the engine keeps only a `Set` of UCI option names instead
of parsing and storing full metadata that nothing reads. ~450 SLOC. Three tests
are retargeted; behavior unchanged.

**C — B + flatten `Mint.js`.** Also removes `__awaiter`, the `ChromeRequest`
IIFE, `TopMove`, and the `getValueConfig` indirection. ~650 SLOC, but it reopens
the WebSocket stop/restart code that was just fixed for race conditions, and the
string-based tests there would stop asserting anything real.

A leaves two copies to drift apart again; C spends the most risk for the least
certainty. B removes every provable redundancy and stops there.

## Changes

### Files deleted

| File | Why |
| --- | --- |
| `css/button.css` | never linked |
| `css/styles.css` | never linked (`.title { color: green }`, would clash with `options.css`) |
| `css/evalvaluetext.css` | never linked; `data-text` is never set by mint |
| `css/material-icon.css` | linked on every chess.com page, zero `material-*` usages; also fetches two Google Fonts |
| `js/interfaces.js` | 2-line stub, never loaded |
| `img/{16,32,48,64,256}.png`, `img/logo-big.png`, `img/logo-h.png` | unreferenced (452 KB) |

That leaves `evalbar.css`, `options.css`, and `img/{betterlogo,logo-16,logo-48,logo-128}.png`.

### `js/defaults.js` (new)

Single declaration of `DefaultExtensionOptions` (24 keys, values as they are
today in `inputObjects`). Loaded as the first entry of `content_scripts[0].js`
in `manifest.json` and by a `<script>` tag in `options.html` before
`options.js`. Both contexts share the global lexical scope of their own script
group, so the declaration is visible to `loader.js` and `options.js` without a
module system.

`loader.js` drops `inputObjects` and the derivation loop (−29). `options.js`
drops both (−29) and iterates `Object.keys(DefaultExtensionOptions)`; a `fields`
map built in `InitOptions()` replaces `inputObjects[key].inputField`.

### `js/loader.js`

- Delete `inputObjects` + `DefaultExtensionOptions` loop.
- Delete `window.Config` (`threadedEnginePaths` points at `js/stockfish.js`,
  which does not exist; the engine is a WebSocket now).

Result: ~42 lines.

### `js/Mint.js`

Remove (~272 lines; 1499 → ~1225):

- `__awaiter` transpiler shim and the `Promise` wrapper it served — its only
  consumer is the ECO fetch, which goes too.
- `ChromeRequest` IIFE → one plain `requestOptions()` function, two call sites.
- `var Config`, `var context`, `var eTable`.
- The entire ECO/book path: the `js/eco.json` fetch in `InitBetterMint`, the
  `isInTheory` field and its check in `MoveAndGo`, the `"Book"` branch in
  `AnalyzeLastMove`, and the `Book` highlight color. `js/eco.json` does not
  exist, so `eTable` is always `null` and none of this can execute.
- `enumOptions.AdvancedTiming` (`option-advanced-timing` has no element).
- `GameController.getPlayingAs()` (callers use `controller.getPlayingAs()`).
- `StockfishEngine.options` (`{ "Slow Mover", "MultiPV" }`, never read).
- `restartGame()`, `executeReadyCallbacks()` — never called.
- `checkEventOne` and the no-op 1100 ms fallback timer.
- The `onAll` debug logger.
- `window.top_pv_moves` write (never read).
- The trailing WebRTC block (builds `config`, never uses it, then replaces
  `getTransceivers` with a stop-all stub) and the `"bm"` alert listener.
- The block comment about `ChromeRequest`.

Replace (~−36 lines): `ProcessMessage`'s UCI `option name` parser keeps only the
name — `this.engineUciOptions` becomes a `Set`, reset to `new Set()` in the
constructor and in `switchEngine`. `UpdateOptions()` only ever tested for
presence (`Object.keys(...).length === 0 || engineUciOptions[key]`), so it
becomes `size === 0 || has(key)`.

Also drop the unused `multipv` argument to `new TopMove(...)` and the stray
fourth argument to `getGradientColor(...)`.

### CSS

- `evalbar.css`: delete `.evaluation-bar-clickable`, `.evaluation-bar-loader`,
  `.evaluation-bar-loading-message`, `.evaluation-bar-score-long`,
  `.evaluation-bar-score.evaluation-bar-draw`, and
  `.evaluation-bar-scoreAbbreviated.evaluation-bar-draw`; reduce the flipped
  selector list to the two elements mint creates (−45).
- `options.css`: delete the unused `--accent-hover` variable.

### `manifest.json`

- `content_scripts[0].js`: `["js/defaults.js", "js/loader.js"]`.
- `content_scripts[0].css`: `["css/evalbar.css"]`.

### Tests retargeted

- `tests/test_live_engine_switching.js`: derive `classCode` from
  `class StockfishEngine {` up to `class BetterMint {` instead of line numbers.
  Replace the three `engineUciOptions[name]` deep-equal assertions with `Set`
  membership and size.
- `tests/test_dynamic_uci_ui.js`: derive the extracted section from
  `function parseUciOptionLine` up to `function loadAndRenderEngineOptions`.
- `tests/test_options_schema.js`: assert `DefaultExtensionOptions` in
  `js/defaults.js` matches the expected 24 keys, that `manifest.json` lists
  `js/defaults.js` before `js/loader.js`, that `options.html` loads it, and that
  neither `loader.js` nor `options.js` still declares `inputObjects`.
- `tests/test_options_html.js`, `test_engine_pipeline.js`,
  `test_stop_evaluation.js`, `test_disclosure_css.js`, `test_timing.js`: no
  change.

## Verification

1. Run all tests from the repo root:
   `for t in BetterMint/tests/*.js; do node "$t"; done` — all pass.
2. Grep for dangling references to every removed identifier and file — zero
   hits.
3. Load unpacked in Brave, open a chess.com game: eval bar renders, hints
   render, engine connects, options popup restores and writes settings, engine
   UCI options list still populates.
4. Confirm no request to `fonts.gstatic.com` from the extension.
5. `git diff --stat` reviewed against the deletion table above.

## Left to the builder

- Exact ordering of the `Mint.js` hunks; the list is a set, not a sequence.
- Whether `requestOptions()` keeps its name in the two call sites.
