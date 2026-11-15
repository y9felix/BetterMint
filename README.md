# BetterMint

High-performance chess companion and real-time analysis extension for Chess.com, backed by a local UCI engine WebSocket server.

[![Version](https://img.shields.io/badge/version-2.1.6-blue.svg)](https://github.com/y9felix/BetterMint/releases/tag/v2.1.6)
[![License: RPL 1.5](https://img.shields.io/badge/License-RPL%201.5-green.svg)](LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-v3-orange.svg)](BetterMint/manifest.json)

---

## Features

- **Local UCI Engine Bridge (`EngineWS`)**: Run local UCI chess engines (Stockfish, Maia, Leela Chess Zero, Komodo) directly over an asynchronous WebSocket connection.
- **Dynamic UCI Controls**: Automatically detects engine-supported options (`Hash`, `Threads`, `UCI_Elo`, `MultiPV`, etc.) and renders interactive controls dynamically in the settings menu.
- **Hot Engine Switching**: Switch engines or update UCI parameters dynamically without reloading Chess.com.
- **Live Evaluation Bar**: Smooth visual evaluation bar displaying real-time centipawn evaluation and mate distances.
- **Natural Auto-Move**: Human-like move execution with Gaussian-distributed thinking times and endgame acceleration.
- **Auto-Queue**: Automated matchmaking and rematch queuing upon game completion.
- **Streamlined UI**: Dark, minimalist configuration card interface with collapsible sections and zero bloat.

---

## Getting Started

### 1. EngineWS Server

Requires Python 3.10+ and a UCI-compliant chess engine (e.g. Stockfish).

Install dependencies:
```bash
cd EngineWS
pip install -r requirements.txt
```

Configure your engines in `EngineWS/config.json`:
```json
{
  "default": "stockfish",
  "engines": {
    "stockfish": ["stockfish"],
    "maia": ["lc0", "--weights=/path/to/weights.pb.gz"]
  }
}
```

Launch the server:
- **Linux:**
  ```bash
  ./run.sh
  ```
- **Windows:**
  ```cmd
  run.bat
  ```

The server listens on `ws://127.0.0.1:8000/ws` (using the `default` engine), or `ws://127.0.0.1:8000/ws/{engine_name}`.

### 2. BetterMint Extension

1. Open your Chromium-based browser (`chrome://extensions` or `brave://extensions`).
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the `BetterMint` directory.

### 3. Usage

1. Click the BetterMint icon in your browser toolbar to open the options panel.
2. Under **Engine Server**, verify the **WebSocket API URL** is set to `ws://localhost:8000/ws` (or a named endpoint such as `ws://localhost:8000/ws/maia`).
3. Expand **Engine UCI Options** to customize detected engine parameters (`Threads`, `Hash`, `UCI_Elo`, etc.) live.

---

## Attribution & License

BetterMint is derived from [BotSolvers/BetterMint](https://github.com/BotSolvers/BetterMint).

This project is licensed under the **Reciprocal Public License 1.5 (RPL-1.5)**. See the [LICENSE](LICENSE) file for complete license terms.
