<div align="center">

# BetterMint

**Live Chess.com analysis and auto move, backed by local engines.**

[![Version](https://img.shields.io/badge/version-2.1.10-7a5cff?style=for-the-badge)](https://github.com/y9felix/BetterMint/releases/tag/v2.1.10)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4ade80?style=for-the-badge&logo=googlechrome&logoColor=white)](#)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](EngineWS)
[![License: RPL-1.5](https://img.shields.io/badge/License-RPL%201.5-22c55e?style=for-the-badge)](LICENSE)

</div>

---

## What it is

BetterMint runs local UCI chess engines and shows their analysis directly on Chess.com.

A Chrome extension renders an evaluation bar, best-move arrows, and move accuracy on the board. A local Python server, EngineWS, runs native engines like Stockfish or Maia in the background and streams analysis over WebSockets.

---

## Features

- **Local engines**: Run any UCI engine over WebSockets.
- **Dynamic controls**: Adjust engine UCI options directly in the popup.
- **Board HUD**: Display an evaluation bar, multi-line hint arrows, and move accuracy.
- **Auto queue**: Rematch opponents and queue new games automatically.
- **Humanized auto move**: Execute moves with natural delays, fast recaptures, and clock scaling.
- **Configs**: Save, load, import, and export settings.

---

## Installation

### 1. EngineWS server

**Requirements:** Python 3.10+, and a UCI engine (Stockfish, Maia).

```bash
cd EngineWS
pip install -r requirements.txt
```

Set engine paths in `EngineWS/config.json`:

```json
{
  "default": "stockfish",
  "engines": {
    "stockfish": ["stockfish"],
    "maia": ["lc0", "--weights=/path/to/maia-1500.pb.gz"]
  }
}
```

Start the server on `127.0.0.1:8000`:
- **Linux / macOS:** `./run.sh`
- **Windows:** `run.bat`

### 2. Chrome extension

1. Open `chrome://extensions` in a Chromium browser (Brave, Chrome, Edge).
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `BetterMint` directory.
4. Verify the WebSocket URL in the popup (`ws://localhost:8000/ws`).
5. Open [Chess.com](https://www.chess.com) and play.

---

## Credits and license

- **[thedemons](https://github.com/thedemons)**, original extension creator.
- **[BotSolvers/BetterMint](https://github.com/BotSolvers/BetterMint)**, upstream V2 maintenance.
- **[y9felix/BetterMint](https://github.com/y9felix/BetterMint)**, architecture refactor, dynamic UCI pipeline, and maintenance.

Licensed under the **Reciprocal Public License 1.5 (RPL-1.5)**. See [LICENSE](LICENSE) for details.
