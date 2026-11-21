import asyncio
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, AsyncMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import main

class TestConfigEngine(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.config_path = os.path.join(self.temp_dir.name, "config.json")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_load_engine_config_creates_default_if_missing(self):
        engine_config = main.load_engine_config(self.config_path)
        self.assertEqual(engine_config.get("default"), "stockfish")
        self.assertIn("stockfish", engine_config.get("engines", {}))
        self.assertTrue(os.path.exists(self.config_path))
        with open(self.config_path, "r", encoding="utf-8") as config_file:
            saved_config = json.load(config_file)
        self.assertEqual(saved_config, engine_config)

    def test_load_engine_config_reads_existing(self):
        custom_config = {
            "default": "myengine",
            "engines": {
                "myengine": ["/opt/bin/myengine", "--fast"],
                "stockfish": ["stockfish"]
            }
        }
        with open(self.config_path, "w", encoding="utf-8") as config_file:
            json.dump(custom_config, config_file)
        loaded_config = main.load_engine_config(self.config_path)
        self.assertEqual(loaded_config, custom_config)

    def test_resolve_engine_command(self):
        engine_config = {
            "default": "stockfish",
            "engines": {
                "stockfish": ["stockfish"],
                "patricia": ["/usr/bin/patricia"]
            }
        }
        default_command = main.resolve_engine_command(engine_config, None)
        self.assertEqual(default_command, ["stockfish"])

        named_command = main.resolve_engine_command(engine_config, "patricia")
        self.assertEqual(named_command, ["/usr/bin/patricia"])

        fallback_command = main.resolve_engine_command(engine_config, "nonexistent")
        self.assertEqual(fallback_command, ["stockfish"])

    def test_serve_engine_websocket_missing_binary(self):
        websocket = MagicMock()
        websocket.send = AsyncMock()
        websocket.close = AsyncMock()
        with patch("main.EngineProcess", side_effect=FileNotFoundError("No such file")):
            asyncio.run(main.serve_engine_websocket(websocket, ["nonexistent_binary_xyz"]))
        websocket.send.assert_awaited()
        sent_messages = [call.args[0] for call in websocket.send.await_args_list]
        self.assertTrue(any("Error" in msg for msg in sent_messages))
        websocket.close.assert_awaited_once()

    def test_load_engine_config_warns_on_malformed_json(self):
        import io
        with open(self.config_path, "w", encoding="utf-8") as config_file:
            config_file.write("{not valid json")
        stdout_trap = io.StringIO()
        with patch("sys.stdout", stdout_trap):
            engine_config = main.load_engine_config(self.config_path)
        self.assertEqual(engine_config, main.DEFAULT_ENGINE_CONFIG)
        self.assertIn("[CONFIG WARN]", stdout_trap.getvalue())

    def test_resolve_engine_command_handles_empty_list(self):
        engine_config = {
            "default": "empty",
            "engines": {"empty": []}
        }
        self.assertEqual(main.resolve_engine_command(engine_config, "empty"), ["stockfish"])

    def test_resolve_engine_command_handles_non_dict_engines(self):
        engine_config = {
            "default": "stockfish",
            "engines": ["unexpected-list"]
        }
        self.assertEqual(main.resolve_engine_command(engine_config, None), ["stockfish"])
        self.assertEqual(main.resolve_engine_command(engine_config, "stockfish"), ["stockfish"])

    def test_serve_engine_websocket_permission_error(self):
        websocket = MagicMock()
        websocket.send = AsyncMock()
        websocket.close = AsyncMock()
        with patch("main.EngineProcess", side_effect=PermissionError("Permission denied")):
            asyncio.run(main.serve_engine_websocket(websocket, ["/opt/nonexec_engine"]))
        websocket.send.assert_awaited()
        sent_messages = [call.args[0] for call in websocket.send.await_args_list]
        self.assertTrue(any("Error: Failed to start engine" in msg for msg in sent_messages))
        websocket.close.assert_awaited_once()

if __name__ == "__main__":
    unittest.main()
