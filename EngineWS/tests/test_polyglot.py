import asyncio
import io
import os
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import main
from main import handle_websocket_connection, validate_websocket_handshake
from polyglot import (
    ENTRY_STRUCT,
    PolyglotBoard,
    lookup_polyglot_moves,
    pick_book_moves,
    resolve_book_path,
)

def encode_polyglot_move(from_sq: str, to_sq: str, promo: str = "") -> int:
    promo_codes = {"": 0, "n": 1, "b": 2, "r": 3, "q": 4}
    from_file = ord(from_sq[0]) - ord("a")
    from_rank = int(from_sq[1]) - 1
    to_file = ord(to_sq[0]) - ord("a")
    to_rank = int(to_sq[1]) - 1
    return (
        (promo_codes[promo] << 12)
        | (from_rank << 9)
        | (from_file << 6)
        | (to_rank << 3)
        | to_file
    )

def write_polyglot_book(path: str, records: list[tuple[int, int, int, int]]):
    sorted_records = sorted(records, key=lambda rec: (rec[0], -rec[2]))
    with open(path, "wb") as book_file:
        for key, raw_move, weight, learn in sorted_records:
            book_file.write(ENTRY_STRUCT.pack(key, raw_move, weight, learn))

class TestPolyglot(unittest.TestCase):
    def test_canonical_zobrist_vectors_fen_and_moves(self):
        vectors = [
            ("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 0x463B96181691FC9C, []),
            ("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", 0x823C9B50FD114196, ["e2e4"]),
            ("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2", 0x0756B94461C50FB0, ["e2e4", "d7d5"]),
            ("rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2", 0x662FAFB965DB29D4, ["e2e4", "d7d5", "e4e5"]),
            ("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3", 0x22A48B5A8E47FF78, ["e2e4", "d7d5", "e4e5", "f7f5"]),
        ]
        for fen, expected_hash, moves in vectors:
            fen_board = PolyglotBoard(fen)
            self.assertEqual(fen_board.zobrist_hash(), expected_hash, f"FEN mismatch for {fen}")

            move_board = PolyglotBoard()
            cmd = "position startpos" if not moves else f"position startpos moves {' '.join(moves)}"
            self.assertTrue(move_board.apply_position_command(cmd))
            self.assertEqual(move_board.zobrist_hash(), expected_hash, f"Move sequence mismatch for {moves}")

    def test_castling_en_passant_and_promotion_state_match_fen(self):
        board_moves = PolyglotBoard()
        self.assertTrue(
            board_moves.apply_position_command(
                "position startpos moves e2e4 a7a6 e4e5 d7d5 e5d6 g8f6 g1f3 b8c6 f1e2 c8d7 e1g1"
            )
        )
        board_fen = PolyglotBoard("r2qkb1r/1ppbpppp/p1nP1n2/8/8/5N2/PPPPBPPP/RNBQ1RK1 b kq - 0 6")
        self.assertEqual(board_moves.zobrist_hash(), board_fen.zobrist_hash())

        promo_moves = PolyglotBoard()
        self.assertTrue(promo_moves.apply_position_command("position fen 4k3/4P3/8/8/8/8/8/4K3 w - - 0 1 moves e7e8q"))
        promo_fen = PolyglotBoard("4Q3/8/8/8/8/8/8/4K3 b - - 0 1")
        self.assertEqual(promo_moves.zobrist_hash(), promo_fen.zobrist_hash())

    def test_decode_polyglot_move_handles_castling_and_promotions(self):
        board = PolyglotBoard("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1")
        self.assertEqual(board.decode_polyglot_move(encode_polyglot_move("e1", "h1")), "e1g1")
        self.assertEqual(board.decode_polyglot_move(encode_polyglot_move("e1", "a1")), "e1c1")
        self.assertEqual(board.decode_polyglot_move(encode_polyglot_move("h1", "g1")), "h1g1")

        black_board = PolyglotBoard("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1")
        self.assertEqual(black_board.decode_polyglot_move(encode_polyglot_move("e8", "h8")), "e8g8")
        self.assertEqual(black_board.decode_polyglot_move(encode_polyglot_move("e8", "a8")), "e8c8")

        promo_board = PolyglotBoard("4k3/4P3/8/8/8/8/8/4K3 w - - 0 1")
        self.assertEqual(promo_board.decode_polyglot_move(encode_polyglot_move("e7", "e8", "n")), "e7e8n")

    def test_binary_search_and_weighted_pick(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            book_path = os.path.join(tmp_dir, "test.bin")
            start_key = PolyglotBoard().zobrist_hash()
            after_e4_key = PolyglotBoard("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1").zobrist_hash()

            write_polyglot_book(
                book_path,
                [
                    (start_key, encode_polyglot_move("e2", "e4"), 900, 0),
                    (start_key, encode_polyglot_move("d2", "d4"), 100, 0),
                    (start_key, encode_polyglot_move("c2", "c4"), 0, 0),
                    (after_e4_key, encode_polyglot_move("e7", "e5"), 500, 0),
                    (0x0000000000000001, encode_polyglot_move("a2", "a3"), 1, 0),
                    (0xFFFFFFFFFFFFFFFE, encode_polyglot_move("h2", "h3"), 1, 0),
                ],
            )

            entries = lookup_polyglot_moves(PolyglotBoard(), book_path)
            self.assertEqual(dict(entries), {"e2e4": 900, "d2d4": 100, "c2c4": 0})

            with patch("polyglot.random.choices", return_value=["e2e4"]) as mock_choices:
                picked, ordered = pick_book_moves(entries)
            self.assertEqual(picked, "e2e4")
            self.assertEqual(ordered, ["e2e4", "d2d4"])
            mock_choices.assert_called_once_with(["e2e4", "d2d4"], weights=[900, 100], k=1)

            self.assertIsNone(pick_book_moves([]))
            self.assertEqual(lookup_polyglot_moves(PolyglotBoard("8/8/8/8/8/8/4K3/4k3 w - - 0 1"), book_path), [])
            self.assertEqual(lookup_polyglot_moves(PolyglotBoard(), os.path.join(tmp_dir, "missing.bin")), [])

    def test_resolve_book_path_per_engine_and_fallback(self):
        base_dir = "/opt/enginews"
        cfg = {
            "default": "stockfish",
            "book": "books/default.bin",
            "books": {
                "patricia": "books/traps.bin",
                "maia": "",
            },
        }
        self.assertEqual(resolve_book_path(cfg, "patricia", base_dir), os.path.normpath("/opt/enginews/books/traps.bin"))
        self.assertIsNone(resolve_book_path(cfg, "maia", base_dir))
        self.assertEqual(resolve_book_path(cfg, "other", base_dir), os.path.normpath("/opt/enginews/books/default.bin"))
        self.assertEqual(resolve_book_path(cfg, None, base_dir), os.path.normpath("/opt/enginews/books/default.bin"))

    def test_real_websocket_book_hit_skips_subprocess_and_miss_forwards(self):
        fake_uci_script = (
            "import sys\n"
            "for line in sys.stdin:\n"
            "    cmd = line.strip()\n"
            "    if cmd == 'uci':\n"
            "        print('id name FakeEngine', flush=True)\n"
            "        print('uciok', flush=True)\n"
            "    elif cmd == 'isready':\n"
            "        print('readyok', flush=True)\n"
            "    elif cmd.startswith('go '):\n"
            "        print('info depth 6 score cp 25 pv a2a4', flush=True)\n"
            "        print('bestmove a2a4', flush=True)\n"
            "    elif cmd == 'quit':\n"
            "        break\n"
        )

        with tempfile.TemporaryDirectory() as tmp_dir:
            book_path = os.path.join(tmp_dir, "traps.bin")
            start_key = PolyglotBoard().zobrist_hash()
            write_polyglot_book(book_path, [(start_key, encode_polyglot_move("e2", "e4"), 500, 0)])

            fake_config = {
                "default": "fake",
                "engines": {"fake": [sys.executable, "-c", fake_uci_script]},
                "books": {"fake": book_path},
            }

            async def exercise_book_server():
                stdout_trap = io.StringIO()
                with (
                    patch("sys.stdout", stdout_trap),
                    patch("main.load_engine_config", return_value=fake_config),
                    patch.object(main, "ENGINEWS_DIR", tmp_dir),
                ):
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

                            await client_ws.send("position startpos\ngo depth 12")
                            self.assertEqual(await asyncio.wait_for(client_ws.recv(), timeout=2.0), "info string book e2e4")
                            self.assertEqual(await asyncio.wait_for(client_ws.recv(), timeout=2.0), "bestmove e2e4")

                            await client_ws.send("position startpos moves a2a3")
                            await client_ws.send("go depth 6")
                            self.assertEqual(
                                await asyncio.wait_for(client_ws.recv(), timeout=2.0),
                                "info depth 6 score cp 25 pv a2a4",
                            )
                            self.assertEqual(await asyncio.wait_for(client_ws.recv(), timeout=2.0), "bestmove a2a4")
                            await client_ws.send("quit")

            asyncio.run(exercise_book_server())

    def test_missing_book_file_logs_warning_and_runs_engine(self):
        async def fake_messages():
            yield "position startpos"
            yield "go depth 5"
            await asyncio.sleep(0.05)

        fake_ws = MagicMock()
        fake_ws.state = main.State.OPEN
        fake_ws.send = AsyncMock()
        fake_ws.close = AsyncMock()
        fake_ws.__aiter__ = lambda self=fake_ws: fake_messages()

        stdout_trap = io.StringIO()
        with patch("sys.stdout", stdout_trap), patch("main.EngineProcess") as mock_proc:
            mock_engine = MagicMock()
            mock_engine.start = AsyncMock(return_value=mock_engine)
            mock_engine.send_uci = AsyncMock()
            mock_engine.wait_until_closed = AsyncMock()
            mock_engine.read_stdout_line = AsyncMock(side_effect=["bestmove d2d4", None])
            mock_engine.stderr = None
            mock_engine.has_sent_quit = False
            mock_engine.exit_code = None
            mock_proc.return_value = mock_engine
            asyncio.run(main.serve_engine_websocket(fake_ws, ["stockfish"], book_path="/nonexistent/missing.bin"))

        self.assertIn("[CONFIG WARN]", stdout_trap.getvalue())
        sent_uci = [call.args[0] for call in mock_engine.send_uci.await_args_list]
        self.assertEqual(sent_uci, ["position startpos", "go depth 5"])

    def test_trapbook_bin_installed_and_entry_size(self):
        self.assertEqual(ENTRY_STRUCT.size, 16)
        trapbook_path = os.path.join(os.path.dirname(__file__), "..", "books", "trapbook.bin")
        if os.path.isfile(trapbook_path):
            board = PolyglotBoard()
            moves = lookup_polyglot_moves(board, trapbook_path)
            self.assertGreater(len(moves), 0)
            uci_moves = [m[0] for m in moves]
            self.assertIn("e2e4", uci_moves)
            self.assertIn("d2d4", uci_moves)
            picked = pick_book_moves(moves)
            self.assertIsNotNone(picked)
            self.assertIn(picked[0], uci_moves)

    def test_invalid_position_skips_stale_book_lookup(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            book_path = os.path.join(tmp_dir, "start.bin")
            start_key = PolyglotBoard().zobrist_hash()
            write_polyglot_book(book_path, [(start_key, encode_polyglot_move("e2", "e4"), 500, 0)])

            async def fake_messages():
                yield "position startpos"
                yield "position fen invalid_fen_string"
                yield "go depth 5"
                await asyncio.sleep(0.05)

            fake_ws = MagicMock()
            fake_ws.state = main.State.OPEN
            fake_ws.send = AsyncMock()
            fake_ws.close = AsyncMock()
            fake_ws.__aiter__ = lambda self=fake_ws: fake_messages()

            with patch("main.EngineProcess") as mock_proc:
                mock_engine = MagicMock()
                mock_engine.start = AsyncMock(return_value=mock_engine)
                mock_engine.send_uci = AsyncMock()
                mock_engine.wait_until_closed = AsyncMock()
                mock_engine.read_stdout_line = AsyncMock(side_effect=["bestmove d2d4", None])
                mock_engine.stderr = None
                mock_engine.has_sent_quit = False
                mock_engine.exit_code = None
                mock_proc.return_value = mock_engine
                asyncio.run(main.serve_engine_websocket(fake_ws, ["stockfish"], book_path=book_path))

            sent_uci = [call.args[0] for call in mock_engine.send_uci.await_args_list]
            self.assertEqual(
                sent_uci,
                ["position startpos", "position fen invalid_fen_string", "go depth 5"],
            )
            ws_sent = [call.args[0] for call in fake_ws.send.await_args_list]
            self.assertEqual(ws_sent, ["bestmove d2d4"])

    def test_apply_uci_move_rejects_wrong_turn_self_move_and_friendly_capture(self):
        board = PolyglotBoard()
        initial_hash = board.zobrist_hash()

        self.assertFalse(board.apply_uci_move("e7e5"))
        self.assertFalse(board.apply_uci_move("e2e2"))
        self.assertFalse(board.apply_uci_move("e1d1"))
        self.assertEqual(board.turn, "w")
        self.assertEqual(board.zobrist_hash(), initial_hash)

        self.assertFalse(board.apply_position_command("position startpos moves e7e5"))
        self.assertFalse(board.apply_position_command("position startpos moves e2e4 d2d4"))

if __name__ == "__main__":
    unittest.main()
