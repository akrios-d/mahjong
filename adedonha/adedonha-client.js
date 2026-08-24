"use strict";

const AE = window.AdedonhaEngine;
const RU = window.RoomUtils;
const I18N = window.I18N;

let ws = null;
let mode = null; // "online" | "local"
let localRoom = null;
let mySeat = -1;
let latest = null;
let myPendingAnswers = {}; // category -> text, local echo (server doesn't send our own typing back)
let answerDebounce = {};

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
  startNoAiBtn: document.getElementById("startNoAiBtn"),

  table: document.getElementById("table"),
  phase: document.getElementById("phaseLabel"),
  message: document.getElementById("messageBox"),

  categoriesPanel: document.getElementById("categoriesPanel"),
  categoryList: document.getElementById("categoryList"),
  newCategory: document.getElementById("newCategory"),
  addCategoryBtn: document.getElementById("addCategoryBtn"),
  useDefaultsBtn: document.getElementById("useDefaultsBtn"),
  startRoundBtn: document.getElementById("startRoundBtn"),

  writingPanel: document.getElementById("writingPanel"),
  letterBadge: document.getElementById("letterBadge"),
  timerLabel: document.getElementById("timerLabel"),
  stopBtn: document.getElementById("stopBtn"),
  answersGrid: document.getElementById("answersGrid"),
  answeredStatus: document.getElementById("answeredStatus"),

  scoringPanel: document.getElementById("scoringPanel"),
  resultsTable: document.getElementById("resultsTable"),
  totalsTable: document.getElementById("totalsTable"),
  nextRoundBtn: document.getElementById("nextRoundBtn"),
};

function defaultServerUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.hostname || "localhost"}:8787`;
}
els.serverUrl.value = defaultServerUrl();
els.roomCode.value = "STOP1";
els.playerName.value = "Jogador" + Math.floor(Math.random() * 900 + 100);

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
    if (obj.type === "startWithAI") { RU.fillWithAI(localRoom); localRoom.started = true; AE.deal(localRoom); return; }
    if (obj.type === "startAsIs") { localRoom.started = true; AE.deal(localRoom); return; }
    else if (obj.type === "addCategory") result = AE.submitAddCategory(localRoom, 0, obj.text);
    else if (obj.type === "useDefaults") result = AE.submitUseDefaults(localRoom);
    else if (obj.type === "startRound") result = AE.startRound(localRoom, 0);
    else if (obj.type === "setAnswer") result = AE.submitSetAnswer(localRoom, 0, obj.category, obj.text);
    else if (obj.type === "stopRound") result = AE.submitStop(localRoom, 0);
    if (result && !result.ok) setMessage(I18N.t("common.error.prefix") + ": " + I18N.t(result.error));
  }
}

els.connectBtn.addEventListener("click", connect);
els.playLocalBtn.addEventListener("click", playLocal);

function connect() {
  const url = els.serverUrl.value.trim() || defaultServerUrl();
  const room = els.roomCode.value.trim() || "STOP1";
  const name = els.playerName.value.trim() || "Jogador";
  mode = "online";
  setLobbyError(I18N.t("common.lobby.connecting"));
  try { ws = new WebSocket(url); } catch (e) { setLobbyError(I18N.t("common.lobby.invalidAddress", { error: e.message })); return; }

  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", game: "adedonha", room, name })));
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
  localRoom = RU.makeRoom("adedonha", "LOCAL", 6);
  localRoom.seats[0] = { ws: {}, name, isAI: false };
  localRoom.hooks = { update: () => { latest = AE.viewFor(localRoom, 0); render(); } };
  showTable();
  latest = AE.viewFor(localRoom, 0);
  render();
}

function showTable() {
  els.lobby.classList.add("hidden");
  els.roomBar.classList.remove("hidden");
  els.table.classList.remove("hidden");
}

els.startBtn.addEventListener("click", () => send({ type: "startWithAI" }));
els.startNoAiBtn.addEventListener("click", () => send({ type: "startAsIs" }));

els.addCategoryBtn.addEventListener("click", () => {
  const text = els.newCategory.value.trim();
  if (!text) return;
  send({ type: "addCategory", text });
  els.newCategory.value = "";
});
els.newCategory.addEventListener("keydown", (e) => { if (e.key === "Enter") els.addCategoryBtn.click(); });
els.useDefaultsBtn.addEventListener("click", () => send({ type: "useDefaults" }));
els.startRoundBtn.addEventListener("click", () => { myPendingAnswers = {}; send({ type: "startRound" }); });
els.nextRoundBtn.addEventListener("click", () => { myPendingAnswers = {}; send({ type: "startRound" }); });
els.stopBtn.addEventListener("click", () => send({ type: "stopRound" }));

function onAnswerInput(category, value) {
  myPendingAnswers[category] = value;
  clearTimeout(answerDebounce[category]);
  answerDebounce[category] = setTimeout(() => send({ type: "setAnswer", category, text: value }), 250);
}

/* ---------------- rendering ---------------- */
let tickHandle = null;

function render() {
  if (!latest) return;
  renderSeatsBar();

  if (!latest.started) {
    els.startBtn.classList.remove("hidden");
    els.startNoAiBtn.classList.remove("hidden");
    els.phase.textContent = I18N.t("common.phase.waiting");
    hideAllPanels();
    return;
  }
  els.startBtn.classList.add("hidden");
  els.startNoAiBtn.classList.add("hidden");

  hideAllPanels();
  if (latest.phase === "categories") {
    els.phase.textContent = I18N.t("adedonha.phase.categories");
    els.categoriesPanel.classList.remove("hidden");
    renderCategories();
  } else if (latest.phase === "writing") {
    els.phase.textContent = I18N.t("adedonha.phase.writing", { round: latest.roundNumber });
    els.writingPanel.classList.remove("hidden");
    renderWriting();
    startTicking();
  } else if (latest.phase === "scoring") {
    els.phase.textContent = I18N.t("adedonha.phase.scoring", { round: latest.roundNumber });
    els.scoringPanel.classList.remove("hidden");
    renderScoring();
  }
}

function hideAllPanels() {
  els.categoriesPanel.classList.add("hidden");
  els.writingPanel.classList.add("hidden");
  els.scoringPanel.classList.add("hidden");
  stopTicking();
}

function renderCategories() {
  els.categoryList.innerHTML = latest.categories.length
    ? latest.categories.map((c) => `<li>${escapeHtml(c)}</li>`).join("")
    : `<li style="opacity:.6">${I18N.t("adedonha.categories.none")}</li>`;
}

function renderWriting() {
  els.letterBadge.textContent = latest.letter || "?";
  els.answersGrid.innerHTML = "";
  for (const cat of latest.categories) {
    const wrap = document.createElement("div");
    wrap.className = "answer-field";
    const label = document.createElement("label");
    label.textContent = cat;
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `${latest.letter}...`;
    input.value = myPendingAnswers[cat] !== undefined ? myPendingAnswers[cat] : (latest.myAnswers[cat] || "");
    input.addEventListener("input", () => onAnswerInput(cat, input.value));
    wrap.appendChild(label);
    wrap.appendChild(input);
    els.answersGrid.appendChild(wrap);
  }
  if (latest.answeredCounts) {
    els.answeredStatus.textContent = latest.answeredCounts
      .map((a) => `${seatName(a.seatIdx)}: ${a.filled}/${latest.categories.length}`)
      .join("  •  ");
  }
  updateTimerDisplay();
}

function updateTimerDisplay() {
  if (!latest || latest.phase !== "writing" || !latest.roundEndAt) return;
  const remaining = Math.max(0, Math.ceil((latest.roundEndAt - Date.now()) / 1000));
  els.timerLabel.textContent = `${remaining}s`;
}

function startTicking() {
  stopTicking();
  tickHandle = setInterval(updateTimerDisplay, 500);
}
function stopTicking() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}

function renderScoring() {
  const results = latest.roundResults || [];
  let html = `<table><thead><tr><th>${I18N.t("common.player")}</th>`;
  html += latest.categories.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  html += `<th>${I18N.t("adedonha.scoring.total")}</th></tr></thead><tbody>`;
  for (const r of results) {
    html += `<tr><td>${escapeHtml(r.name || seatName(r.seatIdx))}</td>`;
    for (const cat of latest.categories) {
      const entry = r.perCategory.find((p) => p.category === cat);
      if (!entry || !entry.answer) html += `<td class="invalid">—</td>`;
      else html += `<td class="${entry.valid ? "" : "invalid"}">${escapeHtml(entry.answer)} <span class="points">(${entry.points})</span></td>`;
    }
    html += `<td class="points">${r.roundTotal}</td></tr>`;
  }
  html += "</tbody></table>";
  els.resultsTable.innerHTML = html;

  const totalsEntries = Object.entries(latest.totals || {}).sort((a, b) => b[1] - a[1]);
  let th = `<table><thead><tr><th>${I18N.t("common.player")}</th><th>${I18N.t("adedonha.scoring.points")}</th></tr></thead><tbody>`;
  for (const [seatIdx, pts] of totalsEntries) {
    th += `<tr><td>${escapeHtml(seatName(Number(seatIdx)))}</td><td class="points">${pts}</td></tr>`;
  }
  th += "</tbody></table>";
  els.totalsTable.innerHTML = th;
}

function seatName(i) {
  if (i === mySeat) return I18N.t("common.you");
  return (latest.seats[i] && latest.seats[i].name) || I18N.t("common.seat", { n: i + 1 });
}

function renderSeatsBar() {
  els.seatsBar.innerHTML = "";
  latest.seats.forEach((s, i) => {
    if (!s.name && !s.isAI) return; // skip empty seats visually once room is large
    const chip = document.createElement("div");
    chip.className = "seat-chip";
    if (i === mySeat) chip.classList.add("you");
    if (s.isAI) chip.classList.add("ai");
    const status = s.name ? (s.isAI ? I18N.t("common.seat.ai", { name: s.name }) : s.connected ? s.name : I18N.t("common.seat.offline", { name: s.name })) : I18N.t("common.seat.empty");
    chip.textContent = I18N.t("common.seat.chip", { n: i + 1, status });
    els.seatsBar.appendChild(chip);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
