"use strict";

const MR = window.MahjongRules;
const RU = window.RoomUtils;
const MJE = window.MahjongEngine;

let ws = null;
let mode = null; // "online" | "local"
let localRoom = null;
let mySeat = -1;
let latest = null;

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

  nameTop: document.getElementById("nameTop"), metaTop: document.getElementById("metaTop"),
  revealedTop: document.getElementById("revealedTop"), handTop: document.getElementById("handTop"),
  nameLeft: document.getElementById("nameLeft"), metaLeft: document.getElementById("metaLeft"),
  revealedLeft: document.getElementById("revealedLeft"), handLeft: document.getElementById("handLeft"),
  nameRight: document.getElementById("nameRight"), metaRight: document.getElementById("metaRight"),
  revealedRight: document.getElementById("revealedRight"), handRight: document.getElementById("handRight"),

  wallCount: document.getElementById("wallCount"),
  discardPile: document.getElementById("discardPile"),
  missingSuitPanel: document.getElementById("missingSuitPanel"),
  claimPanel: document.getElementById("claimPanel"),
  claimPrompt: document.getElementById("claimPrompt"),
  claimButtons: document.getElementById("claimButtons"),

  metaYou: document.getElementById("metaYou"),
  revealedYou: document.getElementById("revealedYou"),
  handYou: document.getElementById("handYou"),
  kongBtn: document.getElementById("kongBtn"),
  huBtn: document.getElementById("huBtn"),
  hintBtn: document.getElementById("hintBtn"),
  newHandBtn: document.getElementById("newHandBtn"),

  endOverlay: document.getElementById("endOverlay"),
  endTitle: document.getElementById("endTitle"),
  endStats: document.getElementById("endStats"),
  playAgainBtn: document.getElementById("playAgainBtn"),
};

function defaultServerUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.hostname || "localhost"}:8787`;
}
els.serverUrl.value = defaultServerUrl();
els.roomCode.value = "MJ1";
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
    if (obj.type === "startWithAI") { RU.fillWithAI(localRoom); localRoom.started = true; MJE.deal(localRoom); return; }
    if (obj.type === "startAsIs") { localRoom.started = true; MJE.deal(localRoom); return; }
    else if (obj.type === "newHand") return MJE.requestNewHand(localRoom);
    else if (obj.type === "chooseMissingSuit") result = MJE.submitMissingSuit(localRoom, 0, obj.suit);
    else if (obj.type === "discard") result = MJE.submitDiscard(localRoom, 0, obj.uid);
    else if (obj.type === "selfKong") result = MJE.submitSelfKong(localRoom, 0);
    else if (obj.type === "selfHu") result = MJE.submitSelfHu(localRoom, 0);
    else if (obj.type === "claimResponse") result = MJE.submitClaimResponse(localRoom, 0, obj.action, obj.chiOption);
    if (result && !result.ok) setMessage("Erro: " + result.error);
  }
}

els.connectBtn.addEventListener("click", connect);
els.playLocalBtn.addEventListener("click", playLocal);

function connect() {
  const url = els.serverUrl.value.trim() || defaultServerUrl();
  const room = els.roomCode.value.trim() || "MJ1";
  const name = els.playerName.value.trim() || "Jogador";
  mode = "online";
  setLobbyError("Conectando...");
  try { ws = new WebSocket(url); } catch (e) { setLobbyError("Endereço inválido: " + e.message); return; }

  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", game: "mahjong", room, name })));
  ws.addEventListener("close", () => setLobbyError("Conexão perdida com o servidor."));
  ws.addEventListener("error", () => setLobbyError("Não foi possível conectar ao servidor."));
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "joined") { mySeat = msg.seatIdx; showTable(); return; }
    if (msg.type === "error") { setMessage("Erro: " + msg.message); return; }
    if (msg.type === "state") { latest = msg.state; render(); }
  });
}

function playLocal() {
  mode = "local";
  mySeat = 0;
  const name = els.playerName.value.trim() || "Você";
  localRoom = RU.makeRoom("mahjong", "LOCAL", 4);
  localRoom.seats[0] = { ws: {}, name, isAI: false };
  localRoom.hooks = { update: () => { latest = MJE.viewFor(localRoom, 0); render(); } };
  showTable();
  latest = MJE.viewFor(localRoom, 0);
  render();
}

function showTable() {
  els.lobby.classList.add("hidden");
  els.roomBar.classList.remove("hidden");
  els.table.classList.remove("hidden");
}

els.startBtn.addEventListener("click", () => send({ type: "startWithAI" }));
els.newHandBtn.addEventListener("click", () => send({ type: "newHand" }));
els.playAgainBtn.addEventListener("click", () => send({ type: "newHand" }));
els.kongBtn.addEventListener("click", () => send({ type: "selfKong" }));
els.huBtn.addEventListener("click", () => send({ type: "selfHu" }));

els.missingSuitPanel.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", () => send({ type: "chooseMissingSuit", suit: b.dataset.suit }));
});

let handHint = null; // { groupUids: Map(uid->label), discardUid, expiresAt }
let handHintTimer = null;
let tileInspectActive = false;
let tileInspectTimer = null;

function showTileInspector(uid) {
  if (!latest || mySeat < 0) return;
  const me = latest.players[mySeat];
  const guidance = MR.tileGuidance(me.hand, me.missingSuit, uid);
  if (!guidance) return;
  const { mult, notes } = MR.estimateMultiplier(me.hand, me.revealed, me.missingSuit);
  const multText = notes.length ? `Multiplicador estimado se fechar com essa cara: ×${mult} (${notes.join(", ")}).` : `Multiplicador estimado: ×${mult} (sem bônus especial ainda).`;
  setMessage(`${guidance.text} ${multText}`);
  tileInspectActive = true;
  clearTimeout(tileInspectTimer);
  tileInspectTimer = setTimeout(() => { tileInspectActive = false; render(); }, 7000);
}

els.hintBtn.addEventListener("click", () => {
  if (!latest || latest.awaitingDiscard !== mySeat) { setMessage("Só dá pra sugerir na sua vez de descartar."); return; }
  const me = latest.players[mySeat];
  const analysis = MR.analyzeHand(me.hand, me.missingSuit);
  const groupUids = new Map();
  analysis.groups.forEach((g) => g.tiles.forEach((t) => groupUids.set(t.uid, MR.GROUP_LABELS[g.type])));
  handHint = { groupUids, discardUid: analysis.discardSuggestion.uid };
  const groupSummary = analysis.groups.length
    ? analysis.groups.map((g) => `${MR.GROUP_LABELS[g.type]} (${g.tiles.map((t) => MR.tileLabel(t)).join(", ")})`).join(" · ")
    : "nenhum grupo formado ainda";
  setMessage(`Sugestão: descarte ${MR.tileLabel(analysis.discardSuggestion)}. Você já tem: ${groupSummary}.`);
  clearTimeout(handHintTimer);
  handHintTimer = setTimeout(() => { handHint = null; render(); }, 6000);
  render();
});

/* ---------------- rendering ---------------- */
function seatLabel(i) {
  if (!latest) return `Assento ${i + 1}`;
  if (i === mySeat) return "Você";
  return (latest.seats[i] && latest.seats[i].name) || `Assento ${i + 1}`;
}
function relativeSeats() { return { right: (mySeat + 1) % 4, top: (mySeat + 2) % 4, left: (mySeat + 3) % 4 }; }

function renderTile(tile, opts) {
  opts = opts || {};
  const el = document.createElement("div");
  el.className = "mtile" + (opts.small ? " small" : "") + (opts.static ? " static" : "") + (opts.disabled ? " disabled" : "");
  el.textContent = MR.tileGlyph(tile);
  el.title = MR.tileLabel(tile);
  if (tile.uid !== undefined) el.dataset.uid = tile.uid;
  if (opts.onClick) el.addEventListener("click", opts.onClick);
  return el;
}

function renderMeld(meld) {
  const el = document.createElement("div");
  el.className = "meld";
  const tiles = meld.type === "chi"
    ? meld.values.map((v) => ({ suit: meld.suit, value: v }))
    : Array(meld.type === "kong" ? 4 : 3).fill({ suit: meld.suit, value: meld.value });
  tiles.forEach((t) => el.appendChild(renderTile(t, { small: true, static: true })));
  return el;
}

function render() {
  if (!latest) return;
  els.phase.textContent = !latest.started ? "Aguardando jogadores..."
    : latest.phase === "missingSuit" ? "Escolhendo naipe a abandonar"
    : latest.phase === "playing" ? "Em jogo"
    : "Mão encerrada";

  renderSeatsBar();

  if (!latest.started) { els.startBtn.classList.remove("hidden"); return; }
  els.startBtn.classList.add("hidden");

  const { top, left, right } = relativeSeats();
  const players = latest.players;
  renderSide("Top", top, players[top]);
  renderSide("Left", left, players[left]);
  renderSide("Right", right, players[right]);

  els.wallCount.textContent = `Monte: ${latest.wallCount} peças`;
  els.discardPile.innerHTML = "";
  for (const d of latest.discardPile) {
    const el = renderTile(d.tile, { static: true, small: true });
    el.style.opacity = "0.85";
    el.title += ` (descarte de ${seatLabel(d.fromSeat)})`;
    els.discardPile.appendChild(el);
  }

  const me = players[mySeat];
  els.metaYou.textContent = me.missingSuit ? `(sem ${MR.SUIT_LABEL[me.missingSuit]})` : "";
  els.revealedYou.innerHTML = "";
  (me.revealed || []).forEach((m) => els.revealedYou.appendChild(renderMeld(m)));

  els.missingSuitPanel.classList.toggle("hidden", !(latest.phase === "missingSuit" && !me.missingSuit));
  els.claimPanel.classList.add("hidden");

  els.handYou.innerHTML = "";
  const myTurnToDiscard = latest.phase === "playing" && latest.awaitingDiscard === mySeat;
  const canInspect = latest.phase === "playing";
  for (const t of (me.hand || [])) {
    const el = renderTile(t, {
      disabled: !myTurnToDiscard,
      onClick: () => {
        if (!myTurnToDiscard) return;
        handHint = null;
        clearTimeout(handHintTimer);
        send({ type: "discard", uid: t.uid });
      },
    });
    if (me.missingSuit && t.suit === me.missingSuit) el.classList.add("missing-suit");
    if (handHint) {
      if (t.uid === handHint.discardUid) { el.classList.add("discard-suggest"); el.title += " — sugestão de descarte"; }
      else if (handHint.groupUids.has(t.uid)) { el.classList.add("keep"); el.title += ` — ${handHint.groupUids.get(t.uid)}`; }
    }
    if (canInspect) {
      const badge = document.createElement("div");
      badge.className = "inspect-badge";
      badge.textContent = "?";
      badge.title = "Ver combinações possíveis para essa peça";
      badge.addEventListener("click", (ev) => {
        ev.stopPropagation();
        showTileInspector(t.uid);
      });
      el.appendChild(badge);
    }
    els.handYou.appendChild(el);
  }

  els.kongBtn.classList.toggle("hidden", !(myTurnToDiscard && MR.hasConcealedKong(me.hand)));
  els.huBtn.classList.toggle("hidden", !(myTurnToDiscard && MR.isWinningHand(me.hand, (me.revealed || []).length, me.missingSuit)));
  els.newHandBtn.classList.toggle("hidden", latest.phase !== "roundEnd");

  if (latest.phase === "playing" && !handHint && !tileInspectActive) {
    if (myTurnToDiscard) setMessage("Sua vez: escolha uma peça para descartar (ou Kong/Hu, se disponível).");
    else if (latest.pendingClaim) setMessage(`${seatLabel(latest.pendingClaim.fromSeat)} descartou ${MR.tileLabel(latest.pendingClaim.tile)}. Aguardando reações...`);
    else setMessage(`Vez de ${seatLabel(latest.turnIdx)}.`);
  }

  if (latest.pendingClaim && latest.pendingClaim.youEligible && !latest.pendingClaim.youResponded) {
    renderClaimPanel();
  }

  if (latest.phase === "roundEnd") {
    els.endOverlay.classList.remove("hidden");
    if (latest.winnerSeat === null) {
      els.endTitle.textContent = "Mão encerrada sem vencedor";
      els.endStats.textContent = "O monte acabou antes de alguém fechar a mão.";
    } else {
      const won = latest.winnerSeat === mySeat;
      els.endTitle.textContent = won ? "Você fechou a mão! Hu! 🎉" : `${seatLabel(latest.winnerSeat)} fechou a mão!`;
      els.endStats.textContent = latest.winType === "zimo" ? "Vitória por compra própria (zimo)." : `Vitória no descarte de ${seatLabel(latest.winFromSeat)}.`;
    }
  } else {
    els.endOverlay.classList.add("hidden");
  }
}

function renderSide(pos, seatIdx, player) {
  els[`name${pos}`].textContent = seatLabel(seatIdx);
  els[`meta${pos}`].textContent = player.missingSuit ? `sem ${MR.SUIT_LABEL[player.missingSuit]}` : (player.hasChosenMissingSuit ? "escolheu naipe" : "");
  els[`revealed${pos}`].innerHTML = "";
  (player.revealed || []).forEach((m) => els[`revealed${pos}`].appendChild(renderMeld(m)));
  els[`hand${pos}`].innerHTML = Array.from({ length: player.handCount }, () => `<div class="card-back"></div>`).join("");
}

function renderClaimPanel() {
  const pc = latest.pendingClaim;
  const opts = pc.youOptions;
  els.claimPanel.classList.remove("hidden");
  els.claimPrompt.textContent = `${seatLabel(pc.fromSeat)} descartou ${MR.tileLabel(pc.tile)}. O que você faz?`;
  els.claimButtons.innerHTML = "";
  const addBtn = (label, onClick) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", onClick);
    els.claimButtons.appendChild(b);
  };
  if (opts.canHu) addBtn("Hu! (fechar)", () => send({ type: "claimResponse", action: "hu" }));
  if (opts.canKong) addBtn("Kong", () => send({ type: "claimResponse", action: "kong" }));
  if (opts.canPong) addBtn("Pong", () => send({ type: "claimResponse", action: "pong" }));
  (opts.canChi || []).forEach((combo) => {
    addBtn(`Chi (${combo[0]}-${combo[1]}-${pc.tile.value})`, () => send({ type: "claimResponse", action: "chi", chiOption: combo }));
  });
  addBtn("Passar", () => send({ type: "claimResponse", action: "pass" }));
}

function renderSeatsBar() {
  els.seatsBar.innerHTML = "";
  latest.seats.forEach((s, i) => {
    const chip = document.createElement("div");
    chip.className = "seat-chip";
    if (i === mySeat) chip.classList.add("you");
    if (s.isAI) chip.classList.add("ai");
    const status = s.name ? (s.isAI ? `${s.name} (IA)` : s.connected ? s.name : `${s.name} (offline)`) : "vazio";
    chip.textContent = `Assento ${i + 1}: ${status}`;
    els.seatsBar.appendChild(chip);
  });
}
