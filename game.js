const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const restartButton = document.getElementById("restart");
const startButton = document.getElementById("start-game");
const lobbyScreen = document.getElementById("lobby-screen");
const loadingScreen = document.getElementById("loading-screen");
const gameMenuScreen = document.getElementById("game-menu-screen");
const loadingPercent = document.getElementById("loading-percent");
const menuMessage = document.getElementById("menu-message");
const hud = document.querySelector(".hud");
const backMenuButton = document.getElementById("back-menu");
const gameCards = document.querySelectorAll(".game-card");

const COLS = 12;
const ROWS = 8;
const INITIAL_CALM_MS = 5000;
const REST_MS = 1000;
const WARNING_MS = 3000;
const FALL_MS = 1200;
const DASH_COOLDOWN = 900;

const keys = new Set();

const state = {
  started: false,
  activeGame: null,
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

const mini = {
  space: {},
  rainbow: {},
  moon: {},
};

function showScreen(name) {
  lobbyScreen.hidden = name !== "lobby";
  loadingScreen.hidden = name !== "loading";
  gameMenuScreen.hidden = name !== "menu";
  canvas.classList.toggle("is-hidden", name !== "game");
  hud.classList.toggle("is-hidden", name !== "game" || state.activeGame !== "stone");
  backMenuButton.classList.toggle("is-hidden", name !== "game");
}

function startLoading() {
  showScreen("loading");
  const loadingStarted = performance.now();
  const loadingDuration = 3600;

  function tick(now) {
    const progress = clamp((now - loadingStarted) / loadingDuration, 0, 1);
    loadingPercent.textContent = `${Math.floor(progress * 100)}%`;
    if (progress < 1) {
      requestAnimationFrame(tick);
      return;
    }

    showScreen("menu");
  }

  requestAnimationFrame(tick);
}

function startStoneGame() {
  state.started = true;
  state.activeGame = "stone";
  showScreen("game");
  resetGame();
}

function startMiniGame(gameName) {
  state.started = true;
  state.activeGame = gameName;
  state.gameOver = false;
  keys.clear();
  restartButton.classList.remove("is-visible");
  showScreen("game");
  if (gameName === "space") resetSpaceGame(performance.now());
  if (gameName === "rainbow") resetRainbowGame(performance.now());
  if (gameName === "moon") resetMoonGame(performance.now());
}

function returnToMenu() {
  state.started = false;
  state.activeGame = null;
  state.gameOver = false;
  keys.clear();
  restartButton.classList.remove("is-visible");
  showScreen("menu");
}

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
  keys.clear();
  if (state.activeGame === "space") {
    resetSpaceGame(performance.now());
    return;
  }
  if (state.activeGame === "rainbow") {
    resetRainbowGame(performance.now());
    return;
  }
  if (state.activeGame === "moon") {
    resetMoonGame(performance.now());
    return;
  }

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
  if (state.started && state.activeGame === "stone" && !state.gameOver) {
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
  } else if (state.started && state.activeGame !== "stone") {
    updateMiniGame(now);
  }

  draw(now);
  requestAnimationFrame(update);
}

function updateMiniGame(now) {
  if (state.activeGame === "space") updateSpaceGame(now);
  if (state.activeGame === "rainbow") updateRainbowGame(now);
  if (state.activeGame === "moon") updateMoonGame(now);
}

function handleInput(now) {
  movePlayer(state.players[0], now, {
    up: "keys",
    down: "keyx",
    left: "keyz",
    right: "keyc",
    dash: "keya",
    minCol: 0,
    maxCol: COLS - 1,
  });
  movePlayer(state.players[1], now, {
    up: "arrowup",
    down: "arrowdown",
    left: "arrowleft",
    right: "arrowright",
    dash: "keym",
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
  if (!state.started) return;
  if (state.activeGame === "space") {
    drawSpaceGame(m, now);
    return;
  }
  if (state.activeGame === "rainbow") {
    drawRainbowGame(m, now);
    return;
  }
  if (state.activeGame === "moon") {
    drawMoonGame(m, now);
    return;
  }

  drawSky(m);
  drawBoard(now);
  drawCharacters(now);
  drawScore(m, now);
  if (state.gameOver) drawGameOver(m);
}

function hasMoveKey(name) {
  const map = {
    up: ["arrowup", "keyw", "keys"],
    down: ["arrowdown", "keyx"],
    left: ["arrowleft", "keya", "keyz"],
    right: ["arrowright", "keyd", "keyc"],
    jump: ["arrowup", "space", "keyw", "keys"],
  };
  return map[name].some((key) => keys.has(key));
}

function resetSpaceGame(now) {
  state.gameOver = false;
  restartButton.classList.remove("is-visible");
  mini.space = {
    player: { x: 150, y: 350, r: 24 },
    rocks: [],
    orbs: [],
    score: 0,
    lastRock: now,
    lastOrb: now,
    over: false,
  };
}

function updateSpaceGame(now) {
  const g = mini.space;
  if (g.over) return;
  const m = boardMetrics();
  const speed = 5.2;
  if (hasMoveKey("up")) g.player.y -= speed;
  if (hasMoveKey("down")) g.player.y += speed;
  if (hasMoveKey("left")) g.player.x -= speed;
  if (hasMoveKey("right")) g.player.x += speed;
  g.player.x = clamp(g.player.x, 38, m.w - 38);
  g.player.y = clamp(g.player.y, 80, m.h - 46);

  if (now - g.lastRock > 900) {
    g.rocks.push({ x: m.w + 34, y: 90 + Math.random() * (m.h - 150), r: 18 + Math.random() * 17, speed: 3.4 + Math.random() * 2.4 });
    g.lastRock = now;
  }
  if (now - g.lastOrb > 1600) {
    g.orbs.push({ x: m.w + 24, y: 100 + Math.random() * (m.h - 170), r: 13, speed: 3 });
    g.lastOrb = now;
  }

  g.rocks.forEach((rock) => rock.x -= rock.speed);
  g.orbs.forEach((orb) => orb.x -= orb.speed);
  g.rocks = g.rocks.filter((rock) => rock.x > -60);
  g.orbs = g.orbs.filter((orb) => orb.x > -40);
  g.score += 0.02;

  g.orbs = g.orbs.filter((orb) => {
    if (distance(g.player, orb) < g.player.r + orb.r) {
      g.score += 5;
      return false;
    }
    return true;
  });
  if (g.rocks.some((rock) => distance(g.player, rock) < g.player.r + rock.r - 4)) {
    g.over = true;
    state.gameOver = true;
    restartButton.classList.add("is-visible");
  }
}

function drawSpaceGame(m, now) {
  const g = mini.space;
  const gradient = ctx.createLinearGradient(0, 0, 0, m.h);
  gradient.addColorStop(0, "#17213d");
  gradient.addColorStop(1, "#090d1a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, m.w, m.h);
  drawStarField(m, now, 1.8);
  g.orbs.forEach((orb) => drawEnergyOrb(orb.x, orb.y, orb.r, now));
  g.rocks.forEach((rock) => drawStone(rock.x, rock.y, rock.r, rock.r * 0.9));
  ctx.save();
  ctx.translate(g.player.x, g.player.y);
  ctx.scale(0.6, 0.6);
  drawStar({ fill: "#ffe96f", accent: "#f7a62d" });
  ctx.restore();
  drawMiniHud("小星星太空冒險", `能量 ${Math.floor(g.score)}`, "方向鍵 / WASD 移動", m);
  if (g.over) drawMiniGameOver(m, "撞到隕石了");
}

function resetRainbowGame(now) {
  state.gameOver = false;
  restartButton.classList.remove("is-visible");
  mini.rainbow = {
    player: { x: 110, y: 330, vy: 0, w: 52, h: 36, grounded: false },
    platforms: [
      { x: 60, y: 440, w: 180 },
      { x: 290, y: 365, w: 160 },
      { x: 520, y: 295, w: 170 },
      { x: 760, y: 375, w: 160 },
      { x: 980, y: 310, w: 160 },
    ],
    score: 0,
    lastMove: now,
    over: false,
  };
}

function updateRainbowGame(now) {
  const g = mini.rainbow;
  if (g.over) return;
  const m = boardMetrics();
  const p = g.player;
  if (hasMoveKey("left")) p.x -= 4.8;
  if (hasMoveKey("right")) p.x += 4.8;
  if (hasMoveKey("jump") && p.grounded) {
    p.vy = -12.5;
    p.grounded = false;
  }
  p.vy += 0.52;
  p.y += p.vy;
  p.x = clamp(p.x, 20, m.w - 60);
  p.grounded = false;
  g.platforms.forEach((platform) => {
    const falling = p.vy >= 0;
    const feet = p.y + p.h;
    if (falling && p.x + p.w > platform.x && p.x < platform.x + platform.w && feet > platform.y && feet < platform.y + 22) {
      p.y = platform.y - p.h;
      p.vy = 0;
      p.grounded = true;
      g.score = Math.max(g.score, Math.floor((m.h - platform.y) / 10));
    }
  });
  if (p.y > m.h + 80) {
    g.over = true;
    state.gameOver = true;
    restartButton.classList.add("is-visible");
  }
}

function drawRainbowGame(m, now) {
  const g = mini.rainbow;
  const gradient = ctx.createLinearGradient(0, 0, 0, m.h);
  gradient.addColorStop(0, "#9ddfff");
  gradient.addColorStop(1, "#fff1fb");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, m.w, m.h);
  drawSoftClouds(m, now);
  g.platforms.forEach((platform, index) => drawRainbowPlatform(platform, index));
  ctx.save();
  ctx.translate(g.player.x + 26, g.player.y + 18);
  ctx.scale(0.45, 0.45);
  drawCloud({ fill: "#f8fdff", accent: "#79cfe8" });
  ctx.restore();
  drawMiniHud("彩虹雲朵跳跳", `高度 ${g.score}`, "方向鍵 / WASD 移動，上鍵跳", m);
  if (g.over) drawMiniGameOver(m, "掉下雲層了");
}

function resetMoonGame(now) {
  state.gameOver = false;
  restartButton.classList.remove("is-visible");
  mini.moon = {
    player: { col: 0, row: 0, lastMove: 0 },
    candies: new Set(["2,0", "4,2", "1,3", "5,4"]),
    score: 0,
    over: false,
  };
}

function updateMoonGame(now) {
  const g = mini.moon;
  if (g.over || now - g.player.lastMove < 150) return;
  let dx = 0;
  let dy = 0;
  if (hasMoveKey("up")) dy = -1;
  if (hasMoveKey("down")) dy = 1;
  if (hasMoveKey("left")) dx = -1;
  if (hasMoveKey("right")) dx = 1;
  if (dx === 0 && dy === 0) return;
  const nextCol = clamp(g.player.col + dx, 0, 5);
  const nextRow = clamp(g.player.row + dy, 0, 4);
  if (isMoonWall(g.player.col, g.player.row, nextCol, nextRow)) return;
  g.player.col = nextCol;
  g.player.row = nextRow;
  g.player.lastMove = now;
  const key = `${nextCol},${nextRow}`;
  if (g.candies.has(key)) {
    g.candies.delete(key);
    g.score += 1;
  }
  if (g.candies.size === 0) {
    g.over = true;
    state.gameOver = true;
    restartButton.classList.add("is-visible");
  }
}

function drawMoonGame(m, now) {
  const g = mini.moon;
  const gradient = ctx.createLinearGradient(0, 0, 0, m.h);
  gradient.addColorStop(0, "#26335f");
  gradient.addColorStop(1, "#151a38");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, m.w, m.h);
  drawStarField(m, now, 0.7);
  const grid = moonGridMetrics(m);
  drawMoonMaze(grid);
  g.candies.forEach((key) => {
    const [col, row] = key.split(",").map(Number);
    const c = moonCellCenter(grid, col, row);
    drawCandy(c.x, c.y, grid.cell * 0.18);
  });
  const p = moonCellCenter(grid, g.player.col, g.player.row);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(0.34, 0.34);
  drawStar({ fill: "#ffe96f", accent: "#f7a62d" });
  ctx.restore();
  drawMiniHud("月亮糖果迷宮", `糖果 ${g.score}/4`, "方向鍵 / WASD 移動", m);
  if (g.over) drawMiniGameOver(m, "糖果找齊了");
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function drawStarField(m, now, speed) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  for (let i = 0; i < 70; i += 1) {
    const x = (i * 83 - now * 0.015 * speed) % m.w;
    const y = 30 + ((i * 47) % Math.max(1, m.h - 80));
    ctx.globalAlpha = 0.28 + (i % 4) * 0.12;
    ctx.fillRect((x + m.w) % m.w, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function drawEnergyOrb(x, y, r, now) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(now / 450);
  ctx.fillStyle = "#9cf4ff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI) / 4;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSoftClouds(m, now) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.58)";
  for (let i = 0; i < 5; i += 1) {
    const x = ((i * 280 + now * 0.012) % (m.w + 240)) - 120;
    const y = 90 + (i % 3) * 115;
    ctx.beginPath();
    ctx.ellipse(x, y, 74, 28, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 48, y - 15, 54, 38, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 42, y - 8, 46, 32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRainbowPlatform(platform, index) {
  const colors = ["#ff95bf", "#ffe47a", "#90ddff", "#c7a2ff"];
  colors.forEach((color, offset) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(platform.x, platform.y + offset * 7);
    ctx.lineTo(platform.x + platform.w, platform.y + offset * 7);
    ctx.stroke();
  });
  ctx.fillStyle = index === 4 ? "#fff3ae" : "rgba(255, 255, 255, 0.7)";
  ctx.fillRect(platform.x, platform.y - 5, platform.w, 8);
}

function moonGridMetrics(m) {
  const cell = Math.min(m.w * 0.1, m.h * 0.13);
  const width = cell * 6;
  const height = cell * 5;
  return { cell, x: (m.w - width) / 2, y: (m.h - height) / 2 + 30 };
}

function moonCellCenter(grid, col, row) {
  return { x: grid.x + col * grid.cell + grid.cell / 2, y: grid.y + row * grid.cell + grid.cell / 2 };
}

function isMoonWall(fromCol, fromRow, toCol, toRow) {
  const walls = new Set(["1,0-1,1", "2,1-3,1", "3,2-3,3", "0,2-1,2", "4,3-5,3", "2,3-2,4"]);
  const a = `${fromCol},${fromRow}-${toCol},${toRow}`;
  const b = `${toCol},${toRow}-${fromCol},${fromRow}`;
  return walls.has(a) || walls.has(b);
}

function drawMoonMaze(grid) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.11)";
  ctx.fillRect(grid.x, grid.y, grid.cell * 6, grid.cell * 5);
  ctx.strokeStyle = "rgba(255, 241, 168, 0.7)";
  ctx.lineWidth = 3;
  for (let col = 0; col <= 6; col += 1) {
    ctx.beginPath();
    ctx.moveTo(grid.x + col * grid.cell, grid.y);
    ctx.lineTo(grid.x + col * grid.cell, grid.y + grid.cell * 5);
    ctx.stroke();
  }
  for (let row = 0; row <= 5; row += 1) {
    ctx.beginPath();
    ctx.moveTo(grid.x, grid.y + row * grid.cell);
    ctx.lineTo(grid.x + grid.cell * 6, grid.y + row * grid.cell);
    ctx.stroke();
  }
  ctx.strokeStyle = "#ff9ccc";
  ctx.lineWidth = 8;
  [[1, 0, 1, 1], [2, 1, 3, 1], [3, 2, 3, 3], [0, 2, 1, 2], [4, 3, 5, 3], [2, 3, 2, 4]].forEach(([a, b, c, d]) => {
    const start = moonCellCenter(grid, a, b);
    const end = moonCellCenter(grid, c, d);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  });
}

function drawCandy(x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "#ff9ccc";
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.fillStyle = "#fff1a8";
  ctx.fillRect(-r * 0.32, -r, r * 0.64, r * 2);
  ctx.restore();
}

function drawMiniHud(title, score, help, m) {
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.font = "800 24px system-ui, sans-serif";
  ctx.fillText(title, m.w / 2, 38);
  ctx.font = "700 15px system-ui, sans-serif";
  ctx.fillText(`${score}   ${help}`, m.w / 2, 62);
}

function drawMiniGameOver(m, message) {
  ctx.fillStyle = "rgba(8, 12, 20, 0.58)";
  ctx.fillRect(0, 0, m.w, m.h);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 40px system-ui, sans-serif";
  ctx.fillText(message, m.w / 2, m.h / 2 - 8);
  ctx.font = "700 17px system-ui, sans-serif";
  ctx.fillText("按重新開始再玩一次，或回到選單", m.w / 2, m.h / 2 + 28);
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

function rememberKey(event) {
  keys.add(event.key.toLowerCase());
  keys.add(event.code.toLowerCase());
}

function forgetKey(event) {
  keys.delete(event.key.toLowerCase());
  keys.delete(event.code.toLowerCase());
}

window.addEventListener("keydown", (event) => {
  rememberKey(event);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) || ["KeyS", "KeyZ", "KeyX", "KeyC", "KeyA", "KeyM"].includes(event.code)) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  forgetKey(event);
});

window.addEventListener("resize", resizeCanvas);
restartButton.addEventListener("click", resetGame);
startButton.addEventListener("click", startLoading);
backMenuButton.addEventListener("click", returnToMenu);
gameCards.forEach((card) => {
  card.addEventListener("click", () => {
    if (card.dataset.game === "stone") {
      startStoneGame();
      return;
    }

    startMiniGame(card.dataset.game);
  });
});

resizeCanvas();
showScreen("lobby");
resetGame();
requestAnimationFrame(update);
