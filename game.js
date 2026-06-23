'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
  '#90a4ae', // Tuerca - gris metálico
  '#d32f2f', // Bomba - rojo intenso
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca - marco con hueco central
];

// ---- Skins ----
// Each skin defines its own palette (indices 1-9, matching COLORS layout)
// plus a draw-style identifier consumed by drawBlock().
const SKINS = {
  retro: {
    palette: COLORS,
    style: 'retro',
  },
  neon: {
    palette: [
      null,
      '#00fff9', // I
      '#fff700', // O
      '#ff00f7', // T
      '#39ff14', // S
      '#ff2d55', // Z
      '#1e90ff', // J
      '#ff9100', // L
      '#b0fcff', // Tuerca
      '#ff3131', // Bomba
    ],
    style: 'neon',
  },
  pastel: {
    palette: [
      null,
      '#a8d8e8', // I
      '#fff2b2', // O
      '#dcb8e0', // T
      '#b9e6c9', // S
      '#f5b8b8', // Z
      '#b8c9f0', // J
      '#f5d2a8', // L
      '#cfd6da', // Tuerca
      '#e89a9a', // Bomba
    ],
    style: 'pastel',
  },
  pixel: {
    palette: COLORS,
    style: 'pixel',
  },
};

const SKIN_KEY = 'tetris-skin';
let currentSkin = 'retro';

const LINE_SCORES = [0, 100, 300, 500, 800];
const BOMB_TYPE = 9;
const BOMB_EVERY_LINES = 10;
const BOMB_SCORE = 50;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, bombReady;
let gridLineColor, blockHighlightColor;

function readThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  gridLineColor = styles.getPropertyValue('--grid-line').trim();
  blockHighlightColor = styles.getPropertyValue('--block-highlight').trim();
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  themeToggle.checked = theme === 'light';
  readThemeColors();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  draw();
  drawNext();
});

function applySkin(skin) {
  if (!SKINS[skin]) skin = 'retro';
  currentSkin = skin;
  document.body.dataset.skin = skin;
  skinSelect.value = skin;
  readThemeColors();
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  applySkin(SKINS[saved] ? saved : 'retro');
}

skinSelect.addEventListener('change', () => {
  const skin = skinSelect.value;
  localStorage.setItem(SKIN_KEY, skin);
  applySkin(skin);
  draw();
  drawNext();
});

initTheme();
initSkin();

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function makeBomb() {
  return { type: BOMB_TYPE, shape: [[BOMB_TYPE]], isBomb: true, x: Math.floor(COLS / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    const prevLines = lines;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (Math.floor(lines / BOMB_EVERY_LINES) > Math.floor(prevLines / BOMB_EVERY_LINES)) {
      bombReady = true;
    }
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.isBomb) {
    detonate();
  } else {
    merge();
    clearLines();
  }
  spawn();
}

function detonate() {
  const cx = current.x;
  const cy = current.y;
  for (let r = cy - 1; r <= cy + 1; r++) {
    if (r < 0 || r >= ROWS) continue;
    for (let c = cx - 1; c <= cx + 1; c++) {
      if (c < 0 || c >= COLS) continue;
      board[r][c] = 0;
    }
  }
  score += BOMB_SCORE * level;
  applyGravity();
  clearLines();
  updateHUD();
}

function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c]) {
        board[write][c] = board[r][c];
        if (write !== r) board[r][c] = 0;
        write--;
      }
    }
    for (let r = write; r >= 0; r--) board[r][c] = 0;
  }
}

function spawn() {
  current = next;
  next = bombReady ? makeBomb() : randomPiece();
  bombReady = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function roundedRectPath(context, rx, ry, rw, rh, radius) {
  const r = Math.min(radius, rw / 2, rh / 2);
  context.beginPath();
  context.moveTo(rx + r, ry);
  context.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
  context.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
  context.arcTo(rx, ry + rh, rx, ry, r);
  context.arcTo(rx, ry, rx + rw, ry, r);
  context.closePath();
}

function drawBombIcon(context, x, y, size, fuseColor) {
  const cx = x * size + size / 2;
  const cy = y * size + size / 2;
  context.beginPath();
  context.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
  context.fillStyle = '#1a1a1a';
  context.fill();
  context.strokeStyle = fuseColor;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(cx + size * 0.12, cy - size * 0.28);
  context.lineTo(cx + size * 0.22, cy - size * 0.4);
  context.stroke();
}

function drawBlockRetro(context, x, y, size, color) {
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = blockHighlightColor;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

function drawBlockNeon(context, x, y, size, color) {
  const rx = x * size + 2;
  const ry = y * size + 2;
  const rw = size - 4;
  const rh = size - 4;
  const baseAlpha = context.globalAlpha;
  context.save();
  context.shadowColor = color;
  context.shadowBlur = size * 0.6;
  context.fillStyle = color;
  context.fillRect(rx, ry, rw, rh);
  // second pass for a brighter core, glow stacks from shadow only on first pass
  context.shadowBlur = 0;
  context.globalAlpha = baseAlpha * 0.85;
  context.fillStyle = blockHighlightColor;
  context.fillRect(rx, ry, rw, 3);
  context.restore();
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
}

function drawBlockPastel(context, x, y, size, color) {
  const rx = x * size + 1.5;
  const ry = y * size + 1.5;
  const rw = size - 3;
  const rh = size - 3;
  roundedRectPath(context, rx, ry, rw, rh, size * 0.22);
  context.fillStyle = color;
  context.fill();
  context.save();
  context.clip();
  context.fillStyle = blockHighlightColor;
  context.fillRect(rx, ry, rw, 4);
  context.restore();
}

let pixelDitherPattern = null;
let pixelDitherPatternCell = null;

function getPixelDitherPattern(context, size) {
  const cell = Math.max(2, Math.round(size / 6));
  if (pixelDitherPattern && pixelDitherPatternCell === cell) return pixelDitherPattern;
  const tile = document.createElement('canvas');
  tile.width = cell * 2;
  tile.height = cell * 2;
  const tctx = tile.getContext('2d');
  tctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  tctx.fillRect(0, 0, cell, cell);
  tctx.fillRect(cell, cell, cell, cell);
  pixelDitherPattern = context.createPattern(tile, 'repeat');
  pixelDitherPatternCell = cell;
  return pixelDitherPattern;
}

function drawBlockPixel(context, x, y, size, color) {
  const rx = x * size + 1;
  const ry = y * size + 1;
  const rw = size - 2;
  const rh = size - 2;
  context.fillStyle = color;
  context.fillRect(rx, ry, rw, rh);
  // checkered dither overlay drawn via a small repeating pattern tile
  context.save();
  context.translate(rx, ry);
  context.fillStyle = getPixelDitherPattern(context, size);
  context.fillRect(0, 0, rw, rh);
  context.restore();
  context.fillStyle = blockHighlightColor;
  context.fillRect(rx, ry, rw, 3);
  context.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  context.lineWidth = 1;
  context.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
}

const SKIN_DRAWERS = {
  retro: drawBlockRetro,
  neon: drawBlockNeon,
  pastel: drawBlockPastel,
  pixel: drawBlockPixel,
};

const BOMB_FUSE_COLORS = {
  retro: () => blockHighlightColor,
  neon: () => '#ffffff',
  pastel: () => '#7a7a90',
  pixel: () => blockHighlightColor,
};

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[currentSkin] || SKINS.retro;
  const color = skin.palette[colorIndex] || COLORS[colorIndex];
  const drawer = SKIN_DRAWERS[skin.style] || drawBlockRetro;
  context.globalAlpha = alpha ?? 1;
  drawer(context, x, y, size, color);
  if (colorIndex === BOMB_TYPE) {
    const fuseColor = (BOMB_FUSE_COLORS[skin.style] || BOMB_FUSE_COLORS.retro)();
    drawBombIcon(context, x, y, size, fuseColor);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridLineColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  bombReady = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

init();
