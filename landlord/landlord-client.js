"use strict";

const LR = window.LandlordRules;
const RU = window.RoomUtils;
const LE = window.LandlordEngine;

let ws = null;
let mode = null; // "online" | "local"
let localRoom = null;
let mySeat = -1;
let latest = null; // last state snapshot (from server, or from the local engine)
let selectedUids = new Set();

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
  handYou: document.getElementById("handYou"),
  handA: document.getElementById("handA"),
  handB: document.getElementById("handB"),
  lastYou: document.getElementById("lastYou"),
  lastA: document.getElementById("lastA"),
  lastB: document.getElementById("lastB"),
  nameA: document.getElementById("nameA"),
  nameB: document.getElementById("nameB"),
  countA: document.getElementById("countA"),
  countB: document.getElementById("countB"),
  kitty: document.getElementById("kitty"),
  bidBox: document.getElementById("bidBox"),
  bidPrompt: document.getElementById("bidPrompt"),
  message: document.getElementById("messageBox"),
  roleYou: document.getElementById("roleYou"),
  roleA: document.getElementById("roleA"),
  roleB: document.getElementById("roleB"),
  playBtn: document.getElementById("playBtn"),
  passBtn: document.getElementById("passBtn"),
  hintBtn: document.getElementById("hintBtn"),
  newBtn: document.getElementById("newBtn"),
};

function defaultServerUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.hostname || "localhost"}:8787`;
}
els.serverUrl.value = defaultServerUrl();
els.roomCode.value = "SALA1";
els.playerName.value = "Jogador" + Math.floor(Math.random() * 900 + 100);

function setLobbyError(msg) { els.lobbyError.textContent = msg || ""; }

els.connectBtn.addEventListener("click", connect);
els.playLocalBtn.addEventListener("click", playLocal);

function connect() {
  const url = els.serverUrl.value.trim() || defaultServerUrl();
  const room = els.roomCode.value.trim() || "SALA1";
  const name = els.playerName.value.trim() || "Jogador";
  mode = "online";
  setLobbyError("Conectando...");
  try { ws = new WebSocket(url); } catch (e) { setLobbyError("Endereço inválido: " + e.message); return; }

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "join", game: "landlord", room, name }));
  });
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
  localRoom = RU.makeRoom("landlord", "LOCAL", 3);
  localRoom.seats[0] = { ws: {}, name, isAI: false };
  localRoom.hooks = { update: () => { latest = LE.viewFor(localRoom, 0); render(); } };
  showTable();
  latest = LE.viewFor(localRoom, 0);
  render();
}

function showTable() {
  els.lobby.classList.add("hidden");
  els.roomBar.classList.remove("hidden");
  els.table.classList.remove("hidden");
}

function setMessage(txt) { els.message.textContent = txt; }

function send(obj) {
  if (mode === "online") {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    return;
  }
  if (mode === "local") {
    if (obj.type === "startWithAI") { RU.fillWithAI(localRoom); localRoom.started = true; LE.deal(localRoom); return; }
    if (obj.type === "newHand") return LE.requestNewHand(localRoom);
    let result = null;
    if (obj.type === "bid") result = LE.submitBid(localRoom, 0, obj.value);
    else if (obj.type === "play") result = LE.submitPlay(localRoom, 0, obj.uids);
    else if (obj.type === "pass") result = LE.submitPass(localRoom, 0);
    if (result && !result.ok) setMessage("Erro: " + result.error);
  }
}

els.startBtn.addEventListener("click", () => send({ type: "startWithAI" }));
els.newBtn.addEventListener("click", () => send({ type: "newHand" }));

els.bidBox.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", () => send({ type: "bid", value: Number(b.dataset.bid) }));
});

els.playBtn.addEventListener("click", () => {
  if (selectedUids.size === 0) { setMessage("Selecione cartas para jogar."); return; }
  send({ type: "play", uids: [...selectedUids] });
  selectedUids.clear();
});

els.passBtn.addEventListener("click", () => { send({ type: "pass" }); selectedUids.clear(); });

els.hintBtn.addEventListener("click", () => {
  if (!latest || !latest.started || mySeat < 0) return;
  const hand = latest.hand;
  let combo;
  if (!latest.currentTrick || latest.currentTrick.ownerIdx === mySeat) {
    combo = LR.aiChooseLead(hand);
  } else {
    combo = LR.aiChooseFollow(hand, latest.currentTrick);
  }
  if (!combo) { setMessage("Nenhuma jogada sugerida (considere passar)."); return; }
  selectedUids = new Set(combo.cards.map((c) => c.uid));
  render();
  setMessage(`Sugestão: ${LR.comboLabel(combo)}`);
});

function seatLabel(i) {
  if (i === mySeat) return "Você";
  return latest.seats[i].name || `Assento ${i + 1}`;
}

function otherSeatIndices() {
  // returns [leftSeat, rightSeat] relative to me, in turn order
  const others = [0, 1, 2].filter((i) => i !== mySeat);
  return others;
}

function render() {
  if (!latest) return;
  els.phase.textContent = latest.started
    ? (latest.phase === "bidding" ? "Rodada de lances" : latest.phase === "playing" ? "Em jogo" : "Mão encerrada")
    : "Aguardando jogadores...";

  renderSeatsBar();

  if (!latest.started) {
    els.startBtn.classList.remove("hidden");
    return;
  }
  els.startBtn.classList.add("hidden");

  const [leftIdx, rightIdx] = otherSeatIndices();
  els.nameA.textContent = seatLabel(leftIdx);
  els.nameB.textContent = seatLabel(rightIdx);
  els.roleYou.textContent = latest.isLandlord[mySeat] ? "(Landlord)" : latest.landlordIdx !== -1 ? "(Peasant)" : "";
  els.roleA.textContent = latest.landlordIdx === -1 ? "" : (latest.isLandlord[leftIdx] ? "Landlord" : "Peasant");
  els.roleB.textContent = latest.landlordIdx === -1 ? "" : (latest.isLandlord[rightIdx] ? "Landlord" : "Peasant");

  els.handA.innerHTML = Array.from({ length: latest.handCounts[leftIdx] }, () => `<div class="card-back"></div>`).join("");
  els.handB.innerHTML = Array.from({ length: latest.handCounts[rightIdx] }, () => `<div class="card-back"></div>`).join("");
  els.countA.textContent = `(${latest.handCounts[leftIdx]} cartas)`;
  els.countB.textContent = `(${latest.handCounts[rightIdx]} cartas)`;

  renderLastPlay(els.lastA, latest.lastPlays[leftIdx]);
  renderLastPlay(els.lastB, latest.lastPlays[rightIdx]);
  renderLastPlay(els.lastYou, latest.lastPlays[mySeat]);

  els.kitty.innerHTML = "";
  for (const c of latest.kitty) {
    const el = document.createElement("div");
    el.className = "mini-card";
    if (c) {
      el.textContent = LR.cardLabel(c) + (c.suit || "");
      if (LR.isRed(c)) el.style.color = "#b3122a";
    } else {
      el.style.background = "#34506b";
    }
    els.kitty.appendChild(el);
  }

  // bidding UI
  if (latest.phase === "bidding") {
    if (latest.currentBidderIdx === mySeat) {
      els.bidBox.classList.remove("hidden");
      els.bidPrompt.textContent = `Sua vez de dar lance (maior atual: ${latest.highestBid})`;
      els.bidBox.querySelectorAll("button").forEach((b) => {
        const v = Number(b.dataset.bid);
        b.disabled = v !== 0 && v <= latest.highestBid;
      });
    } else {
      els.bidBox.classList.add("hidden");
    }
  } else {
    els.bidBox.classList.add("hidden");
  }

  // hand + controls
  els.handYou.innerHTML = "";
  for (const c of latest.hand) {
    const el = document.createElement("div");
    el.className = "card" + (LR.isRed(c) ? " red" : "");
    if (selectedUids.has(c.uid)) el.classList.add("selected");
    el.innerHTML = `<div class="rank">${LR.cardLabel(c)}</div><div class="suit">${c.suit || ""}</div>`;
    el.addEventListener("click", () => {
      if (selectedUids.has(c.uid)) selectedUids.delete(c.uid);
      else selectedUids.add(c.uid);
      render();
    });
    els.handYou.appendChild(el);
  }

  const myTurn = latest.phase === "playing" && latest.turnIdx === mySeat;
  const selectedCards = latest.hand.filter((c) => selectedUids.has(c.uid));
  const selectedCombo = selectedCards.length ? LR.analyzeCombo(selectedCards) : null;
  const canPlaySelection = !!selectedCombo && (
    !latest.currentTrick || latest.currentTrick.ownerIdx === mySeat || LR.compareCombo(selectedCombo, latest.currentTrick)
  );
  els.playBtn.disabled = !myTurn || !canPlaySelection;
  els.passBtn.disabled = !myTurn || !latest.currentTrick || latest.currentTrick.ownerIdx === mySeat;

  if (latest.phase === "playing") {
    setMessage(myTurn ? (latest.currentTrick ? "Sua vez: bata a jogada atual ou passe." : "Sua vez: jogue qualquer combinação.") : `Vez de ${seatLabel(latest.turnIdx)}`);
  }

  if (latest.phase === "roundEnd") {
    els.newBtn.classList.remove("hidden");
    const won = latest.winnerIdx !== null && latest.isLandlord[latest.winnerIdx] === latest.isLandlord[mySeat];
    setMessage(`${seatLabel(latest.winnerIdx)} venceu a mão! ${won ? "Você ganhou. 🎉" : "Você perdeu."}`);
  } else {
    els.newBtn.classList.add("hidden");
  }

  if (latest.log && latest.log.length) {
    const lastLog = latest.log[latest.log.length - 1];
    if (latest.phase !== "playing" || !myTurn) setMessage(lastLog);
  }
}

function renderLastPlay(target, combo) {
  target.innerHTML = "";
  if (!combo) return;
  for (const c of combo.cards) {
    const el = document.createElement("div");
    el.className = "mini-card";
    if (LR.isRed(c)) el.style.color = "#b3122a";
    el.textContent = LR.cardLabel(c) + (c.suit || "");
    target.appendChild(el);
  }
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
