"use strict";

const DR = window.DominoRules;
const RU = window.RoomUtils;
const DE = window.DominoEngine;
const I18N = window.I18N;

let ws = null;
let mode = null; // "online" | "local"
let localRoom = null;
let mySeat = -1;
let latest = null;
let selectedTileId = null;

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
  scoreboard: document.getElementById("scoreboard"),
  startBtn: document.getElementById("startBtn"),

  table: document.getElementById("table"),
  phase: document.getElementById("phaseLabel"),

  nameTop: document.getElementById("nameTop"),
  nameLeft: document.getElementById("nameLeft"),
  nameRight: document.getElementById("nameRight"),
  handTop: document.getElementById("handTop"),
  handLeft: document.getElementById("handLeft"),
  handRight: document.getElementById("handRight"),

  boardChain: document.getElementById("boardChain"),
  mortoInfo: document.getElementById("mortoInfo"),
  message: document.getElementById("messageBox"),
  lastBatida: document.getElementById("lastBatida"),

  handYou: document.getElementById("handYou"),
  playChoice: document.getElementById("playChoice"),
  playChoiceLabel: document.getElementById("playChoiceLabel"),
  playLeftBtn: document.getElementById("playLeftBtn"),
  playRightBtn: document.getElementById("playRightBtn"),
  cancelSelectBtn: document.getElementById("cancelSelectBtn"),
  passBtn: document.getElementById("passBtn"),
  hintBtn: document.getElementById("hintBtn"),
  newHandBtn: document.getElementById("newHandBtn"),
};

function defaultServerUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.hostname || "localhost"}:8787`;
}
els.serverUrl.value = defaultServerUrl();
els.roomCode.value = "MESA1";
els.playerName.value = "Jogador" + Math.floor(Math.random() * 900 + 100);

function setLobbyError(msg) { els.lobbyError.textContent = msg || ""; }
function setMessage(txt) { els.message.textContent = txt; }

function send(obj) {
  if (mode === "online") {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    return;
  }
  if (mode === "local") {
    if (obj.type === "startWithAI") { RU.fillWithAI(localRoom); localRoom.started = true; DE.deal(localRoom); return; }
    if (obj.type === "newHand") return DE.requestNewHand(localRoom);
    let result = null;
    if (obj.type === "playDomino") result = DE.submitPlay(localRoom, 0, obj.tileId, obj.side);
    else if (obj.type === "passDomino") result = DE.submitPass(localRoom, 0);
    if (result && !result.ok) setMessage("Erro: " + result.error);
  }
}

els.connectBtn.addEventListener("click", connect);
els.playLocalBtn.addEventListener("click", playLocal);

function connect() {
  const url = els.serverUrl.value.trim() || defaultServerUrl();
  const room = els.roomCode.value.trim() || "MESA1";
  const name = els.playerName.value.trim() || "Jogador";
  mode = "online";
  setLobbyError("Conectando...");
  try { ws = new WebSocket(url); } catch (e) { setLobbyError("Endereço inválido: " + e.message); return; }

  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", game: "domino", room, name })));
  ws.addEventListener("close", () => setLobbyError("Conexão perdida com o servidor."));
  ws.addEventListener("error", () => setLobbyError("Não foi possível conectar ao servidor."));
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "joined") {
      mySeat = msg.seatIdx;
      showTable();
      return;
    }
    if (msg.type === "error") { setMessage("Erro: " + msg.message); return; }
    if (msg.type === "state") { latest = msg.state; render(); }
  });
}

function playLocal() {
  mode = "local";
  mySeat = 0;
  const name = els.playerName.value.trim() || "Você";
  localRoom = RU.makeRoom("domino", "LOCAL", 4);
  localRoom.seats[0] = { ws: {}, name, isAI: false };
  localRoom.hooks = { update: () => { latest = DE.viewFor(localRoom, 0); render(); } };
  showTable();
  latest = DE.viewFor(localRoom, 0);
  render();
}

function showTable() {
  els.lobby.classList.add("hidden");
  els.roomBar.classList.remove("hidden");
  els.table.classList.remove("hidden");
}

els.startBtn.addEventListener("click", () => send({ type: "startWithAI" }));
els.newHandBtn.addEventListener("click", () => send({ type: "newHand" }));
els.passBtn.addEventListener("click", () => { send({ type: "passDomino" }); selectedTileId = null; render(); });
els.cancelSelectBtn.addEventListener("click", () => { selectedTileId = null; render(); });
els.playLeftBtn.addEventListener("click", () => playSelected("left"));
els.playRightBtn.addEventListener("click", () => playSelected("right"));

function playSelected(side) {
  if (selectedTileId === null) return;
  send({ type: "playDomino", tileId: selectedTileId, side });
  selectedTileId = null;
}

els.hintBtn.addEventListener("click", () => {
  if (!latest || !latest.started) return;
  for (const t of latest.hand) {
    const sides = DR.legalSides(t, latest.board);
    if (sides.length) {
      setMessage(`Sugestão: jogue ${t.a}-${t.b} pela ${sides[0] === "left" ? "esquerda" : "direita"}.`);
      return;
    }
  }
  setMessage("Nenhuma jogada possível — considere passar.");
});

/* ---------------- pip rendering ---------------- */
const PIP_LAYOUT = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function renderHalf(n) {
  const half = document.createElement("div");
  half.className = "half";
  const on = new Set(PIP_LAYOUT[n] || []);
  for (let i = 0; i < 9; i++) {
    const dot = document.createElement("div");
    dot.className = "dot" + (on.has(i) ? " on" : "");
    half.appendChild(dot);
  }
  return half;
}

function renderTile(tile, opts) {
  opts = opts || {};
  const el = document.createElement("div");
  el.className = "domino-tile" + (opts.static ? " static" : "") + (tile.a === tile.b ? " double" : "");
  if (opts.selected) el.classList.add("selected");
  if (opts.disabled) el.classList.add("disabled");
  el.appendChild(renderHalf(tile.a));
  const divider = document.createElement("div");
  divider.className = "divider";
  el.appendChild(divider);
  el.appendChild(renderHalf(tile.b));
  if (opts.onClick) el.addEventListener("click", opts.onClick);
  return el;
}

/* ---------------- rendering ---------------- */
function seatLabel(i) {
  if (i === mySeat) return "Você";
  return (latest.seats[i].name || `Assento ${i + 1}`);
}

function relativeSeats() {
  return { right: (mySeat + 1) % 4, top: (mySeat + 2) % 4, left: (mySeat + 3) % 4 };
}

function render() {
  if (!latest) return;
  els.phase.textContent = latest.started
    ? (latest.phase === "playing" ? "Em jogo" : latest.phase === "matchEnd" ? "Partida encerrada" : "Mão encerrada")
    : "Aguardando jogadores...";

  renderSeatsBar();
  renderScoreboard();

  if (!latest.started) { els.startBtn.classList.remove("hidden"); return; }
  els.startBtn.classList.add("hidden");

  const { top, left, right } = relativeSeats();
  els.nameTop.textContent = seatLabel(top) + (latest.started ? ` (dupla ${DR.teamOf(top) === DR.teamOf(mySeat) ? "sua" : "adv."})` : "");
  els.nameLeft.textContent = seatLabel(left);
  els.nameRight.textContent = seatLabel(right);
  els.handTop.innerHTML = Array.from({ length: latest.handCounts[top] }, () => `<div class="card-back"></div>`).join("");
  els.handLeft.innerHTML = Array.from({ length: latest.handCounts[left] }, () => `<div class="card-back"></div>`).join("");
  els.handRight.innerHTML = Array.from({ length: latest.handCounts[right] }, () => `<div class="card-back"></div>`).join("");

  els.mortoInfo.textContent = `Morto: ${latest.mortoCount} peças escondidas (não usadas na partida)`;

  els.boardChain.innerHTML = "";
  if (latest.board.chain.length === 0) {
    const hintEl = document.createElement("span");
    hintEl.style.opacity = "0.5";
    hintEl.textContent = "Tabuleiro vazio — abre quem tem a maior carroça.";
    els.boardChain.appendChild(hintEl);
  } else {
    for (const t of latest.board.chain) els.boardChain.appendChild(renderTile(t, { static: true }));
  }

  els.lastBatida.textContent = latest.lastBatida
    ? `Última mão: ${latest.lastBatida.label} (+${latest.lastBatida.points} p.)`
    : "";

  // hand + selection
  els.handYou.innerHTML = "";
  const myTurn = latest.phase === "playing" && latest.turnIdx === mySeat;
  for (const t of latest.hand) {
    const sides = myTurn ? DR.legalSides(t, latest.board) : [];
    const disabled = !myTurn || sides.length === 0;
    const el = renderTile(t, {
      selected: selectedTileId === t.id,
      disabled,
      onClick: () => {
        if (!myTurn || sides.length === 0) return;
        selectedTileId = t.id;
        render();
      },
    });
    els.handYou.appendChild(el);
  }

  if (selectedTileId !== null && myTurn) {
    const tile = latest.hand.find((t) => t.id === selectedTileId);
    const sides = tile ? DR.legalSides(tile, latest.board) : [];
    els.playChoice.classList.remove("hidden");
    els.playChoiceLabel.textContent = tile ? `Jogar ${tile.a}-${tile.b}:` : "";
    els.playLeftBtn.style.display = sides.includes("left") ? "" : "none";
    els.playRightBtn.style.display = sides.includes("right") ? "" : "none";
  } else {
    els.playChoice.classList.add("hidden");
  }

  els.passBtn.disabled = !myTurn || DR.hasAnyLegalMove(latest.hand, latest.board);

  if (latest.phase === "playing") {
    setMessage(myTurn ? "Sua vez: escolha uma peça e o lado." : `Vez de ${seatLabel(latest.turnIdx)}`);
  } else if (latest.phase === "handEnd" || latest.phase === "matchEnd") {
    if (latest.log && latest.log.length) {
      const entry = latest.log[latest.log.length - 1];
      setMessage(I18N.t(entry.key, entry.params));
    }
  }

  els.newHandBtn.classList.toggle("hidden", latest.phase !== "matchEnd");
}

function renderSeatsBar() {
  els.seatsBar.innerHTML = "";
  latest.seats.forEach((s, i) => {
    const chip = document.createElement("div");
    chip.className = "seat-chip";
    if (i === mySeat) chip.classList.add("you");
    if (s.isAI) chip.classList.add("ai");
    if (latest.started && latest.turnIdx === i) chip.classList.add("turn");
    const status = s.name ? (s.isAI ? `${s.name} (IA)` : s.connected ? s.name : `${s.name} (offline)`) : "vazio";
    chip.textContent = `Assento ${i + 1}: ${status}`;
    els.seatsBar.appendChild(chip);
  });
}

function renderScoreboard() {
  if (!latest.started || !latest.teamScores) { els.scoreboard.innerHTML = ""; return; }
  const myTeam = DR.teamOf(mySeat);
  els.scoreboard.innerHTML = `
    <span>${myTeam === 0 ? "Sua dupla" : "Dupla adversária"} (1+3): <b>${latest.teamScores[0]}</b> / ${latest.targetScore}</span>
    <span>${myTeam === 1 ? "Sua dupla" : "Dupla adversária"} (2+4): <b>${latest.teamScores[1]}</b> / ${latest.targetScore}</span>
  `;
}
