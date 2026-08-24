"use strict";

let ws = null;
let mySeat = -1;
let latest = null;
let lastRenderedRound = -1;
let currentColor = "#1a1a1a";
let currentSize = 5;
let drawing = false;
let lastPoint = null;

const els = {
  lobby: document.getElementById("lobby"),
  serverUrl: document.getElementById("serverUrl"),
  roomCode: document.getElementById("roomCode"),
  playerName: document.getElementById("playerName"),
  connectBtn: document.getElementById("connectBtn"),
  lobbyError: document.getElementById("lobbyError"),

  roomBar: document.getElementById("roomBar"),
  seatsBar: document.getElementById("seatsBar"),
  startBtn: document.getElementById("startBtn"),

  table: document.getElementById("table"),
  phase: document.getElementById("phaseLabel"),
  message: document.getElementById("messageBox"),

  wordHint: document.getElementById("wordHint"),
  timerLabel: document.getElementById("timerLabel"),
  canvas: document.getElementById("canvas"),
  toolbar: document.getElementById("toolbar"),
  colors: document.getElementById("colors"),
  sizeRange: document.getElementById("sizeRange"),
  clearBtn: document.getElementById("clearBtn"),

  scoreboard: document.getElementById("scoreboard"),
  chatBox: document.getElementById("chatBox"),
  guessForm: document.getElementById("guessForm"),
  guessInput: document.getElementById("guessInput"),
};

const ctx = els.canvas.getContext("2d");
ctx.fillStyle = "#fff";
ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);

const PALETTE = ["#1a1a1a", "#ffffff", "#b3122a", "#e8c060", "#2e7d32", "#1565c0", "#8e24aa", "#ef6c00"];
PALETTE.forEach((c) => {
  const b = document.createElement("button");
  b.style.background = c;
  if (c === "#ffffff") b.style.border = "2px solid #999";
  if (c === currentColor) b.classList.add("active");
  b.addEventListener("click", () => {
    currentColor = c;
    els.colors.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
  });
  els.colors.appendChild(b);
});
els.sizeRange.addEventListener("input", () => { currentSize = Number(els.sizeRange.value); });

function defaultServerUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.hostname || "localhost"}:8787`;
}
els.serverUrl.value = defaultServerUrl();
els.roomCode.value = "DESENHO1";
els.playerName.value = "Jogador" + Math.floor(Math.random() * 900 + 100);

function setLobbyError(msg) { els.lobbyError.textContent = msg || ""; }
function setMessage(txt) { els.message.textContent = txt; }
function send(obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

els.connectBtn.addEventListener("click", connect);

function connect() {
  const url = els.serverUrl.value.trim() || defaultServerUrl();
  const room = els.roomCode.value.trim() || "DESENHO1";
  const name = els.playerName.value.trim() || "Jogador";
  setLobbyError("Conectando...");
  try { ws = new WebSocket(url); } catch (e) { setLobbyError("Endereço inválido: " + e.message); return; }

  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", game: "desenho", room, name })));
  ws.addEventListener("close", () => setLobbyError("Conexão perdida com o servidor."));
  ws.addEventListener("error", () => setLobbyError("Não foi possível conectar ao servidor."));
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "joined") {
      mySeat = msg.seatIdx;
      els.lobby.classList.add("hidden");
      els.roomBar.classList.remove("hidden");
      els.table.classList.remove("hidden");
      return;
    }
    if (msg.type === "error") { setMessage("Erro: " + msg.message); return; }
    if (msg.type === "state") { latest = msg.state; render(); return; }
    if (msg.type === "stroke") { drawSegment({ x: msg.x0, y: msg.y0 }, { x: msg.x1, y: msg.y1 }, msg.color, msg.size); return; }
    if (msg.type === "clearCanvas") { clearCanvasLocal(); return; }
  });
}

els.startBtn.addEventListener("click", () => send({ type: "startAsIs" }));
els.clearBtn.addEventListener("click", () => { clearCanvasLocal(); send({ type: "clearCanvas" }); });

els.guessForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = els.guessInput.value.trim();
  if (!text) return;
  send({ type: "guess", text });
  els.guessInput.value = "";
});

/* ---------------- canvas drawing ---------------- */
function getPos(e) {
  const rect = els.canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
}

function drawSegment(p0, p1, color, size) {
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p0.x * els.canvas.width, p0.y * els.canvas.height);
  ctx.lineTo(p1.x * els.canvas.width, p1.y * els.canvas.height);
  ctx.stroke();
}

function clearCanvasLocal() {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
}

function isMyTurnToDraw() { return latest && latest.isDrawer && latest.phase === "drawing"; }

function pointerDown(e) {
  if (!isMyTurnToDraw()) return;
  drawing = true;
  lastPoint = getPos(e);
  e.preventDefault();
}
function pointerMove(e) {
  if (!drawing || !isMyTurnToDraw()) return;
  const p = getPos(e);
  drawSegment(lastPoint, p, currentColor, currentSize);
  send({ type: "stroke", x0: lastPoint.x, y0: lastPoint.y, x1: p.x, y1: p.y, color: currentColor, size: currentSize });
  lastPoint = p;
  e.preventDefault();
}
function pointerUp() { drawing = false; lastPoint = null; }

els.canvas.addEventListener("mousedown", pointerDown);
els.canvas.addEventListener("mousemove", pointerMove);
window.addEventListener("mouseup", pointerUp);
els.canvas.addEventListener("touchstart", pointerDown, { passive: false });
els.canvas.addEventListener("touchmove", pointerMove, { passive: false });
window.addEventListener("touchend", pointerUp);

/* ---------------- rendering ---------------- */
let tickHandle = null;

function render() {
  if (!latest) return;
  renderSeatsBar();

  if (!latest.started) {
    els.startBtn.classList.remove("hidden");
    els.phase.textContent = "Aguardando jogadores...";
    els.toolbar.classList.add("hidden");
    stopTicking();
    return;
  }
  els.startBtn.classList.add("hidden");

  if (latest.roundNumber !== lastRenderedRound) {
    lastRenderedRound = latest.roundNumber;
    clearCanvasLocal();
  }

  if (latest.phase === "idle") {
    els.phase.textContent = "Pronto para começar";
    els.wordHint.textContent = "--";
    els.timerLabel.textContent = "";
    els.toolbar.classList.add("hidden");
    stopTicking();
  } else if (latest.phase === "drawing") {
    els.phase.textContent = latest.isDrawer ? "Sua vez de desenhar!" : `${drawerName()} está desenhando`;
    els.wordHint.textContent = latest.isDrawer || latest.word
      ? (latest.word || "").toUpperCase()
      : "_ ".repeat(latest.wordLength).trim();
    els.toolbar.classList.toggle("hidden", !latest.isDrawer);
    els.canvas.style.cursor = latest.isDrawer ? "crosshair" : "default";
    startTicking();
  } else if (latest.phase === "reveal") {
    els.phase.textContent = "Revelando...";
    els.wordHint.textContent = (latest.word || "").toUpperCase();
    els.toolbar.classList.add("hidden");
    stopTicking();
    els.timerLabel.textContent = "";
  }

  renderScoreboard();
  renderChat();
}

function drawerName() {
  const seat = latest.seats[latest.drawerSeat];
  return (seat && seat.name) || "alguém";
}

function updateTimerDisplay() {
  if (!latest || latest.phase !== "drawing" || !latest.roundEndAt) return;
  const remaining = Math.max(0, Math.ceil((latest.roundEndAt - Date.now()) / 1000));
  els.timerLabel.textContent = `${remaining}s`;
}
function startTicking() { stopTicking(); tickHandle = setInterval(updateTimerDisplay, 500); updateTimerDisplay(); }
function stopTicking() { if (tickHandle) { clearInterval(tickHandle); tickHandle = null; } }

function renderScoreboard() {
  const entries = Object.entries(latest.scores || {}).sort((a, b) => b[1] - a[1]);
  els.scoreboard.innerHTML = entries.map(([seatIdx, pts]) => {
    const seat = latest.seats[Number(seatIdx)];
    const name = (seat && seat.name) || `Assento ${Number(seatIdx) + 1}`;
    return `<div class="row"><span>${escapeHtml(name)}${Number(seatIdx) === latest.drawerSeat ? " ✏️" : ""}</span><span>${pts}</span></div>`;
  }).join("");
}

function renderChat() {
  els.chatBox.innerHTML = (latest.chat || []).map((m) => {
    if (m.system) return `<div class="msg system">${escapeHtml(m.text)}</div>`;
    return `<div class="msg${m.correct ? " correct" : ""}"><b>${escapeHtml(m.name)}:</b> ${escapeHtml(m.text)}</div>`;
  }).join("");
  els.chatBox.scrollTop = els.chatBox.scrollHeight;
}

function renderSeatsBar() {
  els.seatsBar.innerHTML = "";
  latest.seats.forEach((s, i) => {
    if (!s.name) return;
    const chip = document.createElement("div");
    chip.className = "seat-chip";
    if (i === mySeat) chip.classList.add("you");
    if (latest.started && i === latest.drawerSeat) chip.classList.add("drawer");
    const status = s.connected ? s.name : `${s.name} (offline)`;
    chip.textContent = `Assento ${i + 1}: ${status}`;
    els.seatsBar.appendChild(chip);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
