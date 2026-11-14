import asyncio
import json
import os
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.websockets import WebSocketState

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
        except OSError:
            pass
        return dict(DEFAULT_CONFIG)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
    except (OSError, json.JSONDecodeError):
        pass
    return dict(DEFAULT_CONFIG)

def resolve_engine_cmd(cfg: dict, engine_name: str | None) -> list[str]:
    engines = cfg.get("engines") or {}
    if engine_name and engine_name in engines:
        cmd = engines[engine_name]
    else:
        cmd = engines.get(cfg.get("default", "stockfish"), ["stockfish"])
    return [cmd] if isinstance(cmd, str) else [str(c) for c in cmd]

class EngineProcess:
    def __init__(self, cmd: list[str], init_commands: list[str] | None = None):
        self.cmd = cmd
        self.init_commands = init_commands
        self._proc = None
        self._quit_sent = False

    async def start(self):
        self._proc = await asyncio.create_subprocess_exec(
            *self.cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        if self.init_commands:
            for c in self.init_commands:
                self.put(c)
        return self

    def put(self, cmd: str):
        if not self._proc or not self._proc.stdin or self._proc.returncode is not None or self._quit_sent:
            return
        try:
            self._proc.stdin.write(f"{cmd}\n".encode("utf-8"))
            if cmd == "quit":
                self._quit_sent = True
        except OSError:
            pass

    async def read_line(self) -> str:
        if not self._proc or not self._proc.stdout:
            return ""
        raw = await self._proc.stdout.readline()
        if not raw:
            return ""
        return raw.decode("utf-8", errors="replace").strip()

    def terminate(self):
        if not self._proc:
            return
        try:
            if not self._quit_sent:
                self.put("quit")
            self._proc.terminate()
        except OSError:
            pass

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def handle_engine(websocket: WebSocket, cmd: list[str], init_commands: list[str] | None = None):
    await websocket.accept()
    print(f"[ENGINE SPAWN] {' '.join(cmd)}", flush=True)
    try:
        engine = EngineProcess(cmd, init_commands)
        start_op = engine.start()
        if asyncio.iscoroutine(start_op):
            await start_op
    except FileNotFoundError:
        print(f"[ENGINE ERROR] Binary not found: {' '.join(cmd)}", flush=True)
        await websocket.send_text(f"info string Error: Engine binary '{cmd[0]}' not found")
        await websocket.close()
        return

    async def read_socket():
        try:
            async for msg in websocket.iter_text():
                print(f"[UCI IN] {msg}", flush=True)
                engine.put(msg)
        except Exception:
            pass

    async def stream_stderr():
        try:
            proc = getattr(engine, "_proc", None)
            if not proc or not proc.stderr:
                return
            while line := await proc.stderr.readline():
                text = line.decode("utf-8", errors="replace").strip()
                if text:
                    print(f"[ENGINE STDERR] {text}", flush=True)
        except Exception:
            pass

    task_in = asyncio.create_task(read_socket())
    task_err = asyncio.create_task(stream_stderr())

    try:
        while websocket.client_state == WebSocketState.CONNECTED:
            res = engine.read_line()
            if asyncio.iscoroutine(res):
                res = await res
            if not res:
                await asyncio.sleep(0)
                if not getattr(engine, "_proc", None) or (getattr(engine._proc, "returncode", None) is not None):
                    break
                continue
            await websocket.send_text(res)
    except Exception:
        pass
    finally:
        await asyncio.sleep(0)
        task_in.cancel()
        task_err.cancel()
        engine.terminate()
        print(f"[ENGINE STOP] {' '.join(cmd)}", flush=True)

@app.websocket("/ws")
async def ws_default(websocket: WebSocket):
    await ws_named(websocket, None)

@app.websocket("/ws/{engine_name}")
async def ws_named(websocket: WebSocket, engine_name: str | None = None):
    cfg = load_config()
    cmd = resolve_engine_cmd(cfg, engine_name)
    await handle_engine(websocket, cmd)
