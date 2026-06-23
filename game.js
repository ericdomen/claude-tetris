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
const startBtn = document.getElementById('start-btn');
const themeToggle = document.getElementById('theme-toggle');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const highscoresBody = document.getElementById('highscores-body');
const highscoresSection = document.getElementById('highscores-section');
const bestComboEl = document.getElementById('best-combo');
const maxLinesClearEl = document.getElementById('max-lines-clear');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const THEME_KEY = 'tetris-theme';
const HIGHSCORES_KEY = 'tetris-highscores';
const STATS_KEY = 'tetris-stats';
const MAX_HIGHSCORES = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, bombReady;
let gridLineColor, blockHighlightColor;
let hasStarted = false;
let currentCombo = 0;

function loadHighScores() {
  try {
    const raw = localStorage.getItem(HIGHSCORES_KEY);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(e => e && typeof e.name === 'string' && typeof e.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_HIGHSCORES);
  } catch {
    return [];
  }
}

function saveHighScores(list) {
  localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(list));
}

function qualifiesForHighScore(finalScore) {
  const list = loadHighScores();
  if (list.length < MAX_HIGHSCORES) return true;
  return finalScore > list[list.length - 1].score;
}

function addHighScore(name, finalScore) {
  const list = loadHighScores();
  const entry = { name: name || 'Anónimo', score: finalScore };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const capped = list.slice(0, MAX_HIGHSCORES);
  saveHighScores(capped);
  // Use object identity (not value match) to find the just-inserted entry,
  // since two entries can legitimately share the same name+score.
  return capped.indexOf(entry);
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { bestCombo: 0, maxLinesClear: 0 };
    return {
      bestCombo: typeof parsed.bestCombo === 'number' ? parsed.bestCombo : 0,
      maxLinesClear: typeof parsed.maxLinesClear === 'number' ? parsed.maxLinesClear : 0,
    };
  } catch {
    return { bestCombo: 0, maxLinesClear: 0 };
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function updateStatsIfNeeded(combo, linesInClear) {
  const stats = loadStats();
  let changed = false;
  if (combo > stats.bestCombo) {
    stats.bestCombo = combo;
    changed = true;
  }
  if (linesInClear > stats.maxLinesClear) {
    stats.maxLinesClear = linesInClear;
    changed = true;
  }
  if (changed) saveStats(stats);
  return stats;
}

function renderHighScoresTable(highlightIndex) {
  const list = loadHighScores();
  highscoresBody.innerHTML = '';
  if (list.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'highscore-empty';
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = 'Sin registros aún';
    tr.appendChild(td);
    highscoresBody.appendChild(tr);
  } else {
    list.forEach((entry, i) => {
      const tr = document.createElement('tr');
      if (i === highlightIndex) tr.classList.add('highscore-highlight');
      const tdRank = document.createElement('td');
      tdRank.textContent = `${i + 1}.`;
      const tdName = document.createElement('td');
      tdName.textContent = entry.name;
      const tdScore = document.createElement('td');
      tdScore.textContent = entry.score.toLocaleString();
      tr.appendChild(tdRank);
      tr.appendChild(tdName);
      tr.appendChild(tdScore);
      highscoresBody.appendChild(tr);
    });
  }
  const stats = loadStats();
  bestComboEl.textContent = stats.bestCombo;
  maxLinesClearEl.textContent = stats.maxLinesClear;
}

function resetRecords() {
  localStorage.removeItem(HIGHSCORES_KEY);
  localStorage.removeItem(STATS_KEY);
  renderHighScoresTable(-1);
}

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

initTheme();

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
  // Combo tracking: a lock that clears at least one line continues the combo;
  // a lock that clears zero lines breaks it. Bomb detonations also route
  // through clearLines() (post-gravity), so a bomb that clears lines extends
  // the combo too, and one that clears none breaks it, same as a normal piece.
  if (cleared > 0) {
    currentCombo++;
    // Only persist when something could actually improve: a combo reset to 0
    // or a 0-line clear can never beat an existing non-negative best, so
    // skip the localStorage read/write on the common (non-clearing) lock.
    updateStatsIfNeeded(currentCombo, cleared);
  } else {
    currentCombo = 0;
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

// Single source of truth for which overlay children are visible in each
// state, so endGame/togglePause/showStartScreen can't drift out of sync.
function setOverlayMode(mode) {
  const visible = {
    start: { startBtn: true, highscoresSection: true },
    pause: {},
    gameOverNoQualify: { restartBtn: true, highscoresSection: true },
    gameOverQualify: { restartBtn: true, highscoresSection: true, nameEntry: true },
  }[mode];
  startBtn.classList.toggle('hidden', !visible.startBtn);
  restartBtn.classList.toggle('hidden', !visible.restartBtn);
  nameEntry.classList.toggle('hidden', !visible.nameEntry);
  highscoresSection.classList.toggle('hidden', !visible.highscoresSection);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  const qualifies = qualifiesForHighScore(score);
  setOverlayMode(qualifies ? 'gameOverQualify' : 'gameOverNoQualify');
  renderHighScoresTable(-1);
  overlay.classList.remove('hidden');
  if (qualifies) {
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 0);
  }
}

function submitHighScore() {
  const name = nameInput.value.trim().slice(0, 12);
  const idx = addHighScore(name, score);
  nameEntry.classList.add('hidden');
  renderHighScoresTable(idx);
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    setOverlayMode('pause');
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
  currentCombo = 0;
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

function showStartScreen() {
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  setOverlayMode('start');
  renderHighScoresTable(-1);
  overlay.classList.remove('hidden');
}

function startGame() {
  hasStarted = true;
  startBtn.classList.add('hidden');
  init();
}

startBtn.addEventListener('click', startGame);
saveScoreBtn.addEventListener('click', submitHighScore);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') submitHighScore();
});
resetRecordsBtn.addEventListener('click', resetRecords);

document.addEventListener('keydown', e => {
  if (!hasStarted) return;
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

showStartScreen();
