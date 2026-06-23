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

const nameEntry = document.getElementById('name-entry');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const overlayScoreboardTable = document.getElementById('overlay-scoreboard-table');
const overlayBestCombo = document.getElementById('overlay-best-combo');
const overlayMaxLines = document.getElementById('overlay-max-lines');
const overlayResetScoresBtn = document.getElementById('overlay-reset-scores-btn');

const startOverlay = document.getElementById('start-overlay');
const playBtn = document.getElementById('play-btn');
const startScoreboardTable = document.getElementById('start-scoreboard-table');
const startBestCombo = document.getElementById('start-best-combo');
const startMaxLines = document.getElementById('start-max-lines');
const startResetScoresBtn = document.getElementById('start-reset-scores-btn');

const THEME_KEY = 'tetris-theme';
const HIGHSCORES_KEY = 'tetris-highscores';
const MAX_HIGHSCORES = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, bombReady;
let combo, maxCombo, maxLinesCleared;
let gridLineColor, blockHighlightColor;
let pendingHighlightEntry = null;
let gameStarted = false;

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
  if (gameStarted) {
    draw();
    drawNext();
  }
});

initTheme();

function loadHighscores() {
  try {
    const raw = localStorage.getItem(HIGHSCORES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHighscores(list) {
  try {
    localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(list));
  } catch {
    // localStorage unavailable (e.g. private browsing quota) — fail silently.
  }
}

function qualifiesForHighscore(candidateScore) {
  const list = loadHighscores();
  if (list.length < MAX_HIGHSCORES) return true;
  const lowest = list.reduce((min, e) => Math.min(min, e.score), Infinity);
  return candidateScore >= lowest;
}

function addHighscore(entry) {
  const list = loadHighscores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const truncated = list.slice(0, MAX_HIGHSCORES);
  saveHighscores(truncated);
  return truncated;
}

function clearHighscores() {
  localStorage.removeItem(HIGHSCORES_KEY);
}

function maxField(list, key) {
  return list.reduce((max, e) => Math.max(max, e[key] || 0), 0);
}

function renderScoreboard(tableEl, bestComboEl, maxLinesEl) {
  const list = loadHighscores();
  tableEl.innerHTML = '';
  if (list.length === 0) {
    const row = document.createElement('tr');
    row.className = 'empty-row';
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = 'Sin récords todavía';
    row.appendChild(cell);
    tableEl.appendChild(row);
  } else {
    list.forEach((entry, i) => {
      const row = document.createElement('tr');
      if (pendingHighlightEntry && entry.date === pendingHighlightEntry.date) {
        row.classList.add('highlight-row');
      }
      const rankCell = document.createElement('td');
      rankCell.className = 'rank-col';
      rankCell.textContent = `${i + 1}.`;
      const nameCell = document.createElement('td');
      nameCell.textContent = entry.name || '---';
      const scoreCell = document.createElement('td');
      scoreCell.className = 'score-col';
      scoreCell.textContent = entry.score.toLocaleString();
      row.appendChild(rankCell);
      row.appendChild(nameCell);
      row.appendChild(scoreCell);
      tableEl.appendChild(row);
    });
  }
  bestComboEl.textContent = maxField(list, 'combo');
  maxLinesEl.textContent = maxField(list, 'lines');
}

function renderAllScoreboards() {
  renderScoreboard(overlayScoreboardTable, overlayBestCombo, overlayMaxLines);
  renderScoreboard(startScoreboardTable, startBestCombo, startMaxLines);
}

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
  if (cleared > 0) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    maxLinesCleared = Math.max(maxLinesCleared, cleared);
  } else {
    combo = 0;
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = blockHighlightColor;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);

  if (colorIndex === BOMB_TYPE) {
    const cx = x * size + size / 2;
    const cy = y * size + size / 2;
    context.beginPath();
    context.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
    context.fillStyle = '#1a1a1a';
    context.fill();
    context.strokeStyle = blockHighlightColor;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(cx + size * 0.12, cy - size * 0.28);
    context.lineTo(cx + size * 0.22, cy - size * 0.4);
    context.stroke();
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
  pendingHighlightEntry = null;

  const isNewHighscore = qualifiesForHighscore(score);
  nameEntry.classList.toggle('hidden', !isNewHighscore);
  if (isNewHighscore) {
    playerNameInput.value = '';
  }
  renderAllScoreboards();
  overlay.classList.remove('hidden');
  if (isNewHighscore) {
    setTimeout(() => playerNameInput.focus(), 0);
  }
}

function submitHighscore() {
  const name = playerNameInput.value.trim() || 'Jugador';
  const entry = {
    name,
    score,
    combo: maxCombo,
    lines,
    date: new Date().toISOString(),
  };
  addHighscore(entry);
  pendingHighlightEntry = entry;
  nameEntry.classList.add('hidden');
  renderAllScoreboards();
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
    nameEntry.classList.add('hidden');
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
  combo = 0;
  maxCombo = 0;
  maxLinesCleared = 0;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  pendingHighlightEntry = null;
  nameEntry.classList.add('hidden');
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!gameStarted) return;
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

saveScoreBtn.addEventListener('click', submitHighscore);
playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') {
    e.preventDefault();
    submitHighscore();
  }
});

function resetScoresAndRerender() {
  clearHighscores();
  pendingHighlightEntry = null;
  renderAllScoreboards();
}
overlayResetScoresBtn.addEventListener('click', resetScoresAndRerender);
startResetScoresBtn.addEventListener('click', resetScoresAndRerender);

function startGame() {
  gameStarted = true;
  startOverlay.classList.add('hidden');
  init();
}
playBtn.addEventListener('click', startGame);

renderAllScoreboards();
