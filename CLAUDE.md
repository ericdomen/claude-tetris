# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla Tetris implementation: HTML5 Canvas + CSS + JavaScript (ES6+). No dependencies, no build step, no `package.json`, no test framework.

## Running the game

No install or build needed. Either:

```bash
open index.html        # macOS
```

or serve statically (avoids any local file/CORS quirks):

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`.

There is no lint, build, or test command in this repo — verify changes by opening the game in a browser and playing.

## Architecture

Three files, all logic lives in `game.js` (~300 lines):

- `index.html` — DOM structure: `<canvas id="board">` (300×600px, the live board) plus a side panel (score/lines/level), a `<canvas>` preview for the next piece, and overlay divs for pause/game-over states.
- `style.css` — dark/retro arcade visual theme only.
- `game.js` — entire game model and loop.

Key pieces in `game.js`:

- **Board model**: `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–7` identifying a locked piece.
- **Pieces**: defined as square matrices; rotation is done via `rotateCW` (transpose + row reverse), not precomputed rotation states.
- **Collision** (`collide`): checks board bounds and overlap with locked cells.
- **Wall kicks** (`tryRotate`): on rotation collision, retries the rotation shifted ±1/±2 columns before giving up.
- **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates elapsed time and drops the piece one row once `dropInterval` is exceeded.
- **Line clearing** (`clearLines`): scans bottom-up, removes full rows, unshifts empty rows at the top.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` × current level; hard drop adds 2 pts/cell dropped, soft drop adds 1 pt/row.
- **Leveling/speed**: level increases every 10 lines; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
- **Ghost piece** (`ghostY`): projects current piece straight down to its landing row, drawn at `globalAlpha = 0.2`.

Control flow:

```
init() → createBoard() → next = randomPiece() → spawn() → requestAnimationFrame(loop)
loop(timestamp): accumulate dt → if dt ≥ dropInterval, drop piece or lockPiece() → draw() → repeat
keydown: move / rotate / soft-drop / hard-drop / pause
```

If a freshly spawned piece immediately collides (`spawn`), `endGame()` fires and the Game Over overlay shows.

## Tunable constants (game.js)

`COLS`, `ROWS`, `BLOCK` (cell size px), `COLORS`, `LINE_SCORES`, `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, also update the `width`/`height` attributes of `<canvas id="board">` in `index.html` to match (`COLS × BLOCK` by `ROWS × BLOCK`).
