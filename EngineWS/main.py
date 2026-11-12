import asyncio
from queue import Empty, Queue
import subprocess
from threading import Thread
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.websockets import WebSocketState

def enqueue_output(out, queue):
    for line in iter(out.readline, ""):
        queue.put(line)
    out.close()

class EngineChess:
    def __init__(self, path_cmd):
        self._proc = subprocess.Popen(
            path_cmd,
            universal_newlines=True,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        self.queue = Queue()
        self.thread = Thread(target=enqueue_output, args=(self._proc.stdout, self.queue))
        self.thread.daemon = True
        self.thread.start()
        self._quit_sent = False

    def put(self, cmd):
        if not self._proc.stdin:
            return
        if self._proc.poll() is None and not self._quit_sent:
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
            line = self.queue.get_nowait()
        except Empty:
            return ""
        return line.strip()

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

async def handle_engine_ws(websocket: WebSocket, engine_type: str):
    await websocket.accept()

    cmd = ["/usr/bin/patricia"] if engine_type == "patricia" else ["/usr/bin/stockfish"]
    engine = EngineChess(cmd)

    async def read_socket():
        try:
            async for msg in websocket.iter_text():
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
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        task.cancel()
        engine.terminate()

@app.websocket("/patricia")
@app.websocket("/patricia-{dummy:path}")
async def ws_patricia(websocket: WebSocket):
    await handle_engine_ws(websocket, "patricia")

@app.websocket("/stockfish")
@app.websocket("/stockfish-{dummy:path}")
@app.websocket("/ws")
@app.websocket("/{dummy:path}")
async def ws_stockfish(websocket: WebSocket):
    await handle_engine_ws(websocket, "stockfish")

@app.get("/")
async def get():
    return HTMLResponse("""<!DOCTYPE html>
<html>
    <head>
        <title>Engine WebSocket</title>
    </head>
    <body>
        <h1>Chess Engine WebSocket</h1>
        <form action="" onsubmit="sendMessage(event)">
            <input type="text" id="messageText" autocomplete="off"/>
            <button>Send</button>
        </form>
        <ul id='messages'></ul>
        <script>
            var ws = new WebSocket("ws://" + location.host + "/ws");
            ws.onmessage = function(event) {
                var messages = document.getElementById('messages');
                var message = document.createElement('li');
                var content = document.createTextNode(event.data);
                message.appendChild(content);
                messages.appendChild(message);
            };
            ws.onclose = function(event) {
                setTimeout(function() {
                    ws = new WebSocket("ws://" + location.host + "/ws");
                }, 1000);
            };
            function sendMessage(event) {
                var input = document.getElementById("messageText");
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(input.value);
                }
                input.value = '';
                event.preventDefault();
            }
        </script>
    </body>
</html>
""")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
