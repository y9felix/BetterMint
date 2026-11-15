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
                    return None
                mock_instance.read_line = fake_read
                mock_proc.return_value = mock_instance
                asyncio.run(handle_engine(ws, ["/usr/bin/stockfish"]))

        out = stdout_trap.getvalue()
        self.assertIn("[ENGINE SPAWN] /usr/bin/stockfish", out)
        self.assertIn("[UCI IN] uci", out)
        self.assertIn("[UCI IN] quit", out)
        self.assertIn("[ENGINE STOP] /usr/bin/stockfish", out)

    def test_handle_engine_logs_stderr(self):
        ws = MagicMock()
        ws.accept = AsyncMock()
        async def fake_iter_text():
            return
            yield
        ws.iter_text = fake_iter_text
        ws.client_state = WebSocketState.CONNECTED

        stdout_trap = io.StringIO()
        with patch("sys.stdout", stdout_trap):
            with patch("main.EngineProcess") as mock_proc:
                mock_instance = MagicMock()
                mock_proc.return_value = mock_instance
                mock_instance.read_line = MagicMock(return_value=None)
                mock_stderr = AsyncMock()
                mock_stderr.readline = AsyncMock(side_effect=[b"engine warning\n", b""])
                mock_proc_obj = MagicMock()
                mock_proc_obj.stderr = mock_stderr
                mock_proc_obj.returncode = 0
                mock_instance._proc = mock_proc_obj
                asyncio.run(handle_engine(ws, ["/usr/bin/stockfish"]))

        out = stdout_trap.getvalue()
        self.assertIn("[ENGINE STDERR] engine warning", out)

    def test_handle_engine_terminates_on_disconnect_during_idle_readline(self):
        ws = MagicMock()
        ws.accept = AsyncMock()
        async def fake_iter_text():
            from fastapi.websockets import WebSocketDisconnect
            yield "uci"
            raise WebSocketDisconnect()
        ws.iter_text = fake_iter_text
        ws.client_state = WebSocketState.CONNECTED

        stdout_trap = io.StringIO()
        with patch("sys.stdout", stdout_trap):
            with patch("main.EngineProcess") as mock_proc:
                mock_instance = MagicMock()
                mock_proc.return_value = mock_instance
                async def idle_blocking_readline():
                    await asyncio.sleep(60)
                    return ""
                mock_instance.read_line = idle_blocking_readline
                mock_instance._proc = None
                asyncio.run(handle_engine(ws, ["/usr/bin/stockfish"]))

        out = stdout_trap.getvalue()
        self.assertIn("[ENGINE SPAWN] /usr/bin/stockfish", out)
        self.assertIn("[UCI IN] uci", out)
        self.assertIn("[ENGINE STOP] /usr/bin/stockfish", out)

    def test_handle_engine_skips_empty_lines_without_stopping(self):
        ws = MagicMock()
        ws.accept = AsyncMock()
        ws.send_text = AsyncMock()
        async def fake_iter_text():
            from fastapi.websockets import WebSocketDisconnect
            yield "uci"
            await asyncio.sleep(0.05)
            raise WebSocketDisconnect()
        ws.iter_text = fake_iter_text
        ws.client_state = WebSocketState.CONNECTED

        stdout_trap = io.StringIO()
        with patch("sys.stdout", stdout_trap):
            with patch("main.EngineProcess") as mock_proc:
                mock_instance = MagicMock()
                mock_proc.return_value = mock_instance
                mock_instance.read_line = AsyncMock(side_effect=["id author", "", "option name Hash", "uciok", None])
                mock_instance._proc = None
                asyncio.run(handle_engine(ws, ["/usr/bin/stockfish"]))

        sent = [call.args[0] for call in ws.send_text.await_args_list]
        self.assertIn("id author", sent)
        self.assertIn("option name Hash", sent)
        self.assertIn("uciok", sent)
        self.assertNotIn("", sent)

    def test_origin_validation(self):
        from main import is_allowed_ws_origin
        ws_ok1 = MagicMock()
        ws_ok1.headers = {"origin": "https://www.chess.com"}
        self.assertTrue(is_allowed_ws_origin(ws_ok1))

        ws_ok2 = MagicMock()
        ws_ok2.headers = {"origin": "chrome-extension://abcdef"}
        self.assertTrue(is_allowed_ws_origin(ws_ok2))

        ws_bad = MagicMock()
        ws_bad.headers = {"origin": "https://evil.com"}
        self.assertFalse(is_allowed_ws_origin(ws_bad))

    def test_engine_process_put_multiline(self):
        from main import EngineProcess
        proc = MagicMock()
        proc.stdin = MagicMock()
        proc.stdin.drain = AsyncMock()
        proc.returncode = None
        ep = EngineProcess(["stockfish"])
        ep._proc = proc
        asyncio.run(ep.put("isready\ngo depth 10\nquit\n"))
        calls = [c.args[0] for c in proc.stdin.write.call_args_list]
        self.assertEqual(calls, [b"isready\n", b"go depth 10\n", b"quit\n"])
        self.assertTrue(ep._quit_sent)

    def test_engine_process_blocks_logfile_option(self):
        from main import EngineProcess
        proc = MagicMock()
        proc.stdin = MagicMock()
        proc.stdin.drain = AsyncMock()
        proc.returncode = None
        ep = EngineProcess(["stockfish"])
        ep._proc = proc
        asyncio.run(ep.put("setoption name Debug Log File value /tmp/evil.log\nsetoption name Threads value 4\n"))
        calls = [c.args[0] for c in proc.stdin.write.call_args_list]
        self.assertEqual(calls, [b"setoption name Threads value 4\n"])

if __name__ == "__main__":
    unittest.main()
