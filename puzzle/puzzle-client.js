"use strict";

const PS = window.PuzzleShapes;
const RU = window.RoomUtils;
const PZE = window.PuzzleEngine;

let ws = null;
let mode = null; // "online" | "local"
let localRoom = null;
let mySeat = -1;
let latest = null;
let puzzleImage = null; // HTMLImageElement, loaded from the shared dataUrl
let draggingPiece = null; // {id, dx, dy}
let lastMoveSent = 0;
let canvasScale = 1;

const els = {
  lobby: document.getElementById("lobby"),
  serverUrl: document.getElementById("serverUrl"),
  roomCode: document.getElementById("roomCode"),
  playerName: document.getElementById("playerName"),
  connectBtn: document.getElementById("connectBtn"),
  playLocalBtn: document.getElementById("playLocalBtn"),
  lobbyError: document.getElementById("lobbyError"),

  roomBar: document.getElementById("roomBar"),
  seatsBar: document.getElementById("seatsBar"),
  startBtn: document.getElementById("startBtn"),

  table: document.getElementById("table"),
  phase: document.getElementById("phaseLabel"),
  message: document.getElementById("messageBox"),

  setupPanel: document.getElementById("setupPanel"),
  fileInput: document.getElementById("fileInput"),
  previewImg: document.getElementById("previewImg"),
  gridBox: document.getElementById("gridBox"),
  rowsInput: document.getElementById("rowsInput"),
  colsInput: document.getElementById("colsInput"),
  startPuzzleBtn: document.getElementById("startPuzzleBtn"),

  progressBar: document.getElementById("progressBar"),
  progressLabel: document.getElementById("progressLabel"),
  canvas: document.getElementById("canvas"),
  newPuzzleBtn: document.getElementById("newPuzzleBtn"),

  winOverlay: document.getElementById("winOverlay"),
  playAgainBtn: document.getElementById("playAgainBtn"),
};
const ctx = els.canvas.getContext("2d");

function defaultServerUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.hostname || "localhost"}:8787`;
}
els.serverUrl.value = defaultServerUrl();
els.roomCode.value = "QUEBRA1";
els.playerName.value = "Jogador" + Math.floor(Math.random() * 900 + 100);

function setLobbyError(msg) { els.lobbyError.textContent = msg || ""; }
function setMessage(txt) { els.message.textContent = txt; }

function send(obj) {
  if (mode === "online") {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    return;
  }
  if (mode === "local") {
    let result = null;
    if (obj.type === "startAsIs") { localRoom.started = true; PZE.deal(localRoom); return; }
    else if (obj.type === "newHand") return PZE.requestNewHand(localRoom);
    else if (obj.type === "uploadImage") result = PZE.submitUploadImage(localRoom, 0, obj.dataUrl, obj.aspect);
    else if (obj.type === "startPuzzle") result = PZE.submitStartPuzzle(localRoom, 0, obj.rows, obj.cols);
    else if (obj.type === "movePiece") result = PZE.submitMovePiece(localRoom, 0, obj.pieceId, obj.x, obj.y);
    else if (obj.type === "dropPiece") result = PZE.submitDropPiece(localRoom, 0, obj.pieceId, obj.x, obj.y);
    if (result && !result.ok) setMessage("Erro: " + result.error);
  }
}

els.connectBtn.addEventListener("click", connect);
els.playLocalBtn.addEventListener("click", playLocal);

function connect() {
  const url = els.serverUrl.value.trim() || defaultServerUrl();
  const room = els.roomCode.value.trim() || "QUEBRA1";
  const name = els.playerName.value.trim() || "Jogador";
  mode = "online";
  setLobbyError("Conectando...");
  try { ws = new WebSocket(url); } catch (e) { setLobbyError("Endereço inválido: " + e.message); return; }

  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", game: "puzzle", room, name })));
  ws.addEventListener("close", () => setLobbyError("Conexão perdida com o servidor."));
  ws.addEventListener("error", () => setLobbyError("Não foi possível conectar ao servidor."));
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "joined") { mySeat = msg.seatIdx; showTable(); return; }
    if (msg.type === "error") { setMessage("Erro: " + msg.message); return; }
    if (msg.type === "image") { loadPuzzleImage(msg.dataUrl); return; }
    if (msg.type === "state") { applyState(msg.state); return; }
  });
}

function playLocal() {
  mode = "local";
  mySeat = 0;
  const name = els.playerName.value.trim() || "Você";
  localRoom = RU.makeRoom("puzzle", "LOCAL", 1);
  localRoom.seats[0] = { ws: {}, name, isAI: false };
  localRoom.hooks = {
    update: () => applyState(PZE.viewFor(localRoom, 0)),
    image: (dataUrl) => loadPuzzleImage(dataUrl),
  };
  showTable();
  localRoom.started = true;
  PZE.deal(localRoom);
}

function showTable() {
  els.lobby.classList.add("hidden");
  els.roomBar.classList.remove("hidden");
  els.table.classList.remove("hidden");
}

function applyState(state) {
  latest = state;
  // keep our own in-flight drag authoritative locally until the drop is confirmed
  if (draggingPiece && latest.pieces) {
    const p = latest.pieces.find((x) => x.id === draggingPiece.id);
    if (p && !p.locked) { p.x = draggingPiece.x; p.y = draggingPiece.y; }
  }
  render();
}

els.startBtn.addEventListener("click", () => send({ type: "startAsIs" }));
els.newPuzzleBtn.addEventListener("click", () => send({ type: "newHand" }));
els.playAgainBtn.addEventListener("click", () => { els.winOverlay.classList.add("hidden"); send({ type: "newHand" }); });

els.fileInput.addEventListener("change", async () => {
  const file = els.fileInput.files[0];
  if (!file) return;
  try {
    const { dataUrl, aspect } = await resizeImageFile(file);
    els.previewImg.src = dataUrl;
    els.previewImg.classList.remove("hidden");
    els.gridBox.classList.remove("hidden");
    send({ type: "uploadImage", dataUrl, aspect });
  } catch (e) {
    setMessage("Não consegui ler essa imagem: " + e.message);
  }
});

els.startPuzzleBtn.addEventListener("click", () => {
  const rows = Number(els.rowsInput.value) || 4;
  const cols = Number(els.colsInput.value) || 4;
  send({ type: "startPuzzle", rows, cols });
});

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("falha ao ler o arquivo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("formato de imagem inválido"));
      img.onload = () => {
        const maxDim = 900;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: c.toDataURL("image/jpeg", 0.85), aspect: img.width / img.height });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function loadPuzzleImage(dataUrl) {
  const img = new Image();
  img.onload = () => { puzzleImage = img; render(); };
  img.src = dataUrl;
}

/* ---------------- rendering ---------------- */
function render() {
  if (!latest) return;
  els.phase.textContent = !latest.started ? "Aguardando jogadores..."
    : latest.phase === "setup" ? "Preparando quebra-cabeça"
    : latest.phase === "playing" ? "Montando..."
    : "Completo!";

  renderSeatsBar();

  if (!latest.started) { els.startBtn.classList.remove("hidden"); return; }
  els.startBtn.classList.add("hidden");

  const showSetup = latest.phase === "setup";
  els.setupPanel.classList.toggle("hidden", !showSetup);
  if (showSetup && latest.hasImage) els.gridBox.classList.remove("hidden");

  els.newPuzzleBtn.classList.toggle("hidden", latest.phase === "setup");
  els.progressBar.classList.toggle("hidden", latest.phase !== "playing" && latest.phase !== "solved");

  if (latest.phase === "playing" || latest.phase === "solved") {
    els.progressLabel.textContent = `${latest.lockedCount} / ${latest.totalCount} peças encaixadas`;
    resizeCanvasIfNeeded();
    drawBoard();
  } else {
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  }

  if (latest.phase === "solved") {
    els.winOverlay.classList.remove("hidden");
  } else {
    els.winOverlay.classList.add("hidden");
  }
}

function resizeCanvasIfNeeded() {
  if (!latest.layout) return;
  const layout = latest.layout;
  const containerWidth = els.canvas.parentElement.clientWidth || layout.spaceW;
  canvasScale = containerWidth / layout.spaceW;
  const w = Math.round(layout.spaceW * canvasScale);
  const h = Math.round(layout.spaceH * canvasScale);
  if (els.canvas.width !== w || els.canvas.height !== h) {
    els.canvas.width = w;
    els.canvas.height = h;
  }
}

function drawBoard() {
  const layout = latest.layout, signature = latest.signature;
  ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
  ctx.clearRect(0, 0, layout.spaceW, layout.spaceH);

  // faint target outline
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1.5 / canvasScale;
  ctx.strokeRect(layout.targetX, layout.targetY, layout.targetW, layout.targetH);

  if (!puzzleImage) return;
  const pieces = [...latest.pieces].sort((a, b) => (a.locked ? -1 : 0) - (b.locked ? -1 : 0) || a.z - b.z);
  for (const piece of pieces) {
    const localPts = PS.buildPiecePolygon(piece.r, piece.c, layout, signature);
    ctx.save();
    ctx.beginPath();
    PS.tracePath(ctx, localPts, piece.x, piece.y);
    ctx.closePath();
    ctx.clip();
    const imgDrawX = piece.x - piece.c * layout.cellW;
    const imgDrawY = piece.y - piece.r * layout.cellH;
    ctx.drawImage(puzzleImage, 0, 0, puzzleImage.width, puzzleImage.height, imgDrawX, imgDrawY, layout.targetW, layout.targetH);
    ctx.restore();

    ctx.beginPath();
    PS.tracePath(ctx, localPts, piece.x, piece.y);
    ctx.closePath();
    ctx.strokeStyle = piece.locked ? "rgba(255,255,255,0.25)" : "rgba(20,20,20,0.55)";
    ctx.lineWidth = (piece.locked ? 1 : 1.5) / canvasScale;
    ctx.stroke();
  }
}

function eventToLogical(e) {
  const rect = els.canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const px = clientX - rect.left, py = clientY - rect.top;
  const scaleX = els.canvas.width / rect.width, scaleY = els.canvas.height / rect.height;
  return { x: (px * scaleX) / canvasScale, y: (py * scaleY) / canvasScale };
}

function pieceAt(x, y) {
  if (!latest || !latest.pieces) return null;
  const layout = latest.layout, signature = latest.signature;
  const sorted = [...latest.pieces].sort((a, b) => b.z - a.z);
  for (const piece of sorted) {
    if (piece.locked) continue;
    const localPts = PS.buildPiecePolygon(piece.r, piece.c, layout, signature);
    if (PS.pointInPolygon(x, y, localPts, piece.x, piece.y)) return piece;
  }
  return null;
}

function pointerDown(e) {
  if (!latest || latest.phase !== "playing") return;
  const { x, y } = eventToLogical(e);
  const piece = pieceAt(x, y);
  if (!piece) return;
  draggingPiece = { id: piece.id, dx: x - piece.x, dy: y - piece.y, x: piece.x, y: piece.y };
  e.preventDefault();
}
function pointerMove(e) {
  if (!draggingPiece) return;
  const { x, y } = eventToLogical(e);
  draggingPiece.x = x - draggingPiece.dx;
  draggingPiece.y = y - draggingPiece.dy;
  const piece = latest.pieces.find((p) => p.id === draggingPiece.id);
  if (piece) { piece.x = draggingPiece.x; piece.y = draggingPiece.y; drawBoard(); }
  const now = performance.now();
  if (now - lastMoveSent > 45) {
    lastMoveSent = now;
    send({ type: "movePiece", pieceId: draggingPiece.id, x: draggingPiece.x, y: draggingPiece.y });
  }
  e.preventDefault();
}
function pointerUp() {
  if (!draggingPiece) return;
  send({ type: "dropPiece", pieceId: draggingPiece.id, x: draggingPiece.x, y: draggingPiece.y });
  draggingPiece = null;
}

els.canvas.addEventListener("mousedown", pointerDown);
window.addEventListener("mousemove", pointerMove);
window.addEventListener("mouseup", pointerUp);
els.canvas.addEventListener("touchstart", pointerDown, { passive: false });
els.canvas.addEventListener("touchmove", pointerMove, { passive: false });
window.addEventListener("touchend", pointerUp);
window.addEventListener("resize", () => { if (latest && latest.phase === "playing") { resizeCanvasIfNeeded(); drawBoard(); } });

function renderSeatsBar() {
  els.seatsBar.innerHTML = "";
  latest.seats.forEach((s, i) => {
    if (!s.name) return;
    const chip = document.createElement("div");
    chip.className = "seat-chip";
    if (i === mySeat) chip.classList.add("you");
    const status = s.connected ? s.name : `${s.name} (offline)`;
    chip.textContent = `Assento ${i + 1}: ${status}`;
    els.seatsBar.appendChild(chip);
  });
}
