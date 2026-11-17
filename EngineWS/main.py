import asyncio
import json
import os
from urllib.parse import urlparse
from fastapi import FastAPI, WebSocket
from fastapi.websockets import WebSocketDisconnect, WebSocketState

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
DEFAULT_ENGINE_CONFIG = {
    "default": "stockfish",
    "engines": {
        "stockfish": ["stockfish"]
    }
}

def load_engine_config(config_path: str = CONFIG_PATH) -> dict:
    if not os.path.exists(config_path):
        try:
            with open(config_path, "w", encoding="utf-8") as config_file:
                json.dump(DEFAULT_ENGINE_CONFIG, config_file, indent=2)
        except OSError as write_error:
            print(f"[CONFIG WARN] Failed to write default config '{config_path}': {write_error}", flush=True)
        return dict(DEFAULT_ENGINE_CONFIG)
    try:
        with open(config_path, "r", encoding="utf-8") as config_file:
            parsed_config = json.load(config_file)
            if isinstance(parsed_config, dict):
                return parsed_config
            print(f"[CONFIG WARN] Config '{config_path}' root is not an object; using defaults", flush=True)
    except (OSError, json.JSONDecodeError) as load_error:
        print(f"[CONFIG WARN] Failed to load '{config_path}': {load_error}; using defaults", flush=True)
    return dict(DEFAULT_ENGINE_CONFIG)

def resolve_engine_command(engine_config: dict, engine_name: str | None) -> list[str]:
    engines_map = engine_config.get("engines")
    if not isinstance(engines_map, dict):
        engines_map = {}
    if engine_name and engine_name in engines_map:
        raw_command = engines_map[engine_name]
    else:
        raw_command = engines_map.get(engine_config.get("default", "stockfish"), ["stockfish"])
    if isinstance(raw_command, str):
        return [raw_command] if raw_command else ["stockfish"]
    if isinstance(raw_command, list):
        command_parts = [str(part) for part in raw_command if str(part)]
        return command_parts or ["stockfish"]
    return ["stockfish"]

class EngineProcess:
    def __init__(self, command: list[str]):
        self.command = command
        self._process = None
        self._has_sent_quit = False

    async def start(self):
        self._process = await asyncio.create_subprocess_exec(
            *self.command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        return self

    def _write_uci_lines(self, uci_payload: str) -> bool:
        if not self._process or not self._process.stdin or self._process.returncode is not None or self._has_sent_quit:
            return False
        has_written = False
        for raw_line in uci_payload.replace("\r", "\n").split("\n"):
            clean_line = raw_line.strip()
            if not clean_line or self._has_sent_quit:
                continue
            lower_line = " ".join(clean_line.lower().split())
            if lower_line.startswith("setoption ") and ("debug log file" in lower_line or "logfile" in lower_line):
                continue
            try:
                self._process.stdin.write(f"{clean_line}\n".encode("utf-8"))
                has_written = True
                if lower_line == "quit":
                    self._has_sent_quit = True
            except OSError:
                break
        return has_written

    async def send_uci(self, uci_payload: str):
        if self._write_uci_lines(uci_payload):
            try:
                await self._process.stdin.drain()
            except OSError:
                pass

    async def read_stdout_line(self) -> str | None:
        if not self._process or not self._process.stdout:
            return None
        raw_bytes = await self._process.stdout.readline()
        if not raw_bytes:
            return None
        return raw_bytes.decode("utf-8", errors="replace").strip()

    def terminate(self):
        if not self._process:
            return
        try:
            if not self._has_sent_quit:
                self._write_uci_lines("quit")
            if self._process.returncode is None:
                self._process.terminate()
        except OSError:
            pass

    async def wait_until_closed(self):
        if not self._process:
            return
        if self._process.stdin:
            try:
                self._process.stdin.close()
            except OSError:
                pass
        try:
            await asyncio.wait_for(self._process.wait(), timeout=2.0)
        except asyncio.TimeoutError:
            try:
                self._process.kill()
                await asyncio.wait_for(self._process.wait(), timeout=1.0)
            except (asyncio.TimeoutError, OSError):
                pass

MAX_CONCURRENT_ENGINES = 8
IS_VERBOSE_UCI_LOGGING = os.environ.get("BETTERMINT_VERBOSE", "1") != "0"
engine_concurrency_semaphore = asyncio.Semaphore(MAX_CONCURRENT_ENGINES)

def is_allowed_websocket_origin(websocket: WebSocket) -> bool:
    headers = getattr(websocket, "headers", None)
    origin = headers.get("origin") if headers else None
    if not isinstance(origin, str):
        return True
    if origin.startswith("chrome-extension://"):
        return True
    parsed_origin = urlparse(origin)
    hostname = (parsed_origin.hostname or "").lower()
    return parsed_origin.scheme == "https" and (hostname == "chess.com" or hostname.endswith(".chess.com"))

app = FastAPI()

async def serve_engine_websocket(websocket: WebSocket, engine_command: list[str]):
    if not is_allowed_websocket_origin(websocket):
        await websocket.close(code=1008)
        return
    if engine_concurrency_semaphore.locked():
        await websocket.close(code=1013)
        return

    async with engine_concurrency_semaphore:
        await websocket.accept()
        print(f"[ENGINE SPAWN] {' '.join(engine_command)}", flush=True)
        try:
            engine_process = await EngineProcess(engine_command).start()
        except FileNotFoundError:
            print(f"[ENGINE ERROR] Binary not found: {' '.join(engine_command)}", flush=True)
            try:
                await websocket.send_text(f"info string Error: Engine binary '{engine_command[0]}' not found")
                await websocket.close()
            except (WebSocketDisconnect, RuntimeError, OSError):
                pass
            return
        except OSError as launch_error:
            print(f"[ENGINE ERROR] Failed to start engine '{' '.join(engine_command)}': {launch_error}", flush=True)
            try:
                await websocket.send_text(f"info string Error: Failed to start engine '{engine_command[0]}': {launch_error}")
                await websocket.close()
            except (WebSocketDisconnect, RuntimeError, OSError):
                pass
            return

        async def forward_websocket_to_engine():
            try:
                async for uci_message in websocket.iter_text():
                    if IS_VERBOSE_UCI_LOGGING:
                        escaped_message = uci_message.replace("\r", "\\r").replace("\n", "\\n")
                        print(f"[UCI IN] {escaped_message}", flush=True)
                    await engine_process.send_uci(uci_message)
            except WebSocketDisconnect:
                pass
            except Exception as ingress_error:
                print(f"[WS ERROR] Ingress: {ingress_error}", flush=True)

        async def forward_engine_to_websocket():
            try:
                while websocket.client_state == WebSocketState.CONNECTED:
                    app_state = getattr(websocket, "application_state", WebSocketState.CONNECTED)
                    if isinstance(app_state, WebSocketState) and app_state != WebSocketState.CONNECTED:
                        break
                    stdout_line = await engine_process.read_stdout_line()
                    if stdout_line is None:
                        break
                    if stdout_line:
                        await websocket.send_text(stdout_line)
            except WebSocketDisconnect:
                pass
            except Exception as egress_error:
                print(f"[WS ERROR] Egress: {egress_error}", flush=True)

        last_stderr_line = ""

        async def log_engine_stderr():
            nonlocal last_stderr_line
            try:
                subprocess_handle = getattr(engine_process, "_process", None)
                if not subprocess_handle or not subprocess_handle.stderr:
                    return
                while stderr_bytes := await subprocess_handle.stderr.readline():
                    stderr_text = stderr_bytes.decode("utf-8", errors="replace").strip()
                    if stderr_text:
                        last_stderr_line = stderr_text
                        print(f"[ENGINE STDERR] {stderr_text}", flush=True)
            except Exception as stderr_error:
                print(f"[ENGINE ERROR] Stderr: {stderr_error}", flush=True)

        ingress_task = asyncio.create_task(forward_websocket_to_engine())
        egress_task = asyncio.create_task(forward_engine_to_websocket())
        stderr_task = asyncio.create_task(log_engine_stderr())

        try:
            await asyncio.wait(
                [ingress_task, egress_task],
                return_when=asyncio.FIRST_COMPLETED
            )
        finally:
            if egress_task.done() and not stderr_task.done():
                try:
                    await asyncio.wait_for(asyncio.shield(stderr_task), timeout=0.2)
                except asyncio.TimeoutError:
                    pass
            for task in (ingress_task, egress_task, stderr_task):
                if not task.done():
                    task.cancel()
            await asyncio.gather(ingress_task, egress_task, stderr_task, return_exceptions=True)
            had_sent_quit = getattr(engine_process, "_has_sent_quit", False)
            engine_process.terminate()
            await engine_process.wait_until_closed()
            subprocess_handle = getattr(engine_process, "_process", None)
            exit_code = getattr(subprocess_handle, "returncode", None) if subprocess_handle else None
            if (
                isinstance(exit_code, int)
                and exit_code != 0
                and not had_sent_quit
                and websocket.client_state == WebSocketState.CONNECTED
            ):
                error_detail = f": {last_stderr_line}" if last_stderr_line else ""
                try:
                    await websocket.send_text(f"info string Error: Engine crashed (exit {exit_code}){error_detail}")
                    await websocket.close(code=1011)
                except (WebSocketDisconnect, RuntimeError, OSError):
                    pass
            print(f"[ENGINE STOP] {' '.join(engine_command)}", flush=True)

@app.websocket("/ws")
async def connect_default_engine(websocket: WebSocket):
    await connect_named_engine(websocket, None)

@app.websocket("/ws/{engine_name}")
async def connect_named_engine(websocket: WebSocket, engine_name: str | None = None):
    engine_config = load_engine_config()
    engine_command = resolve_engine_command(engine_config, engine_name)
    await serve_engine_websocket(websocket, engine_command)
