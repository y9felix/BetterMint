# philosophy.md: Web & Manifest V3 Development Philosophy

Companion to `style.md`. This file governs design, architecture and workflow (what to build and why) for the BetterMint Manifest V3 Chromium extension (`BetterMint/`) and its Python WebSocket bridge (`EngineWS/`); `style.md` governs code form and formatting (how it is written). These principles are guidelines for judgement: any rule may be relaxed for a module, provided the choice is held consistently.

## 1. The Creed

1.1 Quality software is simple, minimal and usable. Its marks are simplicity, clarity and frugality.

1.2 Modern web software drowns in build pipelines, megabyte bundles, reactive state frameworks, and speculative abstractions. BetterMint answers it by running raw HTML, CSS, vanilla JS, and a tiny Python WebSocket server—and showing that it is faster, clearer, and harder to break.

1.3 The software is built for a technical user who reads the source, inspects DevTools, and runs a local or remote engine process. Interfaces and code are not bloated to hide how the system works.

1.4 Designing simple software is harder than bolting features onto a complex heap. The price is paid up front. It buys reliability, zero-latency startup, and a codebase small enough to hold in your head.

1.5 Volume of code is not progress; dependency count is negative progress. Every file, abstraction, and line removed makes the extension faster, easier to audit, and less likely to break when Chromium or Chess.com changes.

1.6 When a module becomes tangled in workarounds, state synchronization bugs, or brittle selectors, do not layer patches onto the complexity. Delete it and rewrite it cleanly.

1.7 Frugality is a design property. An extension shares the browser's CPU and memory with the host page; `EngineWS` shares the machine with the chess engine. Do not waste cycles on heavy polling, bloated DOM trees, or framework overhead.

## 2. Order of Qualities

2.1 When design qualities conflict, they are ranked:

1. **Simplicity**, of the implementation first.
2. **Correctness**, achieved within the reduced scope (§2.3).
3. **Design and protocol consistency**, which may yield to implementation simplicity where needed without becoming incoherent.
4. **Completeness**, which is the first quality to go.

2.2 Simplicity of implementation outranks simplicity of internals hidden behind magic. Explicit state transitions—like gating `isready` behind `uciok` and `ucinewgame`, parsing raw UCI lines, or reattaching on board remount—beat fragile "automatic" abstraction layers.

2.3 Correctness comes from shrinking scope, never from tolerating wrong behaviour. Cover supported Chess.com views, MV3 contexts, and standard UCI commands accurately; drop rare edge cases (such as Chess960 castling overrides or client-side opening book tables) that multiply complexity across the board adapter.

2.4 Ship the working core first: reliable board observation, clean UCI handshake and search synchronization over WebSocket, accurate eval bar and hint display. Refine only where real use demands it.

2.5 Follow web and Chromium conventions (`declarativeNetRequest`, `chrome.storage`, standard UCI commands) whenever they cost no implementation complexity.

## 3. Structure

3.1 **Modularity.** Keep boundaries sharp between the three MV3 contexts and the engine server:

- `BetterMint/html/options.html` + `BetterMint/css/options.css` + `BetterMint/js/options.js` own user preferences, saved configs, themes, and dynamic UCI discovery.
- `BetterMint/rules.json` owns declarative network rules.
- `BetterMint/js/loader.js` owns the `ISOLATED`-world storage/tab-message bridge and script injection.
- `BetterMint/js/Mint.js` + `BetterMint/css/evalbar.css` own `MAIN`-world host DOM reading, board overlay, pacing, and WebSocket UCI communication.
- `EngineWS/main.py` + `EngineWS/polyglot.py` + `EngineWS/config.json` own process spawning, WebSocket-to-UCI bridging, and Polyglot `.bin` opening book lookups.

Each piece can be replaced or tested without rewriting the others.

3.2 **Composition.** Connect components with simple, plain-text, inspectable interfaces. The injected page script speaks plain-text UCI lines over WebSocket to `EngineWS`, which pipes those lines to the engine's `stdin`/`stdout`. You can test `EngineWS` with `websocat` or a tiny script without launching a browser, and test `Mint.js` and `options.js` in Node.js with canned UCI lines without running an engine.

3.3 **Separation.** Separate mechanism from policy. Options and rules (`chrome.storage`, `html/options.html`, `rules.json`, `EngineWS/config.json`) hold policy; DOM observers, WebSocket transport, and UCI forwarding hold mechanism. Do not hardcode user preferences inside protocol logic, and do not embed an expression evaluator in configuration.

3.4 **Parsimony.** There is no database, no bundler, no transpiler, no ORM, and no state-management library. Keep the total footprint small enough that one developer can read every file in an afternoon.

## 4. Behaviour at the Interface

4.1 **Least surprise.** Follow standard Web, Chromium MV3, and UCI conventions. An option saved in `options.html` behaves predictably; a UCI command sent over WebSocket means what the UCI spec says it means; omitted UCI options reset to engine-reported defaults when switching profiles.

4.2 **Silence.** Stay quiet in normal operation. Do not spam `console.log` in production browser tabs; reserve client logging for startup/connection state transitions, warnings, and errors. In `EngineWS`, keep `[UCI IN]` command logging controllable via `BETTERMINT_VERBOSE`.

4.3 **Repair and failure.** Handle transient WebSocket disconnects and host DOM re-renders cleanly (exponential backoff paused when hidden, waking on focus/visibility/position updates, coalescing overlapping positions, and timing out hung `stop` calls). When a hard failure occurs (invalid config, missing engine binary, non-zero engine exit), fail loudly, latch `fatalError` against crash loops, and always reap child engine processes on disconnect or shutdown.

4.4 **Robustness.** Robustness comes from transparency and few special cases. Prefer reading canonical board state (`controller.getFEN()`, `controller.getLegalMoves()`, `controller.getMode()`, live DOM clocks) over accumulating fragile incremental diffs that drift out of sync after a navigation or premove.

4.5 **Transparency.** Plain-text UCI over WebSocket, the options popup controls, saved configs, and `chrome.storage` are directly observable in Chromium DevTools and terminal logs. Keep no hidden background state that disagrees with what the DOM, popup, or WebSocket shows.

4.6 **Clarity over cleverness.** Source code is written for its reader. Comments are practically forbidden in production code because they rot and clutter; reserve them solely for non-obvious quirks in browser specs, MV3 behaviour, or host-page DOM quirks. Otherwise, clear structure and names carry the full meaning.

## 5. Data and Protocol Before Code

5.1 **Data dominates.** Define the flat settings schema (`DEFAULT_EXTENSION_OPTIONS` / `EXTENSION_OPTION_KEY`), per-URL `customEngineOptions`, saved `customConfigs` profiles, and the UCI line grammar before writing handlers. Once the data shape is right, the code writes itself.

5.2 **Few structures.** Use plain JavaScript objects, arrays, `Map`, `Set`, and focused single-purpose classes (`CandidateMove`, `GameController`, `UciEngineClient`, `BetterMintExtension`, `EngineProcess`, `PolyglotBoard`) alongside Python dicts, lists, and `asyncio` streams. Avoid deep inheritance trees, observer-bus frameworks, or custom reactive proxies.

5.3 **Simple algorithms.** Host DOM trees and move lists are small. Direct linear scans, simple conditional/table dispatch on UCI keywords, and straightforward string parsing beat clever caching or incremental parsers that introduce stale-state bugs.

5.4 **Fold knowledge into data.** Put static mappings (defaults, slider specs, themes, disclosure visibility groups, eval thresholds, highlight colors, `rules.json` patterns, `EngineWS/config.json` engine commands) into plain object tables and JSON files rather than long chains of procedural conditionals.

5.5 **Lookup tables over branching.** Drive theme definitions (`THEMES`), slider formatting (`SLIDER_VALUE_SPECS`), disclosure visibility groups (`VISIBILITY_TOGGLE_GROUPS`), move highlight colors (`GameController.HIGHLIGHT_COLORS`), and evaluation thresholds (`UciEngineClient.EXPECTED_POINTS_LOSS_THRESHOLDS`) through object/array tables where each entry has one job.

## 6. Measure Before Tuning

6.1 You cannot guess where browser or engine latency lives. Profile with Chromium DevTools Performance/Memory tabs before adding optimizations.

6.2 Do not add Web Workers, virtual DOMs, or custom object pools without measured evidence. Apply lightweight throttling or coalescing only where real page workloads prove it necessary—such as `requestAnimationFrame` coalescing on evaluation bar geometry, `hasAddedElementMutation` mutation filtering, `lastHintSignature` redraw skipping, `150 ms` debouncing on UCI slider writes, and ignoring `upperbound`/`lowerbound` aspiration lines.

6.3 Keep every optimization local, reversible, and smaller in complexity than the bottleneck it solves.

## 7. Build Only What Is Needed

7.1 Implement features when needed, never because they might be wanted someday. Unused options clutter `options.html` and complicate every message handler.

7.2 Delete dead code relentlessly: unused manifest permissions, obsolete `rules.json` entries, unused CSS classes, dead JS helpers, obsolete storage keys, and leftover debug flags.

7.3 No speculative generality: no multi-browser abstraction layers (`browser.*` shims), no database adapters, no plugin systems, no fallback polyfills for old Chromium versions.

7.4 Keep change shallow: isolate host-site selectors (`wc-chess-board`, `AUTO_QUEUE_SELECTORS`, `CLOCK_BOTTOM_SELECTOR`) in `Mint.js` so a site layout change updates one spot rather than every file.

7.5 Normalize and validate persisted config payloads lightly at storage boundaries (`chrome.storage`, `EngineWS/config.json`) without adding unused placeholder fields.

## 8. Platform and Dependencies

8.1 **Platform.** The client platform is evergreen Chromium Manifest V3 and modern Web APIs; the server platform is cross-platform Python 3 (`EngineWS/main.py`). Using Web Platform APIs (`WebSocket`, `MutationObserver`, `ResizeObserver`, `declarativeNetRequest`) and Python's standard library directly is zero-dependency engineering.

8.2 **Be boring.** Treat client-side `npm` packages, bundlers, and CSS frameworks as a budget with a spend of zero. Plain HTML, CSS, and vanilla JS never suffer breaking major-version churn or supply-chain bloat.

8.3 **Optimize globally.** Every external dependency adds install steps, audit burden, and cross-platform failure modes. Ask first how the job is done with standard DOM APIs, MV3 manifest rules, and Python's standard library.

8.4 **Replacing means removing.** When migrating an old hack (such as imperative response-header modification, `eco.json` book loading, or WASM fallbacks) to MV3 (`rules.json`, `EngineWS` WebSockets, `MAIN`/`ISOLATED` script worlds), delete the old path completely. Never maintain two parallel mechanisms.

8.5 **Avoid, copy, or wrap.** If a tiny client helper is truly needed, write the few lines in-tree so you own every line. On the Python server, keep external packages minimal (`websockets` in `EngineWS/requirements.txt`) and isolated to `EngineWS/main.py` while keeping `EngineWS/polyglot.py` pure standard library so the UCI subprocess and opening-book cores stay yours.

8.6 **Isolate untrusted input.** Host web pages are untrusted environments. Keep privileged `chrome.*` APIs in the popup (`options.js`) and `ISOLATED` content script (`loader.js`), keep page interaction in `Mint.js`, and treat every message arriving at `EngineWS` as untrusted text: enforce origin checks, cap concurrency, strip line breaks inside single commands, block unsafe `setoption` targets (`debug log file`, `logfile`), and never pass WebSocket input to a shell or filesystem path.

## 9. Working Method

9.1 **Prototype early.** Get an end-to-end slice running immediately—one DOM read, one WebSocket round-trip, one `bestmove` rendered—then delete and refine the clumsy parts.

9.2 **Delete.** The best refactor removes code. Shrinking `BetterMint/js/*.js` or `EngineWS/*.py` while keeping behaviour intact is real progress.

9.3 **Test cheaply.** Put fast, dependency-free Node.js checks in `BetterMint/tests/test_*.js` and Python `unittest` checks in `EngineWS/tests/test_*.py` using lightweight mocks rather than heavy browser-automation or assertion frameworks. Add a regression test for every protocol parser, timing, UI schema, or state-sync bug fixed.

9.4 **A program is a publication.** Because comments are restricted to non-obvious quirks (§4.6), your file layout, CSS classes, JS/Python names, and clean MV3 boundaries must explain the entire system on sight. Hold your conventions consistently across every file.
