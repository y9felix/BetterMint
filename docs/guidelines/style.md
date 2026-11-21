# style.md: Web & Manifest V3 Style

Companion to `philosophy.md`. This file governs code form, layout and mechanics for the BetterMint Manifest V3 Chromium extension (`BetterMint/`) and its Python WebSocket bridge (`EngineWS/`); `philosophy.md` governs design, architecture and workflow.

## 1. Prime Rule: Consistency

1.1 The most important aspect of style is consistency. Keep your style consistent across the entire extension and server.

1.2 These rules are guidelines. Any rule may be relaxed for a module, and the relaxation then applies uniformly across that module.

1.3 When patching external or upstream code, conform to the formatting and naming choices already made in that file rather than mixing styles mid-file. This never permits what §2, §12, or MV3 Content Security Policy forbids.

1.4 Typography never decorates: no banners, boxes or ornament.

## 2. Platform, Language and Toolchain

2.1 Target modern evergreen Chromium browsers only, using standard Web Platform APIs (`WebSocket`, `MutationObserver`, `ResizeObserver`, `CustomEvent`, `requestAnimationFrame`, `PointerEvent`, CSS Custom Properties, ES2022+) and Manifest V3 `chrome.*` APIs. Write no polyfills or legacy browser fallbacks; use Chromium-specific `-webkit-` or `::-webkit-*` selectors only where no standard CSS equivalent exists (range thumbs, scrollbar hiding, `<details>` markers, `user-select`).

2.2 Use vanilla JavaScript without frameworks, transpilers, bundlers, or a runtime package manager. Source files load directly in the Chromium extension runtime with no build step.

2.3 Obey Manifest V3 Content Security Policy unconditionally: no `eval()`, no `new Function()`, no inline `<script>` or `<style>` blocks, and no inline event attributes (`onclick="..."`) in HTML.

2.4 Keep JavaScript strict and clean: put `"use strict";` at the top of extension scripts (`BetterMint/js/*.js`), and verify syntax and tests (`node --check`, `BetterMint/tests/test_*.js`, JSON schema checks, and Python `py_compile` / `unittest`) with zero errors.

2.5 Write `EngineWS/main.py` and `EngineWS/polyglot.py` in cross-platform Python 3.10+ (`asyncio`, `http`, `json`, `os`/`pathlib`, `signal`, `urllib.parse`), avoiding OS-specific assumptions in line endings or subprocess handling (`asyncio.create_subprocess_exec`). There is no database; all persistent server configuration lives in `EngineWS/config.json` and client state in `chrome.storage`.

## 3. File and Directory Layout

3.1 Keep project layout flat and explicit by runtime context:

- `BetterMint/manifest.json`: extension manifest (2-space indentation).
- `BetterMint/rules.json`: `declarativeNetRequest` rules (2-space indentation).
- `BetterMint/html/options.html`: static semantic popup UI (4-space indentation).
- `BetterMint/css/options.css`, `BetterMint/css/evalbar.css`: plain stylesheets (4-space indentation).
- `BetterMint/js/loader.js`: isolated content script and `chrome.storage` / runtime message bridge (2-space indentation).
- `BetterMint/js/Mint.js`: injected main-world board controller and UCI engine client (2-space indentation).
- `BetterMint/js/options.js`: popup UI logic, lazy UCI probing, saved configs, themes, and inline slider badge editing (2-space indentation).
- `BetterMint/tests/test_*.js`: standalone Node.js test scripts (2-space indentation).
- `EngineWS/main.py`: `websockets` asyncio WebSocket-to-UCI server (4-space indentation).
- `EngineWS/polyglot.py`: stdlib Polyglot `.bin` reader and Zobrist hasher (4-space indentation).
- `EngineWS/config.json`: engine binary and argument configuration (2-space indentation).
- `EngineWS/tests/test_*.py`: Python `unittest` suites (4-space indentation).

3.2 Every extension JavaScript file has this top-to-bottom order (with `Mint.js` wrapped in an outer IIFE to avoid leaking globals into the host page, and optional `module.exports` at the bottom for Node.js tests):

1. `"use strict";`
2. Constants and default configuration values.
3. Module-scoped state.
4. Helper functions and domain classes, ordered bottom-up where practical.
5. Event, DOM, messaging, or WebSocket handlers.
6. Initialization / entry point and conditional `module.exports` block.

3.3 `EngineWS/main.py` has this top-to-bottom order:

1. Standard library imports (`asyncio`, `http`, `json`, `os`, `signal`, `urllib.parse`).
2. Third-party and local imports (`websockets`, `polyglot`), separated cleanly.
3. Constants and default config (`ENGINEWS_DIR`, `CONFIG_PATH`, `DEFAULT_ENGINE_CONFIG`, `SERVER_HOST`, `SERVER_PORT`, `MAX_CONCURRENT_ENGINES`, `IS_VERBOSE_UCI_LOGGING`).
4. Configuration, routing, handshake, and UCI framing helpers (`load_engine_config`, `resolve_engine_command`, `resolve_engine_name_from_path`, `is_allowed_websocket_origin`, `validate_websocket_handshake`, `iter_uci_lines`, `send_error_and_close`).
5. Subprocess wrapper class (`EngineProcess`).
6. WebSocket session handlers (`serve_engine_websocket`, `handle_websocket_connection`), server coroutine (`run_server`), and `asyncio.run(...)` entry point.

## 4. MV3 Contexts, Isolation and Messaging

4.1 Keep MV3 execution contexts strictly separated (BetterMint uses no background service worker):

- **Popup (`BetterMint/html/options.html` + `BetterMint/js/options.js`)**: static semantic UI reading and writing `chrome.storage.sync` / `chrome.storage.local`, probing engines over `WebSocket` on demand, and notifying active Chess.com tabs via `chrome.tabs.sendMessage`.
- **Content script (`BetterMint/js/loader.js`, `ISOLATED` world)**: reads `chrome.storage`, listens to `chrome.runtime.onMessage`, injects `js/Mint.js`, and bridges options to the page via `CustomEvent` (`BetterMintGetOptions`, `BetterMintSendOptions`, `BetterMintUpdateOptions`).
- **Injected page script (`BetterMint/js/Mint.js`, `MAIN` world)**: interacts with host-page `chessboard.game` / DOM, renders the evaluation bar (`css/evalbar.css`), and speaks plain-text UCI over `WebSocket` to `EngineWS`.

4.2 Treat every boundary crossing (`CustomEvent`, `chrome.runtime.onMessage`, `chrome.storage`, WebSocket frames, host-page DOM reads) as untrusted input. Validate message shape, URL scheme, move legality, and origin before acting on it.

4.3 Do not leak privileged extension URLs, internal tokens, or `chrome.*` capabilities into the host page `MAIN` world. Expose only `js/Mint.js` in `web_accessible_resources`.

4.4 Keep `EngineWS` protocol handling strictly plain-text line-oriented UCI over WebSocket. Do not invent binary framing or nested JSON envelopes where a single UCI line suffices.

## 5. Whitespace, Indentation and Line Length

5.1 Use spaces only; never use tabs. Leave no trailing whitespace at the end of any line or on blank lines.

5.2 Indentation width is fixed per file type:

- **2 spaces**: `BetterMint/js/*.js`, `BetterMint/tests/*.js`, `BetterMint/manifest.json`, `BetterMint/rules.json`, `EngineWS/config.json`.
- **4 spaces**: `BetterMint/html/options.html`, `BetterMint/css/options.css`, `BetterMint/css/evalbar.css`, `EngineWS/main.py`, `EngineWS/polyglot.py`, `EngineWS/tests/*.py`.

5.3 Do not wrap lines unnecessarily. Keep declarations, HTML elements, CSS rules, and protocol strings on one line unless readability clearly demands splitting. Never split user-visible strings or UCI command strings across lines, as that breaks `grep`.

5.4 Put one statement per line. Do not use the comma operator to avoid braces, and do not chain assignments (`a = b = 0;`).

5.5 Avoid deep nesting: keep control flow shallow by returning early, inverting conditions, or extracting helpers instead of nesting past three levels.

## 6. Blocks, Braces and Syntax (JavaScript, JSON, Python)

6.1 Always terminate JavaScript statements with semicolons (`;`).

6.2 Use double quotes (`"..."`) across JavaScript, HTML, CSS, Python, and JSON. In JavaScript, use template literals (`` `...` ``) when interpolating expressions or embedding multi-line markup; avoid single quotes except inside CSS attribute selector literals (`"[role='button']"`) where double quotes would require escaping.

6.3 Use K&R-style braces in JavaScript and CSS: place `{` on the same line as the header/selector preceded by a single space, and place `}` on its own line (unless followed by `else`, `catch`, `finally`, or `while` in `do...while`).

```javascript
if (this.isWebSocketOpen()) {
  this.websocket.send(sanitizedCommand);
} else {
  console.warn("Attempted to send command while WebSocket is not open.");
}
```

6.4 In JavaScript, a single simple statement may omit braces only on a single-branch `if` with an immediate return or simple call; use braces on all loops and on every branch of an `if`/`else` chain if any branch requires braces.

6.5 When using `switch`, align `case` and `default` labels with `switch` (no extra indent) and end every non-empty `case` with `break` or `return`.

```javascript
switch (parts[0]) {
case "bestmove":
  applyBestMove(parts[1]);
  break;
case "info":
  updateEval(parts);
  break;
default:
  break;
}
```

6.6 Put a single space after control keywords (`if`, `for`, `while`, `switch`, `catch`, `return`), and no space between a function name and `(`.

6.7 Use one space on each side of binary and ternary operators (`=`, `+`, `-`, `===`, `!==`, `&&`, `||`, `?`, `:`), and no space inside `(` `)` or `[` `]`.

## 7. Functions and Control Flow

7.1 Keep functions cohesive and focused on one responsibility, returning early on invalid state or missing DOM nodes. Break apart handlers when unrelated responsibilities accumulate.

7.2 Prefer named `function` declarations for top-level helpers, concise methods on domain classes (`CandidateMove`, `GameController`, `UciEngineClient`, `BetterMintExtension`, `EngineProcess`, `PolyglotBoard`), and arrow functions for short callbacks (`addEventListener`, array transforms). Never nest large helper functions inside another function when they can live at module scope.

7.3 Action functions perform work (`probeEngineUciOptions`, `stopEvaluation`). Predicate functions read cleanly at the call site (`isWebSocketOpen`, `hasAddedElementMutation`) and return booleans. Query functions return the requested value or `null`.

7.4 Replace long boolean parameter lists with a single options object or explicit state constants.

7.5 Delete unused functions, dead branches, unused parameters, and obsolete message handlers immediately.

## 8. Variables, Declarations and Operators

8.1 Use `const` by default. Use `let` only when a variable is reassigned. Never use `var`.

8.2 Always use strict equality (`===` and `!==`). Never rely on loose type coercion (`==`, `!=`).

8.3 Never create implicit globals. All shared state within a script is explicitly declared at module scope, inside the page IIFE, or on class instances.

8.4 Test missing values explicitly (`value === null`, `value === undefined`) or with `!value` only when falsiness (`""`, `0`, `null`, `undefined`) is genuinely equivalent. Never treat `"0"` or `0` as missing when `0` is a valid evaluation, depth, or disabled numeric slider (`Off`).

8.5 Avoid mutating incoming parameter objects directly; build or update state explicitly (such as `Object.assign({}, ...)` when merging options).

## 9. HTML and CSS

9.1 Write static, semantic HTML5 in `BetterMint/html/options.html` (`<header>`, `<main>`, `<section>`, `<details>`, `<summary>`, `<label>`, `<button>`, `<footer>`). Use `for` attributes on `<label>` or wrap inputs cleanly; do not use `<div>` soup for interactive controls.

9.2 Keep structure, presentation, and behaviour strictly separated: no inline `style="..."` in HTML (only dynamically computed geometry such as eval bar `top`, `left`, `height`, and `transform` set from JS) and no inline scripts or handlers.

9.3 In `BetterMint/css/options.css` and `BetterMint/css/evalbar.css`, use plain CSS with custom properties (`--var-name`), Flexbox, and `kebab-case` class names (`bettermint-*` in `evalbar.css` to avoid host-page collisions). In `evalbar.css`, use explicit `px` units rather than `rem` so host-page root font sizes cannot distort the overlay. Keep specificity flat; avoid `!important` except for utility state like `.hidden`.

```css
.bettermint-evalbar {
    border-radius: 3px;
    position: fixed;
    width: 30px;
    z-index: 5;
}
```

9.4 Order CSS declarations logically and keep one property per line, 4-space indented, with double quotes on strings (`content: ""`, `[data-theme="dark"]`).

## 10. DOM Manipulation and WebSocket Protocol

10.1 Use direct standard DOM APIs (`document.querySelector`, `document.createElement`, `textContent`, `classList`, `dataset`). Never pass untrusted or dynamic strings to `innerHTML`; build dynamic controls (like UCI options and config lists) with `createDomElement` / `document.createElement` and `textContent`. Static trusted templates (empty eval bar shell, built-in theme SVG icons) are permitted only with literal strings.

10.2 Scope `MutationObserver` instances as tightly as possible when a stable container exists. When observing `document` or `document.body` with `subtree: true` to catch SPA board mounts or dynamic game-over modals, filter immediately with `hasAddedElementMutation(mutationRecords)` and coalesce/throttle work (`requestAnimationFrame` or cooldown timers). Always `disconnect()` observers on teardown.

10.3 Separate UCI formatting and parsing from DOM updates and WebSocket I/O (`parseUciOptionLine`, `buildGoCommand`, `processEngineMessage`, `processEngineLine`). Parse incoming UCI lines (`option name`, `uciok`, `readyok`, `info`, `bestmove`) deterministically, ignoring `upperbound`/`lowerbound` aspiration lines and unknown tokens cleanly.

10.4 Guard WebSocket sends against non-open states (`readyState !== WebSocket.OPEN`), handle `close` and `error` events cleanly, gate `isready` behind `uciok` and option synchronization, and coalesce rapid `position` updates instead of flooding `EngineWS`.

## 11. Naming

11.1 **JavaScript**: `camelCase` for functions, methods, and variables (`buildGoCommand`, `applyConfigProfile`, `evalBarFillElement`); `PascalCase` for classes (`CandidateMove`, `GameController`, `UciEngineClient`, `BetterMintExtension`); `UPPER_SNAKE_CASE` for module constants (`ENGINE_STOP_TIMEOUT_MS`, `CHESSCOM_BLACK_TURN`, `DEFAULT_EXTENSION_OPTIONS`, `EXTENSION_OPTION_KEY`, `THEMES`).

11.2 **HTML and CSS**: `kebab-case` for `id`, `class`, `data-*` attributes, and CSS custom properties (`option-url-api-stockfish`, `bettermint-evalbar`, `--bg-primary`).

11.3 **Python (`EngineWS/*.py`)**: `snake_case` for functions, methods, variables, and modules (`serve_engine_websocket`, `resolve_engine_command`, `lookup_polyglot_moves`); `PascalCase` for classes (`EngineProcess`, `PolyglotBoard`); `UPPER_SNAKE_CASE` for constants (`MAX_CONCURRENT_ENGINES`, `IS_VERBOSE_UCI_LOGGING`).

11.4 **Configuration and Storage Keys**: keep `option-*` keys identical across `html/options.html`, `DEFAULT_EXTENSION_OPTIONS` (`js/loader.js`), `EXTENSION_OPTION_KEY` (`js/Mint.js`), and `chrome.storage.sync`; keep engine names consistent between `EngineWS/config.json` and `/ws/{engine_name}` URLs. Never invent synonyms (`engine_depth` in one file and `maxDepth` in another).

11.5 Use short, clear locals in tight loops (`i`, `el`, `ws`, `line`, `cmd`) and descriptive names at module and protocol boundaries. Never name identifiers `foo`, `data2`, or `temp1`.

## 12. Comments

12.1 Practically zero comments in production code (`BetterMint/js/*.js`, `BetterMint/css/*.css`, `BetterMint/html/*.html`, `EngineWS/*.py`). Do not write file header banners, `LICENSE` blocks, JSDoc/docstrings restating types or names, section dividers, or commented-out code. Copyright and licence notices belong in `LICENSE`.

12.2 The sole permitted comment is a brief single-line note explaining a **non-obvious quirk in a specification, browser MV3 constraint, or host-page DOM behaviour**—never *what* the code does, only *why* a strange constraint forces it. (Short section comments are acceptable in `BetterMint/tests/*.js` to label regression blocks.)

```javascript
// Chess.com reuses the tab across SPA navigation; watch for board remounts.
```

12.3 If code requires prose to understand, rename identifiers, simplify control flow, or extract a clearly named helper until the code explains itself.

## 13. Error Handling and Diagnostics

13.1 Fail explicitly and visibly; never write empty `catch (err) {}` blocks that silently discard errors.

13.2 Check `chrome.runtime.lastError` in callback-based extension APIs (`chrome.storage.*`) and handle rejected Promises on async `chrome.*` calls (`chrome.tabs.sendMessage(...).catch(...)`).

13.3 Keep console and server diagnostics concise, prefixed with the component tag (`[BetterMint]` in extension JS; `[ENGINE SPAWN]`, `[UCI IN]`, `[ENGINE STDERR]`, `[ENGINE STOP]`, `[CONFIG WARN]`, `[WS ERROR]` in `EngineWS/main.py`).

13.4 In `BetterMint/tests/test_*.js`, assert failures explicitly with `node:assert` and exit non-zero on failure; in `EngineWS/tests/test_*.py`, use standard `unittest.TestCase` assertions.

## 14. Python (`EngineWS/main.py` and `EngineWS/polyglot.py`)

14.1 Indent with 4 spaces, use double quotes (`"..."`), and keep imports, functions, and error handling clean and explicit.

14.2 Spawn the UCI engine binary with `asyncio.create_subprocess_exec` (never `shell=True`) and handle paths cross-platform (`os.path` or `pathlib.Path`).

14.3 Validate WebSocket origin (`chess.com`, `*.chess.com`, `chrome-extension://`), cap concurrent engines with `asyncio.Semaphore`, validate values loaded from `EngineWS/config.json`, strip CR/LF inside individual commands, and block unsafe `setoption` targets (`debug log file`, `logfile`). Never pass WebSocket payloads to filesystem paths, shell commands, or `eval`/`exec`.

14.4 Always terminate and reap the child engine process (`quit` over `stdin`, `terminate()`, `wait_for(..., timeout=...)`, and fallback `kill()`) in `finally` blocks when a WebSocket client disconnects or an engine exits, forwarding unexpected non-zero exit codes and stderr diagnostics to connected clients.
