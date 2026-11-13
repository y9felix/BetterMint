import asyncio
from queue import Empty, Queue
import subprocess
from threading import Thread
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.websockets import WebSocketState

MAIA_RATINGS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]

def enqueue_output(out, queue):
    for line in iter(out.readline, ""):
        queue.put(line)
    out.close()

class EngineProcess:
    def __init__(self, cmd, init_commands=None):
        self._proc = subprocess.Popen(
            cmd,
            universal_newlines=True,
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
        except (BrokenPipeError, OSError):
            pass

    def read_line(self) -> str:
        if not self._proc.stdout:
            return ""
        try:
            return self.queue.get_nowait().strip()
        except Empty:
            return ""

    def terminate(self):
        try:
            if not self._quit_sent:
                self.put("quit")
            self._proc.terminate()
        except Exception:
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
    engine = EngineProcess(cmd, init_commands)

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
            while True:
                res = engine.read_line()
                if res:
                    await websocket.send_text(res)
                else:
                    break
            await asyncio.sleep(0.01)
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        task.cancel()
        engine.terminate()
        print(f"[ENGINE STOP] {' '.join(cmd)}", flush=True)

@app.websocket("/stockfish")
async def ws_stockfish(websocket: WebSocket):
    await handle_engine(websocket, ["/usr/bin/stockfish"])

@app.websocket("/patricia")
async def ws_patricia(websocket: WebSocket):
    await handle_engine(websocket, ["/usr/bin/patricia"])

@app.websocket("/patricia-{elo:int}")
async def ws_patricia_elo(websocket: WebSocket, elo: int):
    init = ["setoption name UCI_LimitStrength value true", f"setoption name UCI_Elo value {elo}"]
    await handle_engine(websocket, ["/usr/bin/patricia"], init)

@app.websocket("/maia-{elo:int}")
async def ws_maia_elo(websocket: WebSocket, elo: int):
    target_elo = min(MAIA_RATINGS, key=lambda r: abs(r - elo))
    cmd = ["/usr/bin/lc0", f"--weights=/home/felix/.local/share/maia/maia-{target_elo}.pb.gz"]
    await handle_engine(websocket, cmd)
