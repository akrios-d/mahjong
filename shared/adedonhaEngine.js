"use strict";
/* Adedonha (Stop / categorias) orchestration. Unlike Landlord/Domino this
   game doesn't need every seat filled — players who never joined (or AI
   that was never added) are simply skipped everywhere. Isomorphic — see
   shared/landlordEngine.js for the room/hooks contract. */
(function (root) {
  const AW = typeof module !== "undefined" && module.exports ? require("./adedonhaWords.js") : root.AdedonhaWords;
  const RU = typeof module !== "undefined" && module.exports ? require("./roomUtils.js") : root.RoomUtils;

  const ROUND_MS = 60000;
  const LETTERS = "ABCDEFGHIJLMNOPQRSTUV".split(""); // skip K/W/X/Y/Z: too few valid Portuguese answers

  function update(room) { room.hooks.update(); }
  function log(room, key, params) { RU.pushLog(room, key, params); }

  function activeSeats(room) {
    return room.seats.map((s, i) => i).filter((i) => room.seats[i].ws || room.seats[i].isAI);
  }

  function viewFor(room, seatIdx) {
    const base = RU.viewBase(room, seatIdx);
    if (!room.started) return base;
    const s = room.state;
    return {
      ...base,
      phase: s.phase,
      categories: s.categories,
      letter: s.letter,
      roundNumber: s.roundNumber,
      roundEndAt: s.roundEndAt,
      totals: s.totals,
      myAnswers: s.answers[seatIdx] || {},
      answeredCounts: s.phase === "writing"
        ? activeSeats(room).map((i) => ({ seatIdx: i, filled: Object.values(s.answers[i] || {}).filter((v) => v && v.trim()).length }))
        : null,
      roundResults: s.phase === "scoring" ? s.lastResults : null,
    };
  }

  function init(room) {
    room.state = {
      phase: "categories",
      categories: [],
      usedLetters: [],
      letter: null,
      roundEndAt: null,
      answers: {},
      totals: {},
      roundNumber: 0,
      lastResults: null,
      timer: null,
      log: room.state ? room.state.log : [],
    };
    activeSeats(room).forEach((i) => { room.state.totals[i] = 0; });
    log(room, "adedonha.log.roomReady");
    update(room);
  }

  function submitAddCategory(room, seatIdx, text) {
    const s = room.state;
    if (s.phase !== "categories") return { ok: false, error: "adedonha.err.categoriesLocked" };
    const clean = String(text || "").trim().slice(0, 24);
    if (!clean) return { ok: false, error: "adedonha.err.emptyCategory" };
    if (s.categories.length >= 8) return { ok: false, error: "adedonha.err.maxCategories" };
    if (s.categories.some((c) => c.toLowerCase() === clean.toLowerCase())) return { ok: false, error: "adedonha.err.duplicateCategory" };
    s.categories.push(clean);
    log(room, "adedonha.log.categoryAdded", { name: room.seats[seatIdx].name, category: clean });
    update(room);
    return { ok: true };
  }

  function submitUseDefaults(room) {
    const s = room.state;
    if (s.phase !== "categories") return { ok: false, error: "adedonha.err.onlyBeforeFirstRound" };
    for (const c of AW.DEFAULT_CATEGORIES) {
      if (s.categories.length >= 8) break;
      if (!s.categories.some((x) => x.toLowerCase() === c.toLowerCase())) s.categories.push(c);
    }
    log(room, "adedonha.log.defaultsAdded");
    update(room);
    return { ok: true };
  }

  function pickLetter(room) {
    const s = room.state;
    let pool = LETTERS.filter((l) => !s.usedLetters.includes(l));
    if (pool.length === 0) { s.usedLetters = []; pool = LETTERS.slice(); }
    const letter = pool[Math.floor(Math.random() * pool.length)];
    s.usedLetters.push(letter);
    return letter;
  }

  function startRound(room, seatIdx) {
    const s = room.state;
    if (s.phase !== "categories" && s.phase !== "scoring") return { ok: false, error: "adedonha.err.roundInProgress" };
    if (s.categories.length === 0) {
      for (const c of AW.DEFAULT_CATEGORIES.slice(0, 5)) s.categories.push(c);
    }
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    s.letter = pickLetter(room);
    s.roundNumber++;
    s.phase = "writing";
    s.roundEndAt = Date.now() + ROUND_MS;
    s.answers = {};
    const active = activeSeats(room);
    active.forEach((i) => { s.answers[i] = {}; });
    log(room, "adedonha.log.letterDrawn", { round: s.roundNumber, letter: s.letter });
    update(room);
    scheduleAI(room);
    s.timer = setTimeout(() => finishRound(room), ROUND_MS);
    return { ok: true };
  }

  function scheduleAI(room) {
    const s = room.state;
    activeSeats(room).forEach((i) => {
      if (!room.seats[i].isAI) return;
      s.categories.forEach((cat) => {
        const delay = 1200 + Math.random() * (ROUND_MS - 4000);
        setTimeout(() => {
          if (!room.state || room.state.phase !== "writing" || room.state.roundNumber !== s.roundNumber) return;
          const word = AW.pickWord(cat, room.state.letter);
          if (word) room.state.answers[i][cat] = word;
        }, delay);
      });
    });
  }

  function submitSetAnswer(room, seatIdx, category, text) {
    const s = room.state;
    if (s.phase !== "writing") return { ok: false, error: "adedonha.err.notWritingPhase" };
    if (!s.answers[seatIdx]) return { ok: false, error: "adedonha.err.inactiveSeat" };
    s.answers[seatIdx][category] = String(text || "").slice(0, 40);
    return { ok: true }; // intentionally no update(): avoids re-rendering everyone's own typing every keystroke
  }

  function normalizeAnswer(text) { return AW.normalize(text); }

  function finishRound(room) {
    const s = room.state;
    if (s.phase !== "writing") return;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    const active = activeSeats(room);
    const results = active.map((i) => ({ seatIdx: i, name: room.seats[i].name, perCategory: [], roundTotal: 0 }));
    const byIdx = new Map(results.map((r) => [r.seatIdx, r]));

    for (const cat of s.categories) {
      const entries = active.map((i) => {
        const raw = (s.answers[i] || {})[cat] || "";
        const norm = normalizeAnswer(raw);
        const valid = norm.length > 0 && norm[0] === s.letter.toLowerCase();
        return { seatIdx: i, raw, norm, valid };
      });
      const counts = new Map();
      entries.forEach((e) => { if (e.valid) counts.set(e.norm, (counts.get(e.norm) || 0) + 1); });
      entries.forEach((e) => {
        const points = e.valid ? (counts.get(e.norm) === 1 ? 10 : 5) : 0;
        byIdx.get(e.seatIdx).perCategory.push({ category: cat, answer: e.raw, valid: e.valid, points });
        byIdx.get(e.seatIdx).roundTotal += points;
      });
    }

    results.forEach((r) => { s.totals[r.seatIdx] = (s.totals[r.seatIdx] || 0) + r.roundTotal; });
    s.lastResults = results;
    s.phase = "scoring";
    log(room, "adedonha.log.roundOver", { round: s.roundNumber });
    update(room);
  }

  function submitStop(room, seatIdx) {
    const s = room.state;
    if (s.phase !== "writing") return { ok: false, error: "adedonha.err.noRoundInProgress" };
    log(room, "adedonha.log.stopped", { name: room.seats[seatIdx].name });
    finishRound(room);
    return { ok: true };
  }

  const api = { viewFor, deal: init, submitAddCategory, submitUseDefaults, startRound, submitSetAnswer, submitStop, activeSeats };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.AdedonhaEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
