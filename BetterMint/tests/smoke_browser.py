import argparse
import asyncio
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from unittest.mock import patch

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EXTENSION_DIR = os.path.join(REPO_ROOT, "BetterMint")
ENGINEWS_DIR = os.path.join(REPO_ROOT, "EngineWS")

sys.path.insert(0, ENGINEWS_DIR)


def load_enginews_runtime():
    try:
        import websockets
        from websockets.asyncio.server import serve
        import main as enginews_main
    except ImportError as exc:
        sys.stderr.write(
            f"Missing EngineWS dependency ({exc}). Run with EngineWS Python venv:\n"
            f"  EngineWS/.venv/bin/python BetterMint/tests/smoke_browser.py\n"
        )
        sys.exit(2)
    return websockets, serve, enginews_main

FAKE_UCI_ENGINE_SCRIPT = (
    "import sys\n"
    "for line in sys.stdin:\n"
    "    cmd = line.strip()\n"
    "    if cmd == 'uci':\n"
    "        print('id name BetterMintSmokeEngine', flush=True)\n"
    "        print('option name Threads type spin default 1 min 1 max 64', flush=True)\n"
    "        print('option name Ponder type check default false', flush=True)\n"
    "        print('option name Style type combo default Normal var Solid var Normal var Risky', flush=True)\n"
    "        print('option name SyzygyPath type string default <empty>', flush=True)\n"
    "        print('option name Clear Hash type button', flush=True)\n"
    "        print('uciok', flush=True)\n"
    "    elif cmd == 'isready':\n"
    "        print('readyok', flush=True)\n"
    "    elif cmd.startswith('go '):\n"
    "        print('info depth 6 score cp 35 pv e2e4 e7e5', flush=True)\n"
    "        print('bestmove e2e4', flush=True)\n"
    "    elif cmd == 'stop':\n"
    "        print('bestmove e2e4', flush=True)\n"
    "    elif cmd == 'quit':\n"
    "        break\n"
)


def find_chrome_binary(explicit_path=None):
    if explicit_path:
        if os.path.isfile(explicit_path):
            return explicit_path
        raise FileNotFoundError(f"Chrome binary not found at: {explicit_path}")

    env_bin = os.environ.get("CHROME_BIN")
    if env_bin and os.path.isfile(env_bin):
        return env_bin

    candidates = [
        "chromium",
        "chromium-browser",
        "google-chrome",
        "google-chrome-stable",
        "brave-browser",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    ]
    for candidate in candidates:
        resolved = shutil.which(candidate) if not os.path.isabs(candidate) else candidate
        if resolved and os.path.isfile(resolved):
            return resolved

    raise FileNotFoundError(
        "No Chromium/Chrome binary found. Pass --chrome /path/to/chrome or set CHROME_BIN."
    )


def allocate_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def fetch_cdp_targets(debug_port):
    url = f"http://127.0.0.1:{debug_port}/json/list"
    with urllib.request.urlopen(url, timeout=2.0) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_cdp_page_target(debug_port, timeout=15.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            targets = fetch_cdp_targets(debug_port)
            for target in targets:
                if target.get("type") == "page" and target.get("webSocketDebuggerUrl"):
                    return target["webSocketDebuggerUrl"]
        except OSError:
            pass
        time.sleep(0.15)
    raise TimeoutError(f"Timed out waiting for Chrome DevTools target on port {debug_port}")


def find_extension_id_in_preferences(user_data_dir):
    prefs_path = os.path.join(user_data_dir, "Default", "Preferences")
    if not os.path.isfile(prefs_path):
        return None
    try:
        with open(prefs_path, "r", encoding="utf-8") as prefs_file:
            prefs = json.load(prefs_file)
    except (OSError, json.JSONDecodeError):
        return None

    expected_path = os.path.normcase(os.path.realpath(EXTENSION_DIR))
    settings = prefs.get("extensions", {}).get("settings", {})
    for ext_id, entry in settings.items():
        if not isinstance(entry, dict):
            continue
        entry_path = entry.get("path")
        if entry_path and os.path.normcase(os.path.realpath(entry_path)) == expected_path:
            return ext_id
        manifest = entry.get("manifest") or {}
        if manifest.get("name") == "BetterMint":
            return ext_id
    return None


class CdpSession:
    def __init__(self, ws):
        self.ws = ws
        self._next_id = 1
        self._pending = {}
        self.console_errors = []
        self.exceptions = []
        self.csp_report_requests = []
        self.chesscom_doc_headers = []
        self._reader_task = asyncio.create_task(self._read_loop())

    async def _read_loop(self):
        try:
            async for raw_message in self.ws:
                payload = json.loads(raw_message)
                msg_id = payload.get("id")
                if msg_id is not None and msg_id in self._pending:
                    future = self._pending.pop(msg_id)
                    if not future.done():
                        if "error" in payload:
                            future.set_exception(RuntimeError(f"CDP error: {payload['error']}"))
                        else:
                            future.set_result(payload.get("result", {}))
                    continue

                method = payload.get("method")
                params = payload.get("params") or {}
                self._record_event(method, params)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            for future in self._pending.values():
                if not future.done():
                    future.set_exception(exc)
            self._pending.clear()

    def _record_event(self, method, params):
        if method == "Runtime.exceptionThrown":
            details = params.get("exceptionDetails") or {}
            text = details.get("text") or "Uncaught exception"
            desc = (details.get("exception") or {}).get("description")
            self.exceptions.append(desc or text)
        elif method == "Runtime.consoleAPICalled":
            if params.get("type") == "error":
                args = [
                    str(arg.get("value", arg.get("description", "")))
                    for arg in params.get("args", [])
                ]
                self.console_errors.append(" ".join(args))
        elif method == "Log.entryAdded":
            entry = params.get("entry") or {}
            text = entry.get("text", "")
            if entry.get("level") == "error" or "Content Security Policy" in text:
                self.console_errors.append(text)
        elif method == "Network.responseReceived":
            response = params.get("response") or {}
            url = response.get("url", "")
            if params.get("type") == "Document" and "chess.com" in url:
                headers = {
                    k.lower(): v for k, v in (response.get("headers") or {}).items()
                }
                self.chesscom_doc_headers.append((url, headers))
        elif method == "Network.requestWillBeSent":
            if params.get("type") == "CSPReport":
                self.csp_report_requests.append((params.get("request") or {}).get("url", ""))

    async def call(self, method, params=None, timeout=10.0):
        msg_id = self._next_id
        self._next_id += 1
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self._pending[msg_id] = future
        request = {"id": msg_id, "method": method}
        if params:
            request["params"] = params
        await self.ws.send(json.dumps(request))
        return await asyncio.wait_for(future, timeout=timeout)

    async def eval_js(self, expression, await_promise=True, timeout=10.0):
        result = await self.call(
            "Runtime.evaluate",
            {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": await_promise,
            },
            timeout=timeout,
        )
        if "exceptionDetails" in result:
            details = result["exceptionDetails"]
            desc = (details.get("exception") or {}).get("description") or details.get("text")
            raise AssertionError(f"JS evaluation error: {desc}")
        return (result.get("result") or {}).get("value")

    async def wait_for(self, js_expression, timeout=8.0, label="condition"):
        deadline = time.monotonic() + timeout
        last_value = None
        while time.monotonic() < deadline:
            last_value = await self.eval_js(js_expression)
            if last_value:
                return last_value
            await asyncio.sleep(0.1)
        raise AssertionError(f"Timed out waiting for {label} (last value: {last_value!r})")

    async def navigate(self, url, timeout=15.0):
        await self.call("Page.navigate", {"url": url}, timeout=timeout)
        await self.wait_for("document.readyState === 'complete'", timeout=timeout, label=f"load {url}")

    async def click(self, selector):
        point = await self.eval_js(
            f"(() => {{"
            f"  const el = document.querySelector({json.dumps(selector)});"
            f"  if (!el) return null;"
            f"  el.scrollIntoView({{ block: 'center', inline: 'nearest' }});"
            f"  const r = el.getBoundingClientRect();"
            f"  return {{ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }};"
            f"}})()"
        )
        if not point or point["w"] <= 0 or point["h"] <= 0:
            raise AssertionError(f"Element not clickable or invisible: {selector}")
        for event_type in ("mouseMoved", "mousePressed", "mouseReleased"):
            params = {
                "type": event_type,
                "x": point["x"],
                "y": point["y"],
                "button": "left",
                "clickCount": 1,
            }
            if event_type == "mouseMoved":
                del params["button"]
                del params["clickCount"]
            await self.call("Input.dispatchMouseEvent", params)

    async def mouse_down_up(self, selector):
        await self.click(selector)

    async def type_text(self, text):
        await self.call("Input.insertText", {"text": text})

    async def press_key(self, key_name):
        key_map = {
            "Enter": {"key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13},
            "Escape": {"key": "Escape", "code": "Escape", "windowsVirtualKeyCode": 27},
            "Tab": {"key": "Tab", "code": "Tab", "windowsVirtualKeyCode": 9},
            "Backspace": {"key": "Backspace", "code": "Backspace", "windowsVirtualKeyCode": 8},
        }
        spec = key_map[key_name]
        await self.call("Input.dispatchKeyEvent", {"type": "keyDown", **spec})
        await self.call("Input.dispatchKeyEvent", {"type": "keyUp", **spec})

    async def close(self):
        self._reader_task.cancel()
        try:
            await self._reader_task
        except asyncio.CancelledError:
            pass


async def resolve_extension_id(cdp, user_data_dir, explicit_id=None):
    if explicit_id:
        return explicit_id

    for _ in range(10):
        ext_id = find_extension_id_in_preferences(user_data_dir)
        if ext_id:
            return ext_id
        await asyncio.sleep(0.15)

    # BetterMint has no background service worker, so inspect chrome://extensions Shadow DOM as fallback.
    await cdp.navigate("chrome://extensions")
    try:
        ext_id = await cdp.wait_for(
            "(() => {"
            "  const mgr = document.querySelector('extensions-manager');"
            "  const list = mgr?.shadowRoot?.querySelector('extensions-item-list');"
            "  const items = list?.shadowRoot?.querySelectorAll('extensions-item') || [];"
            "  for (const item of items) {"
            "    const name = item.shadowRoot?.querySelector('#name')?.textContent?.trim();"
            "    if (name === 'BetterMint') return item.getAttribute('id');"
            "  }"
            "  return null;"
            "})()",
            timeout=8.0,
            label="BetterMint extension ID in chrome://extensions",
        )
    except AssertionError as exc:
        raise AssertionError(
            f"{exc}. Note: branded Google Chrome 137+ disables --load-extension; "
            f"pass --chrome /path/to/chromium (or Chrome for Testing)."
        ) from exc
    return ext_id


def report_step(name):
    print(f"[PASS] {name}")


async def run_popup_checks(cdp, ext_id, engine_ws_url):
    popup_url = f"chrome-extension://{ext_id}/html/options.html"
    await cdp.call(
        "Emulation.setDeviceMetricsOverride",
        {"width": 340, "height": 580, "deviceScaleFactor": 1, "mobile": False},
    )
    cdp.console_errors.clear()
    cdp.exceptions.clear()

    await cdp.navigate(popup_url)
    await cdp.wait_for("Boolean(document.getElementById('option-url-api-stockfish'))", label="popup controls")
    assert not cdp.exceptions, f"Popup threw uncaught exceptions: {cdp.exceptions}"
    assert not cdp.console_errors, f"Popup logged console errors: {cdp.console_errors}"
    report_step("Popup loads cleanly with zero MV3 CSP or runtime errors")

    overflow_metrics = await cdp.eval_js(
        "(() => ({"
        "  scrollWidth: document.documentElement.scrollWidth,"
        "  clientWidth: document.documentElement.clientWidth,"
        "  bodyHeight: document.body.getBoundingClientRect().height"
        "}))()"
    )
    assert overflow_metrics["scrollWidth"] <= overflow_metrics["clientWidth"], (
        f"Horizontal overflow detected: {overflow_metrics}"
    )
    assert overflow_metrics["bodyHeight"] <= 600, (
        f"Popup exceeds Chrome 600px height cap: {overflow_metrics}"
    )
    report_step("Popup fits within 340x580 bounds with zero horizontal overflow")

    initial_theme = await cdp.eval_js("document.documentElement.dataset.theme")
    expected_cycle = {
        "dark": ["light", "black", "chesscom", "dark"],
        "light": ["black", "chesscom", "dark", "light"],
    }.get(initial_theme, ["light", "black", "chesscom", "dark"])

    for expected_theme in expected_cycle:
        await cdp.click("#theme-toggle")
        actual_theme = await cdp.eval_js("document.documentElement.dataset.theme")
        assert actual_theme == expected_theme, f"Expected theme {expected_theme}, got {actual_theme}"

    while (await cdp.eval_js("document.documentElement.dataset.theme")) != "chesscom":
        await cdp.click("#theme-toggle")
    await asyncio.sleep(0.15)
    await cdp.navigate(popup_url)
    await cdp.wait_for("document.documentElement.dataset.theme === 'chesscom'", label="persisted theme")
    report_step("Theme cycling works across all 4 themes and persists in chrome.storage.local")

    await cdp.click("#go-command-details > summary")
    await cdp.wait_for("document.getElementById('go-command-details').open === true", label="Search Options open")

    await cdp.click("#badge-option-go-movetime")
    await cdp.wait_for("Boolean(document.querySelector('#go-command-details input.badge-input'))", label="movetime badge input")
    await cdp.type_text("320")
    await cdp.press_key("Enter")
    movetime_state = await cdp.eval_js(
        "(() => ({"
        "  value: document.getElementById('option-go-movetime').value,"
        "  step: document.getElementById('option-go-movetime').step,"
        "  badge: document.getElementById('badge-option-go-movetime').textContent"
        "}))()"
    )
    assert movetime_state == {"value": "320", "step": "1", "badge": "320"}, (
        f"Real Chromium range slider snapped unaligned movetime: {movetime_state}"
    )

    await cdp.click("#badge-option-go-movetime")
    await cdp.type_text("9999")
    await cdp.press_key("Escape")
    assert (await cdp.eval_js("document.getElementById('option-go-movetime').value")) == "320"

    await asyncio.sleep(0.15)
    await cdp.navigate(popup_url)
    await cdp.wait_for("document.getElementById('option-go-movetime').value === '320'", label="persisted exact movetime")
    await cdp.click("#go-command-details > summary")
    await cdp.wait_for("document.getElementById('go-command-details').open === true", label="Search Options reopen")

    await cdp.click("#badge-option-go-nodes")
    await cdp.type_text("12345")
    await cdp.press_key("Enter")
    assert (await cdp.eval_js("document.getElementById('option-go-nodes').value")) == "12345"
    assert (await cdp.eval_js("document.getElementById('badge-option-go-nodes').textContent")) == "12,345"
    await cdp.mouse_down_up("#option-go-nodes")
    assert (await cdp.eval_js("document.getElementById('option-go-nodes').step")) == "10000", (
        "Pointer interaction on range slider must restore coarse step=10000"
    )
    report_step("Real Chromium <input type='range'> inline badge editing, persistence, Escape, and step restoration")

    await cdp.click("#go-command-details > summary")
    await cdp.click("label[for='option-auto-queue']")
    await asyncio.sleep(0.35)
    scroll_check = await cdp.eval_js(
        "(() => {"
        "  const container = document.querySelector('.settings-container').getBoundingClientRect();"
        "  const group = document.getElementById('auto-queue-group').getBoundingClientRect();"
        "  return { visible: !document.getElementById('auto-queue-group').classList.contains('hidden'),"
        "           fitsBottom: group.bottom <= container.bottom + 2,"
        "           fitsTop: group.top >= container.top - 2 };"
        "})()"
    )
    assert scroll_check["visible"] and scroll_check["fitsBottom"] and scroll_check["fitsTop"], (
        f"Auto-scroll did not reveal #auto-queue-group cleanly: {scroll_check}"
    )
    report_step("Toggling Auto Queue reveals sub-panel above sticky footer via auto-scroll")

    await cdp.click("#config-toggle")
    await cdp.wait_for("!document.getElementById('config-popover').classList.contains('hidden')", label="config popover open")
    await cdp.click("#config-save-name")
    await cdp.type_text("CDP Smoke")
    await cdp.click("#config-save-confirm")
    await cdp.wait_for("document.getElementById('config-popover').classList.contains('hidden')", label="config popover close")

    await cdp.click("#config-toggle")
    await cdp.wait_for("document.getElementById('config-load-list').textContent.includes('CDP Smoke')", label="saved profile listed")
    await cdp.click("#config-load-list button.config-delete-btn")
    await cdp.wait_for("document.getElementById('config-load-list').textContent.includes('No saved configs yet')", label="profile deleted")
    await cdp.press_key("Escape")
    await cdp.wait_for("document.getElementById('config-popover').classList.contains('hidden')", label="Escape closes popover")
    report_step("Configs popover save, list, delete, and Escape close work in real Chromium")

    await cdp.eval_js(
        f"(() => {{"
        f"  const input = document.getElementById('option-url-api-stockfish');"
        f"  input.value = {json.dumps(engine_ws_url)};"
        f"  input.dispatchEvent(new Event('change', {{ bubbles: true }}));"
        f"}})()"
    )
    await cdp.click("#engine-options-details > summary")
    await cdp.wait_for(
        "(() => {"
        "  const c = document.getElementById('engine-options-container');"
        "  return c.getAttribute('aria-busy') === 'false' && c.textContent.includes('Threads') && c.textContent.includes('Clear Hash');"
        "})()",
        timeout=8.0,
        label="dynamic UCI controls from live EngineWS",
    )
    uci_controls = await cdp.eval_js(
        "(() => {"
        "  const c = document.getElementById('engine-options-container');"
        "  return {"
        "    ranges: c.querySelectorAll('input[type=\"range\"]').length,"
        "    checks: c.querySelectorAll('input[type=\"checkbox\"]').length,"
        "    selects: c.querySelectorAll('select').length,"
        "    texts: c.querySelectorAll('input[type=\"text\"]').length,"
        "    buttons: c.querySelectorAll('button.action-btn').length"
        "  };"
        "})()"
    )
    assert (
        uci_controls["ranges"] >= 1
        and uci_controls["checks"] >= 1
        and uci_controls["selects"] >= 1
        and uci_controls["texts"] >= 1
        and uci_controls["buttons"] >= 1
    ), f"Missing expected dynamic UCI control types: {uci_controls}"
    assert not cdp.exceptions, f"Uncaught exceptions during popup checks: {cdp.exceptions}"
    assert not cdp.console_errors, f"Console errors during popup checks: {cdp.console_errors}"
    report_step("Live EngineWS WebSocket UCI probing renders real dynamic controls cleanly")


async def run_live_chesscom_checks(cdp):
    await cdp.call(
        "Emulation.setDeviceMetricsOverride",
        {"width": 1280, "height": 800, "deviceScaleFactor": 1, "mobile": False},
    )
    cdp.console_errors.clear()
    cdp.exceptions.clear()
    cdp.csp_report_requests.clear()
    cdp.chesscom_doc_headers.clear()

    await cdp.navigate("https://www.chess.com/analysis", timeout=25.0)
    await cdp.wait_for(
        "Boolean(document.querySelector('wc-chess-board, chess-board'))",
        timeout=20.0,
        label="Chess.com board mount",
    )
    await cdp.wait_for(
        "(() => {"
        "  const bar = document.querySelector('.bettermint-evalbar');"
        "  return Boolean(bar && bar.getBoundingClientRect().height > 100);"
        "})()",
        timeout=15.0,
        label="BetterMint eval bar mount",
    )

    for url, headers in cdp.chesscom_doc_headers:
        for forbidden in ("content-security-policy-report-only", "report-to", "reporting-endpoints"):
            assert forbidden not in headers, f"DNR failed to strip {forbidden} on {url}"
    assert not cdp.csp_report_requests, f"Unexpected csp_report requests: {cdp.csp_report_requests}"
    csp_console_spam = [msg for msg in cdp.console_errors if "report-only" in msg.lower()]
    assert not csp_console_spam, f"Report-only CSP notices leaked to console: {csp_console_spam}"
    report_step("Live Chess.com DNR strips report-only CSP headers with zero console spam")

    desktop_layout = await cdp.eval_js(
        "(() => {"
        "  const board = document.querySelector('wc-chess-board, chess-board').getBoundingClientRect();"
        "  const bar = document.querySelector('.bettermint-evalbar');"
        "  const rect = bar.getBoundingClientRect();"
        "  return {"
        "    width: Math.round(rect.width),"
        "    rightEdgeOk: rect.right <= board.left + 4,"
        "    pointerEvents: getComputedStyle(bar).pointerEvents"
        "  };"
        "})()"
    )
    assert desktop_layout["width"] == 30 and desktop_layout["rightEdgeOk"] and desktop_layout["pointerEvents"] == "none", (
        f"Desktop eval bar layout mismatch: {desktop_layout}"
    )

    await cdp.call(
        "Emulation.setDeviceMetricsOverride",
        {"width": 720, "height": 800, "deviceScaleFactor": 1, "mobile": False},
    )
    await asyncio.sleep(0.25)
    compact_width = await cdp.eval_js(
        "Math.round(document.querySelector('.bettermint-evalbar').getBoundingClientRect().width)"
    )
    assert compact_width == 20, f"Compact (<960px) eval bar width expected 20px, got {compact_width}px"
    report_step("Live Chess.com board attach and responsive eval bar (30px desktop / 20px compact)")


async def run_smoke_suite(args):
    websockets, serve, enginews_main = load_enginews_runtime()
    chrome_bin = find_chrome_binary(args.chrome)
    debug_port = allocate_free_port()
    user_data_dir = tempfile.mkdtemp(prefix="bettermint-cdp-")
    spawned_engines = []

    original_engine_class = enginews_main.EngineProcess

    class TrackedEngineProcess(original_engine_class):
        def __init__(self, command_args):
            super().__init__(command_args)
            spawned_engines.append(self)

    fake_config = {
        "default": "fake",
        "engines": {"fake": [sys.executable, "-c", FAKE_UCI_ENGINE_SCRIPT]},
    }

    chrome_args = [
        chrome_bin,
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={user_data_dir}",
        f"--disable-extensions-except={EXTENSION_DIR}",
        f"--load-extension={EXTENSION_DIR}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
    ]
    if not args.headed:
        chrome_args.append("--headless=new")
    chrome_args.append("about:blank")

    chrome_proc = None
    cdp = None
    try:
        with (
            patch.object(enginews_main, "load_engine_config", return_value=fake_config),
            patch.object(enginews_main, "EngineProcess", TrackedEngineProcess),
        ):
            async with serve(
                enginews_main.handle_websocket_connection,
                "127.0.0.1",
                0,
                process_request=enginews_main.validate_websocket_handshake,
            ) as ws_server:
                engine_port = ws_server.sockets[0].getsockname()[1]
                engine_ws_url = args.engine_url or f"ws://127.0.0.1:{engine_port}/ws/fake"

                chrome_proc = subprocess.Popen(
                    chrome_args,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                ws_debug_url = wait_for_cdp_page_target(debug_port)

                async with websockets.connect(ws_debug_url, max_size=None) as cdp_ws:
                    cdp = CdpSession(cdp_ws)
                    await cdp.call("Page.enable")
                    await cdp.call("Runtime.enable")
                    await cdp.call("Log.enable")
                    await cdp.call("Network.enable")

                    ext_id = await resolve_extension_id(cdp, user_data_dir, args.extension_id)
                    report_step(f"Loaded unpacked BetterMint extension ({ext_id})")

                    await run_popup_checks(cdp, ext_id, engine_ws_url)
                    if args.live:
                        await run_live_chesscom_checks(cdp)

                    await cdp.close()
                    cdp = None

        await asyncio.sleep(0.25)
        leaked = [proc for proc in spawned_engines if proc.exit_code is None]
        assert not leaked, f"Orphaned engine subprocesses remained alive: {len(leaked)}"
        report_step("All spawned EngineWS subprocesses exited cleanly with zero orphans")
    finally:
        if cdp is not None:
            await cdp.close()
        if chrome_proc is not None:
            chrome_proc.terminate()
            try:
                chrome_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                chrome_proc.kill()
                chrome_proc.wait(timeout=5)
        shutil.rmtree(user_data_dir, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(
        description="Zero-bloat Chrome DevTools Protocol (CDP) browser smoke test for BetterMint."
    )
    parser.add_argument("--chrome", help="Path to Chromium/Chrome binary (or set CHROME_BIN)")
    parser.add_argument("--headed", action="store_true", help="Show the Chrome window while running")
    parser.add_argument("--live", action="store_true", help="Also run live Chess.com DNR & board checks")
    parser.add_argument("--engine-url", help="Override EngineWS URL instead of built-in local test server")
    parser.add_argument("--extension-id", help="Explicit unpacked extension ID override")
    args = parser.parse_args()

    asyncio.run(run_smoke_suite(args))
    print("All CDP browser smoke checks passed.")


if __name__ == "__main__":
    main()
