import asyncio
from http import HTTPStatus
import io
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosedOK, InvalidStatus
from websockets.frames import Close
from websockets.protocol import State

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from helpers import FakeWebSocket, make_engine_mock
from main import (
    EngineProcess,
    handle_websocket_connection,
    is_allowed_websocket_origin,
    resolve_engine_name_from_path,
    serve_engine_websocket,
    validate_websocket_handshake,
)


class TestServerLogging(unittest.TestCase):
    def _make_engine_mock(self):
        return make_engine_mock()

    def test_serve_engine_websocket_logs_spawn_and_uci_in(self):
        async def fake_messages():
            yield "uci"
            yield "quit"

        websocket = FakeWebSocket(fake_messages)

        stdout_trap = io.StringIO()
        with patch("sys.stdout", stdout_trap):
            with patch("main.EngineProcess") as mock_proc:
                mock_engine = self._make_engine_mock()

                async def fake_read():
                    websocket.state = State.CLOSED
                    return None

                mock_engine.read_stdout_line = fake_read
                mock_proc.return_value = mock_engine
                asyncio.run(serve_engine_websocket(websocket, ["/usr/bin/stockfish"]))

        stdout_output = stdout_trap.getvalue()
        self.assertIn("[ENGINE SPAWN] /usr/bin/stockfish", stdout_output)
        self.assertIn("[UCI IN] uci", stdout_output)
        self.assertIn("[UCI IN] quit", stdout_output)
        self.assertIn("[ENGINE STOP] /usr/bin/stockfish", stdout_output)

    def test_serve_engine_websocket_logs_stderr(self):
        websocket = FakeWebSocket()

        stdout_trap = io.StringIO()
        with patch("sys.stdout", stdout_trap):
            with patch("main.EngineProcess") as mock_proc:
                mock_engine = self._make_engine_mock()
                mock_proc.return_value = mock_engine
                mock_engine.read_stdout_line = AsyncMock(return_value=None)
                mock_stderr = AsyncMock()
                mock_stderr.readline = AsyncMock(side_effect=[b"engine warning\n", b""])
                mock_engine.stderr = mock_stderr
                mock_engine.exit_code = 0
                asyncio.run(serve_engine_websocket(websocket, ["/usr/bin/stockfish"]))

        stdout_output = stdout_trap.getvalue()
        self.assertIn("[ENGINE STDERR] engine warning", stdout_output)

    def test_serve_engine_websocket_terminates_on_disconnect_during_idle_readline(self):
        async def fake_messages():
            yield "uci"
            raise ConnectionClosedOK(Close(1000, ""), Close(1000, ""), True)

        websocket = FakeWebSocket(fake_messages)

        stdout_trap = io.StringIO()
        with patch("sys.stdout", stdout_trap):
            with patch("main.EngineProcess") as mock_proc:
                mock_engine = self._make_engine_mock()
                mock_proc.return_value = mock_engine

                async def idle_blocking_readline():
                    await asyncio.sleep(60)
                    return ""

                mock_engine.read_stdout_line = idle_blocking_readline
                asyncio.run(serve_engine_websocket(websocket, ["/usr/bin/stockfish"]))

        stdout_output = stdout_trap.getvalue()
        self.assertIn("[ENGINE SPAWN] /usr/bin/stockfish", stdout_output)
        self.assertIn("[UCI IN] uci", stdout_output)
        self.assertIn("[ENGINE STOP] /usr/bin/stockfish", stdout_output)

    def test_serve_engine_websocket_skips_empty_lines_without_stopping(self):
        async def fake_messages():
            yield "uci"
            await asyncio.sleep(0.05)
            raise ConnectionClosedOK(Close(1000, ""), Close(1000, ""), True)

        websocket = FakeWebSocket(fake_messages)

        stdout_trap = io.StringIO()
        with patch("sys.stdout", stdout_trap):
            with patch("main.EngineProcess") as mock_proc:
                mock_engine = self._make_engine_mock()
                mock_proc.return_value = mock_engine
                mock_engine.read_stdout_line = AsyncMock(
                    side_effect=["id author", "", "option name Hash", "uciok", None]
                )
                asyncio.run(serve_engine_websocket(websocket, ["/usr/bin/stockfish"]))

        self.assertIn("id author", websocket.sent_messages)
        self.assertIn("option name Hash", websocket.sent_messages)
        self.assertIn("uciok", websocket.sent_messages)
        self.assertNotIn("", websocket.sent_messages)

    def test_serve_engine_websocket_forwards_nonzero_exit_error(self):
        async def fake_messages():
            yield "uci"
            await asyncio.sleep(0.05)

        websocket = FakeWebSocket(fake_messages)

        stdout_trap = io.StringIO()
        with patch("sys.stdout", stdout_trap):
            with patch("main.EngineProcess") as mock_proc:
                mock_engine = self._make_engine_mock()
                mock_proc.return_value = mock_engine
                mock_engine.read_stdout_line = AsyncMock(return_value=None)
                mock_stderr = AsyncMock()
                mock_stderr.readline = AsyncMock(side_effect=[b"Missing NNUE weights\n", b""])
                mock_engine.stderr = mock_stderr
                mock_engine.exit_code = 1
                asyncio.run(serve_engine_websocket(websocket, ["/usr/bin/stockfish"]))

        self.assertIn("info string Error: Engine crashed (exit 1): Missing NNUE weights", websocket.sent_messages)
        websocket.close.assert_awaited_once_with(code=1011)

    def test_origin_validation(self):
        self.assertTrue(is_allowed_websocket_origin("https://www.chess.com"))
        self.assertTrue(is_allowed_websocket_origin("https://chess.com"))
        self.assertTrue(is_allowed_websocket_origin("chrome-extension://abcdef"))
        self.assertTrue(is_allowed_websocket_origin(None))
        self.assertFalse(is_allowed_websocket_origin("https://evil.com"))
        self.assertFalse(is_allowed_websocket_origin("http://www.chess.com"))

    def test_resolve_engine_name_from_path(self):
        self.assertEqual(resolve_engine_name_from_path("/ws"), (True, None))
        self.assertEqual(resolve_engine_name_from_path("/ws/"), (True, None))
        self.assertEqual(resolve_engine_name_from_path("/ws/maia-1500"), (True, "maia-1500"))
        self.assertEqual(resolve_engine_name_from_path("/ws/maia%201500?x=1"), (True, "maia 1500"))
        self.assertEqual(resolve_engine_name_from_path("/"), (False, None))
        self.assertEqual(resolve_engine_name_from_path("/other"), (False, None))
        self.assertEqual(resolve_engine_name_from_path("/ws/a/b"), (False, None))

    def test_validate_websocket_handshake_rejects_invalid_path_and_origin(self):
        connection = MagicMock()
        connection.respond.side_effect = lambda status, body: (status, body)

        bad_path_request = MagicMock()
        bad_path_request.path = "/unknown"
        bad_path_request.headers = {"origin": "https://www.chess.com"}
        self.assertEqual(
            validate_websocket_handshake(connection, bad_path_request),
            (HTTPStatus.NOT_FOUND, "Not Found\n"),
        )

        bad_origin_request = MagicMock()
        bad_origin_request.path = "/ws/stockfish"
        bad_origin_request.headers = {"origin": "https://evil.com"}
        self.assertEqual(
            validate_websocket_handshake(connection, bad_origin_request),
            (HTTPStatus.FORBIDDEN, "Forbidden\n"),
        )

        valid_request = MagicMock()
        valid_request.path = "/ws/stockfish"
        valid_request.headers = {"origin": "https://www.chess.com"}
        self.assertIsNone(validate_websocket_handshake(connection, valid_request))

    def test_engine_process_send_uci_multiline(self):
        subprocess_handle = MagicMock()
        subprocess_handle.stdin = MagicMock()
        subprocess_handle.stdin.drain = AsyncMock()
        subprocess_handle.returncode = None
        engine_process = EngineProcess(["stockfish"])
        engine_process._process = subprocess_handle
        asyncio.run(engine_process.send_uci("isready\ngo depth 10\nquit\n"))
        written_calls = [call.args[0] for call in subprocess_handle.stdin.write.call_args_list]
        self.assertEqual(written_calls, [b"isready\n", b"go depth 10\n", b"quit\n"])
        self.assertTrue(engine_process.has_sent_quit)

    def test_engine_process_blocks_logfile_option(self):
        subprocess_handle = MagicMock()
        subprocess_handle.stdin = MagicMock()
        subprocess_handle.stdin.drain = AsyncMock()
        subprocess_handle.returncode = None
        engine_process = EngineProcess(["stockfish"])
        engine_process._process = subprocess_handle
        asyncio.run(
            engine_process.send_uci(
                "setoption name Debug Log File value /tmp/evil.log\n"
                "setoption  name  Debug  Log  File  value  /tmp/evil2.log\n"
                "setoption name Threads value 4\n"
            )
        )
        written_calls = [call.args[0] for call in subprocess_handle.stdin.write.call_args_list]
        self.assertEqual(written_calls, [b"setoption name Threads value 4\n"])

    def test_serve_engine_websocket_preserves_crash_error_when_terminate_sets_quit(self):
        async def fake_messages():
            yield "uci"
            await asyncio.sleep(0.05)

        websocket = FakeWebSocket(fake_messages)

        stdout_trap = io.StringIO()
        with patch("sys.stdout", stdout_trap):
            with patch("main.EngineProcess") as mock_proc:
                mock_engine = self._make_engine_mock()
                mock_proc.return_value = mock_engine
                mock_engine.read_stdout_line = AsyncMock(return_value=None)
                mock_stderr = AsyncMock()
                mock_stderr.readline = AsyncMock(side_effect=[b"Missing NNUE weights\n", b""])
                mock_engine.stderr = mock_stderr

                def fake_terminate():
                    mock_engine.has_sent_quit = True

                async def fake_wait_until_closed():
                    mock_engine.exit_code = 1

                mock_engine.terminate = fake_terminate
                mock_engine.wait_until_closed = fake_wait_until_closed
                asyncio.run(serve_engine_websocket(websocket, ["/usr/bin/stockfish"]))

        self.assertIn("info string Error: Engine crashed (exit 1): Missing NNUE weights", websocket.sent_messages)
        websocket.close.assert_awaited_once_with(code=1011)

    def test_real_websocket_and_subprocess_end_to_end(self):
        fake_uci_script = (
            "import sys\n"
            "for line in sys.stdin:\n"
            "    cmd = line.strip()\n"
            "    if cmd == 'uci':\n"
            "        print('id name FakeEngine', flush=True)\n"
            "        print('uciok', flush=True)\n"
            "    elif cmd == 'isready':\n"
            "        print('readyok', flush=True)\n"
            "    elif cmd.startswith('position '):\n"
            "        print(f'info string received {cmd}', flush=True)\n"
            "    elif cmd == 'quit':\n"
            "        break\n"
        )
        fake_config = {
            "default": "fake",
            "engines": {"fake": [sys.executable, "-c", fake_uci_script]},
        }

        async def exercise_real_server():
            stdout_trap = io.StringIO()
            with patch("sys.stdout", stdout_trap), patch("main.load_engine_config", return_value=fake_config):
                async with serve(
                    handle_websocket_connection,
                    "127.0.0.1",
                    0,
                    process_request=validate_websocket_handshake,
                ) as server:
                    port = server.sockets[0].getsockname()[1]

                    async with connect(
                        f"ws://127.0.0.1:{port}/ws/fake",
                        origin="https://www.chess.com",
                    ) as client_ws:
                        await client_ws.send("uci")
                        self.assertEqual(await asyncio.wait_for(client_ws.recv(), timeout=2.0), "id name FakeEngine")
                        self.assertEqual(await asyncio.wait_for(client_ws.recv(), timeout=2.0), "uciok")
                        await client_ws.send("isready")
                        self.assertEqual(await asyncio.wait_for(client_ws.recv(), timeout=2.0), "readyok")
                        await client_ws.send("position startpos moves e2e4 e7e5 g1f3 b8c6")
                        self.assertEqual(
                            await asyncio.wait_for(client_ws.recv(), timeout=2.0),
                            "info string received position startpos moves e2e4 e7e5 g1f3 b8c6",
                        )
                        await client_ws.send("quit")

                    with self.assertRaises(InvalidStatus) as bad_origin_ctx:
                        async with connect(
                            f"ws://127.0.0.1:{port}/ws",
                            origin="https://evil.com",
                        ):
                            pass
                    self.assertEqual(bad_origin_ctx.exception.response.status_code, 403)

                    with self.assertRaises(InvalidStatus) as bad_path_ctx:
                        async with connect(
                            f"ws://127.0.0.1:{port}/invalid",
                            origin="https://www.chess.com",
                        ):
                            pass
                    self.assertEqual(bad_path_ctx.exception.response.status_code, 404)

        asyncio.run(exercise_real_server())

if __name__ == "__main__":
    unittest.main()
