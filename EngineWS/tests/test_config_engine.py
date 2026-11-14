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

    def test_load_config_creates_default_if_missing(self):
        cfg = main.load_config(self.config_path)
        self.assertEqual(cfg.get("default"), "stockfish")
        self.assertIn("stockfish", cfg.get("engines", {}))
        self.assertTrue(os.path.exists(self.config_path))
        with open(self.config_path, "r", encoding="utf-8") as f:
            saved = json.load(f)
        self.assertEqual(saved, cfg)

    def test_load_config_reads_existing(self):
        custom = {
            "default": "myengine",
            "engines": {
                "myengine": ["/opt/bin/myengine", "--fast"],
                "stockfish": ["stockfish"]
            }
        }
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(custom, f)
        cfg = main.load_config(self.config_path)
        self.assertEqual(cfg, custom)

    def test_resolve_engine_command(self):
        cfg = {
            "default": "stockfish",
            "engines": {
                "stockfish": ["stockfish"],
                "patricia": ["/usr/bin/patricia"]
            }
        }
        cmd_default = main.resolve_engine_cmd(cfg, None)
        self.assertEqual(cmd_default, ["stockfish"])

        cmd_named = main.resolve_engine_cmd(cfg, "patricia")
        self.assertEqual(cmd_named, ["/usr/bin/patricia"])

        cmd_fallback = main.resolve_engine_cmd(cfg, "nonexistent")
        self.assertEqual(cmd_fallback, ["stockfish"])

    def test_handle_engine_missing_binary(self):
        ws = MagicMock()
        ws.accept = AsyncMock()
        ws.send_text = AsyncMock()
        ws.close = AsyncMock()
        with patch("main.EngineProcess", side_effect=FileNotFoundError("No such file")):
            asyncio.run(main.handle_engine(ws, ["nonexistent_binary_xyz"]))
        ws.accept.assert_awaited_once()
        ws.send_text.assert_awaited()
        sent_messages = [call.args[0] for call in ws.send_text.await_args_list]
        self.assertTrue(any("Error" in msg for msg in sent_messages))
        ws.close.assert_awaited_once()

if __name__ == "__main__":
    unittest.main()
