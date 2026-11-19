import asyncio
from http import HTTPStatus
import json
import os
import signal
from urllib.parse import unquote, urlparse
from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed
from websockets.protocol import State
from polyglot import (
    PolyglotBoard,
    extract_go_searchmoves,
    lookup_polyglot_moves,
    pick_book_moves,
    resolve_book_path,
)

ENGINEWS_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(ENGINEWS_DIR, "config.json")
DEFAULT_ENGINE_CONFIG = {
    "default": "stockfish",
    "engines": {
        "stockfish": ["stockfish"]
    }
}
SERVER_HOST = os.environ.get("ENGINEWS_HOST", "127.0.0.1")
SERVER_PORT = int(os.environ.get("ENGINEWS_PORT", "8000"))
MAX_CONCURRENT_ENGINES = 8
IS_VERBOSE_UCI_LOGGING = os.environ.get("BETTERMINT_VERBOSE", "1") != "0"
engine_concurrency_semaphore = asyncio.Semaphore(MAX_CONCURRENT_ENGINES)

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

def resolve_engine_name_from_path(raw_path: str) -> tuple[bool, str | None]:
    parsed_path = urlparse(raw_path or "").path.rstrip("/")
    if parsed_path == "/ws":
        return True, None
    if parsed_path.startswith("/ws/"):
        engine_segment = parsed_path[len("/ws/"):]
        if engine_segment and "/" not in engine_segment:
            return True, unquote(engine_segment)
    return False, None

def is_allowed_websocket_origin(origin: str | None) -> bool:
    if not isinstance(origin, str):
        return True
    if origin.startswith("chrome-extension://"):
        return True
    parsed_origin = urlparse(origin)
    hostname = (parsed_origin.hostname or "").lower()
    return parsed_origin.scheme == "https" and (hostname == "chess.com" or hostname.endswith(".chess.com"))

def validate_websocket_handshake(connection: ServerConnection, request):
    is_valid_path, _ = resolve_engine_name_from_path(request.path)
    if not is_valid_path:
        return connection.respond(HTTPStatus.NOT_FOUND, "Not Found\n")
    if not is_allowed_websocket_origin(request.headers.get("origin")):
        return connection.respond(HTTPStatus.FORBIDDEN, "Forbidden\n")
    return None

def iter_uci_lines(uci_payload: str):
    for raw_line in uci_payload.replace("\r", "\n").split("\n"):
        clean_line = raw_line.strip()
        if clean_line:
            yield clean_line

class EngineProcess:
    def __init__(self, command: list[str]):
        self.command = command
        self._process = None
        self._has_sent_quit = False

    @property
    def has_sent_quit(self) -> bool:
        return self._has_sent_quit

    @property
    def exit_code(self) -> int | None:
        return self._process.returncode if self._process else None

    @property
    def stderr(self):
        return self._process.stderr if self._process else None

    async def start(self):
        self._process = await asyncio.create_subprocess_exec(
            *self.command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        return self

    def _write_uci_lines(self, uci_lines) -> bool:
        if not self._process or not self._process.stdin or self._process.returncode is not None or self._has_sent_quit:
            return False
        has_written = False
        for clean_line in uci_lines:
            if self._has_sent_quit:
                break
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
        if self._write_uci_lines(iter_uci_lines(uci_payload)):
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
                self._write_uci_lines(("quit",))
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

async def serve_engine_websocket(
    websocket: ServerConnection,
    engine_command: list[str],
    book_path: str | None = None,
):
    if engine_concurrency_semaphore.locked():
        await websocket.close(code=1013)
        return

    async with engine_concurrency_semaphore:
        print(f"[ENGINE SPAWN] {' '.join(engine_command)}", flush=True)
        try:
            engine_process = await EngineProcess(engine_command).start()
        except FileNotFoundError:
            print(f"[ENGINE ERROR] Binary not found: {' '.join(engine_command)}", flush=True)
            try:
                await websocket.send(f"info string Error: Engine binary '{engine_command[0]}' not found")
                await websocket.close()
            except (ConnectionClosed, RuntimeError, OSError):
                pass
            return
        except OSError as launch_error:
            print(f"[ENGINE ERROR] Failed to start engine '{' '.join(engine_command)}': {launch_error}", flush=True)
            try:
                await websocket.send(f"info string Error: Failed to start engine '{engine_command[0]}': {launch_error}")
                await websocket.close()
            except (ConnectionClosed, RuntimeError, OSError):
                pass
            return

        active_book_path = None
        if book_path:
            if os.path.isfile(book_path):
                active_book_path = book_path
            else:
                print(f"[CONFIG WARN] Polyglot book '{book_path}' not found; running without opening book", flush=True)

        board_state = PolyglotBoard()
        websocket_send_lock = asyncio.Lock()

        async def send_ws_line(text: str):
            async with websocket_send_lock:
                await websocket.send(text)

        async def forward_websocket_to_engine():
            try:
                async for raw_message in websocket:
                    uci_message = (
                        raw_message.decode("utf-8", errors="replace")
                        if isinstance(raw_message, bytes)
                        else raw_message
                    )
                    if IS_VERBOSE_UCI_LOGGING:
                        escaped_message = uci_message.replace("\r", "\\r").replace("\n", "\\n")
                        print(f"[UCI IN] {escaped_message}", flush=True)
                    for clean_line in iter_uci_lines(uci_message):
                        lower_line = " ".join(clean_line.lower().split())
                        if lower_line == "ucinewgame":
                            board_state.reset()
                            await engine_process.send_uci(clean_line)
                        elif lower_line.startswith("position "):
                            board_state.apply_position_command(clean_line)
                            await engine_process.send_uci(clean_line)
                        elif active_book_path and (lower_line == "go" or lower_line.startswith("go ")):
                            book_entries = lookup_polyglot_moves(board_state, active_book_path)
                            book_selection = pick_book_moves(book_entries, extract_go_searchmoves(clean_line))
                            if book_selection:
                                selected_move, ordered_moves = book_selection
                                await send_ws_line(f"info string book {' '.join(ordered_moves)}")
                                await send_ws_line(f"bestmove {selected_move}")
                            else:
                                await engine_process.send_uci(clean_line)
                        else:
                            await engine_process.send_uci(clean_line)
            except ConnectionClosed:
                pass
            except Exception as ingress_error:
                print(f"[WS ERROR] Ingress: {ingress_error}", flush=True)

        async def forward_engine_to_websocket():
            try:
                while websocket.state is State.OPEN:
                    stdout_line = await engine_process.read_stdout_line()
                    if stdout_line is None:
                        break
                    if stdout_line:
                        await send_ws_line(stdout_line)
            except ConnectionClosed:
                pass
            except Exception as egress_error:
                print(f"[WS ERROR] Egress: {egress_error}", flush=True)

        last_stderr_line = ""

        async def log_engine_stderr():
            nonlocal last_stderr_line
            try:
                stderr_stream = engine_process.stderr
                if not stderr_stream:
                    return
                while stderr_bytes := await stderr_stream.readline():
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
            had_sent_quit = engine_process.has_sent_quit
            engine_process.terminate()
            await engine_process.wait_until_closed()
            exit_code = engine_process.exit_code
            if (
                isinstance(exit_code, int)
                and exit_code != 0
                and not had_sent_quit
                and websocket.state is State.OPEN
            ):
                error_detail = f": {last_stderr_line}" if last_stderr_line else ""
                try:
                    await websocket.send(f"info string Error: Engine crashed (exit {exit_code}){error_detail}")
                    await websocket.close(code=1011)
                except (ConnectionClosed, RuntimeError, OSError):
                    pass
            print(f"[ENGINE STOP] {' '.join(engine_command)}", flush=True)

async def handle_websocket_connection(websocket: ServerConnection):
    request_path = websocket.request.path if websocket.request else "/ws"
    is_valid_path, engine_name = resolve_engine_name_from_path(request_path)
    if not is_valid_path:
        await websocket.close(code=1008)
        return
    engine_config = load_engine_config()
    engine_command = resolve_engine_command(engine_config, engine_name)
    book_path = resolve_book_path(engine_config, engine_name, ENGINEWS_DIR)
    await serve_engine_websocket(websocket, engine_command, book_path=book_path)

async def run_server(host: str = SERVER_HOST, port: int = SERVER_PORT):
    stop_event = asyncio.Event()
    running_loop = asyncio.get_running_loop()
    for stop_signal in (signal.SIGINT, signal.SIGTERM):
        try:
            running_loop.add_signal_handler(stop_signal, stop_event.set)
        except NotImplementedError:
            pass

    async with serve(
        handle_websocket_connection,
        host,
        port,
        process_request=validate_websocket_handshake,
    ):
        print(f"[ENGINEWS] Listening on ws://{host}:{port}/ws", flush=True)
        await stop_event.wait()

if __name__ == "__main__":
    try:
        asyncio.run(run_server())
    except KeyboardInterrupt:
        pass
