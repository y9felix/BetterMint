import asyncio
import io
import os
import sys
import unittest
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi.websockets import WebSocketState

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from main import handle_engine

class TestServerLogging(unittest.TestCase):
    def test_handle_engine_logs_spawn_and_uci_in(self):
        ws = MagicMock()
        ws.accept = AsyncMock()
        async def fake_iter_text():
            yield "uci"
            yield "quit"
        ws.iter_text = fake_iter_text
        ws.client_state = WebSocketState.CONNECTED

        stdout_trap = io.StringIO()
        with patch("sys.stdout", stdout_trap):
            with patch("main.EngineProcess") as mock_proc:
                mock_instance = MagicMock()
                def fake_read():
                    ws.client_state = WebSocketState.DISCONNECTED
                    return ""
                mock_instance.read_line = fake_read
                mock_proc.return_value = mock_instance
                asyncio.run(handle_engine(ws, ["/usr/bin/stockfish"]))

        out = stdout_trap.getvalue()
        self.assertIn("[ENGINE SPAWN] /usr/bin/stockfish", out)
        self.assertIn("[UCI IN] uci", out)
        self.assertIn("[UCI IN] quit", out)
        self.assertIn("[ENGINE STOP] /usr/bin/stockfish", out)

if __name__ == "__main__":
    unittest.main()
