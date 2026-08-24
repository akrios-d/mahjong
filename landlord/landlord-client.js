"use strict";

const LR = window.LandlordRules;
const RU = window.RoomUtils;
const LE = window.LandlordEngine;
const I18N = window.I18N;

let ws = null;
let mode = null; // "online" | "local"
let localRoom = null;
let mySeat = -1;
let latest = null; // last state snapshot (from server, or from the local engine)
let selectedUids = new Set();

const els = {
  lobby: document.getElementById("lobby"),
  roomCode: document.getElementById("roomCode"),
  findRoomsBtn: document.getElementById("findRoomsBtn"),
  roomList: document.getElementById("roomList"),
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
els.roomCode.value = "SALA1";
els.playerName.value = PlayerName.get() || ("Jogador" + Math.floor(Math.random() * 900 + 100));
els.playerName.addEventListener("input", () => PlayerName.set(els.playerName.value));

els.findRoomsBtn.addEventListener("click", () => {
  els.roomList.innerHTML = "";
  els.roomList.textContent = I18N.t("common.lobby.searching");
  RoomSearch.search("landlord", (rms) => {
    if (!rms.length) { els.roomList.textContent = I18N.t("common.lobby.noRooms"); return; }
    els.roomList.innerHTML = "";
    rms.forEach((r) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = I18N.t("common.lobby.roomChip", { code: r.code, used: r.seatsUsed, total: r.seatsTotal });
      b.addEventListener("click", () => { els.roomCode.value = r.code; });
      els.roomList.appendChild(b);
    });
  }, () => { els.roomList.textContent = I18N.t("common.lobby.searchFailed"); });
});

if (!ServerConfig.get()) {
  els.connectBtn.disabled = true;
  els.findRoomsBtn.disabled = true;
  setLobbyError(I18N.t("common.lobby.notConfigured"));
}

I18N.applyStaticI18n();
I18N.injectLanguageSwitcher(document.getElementById("langBar"), () => { I18N.applyStaticI18n(); render(); });

function setLobbyError(msg) { els.lobbyError.textContent = msg || ""; }

els.connectBtn.addEventListener("click", connect);
els.playLocalBtn.addEventListener("click", playLocal);

function connect() {
  const url = ServerConfig.get() || defaultServerUrl();
  const room = els.roomCode.value.trim() || "SALA1";
  const name = els.playerName.value.trim() || "Jogador";
  mode = "online";
  setLobbyError(I18N.t("common.lobby.connecting"));
  try { ws = new WebSocket(url); } catch (e) { setLobbyError(I18N.t("common.lobby.invalidAddress", { error: e.message })); return; }

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "join", game: "landlord", room, name }));
  });
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
    if (result && !result.ok) setMessage(I18N.t("common.error.prefix") + ": " + I18N.t(result.error));
  }
}

els.startBtn.addEventListener("click", () => send({ type: "startWithAI" }));
els.newBtn.addEventListener("click", () => send({ type: "newHand" }));

els.bidBox.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", () => send({ type: "bid", value: Number(b.dataset.bid) }));
});

els.playBtn.addEventListener("click", () => {
  if (selectedUids.size === 0) { setMessage(I18N.t("landlord.play.selectFirst")); return; }
  send({ type: "play", uids: [...selectedUids] });
  selectedUids.clear();
});

els.passBtn.addEventListener("click", () => { send({ type: "pass" }); selectedUids.clear(); });

function comboLabelI18n(combo) { return I18N.t("landlord.combo." + combo.type); }

els.hintBtn.addEventListener("click", () => {
  if (!latest || !latest.started || mySeat < 0) return;
  const hand = latest.hand;
  let combo;
  if (!latest.currentTrick || latest.currentTrick.ownerIdx === mySeat) {
    combo = LR.aiChooseLead(hand);
  } else {
    combo = LR.aiChooseFollow(hand, latest.currentTrick);
  }
  if (!combo) { setMessage(I18N.t("landlord.hint.none")); return; }
  selectedUids = new Set(combo.cards.map((c) => c.uid));
  render();
  setMessage(I18N.t("landlord.hint.suggestion", { combo: comboLabelI18n(combo) }));
});

function seatLabel(i) {
  if (i === mySeat) return I18N.t("common.you");
  return latest.seats[i].name || I18N.t("common.seat", { n: i + 1 });
}

function otherSeatIndices() {
  // returns [leftSeat, rightSeat] relative to me, in turn order
  const others = [0, 1, 2].filter((i) => i !== mySeat);
  return others;
}

function render() {
  if (!latest) return;
  els.phase.textContent = latest.started
    ? I18N.t(latest.phase === "bidding" ? "landlord.phase.bidding" : latest.phase === "playing" ? "common.phase.playing" : "common.phase.roundEnd")
    : I18N.t("common.phase.waiting");

  renderSeatsBar();

  if (!latest.started) {
    els.startBtn.classList.remove("hidden");
    return;
  }
  els.startBtn.classList.add("hidden");

  const [leftIdx, rightIdx] = otherSeatIndices();
  els.nameA.textContent = seatLabel(leftIdx);
  els.nameB.textContent = seatLabel(rightIdx);
  els.roleYou.textContent = latest.isLandlord[mySeat] ? I18N.t("landlord.role.landlordParen") : latest.landlordIdx !== -1 ? I18N.t("landlord.role.peasantParen") : "";
  els.roleA.textContent = latest.landlordIdx === -1 ? "" : I18N.t(latest.isLandlord[leftIdx] ? "landlord.role.landlord" : "landlord.role.peasant");
  els.roleB.textContent = latest.landlordIdx === -1 ? "" : I18N.t(latest.isLandlord[rightIdx] ? "landlord.role.landlord" : "landlord.role.peasant");

  els.handA.innerHTML = Array.from({ length: latest.handCounts[leftIdx] }, () => `<div class="card-back"></div>`).join("");
  els.handB.innerHTML = Array.from({ length: latest.handCounts[rightIdx] }, () => `<div class="card-back"></div>`).join("");
  els.countA.textContent = I18N.t("landlord.cardCount", { n: latest.handCounts[leftIdx] });
  els.countB.textContent = I18N.t("landlord.cardCount", { n: latest.handCounts[rightIdx] });

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
      els.bidPrompt.textContent = I18N.t("landlord.bid.yourTurn", { highest: latest.highestBid });
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
    setMessage(myTurn ? I18N.t(latest.currentTrick ? "landlord.turn.mustBeat" : "landlord.turn.leadAny") : I18N.t("common.turnOf", { name: seatLabel(latest.turnIdx) }));
  }

  if (latest.phase === "roundEnd") {
    els.newBtn.classList.remove("hidden");
    const winnerIsLandlord = latest.winnerIdx !== null && latest.isLandlord[latest.winnerIdx];
    const won = latest.winnerIdx !== null && latest.isLandlord[latest.winnerIdx] === latest.isLandlord[mySeat];
    const teamKey = winnerIsLandlord ? "landlord.roundEnd.landlordWon" : "landlord.roundEnd.peasantsWon";
    setMessage(I18N.t(teamKey, { name: seatLabel(latest.winnerIdx) }) + " " + I18N.t(won ? "common.youWon" : "common.youLost"));
  } else {
    els.newBtn.classList.add("hidden");
  }

  if (latest.log && latest.log.length && latest.phase !== "roundEnd") {
    const lastLog = latest.log[latest.log.length - 1];
    if (latest.phase !== "playing" || !myTurn) setMessage(formatLogEntry(lastLog));
  }
}

function formatLogEntry(entry) {
  if (!entry || typeof entry !== "object") return entry || "";
  if (entry.key === "landlord.log.played" && entry.params) {
    const cards = (entry.params.cards || []).map((c) => LR.cardLabel(c) + (c.suit || "")).join(", ");
    return I18N.t(entry.key, { ...entry.params, comboType: comboLabelI18n({ type: entry.params.comboType }), cards });
  }
  return I18N.t(entry.key, entry.params);
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
    const status = s.name ? (s.isAI ? I18N.t("common.seat.ai", { name: s.name }) : s.connected ? s.name : I18N.t("common.seat.offline", { name: s.name })) : I18N.t("common.seat.empty");
    chip.textContent = I18N.t("common.seat.chip", { n: i + 1, status });
    els.seatsBar.appendChild(chip);
  });
}
