<div align="center">

<img src="BetterMint/img/betterlogo.png" alt="BetterMint" height="120" />

# BetterMint

**Chess.com engine analysis and auto-move tool.**

[![Version](https://img.shields.io/badge/version-2.2.9-7a5cff?style=for-the-badge)](https://github.com/y9felix/BetterMint/releases/tag/v2.2.9)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4ade80?style=for-the-badge&logo=googlechrome&logoColor=white)](#)
[![Wiki](https://img.shields.io/badge/Docs-Wiki-6366f1?style=for-the-badge)](https://github.com/y9felix/BetterMint/wiki)
[![License](https://img.shields.io/badge/License-RPL--1.5-ea580c?style=for-the-badge)](LICENSE)

</div>

> [!NOTE]
> BetterMint is complete. Future updates will address only fixes for Chess.com DOM changes and Chromium updates. If a problem arises, open an issue on [GitHub](https://github.com/y9felix/BetterMint/issues).

## What it is

BetterMint is a Manifest V3 Chrome extension that connects Chess.com to Stockfish and other UCI chess engines over WebSocket.
It draws an evaluation bar, move hint arrows, and move analysis highlights on the board, and supports Polyglot opening books and human-like auto-move.
You can connect BetterMint to hosted engine sockets or run local engines through EngineWS.

Full guides, screenshots, and configuration details live in the [BetterMint Wiki](https://github.com/y9felix/BetterMint/wiki).

<p align="center">
  <img src="https://raw.githubusercontent.com/wiki/y9felix/BetterMint/images/home-overview.png" alt="BetterMint Chess.com evaluation bar, move hint arrows, and popup UI" width="720" />
</p>

## Capabilities

- Live engine switching and dynamic UCI controls in the popup, saved per engine URL.
- Search Depth, Move Time, and Node Limit controls.
- Polyglot `.bin` opening book lookups in EngineWS, configurable globally or per engine.
- Floating evaluation bar, multi-line hint arrows, mate indicators, and move analysis badges.
- Auto Queue with a Rematch first option and Auto Move with log-normal human-like timing, fast reflex moves, opening pacing, and clock scaling.
- Saved configs menu for switching setups and four popup themes: Dark, Light, Black, and Chess.com.

## Quick start

### 1. Engine backend

Pick one of two engine backends:

- Remote sockets from [bettermint-sockets](https://github.com/ProtonDev-sys/bettermint-sockets) require no local setup.
- Local EngineWS runs native Universal Chess Interface engines such as Stockfish, Patricia, or Maia on your machine with Python 3.10 or newer.

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

- On Linux or macOS, run `./run.sh`.
- On Windows, run `run.bat`.

### 2. Chrome extension

1. Open `chrome://extensions` in Chrome, Brave, or Edge.
2. Turn on Developer mode in the top right corner.
3. Click Load unpacked and select the `BetterMint` directory.
4. Open the BetterMint popup and enter `ws://localhost:8000/ws` or a [bettermint-sockets](https://github.com/ProtonDev-sys/bettermint-sockets) endpoint in WebSocket API URL.
5. Open [Chess.com](https://www.chess.com) and start a game.

## Credits and license

- [thedemons](https://github.com/thedemons), original extension creator.
- [BotSolvers/BetterMint](https://github.com/BotSolvers/BetterMint), upstream V2.
- [ProtonDev](https://github.com/ProtonDev-sys), public engine sockets.
- [y9felix](https://github.com/y9felix), architecture refactor and maintenance.

Licensed under the Reciprocal Public License 1.5. See [LICENSE](LICENSE) for details.
