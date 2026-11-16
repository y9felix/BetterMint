import asyncio
import json
import os
from urllib.parse import urlparse
from fastapi import FastAPI, WebSocket
from fastapi.websockets import WebSocketDisconnect, WebSocketState

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
DEFAULT_CONFIG = {
    "default": "stockfish",
    "engines": {
        "stockfish": ["stockfish"]
    }
}

def load_config(path: str = CONFIG_PATH) -> dict:
    if not os.path.exists(path):
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(DEFAULT_CONFIG, f, indent=2)
        except OSError as e:
            print(f"[CONFIG WARN] Failed to write default config '{path}': {e}", flush=True)
        return dict(DEFAULT_CONFIG)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
            print(f"[CONFIG WARN] Config '{path}' root is not an object; using defaults", flush=True)
    except (OSError, json.JSONDecodeError) as e:
        print(f"[CONFIG WARN] Failed to load '{path}': {e}; using defaults", flush=True)
    return dict(DEFAULT_CONFIG)

def resolve_engine_cmd(cfg: dict, engine_name: str | None) -> list[str]:
    engines = cfg.get("engines")
    if not isinstance(engines, dict):
        engines = {}
    if engine_name and engine_name in engines:
        cmd = engines[engine_name]
    else:
        cmd = engines.get(cfg.get("default", "stockfish"), ["stockfish"])
    if isinstance(cmd, str):
        return [cmd] if cmd else ["stockfish"]
    if isinstance(cmd, list):
        parts = [str(c) for c in cmd if str(c)]
        return parts or ["stockfish"]
    return ["stockfish"]

class EngineProcess:
    def __init__(self, cmd: list[str]):
        self.cmd = cmd
        self._proc = None
        self._quit_sent = False

    async def start(self):
        self._proc = await asyncio.create_subprocess_exec(
            *self.cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        return self

    def _write(self, cmd: str) -> bool:
        if not self._proc or not self._proc.stdin or self._proc.returncode is not None or self._quit_sent:
            return False
        wrote = False
        for raw_line in cmd.replace("\r", "\n").split("\n"):
            clean = raw_line.strip()
            if not clean or self._quit_sent:
                continue
            lower = clean.lower()
            if lower.startswith("setoption ") and ("debug log file" in lower or "logfile" in lower):
                continue
            try:
                self._proc.stdin.write(f"{clean}\n".encode("utf-8"))
                wrote = True
                if lower == "quit":
                    self._quit_sent = True
            except OSError:
                break
        return wrote

    async def put(self, cmd: str):
        if self._write(cmd):
            try:
                await self._proc.stdin.drain()
            except OSError:
                pass

    async def read_line(self) -> str | None:
        if not self._proc or not self._proc.stdout:
            return None
        raw = await self._proc.stdout.readline()
        if not raw:
            return None
        return raw.decode("utf-8", errors="replace").strip()

    def terminate(self):
        if not self._proc:
            return
        try:
            if not self._quit_sent:
                self._write("quit")
            if self._proc.returncode is None:
                self._proc.terminate()
        except OSError:
            pass

    async def wait_closed(self):
        if not self._proc:
            return
        if self._proc.stdin:
            try:
                self._proc.stdin.close()
            except OSError:
                pass
        try:
            await asyncio.wait_for(self._proc.wait(), timeout=2.0)
        except asyncio.TimeoutError:
            try:
                self._proc.kill()
                await asyncio.wait_for(self._proc.wait(), timeout=1.0)
            except (asyncio.TimeoutError, OSError):
                pass

MAX_CONCURRENT_ENGINES = 8
VERBOSE_UCI = os.environ.get("BETTERMINT_VERBOSE", "1") != "0"
engine_semaphore = asyncio.Semaphore(MAX_CONCURRENT_ENGINES)

def is_allowed_ws_origin(websocket: WebSocket) -> bool:
    headers = getattr(websocket, "headers", None)
    origin = headers.get("origin") if headers else None
    if not isinstance(origin, str):
        return True
    if origin.startswith("chrome-extension://"):
        return True
    parsed = urlparse(origin)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and (host == "chess.com" or host.endswith(".chess.com"))

app = FastAPI()

async def handle_engine(websocket: WebSocket, cmd: list[str]):
    if not is_allowed_ws_origin(websocket):
        await websocket.close(code=1008)
        return
    if engine_semaphore.locked():
        await websocket.close(code=1013)
        return

    async with engine_semaphore:
        await websocket.accept()
        print(f"[ENGINE SPAWN] {' '.join(cmd)}", flush=True)
        try:
            engine = await EngineProcess(cmd).start()
        except FileNotFoundError:
            print(f"[ENGINE ERROR] Binary not found: {' '.join(cmd)}", flush=True)
            try:
                await websocket.send_text(f"info string Error: Engine binary '{cmd[0]}' not found")
                await websocket.close()
            except (WebSocketDisconnect, RuntimeError, OSError):
                pass
            return

        async def read_socket():
            try:
                async for msg in websocket.iter_text():
                    if VERBOSE_UCI:
                        safe_msg = msg.replace("\r", "\\r").replace("\n", "\\n")
                        print(f"[UCI IN] {safe_msg}", flush=True)
                    await engine.put(msg)
            except WebSocketDisconnect:
                pass
            except Exception as e:
                print(f"[WS ERROR] Ingress: {e}", flush=True)

        async def send_socket():
            try:
                while websocket.client_state == WebSocketState.CONNECTED:
                    app_state = getattr(websocket, "application_state", WebSocketState.CONNECTED)
                    if isinstance(app_state, WebSocketState) and app_state != WebSocketState.CONNECTED:
                        break
                    res = await engine.read_line()
                    if res is None:
                        break
                    if res:
                        await websocket.send_text(res)
            except WebSocketDisconnect:
                pass
            except Exception as e:
                print(f"[WS ERROR] Egress: {e}", flush=True)

        last_stderr = ""

        async def stream_stderr():
            nonlocal last_stderr
            try:
                proc = getattr(engine, "_proc", None)
                if not proc or not proc.stderr:
                    return
                while line := await proc.stderr.readline():
                    text = line.decode("utf-8", errors="replace").strip()
                    if text:
                        last_stderr = text
                        print(f"[ENGINE STDERR] {text}", flush=True)
            except Exception as e:
                print(f"[ENGINE ERROR] Stderr: {e}", flush=True)

        task_in = asyncio.create_task(read_socket())
        task_out = asyncio.create_task(send_socket())
        task_err = asyncio.create_task(stream_stderr())

        try:
            await asyncio.wait(
                [task_in, task_out],
                return_when=asyncio.FIRST_COMPLETED
            )
        finally:
            if task_out.done() and not task_err.done():
                try:
                    await asyncio.wait_for(asyncio.shield(task_err), timeout=0.2)
                except asyncio.TimeoutError:
                    pass
            for t in (task_in, task_out, task_err):
                if not t.done():
                    t.cancel()
            await asyncio.gather(task_in, task_out, task_err, return_exceptions=True)
            quit_already_sent = getattr(engine, "_quit_sent", False)
            engine.terminate()
            await engine.wait_closed()
            proc = getattr(engine, "_proc", None)
            rc = getattr(proc, "returncode", None) if proc else None
            if (
                isinstance(rc, int)
                and rc != 0
                and not quit_already_sent
                and websocket.client_state == WebSocketState.CONNECTED
            ):
                detail = f": {last_stderr}" if last_stderr else ""
                try:
                    await websocket.send_text(f"info string Error: Engine crashed (exit {rc}){detail}")
                    await websocket.close(code=1011)
                except (WebSocketDisconnect, RuntimeError, OSError):
                    pass
            print(f"[ENGINE STOP] {' '.join(cmd)}", flush=True)

@app.websocket("/ws")
async def ws_default(websocket: WebSocket):
    await ws_named(websocket, None)

@app.websocket("/ws/{engine_name}")
async def ws_named(websocket: WebSocket, engine_name: str | None = None):
    cfg = load_config()
    cmd = resolve_engine_cmd(cfg, engine_name)
    await handle_engine(websocket, cmd)
