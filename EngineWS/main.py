import asyncio
import json
import os
from queue import Empty, Queue
import subprocess
from threading import Thread
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

def enqueue_output(out, queue):
    for line in iter(out.readline, ""):
        queue.put(line)
    out.close()

class EngineProcess:
    def __init__(self, cmd, init_commands=None):
        self._proc = subprocess.Popen(
            cmd,
            text=True,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        self.queue = Queue()
        self.thread = Thread(target=enqueue_output, args=(self._proc.stdout, self.queue), daemon=True)
        self.thread.start()
        self._quit_sent = False
        if init_commands:
            for c in init_commands:
                self.put(c)

    def put(self, cmd: str):
        if not self._proc.stdin or self._proc.poll() is not None or self._quit_sent:
            return
        try:
            self._proc.stdin.write(f"{cmd}\n")
            self._proc.stdin.flush()
            if cmd == "quit":
                self._quit_sent = True
        except OSError:
            pass

    def read_line(self) -> str:
        try:
            return self.queue.get_nowait().strip()
        except Empty:
            return ""

    def terminate(self):
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

    task = asyncio.create_task(read_socket())

    try:
        while websocket.client_state == WebSocketState.CONNECTED:
            while res := engine.read_line():
                await websocket.send_text(res)
            await asyncio.sleep(0.01)
    except Exception:
        pass
    finally:
        task.cancel()
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
