"use strict";
/* Desenho & Adivinha (drawing & guessing, Gartic/skribbl-style) orchestration.
   Human-only — there is no AI drawer or guesser, so unlike the other
   engines this one never fills seats with bots. Canvas strokes themselves
   are NOT part of this engine's state; they're relayed directly by the
   server as a lightweight pass-through (see server.js) since they're pure
   real-time streaming data with no need for reconciliation. */
(function (root) {
  const DW = typeof module !== "undefined" && module.exports ? require("./desenhoWords.js") : root.DesenhoWords;
  const RU = typeof module !== "undefined" && module.exports ? require("./roomUtils.js") : root.RoomUtils;

  const ROUND_MS = 90000;
  const REVEAL_MS = 5000;

  function update(room) { room.hooks.update(); }
  function log(room, key, params) { RU.pushLog(room, key, params); }

  function activeSeats(room) {
    return room.seats.map((s, i) => i).filter((i) => !!room.seats[i].ws);
  }

  function normalize(text) {
    return String(text || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function viewFor(room, seatIdx) {
    const base = RU.viewBase(room, seatIdx);
    if (!room.started) return base;
    const s = room.state;
    const isDrawer = seatIdx === s.drawerSeat;
    const hasGuessed = s.guessedSeats.includes(seatIdx);
    const revealWord = s.phase === "reveal" || isDrawer || hasGuessed;
    return {
      ...base,
      phase: s.phase,
      roundNumber: s.roundNumber,
      drawerSeat: s.drawerSeat,
      roundEndAt: s.roundEndAt,
      isDrawer,
      word: revealWord ? s.word : null,
      wordLength: s.word ? s.word.length : 0,
      guessedSeats: s.guessedSeats,
      scores: s.scores,
      chat: s.chat.slice(-30),
    };
  }

  function init(room) {
    room.state = {
      phase: "idle", // waiting for someone to click "Começar"; startRound() moves to "drawing"
      order: [],
      nextDrawerIdx: -1,
      drawerSeat: -1,
      word: null,
      usedWords: [],
      roundEndAt: null,
      guessedSeats: [],
      scores: {},
      chat: [],
      roundNumber: 0,
      timer: null,
      revealTimer: null,
      log: room.state ? room.state.log : [],
    };
    activeSeats(room).forEach((i) => { room.state.scores[i] = 0; });
    log(room, "desenho.log.roomReady");
    const started = startRound(room);
    if (!started.ok) { log(room, started.error); update(room); } // not enough players yet — stay in "idle" and show why
  }

  function pickWord(room) {
    const s = room.state;
    let pool = DW.WORDS.filter((w) => !s.usedWords.includes(w));
    if (pool.length === 0) { s.usedWords = []; pool = DW.WORDS.slice(); }
    const word = pool[Math.floor(Math.random() * pool.length)];
    s.usedWords.push(word);
    return word;
  }

  function pickNextDrawer(room) {
    const active = activeSeats(room);
    if (active.length === 0) return -1;
    const s = room.state;
    for (let step = 1; step <= room.seats.length; step++) {
      const idx = (s.nextDrawerIdx + step) % room.seats.length;
      if (active.includes(idx)) { s.nextDrawerIdx = idx; return idx; }
    }
    return active[0];
  }

  function startRound(room) {
    const s = room.state;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    if (s.revealTimer) { clearTimeout(s.revealTimer); s.revealTimer = null; }
    const drawer = pickNextDrawer(room);
    if (drawer === -1) return { ok: false, error: "desenho.err.notEnoughPlayers" };
    if (activeSeats(room).length < 2) return { ok: false, error: "desenho.err.needTwoPlayers" };
    s.drawerSeat = drawer;
    s.word = pickWord(room);
    s.guessedSeats = [];
    s.roundNumber++;
    s.phase = "drawing";
    s.roundEndAt = Date.now() + ROUND_MS;
    s.chat.push({ system: true, key: "desenho.chat.roundStart", params: { round: s.roundNumber, name: room.seats[drawer].name } });
    log(room, "desenho.log.roundStart", { round: s.roundNumber, name: room.seats[drawer].name });
    update(room);
    s.timer = setTimeout(() => finishRound(room, "timeout"), ROUND_MS);
    return { ok: true };
  }

  function finishRound(room, reason) {
    const s = room.state;
    if (s.phase !== "drawing") return;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    s.phase = "reveal";
    s.chat.push({ system: true, key: reason === "timeout" ? "desenho.chat.timeout" : "desenho.chat.allGuessed", params: { word: s.word } });
    log(room, "desenho.log.roundEnded", { round: s.roundNumber, reason, word: s.word });
    update(room);
    s.revealTimer = setTimeout(() => {
      if (activeSeats(room).length >= 2) startRound(room);
    }, REVEAL_MS);
  }

  function submitGuess(room, seatIdx, text) {
    const s = room.state;
    if (s.phase !== "drawing") return { ok: false, error: "desenho.err.noRoundInProgress" };
    if (seatIdx === s.drawerSeat) return { ok: false, error: "desenho.err.youAreDrawer" };
    if (s.guessedSeats.includes(seatIdx)) return { ok: false, error: "desenho.err.alreadyGuessed" };
    const guess = String(text || "").trim().slice(0, 60);
    if (!guess) return { ok: false, error: "desenho.err.emptyGuess" };
    const correct = normalize(guess) === normalize(s.word);
    const name = room.seats[seatIdx].name;
    if (correct) {
      const remaining = Math.max(0, s.roundEndAt - Date.now());
      const points = Math.max(20, Math.round(100 * (remaining / ROUND_MS)));
      s.scores[seatIdx] = (s.scores[seatIdx] || 0) + points;
      s.scores[s.drawerSeat] = (s.scores[s.drawerSeat] || 0) + 20;
      s.guessedSeats.push(seatIdx);
      s.chat.push({ system: true, key: "desenho.chat.correct", params: { name, points } });
      log(room, "desenho.log.correct", { name });
      const activeGuessers = activeSeats(room).filter((i) => i !== s.drawerSeat);
      if (activeGuessers.every((i) => s.guessedSeats.includes(i))) {
        update(room);
        finishRound(room, "allGuessed");
        return { ok: true };
      }
    } else {
      s.chat.push({ seatIdx, name, text: guess, correct: false });
    }
    update(room);
    return { ok: true };
  }

  function requestStart(room) { return startRound(room); }

  const api = { viewFor, deal: init, startRound: requestStart, submitGuess, activeSeats };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.DesenhoEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
