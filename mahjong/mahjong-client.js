"use strict";

const MR = window.MahjongRules;
const RU = window.RoomUtils;
const MJE = window.MahjongEngine;
const I18N = window.I18N;

function suitLabelI18n(suit) { return I18N.t("mahjong.suit." + suit); }
function tileLabelI18n(t) { return `${t.value} ${suitLabelI18n(t.suit)}`; }

let ws = null;
let mode = null; // "online" | "local"
let localRoom = null;
let mySeat = -1;
let latest = null;

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
  winnersLine: document.getElementById("winnersLine"),

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
els.roomCode.value = "MJ1";
els.playerName.value = PlayerName.get() || ("Jogador" + Math.floor(Math.random() * 900 + 100));
els.playerName.addEventListener("input", () => PlayerName.set(els.playerName.value));

els.findRoomsBtn.addEventListener("click", () => {
  els.roomList.innerHTML = "";
  els.roomList.textContent = I18N.t("common.lobby.searching");
  RoomSearch.search("mahjong", (rms) => {
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
    if (result && !result.ok) setMessage(I18N.t("common.error.prefix") + ": " + I18N.t(result.error));
  }
}

els.connectBtn.addEventListener("click", connect);
els.playLocalBtn.addEventListener("click", playLocal);

function connect() {
  const url = ServerConfig.get() || defaultServerUrl();
  const room = els.roomCode.value.trim() || "MJ1";
  const name = els.playerName.value.trim() || "Jogador";
  mode = "online";
  setLobbyError(I18N.t("common.lobby.connecting"));
  try { ws = new WebSocket(url); } catch (e) { setLobbyError(I18N.t("common.lobby.invalidAddress", { error: e.message })); return; }

  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", game: "mahjong", room, name })));
  ws.addEventListener("close", () => setLobbyError(I18N.t("common.lobby.connectionLost")));
  ws.addEventListener("error", () => setLobbyError(I18N.t("common.lobby.connectFailed")));
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "joined") { mySeat = msg.seatIdx; showTable(); return; }
    if (msg.type === "error") { setMessage(I18N.t("common.error.prefix") + ": " + I18N.t(msg.message)); return; }
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

function tileGuidanceText(guidance) {
  const g = guidance;
  if (g.status === "triplet") return I18N.t("mahjong.tileInfo.triplet", { values: g.groupValues.join("-"), suit: suitLabelI18n(g.tile.suit) });
  if (g.status === "run") return I18N.t("mahjong.tileInfo.run", { values: g.groupValues.join("-"), suit: suitLabelI18n(g.tile.suit) });
  if (g.status === "pair") return I18N.t("mahjong.tileInfo.pair", { value: g.tile.value, suit: suitLabelI18n(g.tile.suit) });
  if (g.status === "partial_run") {
    const waits = g.waits.map((v) => `${v} ${suitLabelI18n(g.tile.suit)}`).join(I18N.t("mahjong.tileInfo.or"));
    return I18N.t("mahjong.tileInfo.partialRun", { values: g.groupValues.join("-"), suit: suitLabelI18n(g.tile.suit), waits });
  }
  return I18N.t("mahjong.tileInfo.isolated", { value: g.tile.value, suit: suitLabelI18n(g.tile.suit), waits: g.waits.join(", ") });
}

function showTileInspector(uid) {
  if (!latest || mySeat < 0) return;
  const me = latest.players[mySeat];
  const guidance = MR.tileGuidance(me.hand, me.missingSuit, uid);
  if (!guidance) return;
  const { mult, notes } = MR.estimateMultiplier(me.hand, me.revealed, me.missingSuit);
  const noteText = notes.map((k) => I18N.t(k)).join(", ");
  const multText = notes.length
    ? I18N.t("mahjong.multiplier.withNotes", { mult, notes: noteText })
    : I18N.t("mahjong.multiplier.none", { mult });
  setMessage(`${tileGuidanceText(guidance)} ${multText}`);
  tileInspectActive = true;
  clearTimeout(tileInspectTimer);
  tileInspectTimer = setTimeout(() => { tileInspectActive = false; render(); }, 7000);
}

els.hintBtn.addEventListener("click", () => {
  if (!latest || latest.awaitingDiscard !== mySeat) { setMessage(I18N.t("mahjong.hint.onlyOnTurn")); return; }
  const me = latest.players[mySeat];
  const analysis = MR.analyzeHand(me.hand, me.missingSuit);
  const groupUids = new Map();
  analysis.groups.forEach((g) => g.tiles.forEach((t) => groupUids.set(t.uid, I18N.t("mahjong.group." + g.type))));
  handHint = { groupUids, discardUid: analysis.discardSuggestion.uid };
  const groupSummary = analysis.groups.length
    ? analysis.groups.map((g) => `${I18N.t("mahjong.group." + g.type)} (${g.tiles.map((t) => tileLabelI18n(t)).join(", ")})`).join(" · ")
    : I18N.t("mahjong.hint.noGroupsYet");
  setMessage(I18N.t("mahjong.hint.suggestion", { tile: tileLabelI18n(analysis.discardSuggestion), groups: groupSummary }));
  clearTimeout(handHintTimer);
  handHintTimer = setTimeout(() => { handHint = null; render(); }, 6000);
  render();
});

// Keeps tiles you're abandoning (missing suit) up front, on the left, so
// the ones you'll be discarding are the easiest to spot/reach — the rest
// keep the server's original (suit, value) order.
function sortHandForDisplay(hand, missingSuit) {
  if (!missingSuit) return hand;
  const missing = hand.filter((t) => t.suit === missingSuit);
  const rest = hand.filter((t) => t.suit !== missingSuit);
  return [...missing, ...rest];
}

/* ---------------- rendering ---------------- */
function seatLabel(i) {
  if (!latest) return I18N.t("common.seat", { n: i + 1 });
  if (i === mySeat) return I18N.t("common.you");
  return (latest.seats[i] && latest.seats[i].name) || I18N.t("common.seat", { n: i + 1 });
}
function relativeSeats() { return { right: (mySeat + 1) % 4, top: (mySeat + 2) % 4, left: (mySeat + 3) % 4 }; }

function renderTile(tile, opts) {
  opts = opts || {};
  const el = document.createElement("div");
  el.className = "mtile" + (opts.small ? " small" : "") + (opts.static ? " static" : "") + (opts.disabled ? " disabled" : "");
  el.textContent = MR.tileGlyph(tile);
  el.title = tileLabelI18n(tile);
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
  els.phase.textContent = !latest.started ? I18N.t("common.phase.waiting")
    : latest.phase === "missingSuit" ? I18N.t("mahjong.phase.missingSuit")
    : latest.phase === "playing" ? I18N.t("common.phase.playing")
    : I18N.t("common.phase.roundEnd");

  renderSeatsBar();

  if (!latest.started) { els.startBtn.classList.remove("hidden"); return; }
  els.startBtn.classList.add("hidden");

  const { top, left, right } = relativeSeats();
  const players = latest.players;
  renderSide("Top", top, players[top]);
  renderSide("Left", left, players[left]);
  renderSide("Right", right, players[right]);

  els.wallCount.textContent = I18N.t("mahjong.wallCount", { n: latest.wallCount });
  els.discardPile.innerHTML = "";
  for (const d of latest.discardPile) {
    const el = renderTile(d.tile, { static: true, small: true });
    el.style.opacity = "0.85";
    el.title += ` (${I18N.t("mahjong.discardedBy", { name: seatLabel(d.fromSeat) })})`;
    els.discardPile.appendChild(el);
  }

  const me = players[mySeat];
  const mySuitText = me.missingSuit ? I18N.t("mahjong.missingSuitParen", { suit: suitLabelI18n(me.missingSuit) }) : "";
  els.metaYou.textContent = [mySuitText, chipsLabel(mySeat)].filter(Boolean).join(" · ");
  els.revealedYou.innerHTML = "";
  (me.revealed || []).forEach((m) => els.revealedYou.appendChild(renderMeld(m)));

  els.missingSuitPanel.classList.toggle("hidden", !(latest.phase === "missingSuit" && !me.missingSuit));
  els.claimPanel.classList.add("hidden");

  els.handYou.innerHTML = "";
  const myTurnToDiscard = latest.phase === "playing" && latest.awaitingDiscard === mySeat;
  const canInspect = latest.phase === "playing";
  const handOrdered = sortHandForDisplay(me.hand || [], me.missingSuit);
  for (const t of handOrdered) {
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
      if (t.uid === handHint.discardUid) { el.classList.add("discard-suggest"); el.title += ` — ${I18N.t("mahjong.discardSuggestion")}`; }
      else if (handHint.groupUids.has(t.uid)) { el.classList.add("keep"); el.title += ` — ${handHint.groupUids.get(t.uid)}`; }
    }
    // No inspector on tiles you're already abandoning (missing suit) — their
    // fate is obvious, so skip the extra badge to reduce clutter/mis-taps.
    if (canInspect && !(me.missingSuit && t.suit === me.missingSuit)) {
      const badge = document.createElement("div");
      badge.className = "inspect-badge";
      badge.textContent = "?";
      badge.title = I18N.t("mahjong.inspect.title");
      const openInspector = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showTileInspector(t.uid);
      };
      badge.addEventListener("click", openInspector);
      badge.addEventListener("touchend", openInspector);
      el.appendChild(badge);
    }
    els.handYou.appendChild(el);
  }

  els.kongBtn.classList.toggle("hidden", !(myTurnToDiscard && MR.hasConcealedKong(me.hand)));
  els.huBtn.classList.toggle("hidden", !(myTurnToDiscard && MR.isWinningHand(me.hand, (me.revealed || []).length, me.missingSuit)));
  els.newHandBtn.classList.toggle("hidden", latest.phase !== "roundEnd");
  els.hintBtn.disabled = !myTurnToDiscard;

  if (latest.phase === "playing" && !handHint && !tileInspectActive) {
    if (myTurnToDiscard) setMessage(I18N.t("mahjong.turn.discard"));
    else if (latest.pendingClaim) setMessage(I18N.t("mahjong.claim.waiting", { name: seatLabel(latest.pendingClaim.fromSeat), tile: tileLabelI18n(latest.pendingClaim.tile) }));
    else setMessage(I18N.t("common.turnOf", { name: seatLabel(latest.turnIdx) }));
  }

  if (latest.pendingClaim && latest.pendingClaim.youEligible && !latest.pendingClaim.youResponded) {
    renderClaimPanel();
  }

  renderWinnersLine();

  if (latest.phase === "roundEnd") {
    els.endOverlay.classList.remove("hidden");
    const winners = latest.winners || [];
    if (winners.length === 0) {
      els.endTitle.textContent = I18N.t("mahjong.roundEnd.noWinnerTitle");
      els.endStats.textContent = I18N.t("mahjong.roundEnd.noWinnerStats");
    } else {
      const iWon = winners.some((w) => w.seatIdx === mySeat);
      els.endTitle.textContent = iWon ? I18N.t("mahjong.roundEnd.youWonTitle") : I18N.t("mahjong.roundEnd.wonByTitle", { name: seatLabel(winners[0].seatIdx) });
      els.endStats.textContent = winners.map((w) => I18N.t("mahjong.roundEnd.winnerLine", { name: seatLabel(w.seatIdx), mult: w.mult, payout: w.payout })).join("  ·  ");
    }
  } else {
    els.endOverlay.classList.add("hidden");
  }
}

// Blood-battle hands can have several winners over time (each steps out
// as they Hu, but play continues for the rest) — this keeps a running,
// always-visible tally so it's clear who's already won this hand and
// for how much, instead of that only surfacing once at the very end.
function renderWinnersLine() {
  const winners = latest.winners || [];
  if (!els.winnersLine) return;
  els.winnersLine.textContent = winners
    .map((w) => I18N.t("mahjong.roundEnd.winnerLine", { name: seatLabel(w.seatIdx), mult: w.mult, payout: w.payout }))
    .join("  ·  ");
}

function chipsLabel(seatIdx) {
  if (!latest.chips) return "";
  const isOut = latest.activeSeats && !latest.activeSeats[seatIdx];
  return I18N.t(isOut ? "mahjong.chips.outLabel" : "mahjong.chips.label", { chips: latest.chips[seatIdx] });
}

function renderSide(pos, seatIdx, player) {
  els[`name${pos}`].textContent = seatLabel(seatIdx);
  const suitText = player.missingSuit ? I18N.t("mahjong.missingSuitPlain", { suit: suitLabelI18n(player.missingSuit) }) : (player.hasChosenMissingSuit ? I18N.t("mahjong.chosenSuit") : "");
  els[`meta${pos}`].textContent = [suitText, chipsLabel(seatIdx)].filter(Boolean).join(" · ");
  els[`revealed${pos}`].innerHTML = "";
  (player.revealed || []).forEach((m) => els[`revealed${pos}`].appendChild(renderMeld(m)));
  els[`hand${pos}`].innerHTML = Array.from({ length: player.handCount }, () => `<div class="card-back"></div>`).join("");
}

function renderClaimPanel() {
  const pc = latest.pendingClaim;
  const opts = pc.youOptions;
  els.claimPanel.classList.remove("hidden");
  els.claimPrompt.textContent = I18N.t("mahjong.claim.prompt", { name: seatLabel(pc.fromSeat), tile: tileLabelI18n(pc.tile) });
  els.claimButtons.innerHTML = "";
  const addBtn = (label, onClick) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", onClick);
    els.claimButtons.appendChild(b);
  };
  if (opts.canHu) addBtn(I18N.t("mahjong.claim.hu"), () => send({ type: "claimResponse", action: "hu" }));
  if (opts.canKong) addBtn(I18N.t("mahjong.claim.kong"), () => send({ type: "claimResponse", action: "kong" }));
  if (opts.canPong) addBtn(I18N.t("mahjong.claim.pong"), () => send({ type: "claimResponse", action: "pong" }));
  (opts.canChi || []).forEach((combo) => {
    addBtn(I18N.t("mahjong.claim.chi", { a: combo[0], b: combo[1], c: pc.tile.value }), () => send({ type: "claimResponse", action: "chi", chiOption: combo }));
  });
  addBtn(I18N.t("landlord.bid.pass"), () => send({ type: "claimResponse", action: "pass" }));
}

function renderSeatsBar() {
  els.seatsBar.innerHTML = "";
  latest.seats.forEach((s, i) => {
    const chip = document.createElement("div");
    chip.className = "seat-chip";
    if (i === mySeat) chip.classList.add("you");
    if (s.isAI) chip.classList.add("ai");
    const status = s.name ? (s.isAI ? I18N.t("common.seat.ai", { name: s.name }) : s.connected ? s.name : I18N.t("common.seat.offline", { name: s.name })) : I18N.t("common.seat.empty");
    chip.textContent = I18N.t("common.seat.chip", { n: i + 1, status });
    els.seatsBar.appendChild(chip);
  });
}
