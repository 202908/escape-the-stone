const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const restartButton = document.getElementById("restart");

const COLS = 12;
const ROWS = 8;
const INITIAL_CALM_MS = 5000;
const REST_MS = 1000;
const WARNING_MS = 3000;
const FALL_MS = 1200;
const DASH_COOLDOWN = 900;

const keys = new Set();

const state = {
  phase: "calm",
  phaseStart: performance.now(),
  danger: new Set(),
  score: 0,
  gameOver: false,
  players: [
    createPlayer("star", 2, 4, "#ffe96f", "#f7a62d"),
    createPlayer("cloud", 9, 4, "#e8f8ff", "#7ecce0"),
  ],
};

function createPlayer(kind, col, row, fill, accent) {
  return {
    kind,
    col,
    row,
    targetCol: col,
    targetRow: row,
    x: col,
    y: row,
    fill,
    accent,
    alive: true,
    lastMove: 0,
    lastDash: -DASH_COOLDOWN,
  };
}

function cellKey(col, row) {
  return `${col},${row}`;
}

function chooseDangerCells() {
  const next = new Set();
  const cells = [];
  for (let col = 0; col < COLS; col += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      cells.push([col, row]);
    }
  }

  shuffle(cells);
  cells.slice(0, cells.length / 2).forEach(([col, row]) => next.add(cellKey(col, row)));
  state.danger = next;
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function resetGame() {
  state.phase = "calm";
  state.phaseStart = performance.now();
  state.danger = new Set();
  state.score = 0;
  state.gameOver = false;
  state.players = [
    createPlayer("star", 2, 4, "#ffe96f", "#f7a62d"),
    createPlayer("cloud", 9, 4, "#e8f8ff", "#7ecce0"),
  ];
  restartButton.classList.remove("is-visible");
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function boardMetrics() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const horizon = h * 0.18;
  const bottom = h * 0.88;
  const topWidth = w * 0.48;
  const bottomWidth = w * 0.9;
  return { w, h, horizon, bottom, topWidth, bottomWidth };
}

function project(col, row, z = 0) {
  const m = boardMetrics();
  const depth = (row + 0.5) / ROWS;
  const centerX = m.w / 2;
  const y = lerp(m.horizon, m.bottom, Math.pow(depth, 1.48)) - z;
  const width = lerp(m.topWidth, m.bottomWidth, depth);
  const x = centerX - width / 2 + ((col + 0.5) / COLS) * width;
  const cellW = width / COLS;
  const cellH = (m.bottom - m.horizon) / ROWS * lerp(0.45, 1.28, depth);
  return { x, y, cellW, cellH, depth };
}

function cellPolygon(col, row) {
  const a = project(col - 0.5, row - 0.5);
  const b = project(col + 0.5, row - 0.5);
  const c = project(col + 0.5, row + 0.5);
  const d = project(col - 0.5, row + 0.5);
  return [a, b, c, d];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function update(now) {
  if (!state.gameOver) {
    handleInput(now);
    state.players.forEach((player) => {
      player.x = lerp(player.x, player.targetCol, 0.24);
      player.y = lerp(player.y, player.targetRow, 0.24);
    });

    if (state.phase === "calm" && now - state.phaseStart >= INITIAL_CALM_MS) {
      chooseDangerCells();
      state.phase = "warning";
      state.phaseStart = now;
    } else if (state.phase === "rest" && now - state.phaseStart >= REST_MS) {
      chooseDangerCells();
      state.phase = "warning";
      state.phaseStart = now;
    } else if (state.phase === "warning" && now - state.phaseStart >= WARNING_MS) {
      state.phase = "falling";
      state.phaseStart = now;
    } else if (state.phase === "falling" && now - state.phaseStart >= FALL_MS) {
      resolveHits();
      state.score += 1;
      state.danger = new Set();
      state.phase = "rest";
      state.phaseStart = now;
    }
  }

  draw(now);
  requestAnimationFrame(update);
}

function handleInput(now) {
  movePlayer(state.players[0], now, {
    up: "s",
    down: "x",
    left: "z",
    right: "c",
    dash: "a",
    minCol: 0,
    maxCol: COLS - 1,
  });
  movePlayer(state.players[1], now, {
    up: "arrowup",
    down: "arrowdown",
    left: "arrowleft",
    right: "arrowright",
    dash: "m",
    minCol: 0,
    maxCol: COLS - 1,
  });
}

function movePlayer(player, now, controls) {
  if (!player.alive || now - player.lastMove < 120) return;

  let dx = 0;
  let dy = 0;
  if (keys.has(controls.up)) dy -= 1;
  if (keys.has(controls.down)) dy += 1;
  if (keys.has(controls.left)) dx -= 1;
  if (keys.has(controls.right)) dx += 1;
  if (dx === 0 && dy === 0) return;

  const canDash = keys.has(controls.dash) && now - player.lastDash >= DASH_COOLDOWN;
  const distance = canDash ? 2 : 1;
  const nextCol = clamp(player.targetCol + dx * distance, controls.minCol, controls.maxCol);
  const nextRow = clamp(player.targetRow + dy * distance, 0, ROWS - 1);
  player.targetCol = nextCol;
  player.targetRow = nextRow;
  player.lastMove = now;
  if (canDash) player.lastDash = now;
}

function resolveHits() {
  state.players.forEach((player) => {
    if (state.danger.has(cellKey(player.targetCol, player.targetRow))) {
      player.alive = false;
    }
  });

  if (state.players.some((player) => !player.alive)) {
    state.gameOver = true;
    restartButton.classList.add("is-visible");
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function draw(now) {
  const m = boardMetrics();
  ctx.clearRect(0, 0, m.w, m.h);
  drawSky(m);
  drawBoard(now);
  drawCharacters(now);
  drawScore(m, now);
  if (state.gameOver) drawGameOver(m);
}

function drawSky(m) {
  const gradient = ctx.createLinearGradient(0, 0, 0, m.h);
  gradient.addColorStop(0, "#243240");
  gradient.addColorStop(0.54, "#14212c");
  gradient.addColorStop(1, "#0d1218");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, m.w, m.h);

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  for (let i = 0; i < 42; i += 1) {
    const x = (i * 97) % m.w;
    const y = 42 + ((i * 53) % Math.max(1, m.h * 0.34));
    ctx.globalAlpha = 0.25 + ((i % 5) * 0.08);
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function drawBoard(now) {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      drawCell(col, row, now);
    }
  }
  if (state.phase === "falling") drawFallingStones(now);
}

function drawCell(col, row, now) {
  const poly = cellPolygon(col, row);
  const danger = state.danger.has(cellKey(col, row));
  const pulse = 0.45 + Math.sin(now / 90 + col * 0.4 + row) * 0.18;

  ctx.beginPath();
  poly.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fillStyle = danger && state.phase === "warning"
    ? `rgba(255, 70, 70, ${pulse})`
    : (col + row) % 2 === 0
      ? "rgba(78, 160, 184, 0.18)"
      : "rgba(226, 197, 82, 0.14)";
  ctx.fill();
  ctx.strokeStyle = danger && state.phase === "warning"
    ? "rgba(255, 130, 130, 0.88)"
    : "rgba(225, 240, 244, 0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawFallingStones(now) {
  const elapsed = now - state.phaseStart;
  const t = clamp(elapsed / FALL_MS, 0, 1);
  state.danger.forEach((key) => {
    const [col, row] = key.split(",").map(Number);
    const p = project(col, row, lerp(260, 18, easeIn(t)));
    drawStone(p.x, p.y, p.cellW * 0.35, p.cellH * 0.34);
  });
}

function easeIn(t) {
  return t * t;
}

function drawStone(x, y, rx, ry) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#59606a";
  ctx.strokeStyle = "#2b3037";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-rx * 0.7, -ry * 0.1);
  ctx.lineTo(-rx * 0.35, -ry * 0.72);
  ctx.lineTo(rx * 0.4, -ry * 0.62);
  ctx.lineTo(rx * 0.78, -ry * 0.08);
  ctx.lineTo(rx * 0.54, ry * 0.56);
  ctx.lineTo(-rx * 0.4, ry * 0.68);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCharacters(now) {
  const ordered = [...state.players].sort((a, b) => a.y - b.y);
  ordered.forEach((player) => drawPlayer(player, now, 1));
}

function drawPlayer(player, now, alpha = 1, sideOffset = 1) {
  if (!player.alive && Math.floor(now / 140) % 2 === 0) return;
  const p = project(player.x, player.y);
  const bob = Math.sin(now / 180 + player.targetCol) * 3;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(p.x + (sideOffset - 1) * p.cellW, p.y - p.cellH * 0.42 + bob);
  const scale = lerp(0.48, 0.92, p.depth);
  ctx.scale(scale, scale);
  player.kind === "cloud" ? drawCloud(player) : drawStar(player);
  ctx.restore();
}

function drawCloud(player) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 38, 58, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = player.fill;
  ctx.strokeStyle = player.accent;
  ctx.lineWidth = 4;
  roundedBlob([
    [-44, 6, 26],
    [-18, -10, 32],
    [16, -14, 36],
    [45, 6, 25],
    [8, 14, 44],
    [-28, 16, 36],
  ]);
  drawEyes(-16, 3, 16, 3);
}

function roundedBlob(parts) {
  parts.forEach(([x, y, r], index) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (index < 4) ctx.stroke();
  });
}

function drawStar(player) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 42, 44, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = player.fill;
  ctx.strokeStyle = player.accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? 48 : 23;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  drawEyes(-14, -4, 14, -4);
}

function drawEyes(x1, y1, x2, y2) {
  ctx.fillStyle = "#14212c";
  ctx.beginPath();
  ctx.arc(x1, y1, 5, 0, Math.PI * 2);
  ctx.arc(x2, y2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x1 - 2, y1 - 2, 1.6, 0, Math.PI * 2);
  ctx.arc(x2 - 2, y2 - 2, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawScore(m, now) {
  const elapsed = now - state.phaseStart;
  const calmRemaining = state.phase === "calm" ? Math.max(0, (INITIAL_CALM_MS - elapsed) / 1000) : 0;
  const warningRemaining = state.phase === "warning" ? Math.max(0, (WARNING_MS - elapsed) / 1000) : 0;
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`撐過 ${state.score} 波`, m.w / 2, 38);

  ctx.font = "600 14px system-ui, sans-serif";
  ctx.fillStyle = state.phase === "warning" ? "#ffb0b0" : "#d8dde3";
  const message = state.phase === "calm"
    ? `準備一下 ${Math.ceil(calmRemaining)}`
    : state.phase === "warning"
      ? "紅燈格子快掉石頭"
      : state.phase === "falling"
        ? "石頭掉下來了"
        : "等一下再亮紅燈";
  ctx.fillText(message, m.w / 2, 62);

  if (state.phase === "warning") {
    const countdown = clamp(Math.ceil(warningRemaining), 1, 3);
    ctx.fillStyle = "rgba(255, 230, 230, 0.95)";
    ctx.font = "800 64px system-ui, sans-serif";
    ctx.fillText(String(countdown), m.w / 2, 130);
  }
}

function drawGameOver(m) {
  ctx.fillStyle = "rgba(7, 10, 13, 0.58)";
  ctx.fillRect(0, 0, m.w, m.h);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "800 42px system-ui, sans-serif";
  ctx.fillText("遊戲結束", m.w / 2, m.h / 2 - 18);
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.fillText(`你們一起躲過 ${state.score} 波石頭`, m.w / 2, m.h / 2 + 20);
}

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

window.addEventListener("resize", resizeCanvas);
restartButton.addEventListener("click", resetGame);

resizeCanvas();
resetGame();
requestAnimationFrame(update);
