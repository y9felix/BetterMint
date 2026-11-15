<div align="center">

# BetterMint

**Chess.com engine analysis and auto-move tool.**

[![Version](https://img.shields.io/badge/version-2.1.11-7a5cff?style=for-the-badge)](https://github.com/y9felix/BetterMint/releases/tag/v2.1.11)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4ade80?style=for-the-badge&logo=googlechrome&logoColor=white)](#)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](EngineWS)
[![License: RPL-1.5](https://img.shields.io/badge/License-RPL%201.5-22c55e?style=for-the-badge)](LICENSE)

</div>

---

## What it is

BetterMint is a Chrome extension that analyzes your Chess.com games with chess engines. It draws an evaluation bar, hint arrows, and move accuracy directly on the board. You can connect it to hosted engine sockets or run local engines with EngineWS.

---

## Features

- **Dynamic controls**: Adjust engine UCI options directly in the popup.
- **Board HUD**: Display an evaluation bar, multi-line hint arrows, and move accuracy.
- **Auto queue**: Rematch opponents and queue new games automatically.
- **Humanized auto move**: Execute moves with natural delays, fast recaptures, and clock scaling.

---

## Installation

### 1. Engine backend

Choose one of two options:

- **Remote sockets**: Use public engine endpoints from [bettermint-sockets](https://github.com/ProtonDev-sys/bettermint-sockets) (no local setup required).
- **Local EngineWS server**: Run native engines on your computer.

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
4. Set the WebSocket URL in the popup (`ws://localhost:8000/ws` or a [bettermint-sockets](https://github.com/ProtonDev-sys/bettermint-sockets) endpoint).
5. Open [Chess.com](https://www.chess.com) and play.

---

## Credits and license

- **[thedemons](https://github.com/thedemons)**, original extension creator.
- **[BotSolvers/BetterMint](https://github.com/BotSolvers/BetterMint)**, upstream V2.
- **[ProtonDev](https://github.com/ProtonDev-sys)**, public engine sockets.
- **[y9felix](https://github.com/y9felix)**, architecture refactor, dynamic UCI pipeline, and maintenance.

Licensed under the **Reciprocal Public License 1.5 (RPL-1.5)**. See [LICENSE](LICENSE) for details.
