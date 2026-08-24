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

  handEndPanel: document.getElementById("handEndPanel"),
  confirmHandBtn: document.getElementById("confirmHandBtn"),
  starterPickBox: document.getElementById("starterPickBox"),
  starterPickPrompt: document.getElementById("starterPickPrompt"),
  starterPickButtons: document.getElementById("starterPickButtons"),
  starterPickStatus: document.getElementById("starterPickStatus"),
};

function defaultServerUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.hostname || "localhost"}:8787`;
}
els.serverUrl.value = defaultServerUrl();
els.roomCode.value = "MESA1";
els.playerName.value = PlayerName.get() || ("Jogador" + Math.floor(Math.random() * 900 + 100));
els.playerName.addEventListener("input", () => PlayerName.set(els.playerName.value));

I18N.applyStaticI18n();
I18N.injectLanguageSwitcher(document.getElementById("langBar"), () => { I18N.applyStaticI18n(); render(); });

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
    else if (obj.type === "pickStarter") result = DE.submitPickStarter(localRoom, 0, obj.seat);
    if (result && !result.ok) setMessage(I18N.t("common.error.prefix") + ": " + I18N.t(result.error));
  }
}

els.connectBtn.addEventListener("click", connect);
els.playLocalBtn.addEventListener("click", playLocal);

function connect() {
  const url = els.serverUrl.value.trim() || defaultServerUrl();
  const room = els.roomCode.value.trim() || "MESA1";
  const name = els.playerName.value.trim() || "Jogador";
  mode = "online";
  setLobbyError(I18N.t("common.lobby.connecting"));
  try { ws = new WebSocket(url); } catch (e) { setLobbyError(I18N.t("common.lobby.invalidAddress", { error: e.message })); return; }

  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", game: "domino", room, name })));
  ws.addEventListener("close", () => setLobbyError(I18N.t("common.lobby.connectionLost")));
  ws.addEventListener("error", () => setLobbyError(I18N.t("common.lobby.connectFailed")));
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "joined") {
      mySeat = msg.seatIdx;
      showTable();
      return;
    }
    if (msg.type === "error") { setMessage(I18N.t("common.error.prefix") + ": " + I18N.t(msg.message)); return; }
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
els.confirmHandBtn.addEventListener("click", () => send({ type: "newHand" }));
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
      setMessage(I18N.t("domino.hint.suggestion", { a: t.a, b: t.b, side: I18N.t(sides[0] === "left" ? "domino.side.left" : "domino.side.right") }));
      return;
    }
  }
  setMessage(I18N.t("domino.hint.none"));
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
  if (i === mySeat) return I18N.t("common.you");
  return (latest.seats[i].name || I18N.t("common.seat", { n: i + 1 }));
}

function relativeSeats() {
  return { right: (mySeat + 1) % 4, top: (mySeat + 2) % 4, left: (mySeat + 3) % 4 };
}

function render() {
  if (!latest) return;
  els.phase.textContent = latest.started
    ? I18N.t(latest.phase === "playing" ? "common.phase.playing" : latest.phase === "matchEnd" ? "domino.phase.matchEnd" : "common.phase.roundEnd")
    : I18N.t("common.phase.waiting");

  renderSeatsBar();
  renderScoreboard();

  if (!latest.started) { els.startBtn.classList.remove("hidden"); return; }
  els.startBtn.classList.add("hidden");

  const { top, left, right } = relativeSeats();
  els.nameTop.textContent = seatLabel(top) + (latest.started ? ` (${I18N.t(DR.teamOf(top) === DR.teamOf(mySeat) ? "domino.team.yours" : "domino.team.opponent")})` : "");
  els.nameLeft.textContent = seatLabel(left);
  els.nameRight.textContent = seatLabel(right);
  els.handTop.innerHTML = Array.from({ length: latest.handCounts[top] }, () => `<div class="card-back"></div>`).join("");
  els.handLeft.innerHTML = Array.from({ length: latest.handCounts[left] }, () => `<div class="card-back"></div>`).join("");
  els.handRight.innerHTML = Array.from({ length: latest.handCounts[right] }, () => `<div class="card-back"></div>`).join("");

  els.mortoInfo.textContent = I18N.t("domino.mortoInfo", { n: latest.mortoCount });

  els.boardChain.innerHTML = "";
  if (latest.board.chain.length === 0) {
    const hintEl = document.createElement("span");
    hintEl.style.opacity = "0.5";
    hintEl.textContent = I18N.t("domino.board.empty");
    els.boardChain.appendChild(hintEl);
  } else {
    for (const t of latest.board.chain) els.boardChain.appendChild(renderTile(t, { static: true }));
  }

  els.lastBatida.textContent = latest.lastBatida
    ? I18N.t("domino.lastHand", { label: I18N.t("domino.batida." + latest.lastBatida.type), points: latest.lastBatida.points })
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
    els.playChoiceLabel.textContent = tile ? I18N.t("domino.playChoice.label", { a: tile.a, b: tile.b }) : "";
    els.playLeftBtn.style.display = sides.includes("left") ? "" : "none";
    els.playRightBtn.style.display = sides.includes("right") ? "" : "none";
  } else {
    els.playChoice.classList.add("hidden");
  }

  els.passBtn.disabled = !myTurn || DR.hasAnyLegalMove(latest.hand, latest.board);
  els.hintBtn.disabled = !myTurn || !DR.hasAnyLegalMove(latest.hand, latest.board);

  if (latest.phase === "playing") {
    setMessage(myTurn ? I18N.t("domino.turn.yours") : I18N.t("common.turnOf", { name: seatLabel(latest.turnIdx) }));
  } else if (latest.phase === "handEnd" || latest.phase === "matchEnd") {
    if (latest.log && latest.log.length) {
      setMessage(formatLogEntry(latest.log[latest.log.length - 1]));
    }
  }

  els.newHandBtn.classList.toggle("hidden", latest.phase !== "matchEnd");
  renderHandEndPanel();
}

function formatLogEntry(entry) {
  if (!entry || typeof entry !== "object") return entry || "";
  const p = entry.params || {};
  if (entry.key === "domino.log.played") {
    return I18N.t(entry.key, { ...p, side: I18N.t(p.side === "left" ? "domino.side.left" : "domino.side.right") });
  }
  if (entry.key === "domino.log.teamScored") {
    return I18N.t(entry.key, { ...p, team: I18N.t("domino.teamNameFull." + p.team), batidaType: I18N.t("domino.batida." + p.batidaType) });
  }
  if (entry.key === "domino.log.matchWon") {
    return I18N.t(entry.key, { ...p, team: I18N.t("domino.teamNameFull." + p.team) });
  }
  return I18N.t(entry.key, p);
}

function renderHandEndPanel() {
  const show = latest.phase === "handEnd" && latest.pendingHandEnd;
  els.handEndPanel.classList.toggle("hidden", !show);
  if (!show) return;
  const p = latest.pendingHandEnd;

  if (p.needsTeamPick && p.teammates.includes(mySeat)) {
    els.starterPickBox.classList.remove("hidden");
    els.confirmHandBtn.classList.add("hidden");
    const partnerSeat = p.teammates.find((s) => s !== mySeat);
    els.starterPickPrompt.textContent = I18N.t("domino.starterPick.prompt");
    els.starterPickButtons.innerHTML = "";
    const myPick = p.picks[mySeat];
    const addPickBtn = (label, seat) => {
      const b = document.createElement("button");
      b.textContent = label;
      if (myPick === seat) b.classList.add("picked");
      b.addEventListener("click", () => send({ type: "pickStarter", seat }));
      els.starterPickButtons.appendChild(b);
    };
    addPickBtn(I18N.t("domino.starterPick.me"), mySeat);
    addPickBtn(I18N.t("domino.starterPick.partner", { name: seatLabel(partnerSeat) }), partnerSeat);

    const partnerPick = p.picks[partnerSeat];
    if (myPick === undefined) els.starterPickStatus.textContent = I18N.t("domino.starterPick.waitingYou");
    else if (partnerPick === undefined) els.starterPickStatus.textContent = I18N.t("domino.starterPick.waitingPartner");
    else if (myPick === partnerPick) els.starterPickStatus.textContent = I18N.t("domino.starterPick.agreed", { name: seatLabel(myPick) });
    else els.starterPickStatus.textContent = I18N.t("domino.starterPick.mismatch");
  } else if (p.needsTeamPick) {
    els.starterPickBox.classList.add("hidden");
    els.confirmHandBtn.classList.add("hidden");
  } else {
    els.starterPickBox.classList.add("hidden");
    els.confirmHandBtn.classList.remove("hidden");
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
    const status = s.name ? (s.isAI ? I18N.t("common.seat.ai", { name: s.name }) : s.connected ? s.name : I18N.t("common.seat.offline", { name: s.name })) : I18N.t("common.seat.empty");
    chip.textContent = I18N.t("common.seat.chip", { n: i + 1, status });
    els.seatsBar.appendChild(chip);
  });
}

function teamLabel(team, myTeam) {
  return `${I18N.t(team === myTeam ? "domino.team.yours" : "domino.team.opponent")} (${I18N.t("domino.teamName." + team)})`;
}

function renderScoreboard() {
  if (!latest.started || !latest.teamScores) { els.scoreboard.innerHTML = ""; return; }
  const myTeam = DR.teamOf(mySeat);
  els.scoreboard.innerHTML = `
    <span>${teamLabel(0, myTeam)}: <b>${latest.teamScores[0]}</b> / ${latest.targetScore}</span>
    <span>${teamLabel(1, myTeam)}: <b>${latest.teamScores[1]}</b> / ${latest.targetScore}</span>
  `;
}
