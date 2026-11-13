# Dynamic UCI Engine Controls & Live WebSocket Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide real-time UCI command logging in `EngineWS/run.sh`, enable dynamic live engine switching without page reloads in `Mint.js`, and replace flat/misleading toggles with unified non-destructive disclosure controls for Engine UCI Options and Advanced Timing in the extension UI.

**Architecture:** `EngineWS/main.py` adds stdout logging for all incoming UCI commands and process lifecycles. `Mint.js` tracks the active WebSocket URL and re-initializes connection on change without page reloads, parsing engine-reported options and filtering `setoption` commands. `options.html` and `options.js` introduce a unified `<details class="collapse-group">` disclosure UI that never alters underlying values, generating dynamic form controls from parsed UCI options.

**Tech Stack:** Python 3 (FastAPI, uvicorn), JavaScript (Vanilla ES6, WebSockets, Chrome Extensions Manifest V3), HTML5, CSS3, Node.js test harness.

**Spec:** [docs/superpowers/specs/2026-11-13-dynamic-uci-engine-controls-design.md](file:///home/felix/documents/extensions/BetterMint/docs/superpowers/specs/2026-11-13-dynamic-uci-engine-controls-design.md)

## Global Constraints
- Zero comments in all code, scripts, and configs (shebangs only).
- Zero external package additions to `EngineWS` or the Chrome extension.
- Preserve all existing security boundaries and non-destructive disclosure semantics (expanding/collapsing never resets or alters active option values).
- All custom compiled source code remains in designated source directories.

## Review Focus
1. Rapid consecutive engine URL changes in options: must cleanly terminate prior WebSocket and spawn the new engine without leaking orphan connections or race conditions.
2. Handling of non-standard or missing UCI option attributes: missing `default`, `min`, `max`, or `var` fields must fall back gracefully without throwing exceptions.
3. Live evaluation in progress during engine switch: must abort current search cleanly on old engine before starting search on new engine.
4. Preserving advanced timing settings across collapse/expand: expanding and collapsing the disclosure panel must not reset or overwrite configured timing values.
5. Reconnecting to an unresponsive engine URL: connection timeout or error must trigger clean error logging and display status in the UI without crashing the extension.

---

### Task 1: Real-Time Console Logging in `EngineWS/main.py`

**Files:**
- Modify: `EngineWS/main.py:16-59, 70-97`
- Test: `EngineWS/tests/test_server_logging.py`

**Interfaces:**
- Consumes: WebSocket text messages, subprocess stdin/stdout
- Produces: Formatted stdout log lines `[ENGINE SPAWN] ...`, `[UCI IN] ...`, `[ENGINE STOP] ...`

- [ ] **Step 1: Write the failing unit test for server logging**

Create `EngineWS/tests/test_server_logging.py` verifying that sending UCI commands to `handle_engine` emits `[UCI IN]` and `[ENGINE SPAWN]` log lines to stdout with `flush=True`.

```python
import asyncio
from unittest.mock import MagicMock, patch
import pytest
from main import handle_engine

@pytest.mark.asyncio
async def test_handle_engine_logs_spawn_and_uci_in(capsys):
    ws = MagicMock()
    ws.iter_text = MagicMock(return_value=aiter(["uci", "quit"]))
    ws.client_state = 1
    with patch("main.EngineProcess") as mock_proc:
        mock_instance = MagicMock()
        mock_instance.read_line.return_value = ""
        mock_proc.return_value = mock_instance
        try:
            await handle_engine(ws, ["/usr/bin/stockfish"])
        except Exception:
            pass
    captured = capsys.readouterr()
    assert "[ENGINE SPAWN] /usr/bin/stockfish" in captured.out
    assert "[UCI IN] uci" in captured.out
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest EngineWS/tests/test_server_logging.py`
Expected: FAIL with `AssertionError: assert '[ENGINE SPAWN]' in ''`

- [ ] **Step 3: Implement stdout logging in `EngineWS/main.py`**

In `handle_engine()`, add explicit flushed console prints:
```python
print(f"[ENGINE SPAWN] {' '.join(cmd)}", flush=True)
```
In `read_socket()`, log each message:
```python
print(f"[UCI IN] {msg}", flush=True)
```
In `finally:`, log engine termination:
```python
print(f"[ENGINE STOP] {' '.join(cmd)}", flush=True)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest EngineWS/tests/test_server_logging.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add EngineWS/main.py EngineWS/tests/test_server_logging.py
git commit -m "Add real-time stdout logging for engine lifecycle and UCI commands in EngineWS"
```

---

### Task 2: Live WebSocket Switching & Real UCI Options in `BetterMint/js/Mint.js`

**Files:**
- Modify: `BetterMint/js/Mint.js:600-645, 797-850`
- Test: `BetterMint/tests/test_live_engine_switching.js`

**Interfaces:**
- Consumes: `enumOptions.UrlApiStockfish`, `BetterMintUpdateOptions` event
- Produces: `StockfishEngine.switchEngine(newUrl)`, `this.engineUciOptions` map, filtered `setoption` dispatch

- [ ] **Step 1: Write the failing test for live engine switching**

Create `BetterMint/tests/test_live_engine_switching.js` asserting that `StockfishEngine.UpdateExtensionOptions` detects URL changes, calls `switchEngine(newUrl)`, parses `option name ...`, and only sends `setoption` for recognized engine options.

```javascript
const assert = require("assert");
const fs = require("fs");

const content = fs.readFileSync("BetterMint/js/Mint.js", "utf8");
assert.ok(content.includes("switchEngine"), "StockfishEngine must implement switchEngine");
assert.ok(content.includes("this.currentUrl"), "StockfishEngine must track currentUrl");
assert.ok(!content.includes("setoption name option-depth"), "Must not emit extension settings keys as UCI options");
console.log("Live switching static checks passed.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node BetterMint/tests/test_live_engine_switching.js`
Expected: FAIL with "StockfishEngine must implement switchEngine"

- [ ] **Step 3: Implement `switchEngine` and UCI option handling in `Mint.js`**

1. In `StockfishEngine.constructor`:
   - Store `this.currentUrl = getValueConfig(enumOptions.UrlApiStockfish);`
   - Initialize `this.engineUciOptions = {};`
2. Implement `switchEngine(newUrl)`:
   - Abort current evaluation if running: `this.stopEvaluation(...)`
   - Close active socket: `if (this.stockfish) this.stockfish.close();`
   - Set `this.currentUrl = newUrl;`
   - Call `this.initializeWebSocket(newUrl);`
   - Upon ready, re-evaluate: `if (this.BetterMintmaster.game) this.BetterMintmaster.game.UpdateEngine(false);`
3. In `UpdateExtensionOptions(options)`:
   - Compare `options[enumOptions.UrlApiStockfish]` with `this.currentUrl`. If different, call `this.switchEngine(options[enumOptions.UrlApiStockfish])`.
   - Iterate over `options.customEngineOptions`: only send `setoption name ${key} value ${val}` for keys present in `this.engineUciOptions`.
4. In `ProcessMessage(line)`:
   - Match `option name (\S+(?: \S+)*) type (\w+)...`:
     Store in `this.engineUciOptions[name] = { type, default, min, max, vars };`

- [ ] **Step 4: Run test to verify it passes**

Run: `node BetterMint/tests/test_live_engine_switching.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add BetterMint/js/Mint.js BetterMint/tests/test_live_engine_switching.js
git commit -m "Implement live engine switching and UCI option parsing in Mint.js"
```

---

### Task 3: Unified Disclosure Styling (`collapse-group`) in `BetterMint/css/options.css`

**Files:**
- Modify: `BetterMint/css/options.css:40-60, 130-150`
- Test: `BetterMint/tests/test_disclosure_css.js`

**Interfaces:**
- Consumes: Native HTML `<details>` and `<summary>` elements
- Produces: CSS classes `.collapse-group`, `.collapse-summary`, `.collapse-content`

- [ ] **Step 1: Write the failing test for disclosure CSS**

Create `BetterMint/tests/test_disclosure_css.js` verifying the existence of `.collapse-group`, `.collapse-summary`, and chevron rotation styles in `BetterMint/css/options.css`.

```javascript
const assert = require("assert");
const fs = require("fs");

const css = fs.readFileSync("BetterMint/css/options.css", "utf8");
assert.ok(css.includes(".collapse-group"), "Missing .collapse-group selector");
assert.ok(css.includes(".collapse-summary"), "Missing .collapse-summary selector");
assert.ok(css.includes("transform: rotate"), "Missing chevron rotation rule");
console.log("Disclosure CSS tests passed.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node BetterMint/tests/test_disclosure_css.js`
Expected: FAIL with "Missing .collapse-group selector"

- [ ] **Step 3: Implement `.collapse-group` and chevron styling in `options.css`**

Add CSS rules for disclosure elements:
- Remove default marker: `details.collapse-group > summary::-webkit-details-marker { display: none; }`
- Reset list style: `details.collapse-group > summary { list-style: none; display: flex; align-items: center; justify-content: space-between; cursor: pointer; color: var(--text-muted); font-size: 12px; font-weight: 600; padding: 6px 0; }`
- Chevron pseudo-element: `::after` with border arrow and `transition: transform 0.2s ease;`
- Expanded state: `details.collapse-group[open] > summary::after { transform: rotate(-135deg); }`

- [ ] **Step 4: Run test to verify it passes**

Run: `node BetterMint/tests/test_disclosure_css.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add BetterMint/css/options.css BetterMint/tests/test_disclosure_css.js
git commit -m "Add unified disclosure styling in options.css"
```

---

### Task 4: Options UI Refactor with Unified Disclosure & Dynamic UCI Discovery in `options.html` and `options.js`

**Files:**
- Modify: `BetterMint/html/options.html:23-38, 98-103`
- Modify: `BetterMint/js/options.js:40-120`
- Modify: `BetterMint/js/loader.js:1-35`
- Test: `BetterMint/tests/test_options_html.js`
- Test: `BetterMint/tests/test_options_schema.js`
- Test: `BetterMint/tests/test_dynamic_uci_ui.js`

**Interfaces:**
- Consumes: Engine WebSocket URL, UCI option strings
- Produces: `<details class="collapse-group">` for Engine UCI Options and Advanced Timing; dynamic form input rendering; per-engine storage persistence in `chrome.storage.local`

- [ ] **Step 1: Write the failing tests for HTML structure and dynamic UCI parsing**

Create `BetterMint/tests/test_dynamic_uci_ui.js` verifying that `options.html` contains the two `<details class="collapse-group">` elements, no longer contains the misleading `option-advanced-timing` switch toggle, and `options.js` includes the UCI option parser function.

```javascript
const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("BetterMint/html/options.html", "utf8");
assert.ok(html.includes('id="engine-options-details"'), "Missing engine-options-details details element");
assert.ok(html.includes('id="advanced-timing-details"'), "Missing advanced-timing-details details element");
assert.ok(!html.includes('id="option-advanced-timing"'), "Former toggle switch must be replaced by details summary");

const js = fs.readFileSync("BetterMint/js/options.js", "utf8");
assert.ok(js.includes("parseUciOptionLine"), "Missing parseUciOptionLine helper");
assert.ok(js.includes("renderDynamicUciOptions"), "Missing renderDynamicUciOptions helper");
console.log("Dynamic UCI UI tests passed.");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node BetterMint/tests/test_dynamic_uci_ui.js`
Expected: FAIL with "Missing engine-options-details details element"

- [ ] **Step 3: Update `options.html`, `options.js`, and `loader.js`**

1. In `BetterMint/html/options.html`:
   - In Engine Server section, add:
     ```html
     <details id="engine-options-details" class="collapse-group sub-panel">
         <summary class="collapse-summary">Engine UCI Options</summary>
         <div id="engine-options-container" class="sub-panel"></div>
     </details>
     ```
   - In Auto Move Pacing section, replace the `<label ... for="option-advanced-timing">` toggle with:
     ```html
     <details id="advanced-timing-details" class="collapse-group sub-panel">
         <summary class="collapse-summary">Advanced Timing Settings</summary>
         <div id="advanced-timing-panel" class="sub-panel">...</div>
     </details>
     ```
2. In `BetterMint/js/options.js`:
   - Implement `parseUciOptionLine(line)` parsing `option name ... type ... default ... min ... max ... var ...`.
   - Implement `renderDynamicUciOptions(optionsList, savedValues, container)`.
   - Connect discovery probe WebSocket on URL change, issue `uci`, parse options, render inputs, and save changes to `chrome.storage.local` under `engine_options_${engineId}`.
3. Update `BetterMint/tests/test_options_html.js` and `BetterMint/tests/test_options_schema.js` to align with the removal of `option-advanced-timing` as a toggle switch.

- [ ] **Step 4: Run test to verify it passes**

Run: `node BetterMint/tests/test_dynamic_uci_ui.js && node BetterMint/tests/test_options_html.js && node BetterMint/tests/test_options_schema.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add BetterMint/html/options.html BetterMint/js/options.js BetterMint/js/loader.js BetterMint/tests/
git commit -m "Refactor options UI with unified disclosure controls and dynamic UCI generation"
```

---

### Task 5: End-to-End Integration & Regression Verification

**Files:**
- Test: All test suites across `BetterMint/tests/*.js` and `EngineWS/tests/*.py`

**Interfaces:**
- Consumes: Complete project workspace
- Produces: Verified test reports across all subsystems

- [ ] **Step 1: Run full JavaScript test suite**

Run: `cd /home/felix/documents/extensions/BetterMint && for t in BetterMint/tests/*.js; do echo "Running $t..."; node "$t" || exit 1; done`
Expected: All tests pass with zero failures.

- [ ] **Step 2: Run Python test suite**

Run: `pytest EngineWS/tests/`
Expected: All tests pass with zero failures.

- [ ] **Step 3: Syntax check all JavaScript files**

Run: `node -c BetterMint/js/Mint.js BetterMint/js/options.js BetterMint/js/loader.js`
Expected: Clean exit code 0.

- [ ] **Step 4: Commit any integration test additions**

```bash
git add -A
git commit -m "Verify complete dynamic UCI controls and live engine switching integration"
```
