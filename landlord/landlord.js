"use strict";

/* =========================================================
   Landlord / Dou Dizhu (斗地主) — recriação original e independente.
   3 jogadores: Você (0), Bot A (1), Bot B (2).
   Combinações suportadas: single, pair, triple, triple+single,
   triple+pair, straight (>=5, sem 2/coringas), bomb, rocket.
   ========================================================= */

const RANKS = ["3","4","5","6","7","8","9","10","J","Q","K","A","2","SJ","BJ"];
const SUITS = ["♠","♥","♦","♣"]; // ♠ ♥ ♦ ♣
const RED_SUITS = new Set(["♥","♦"]);

function rankValue(r) { return RANKS.indexOf(r); }

function buildDeck() {
  const deck = [];
  let uid = 0;
  for (let ri = 0; ri < 13; ri++) {
    for (const s of SUITS) {
      deck.push({ uid: uid++, rank: RANKS[ri], suit: s, value: ri });
    }
  }
  deck.push({ uid: uid++, rank: "SJ", suit: null, value: 13, label: "小王" });
  deck.push({ uid: uid++, rank: "BJ", suit: null, value: 14, label: "大王" });
  return deck; // 54
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------------- combo analysis ---------------- */
function groupByRank(cards) {
  const m = new Map();
  for (const c of cards) {
    if (!m.has(c.value)) m.set(c.value, []);
    m.get(c.value).push(c);
  }
  return m;
}

function analyzeCombo(cards) {
  if (!cards || cards.length === 0) return null;
  const sorted = [...cards].sort((a, b) => a.value - b.value);
  const groups = groupByRank(sorted);
  const distinct = [...groups.keys()].sort((a, b) => a - b);

  if (sorted.length === 2 && distinct.length === 2 && distinct.includes(13) && distinct.includes(14)) {
    return { type: "rocket", mainRank: 999, length: 2, cards: sorted };
  }

  if (distinct.length === 1) {
    const n = sorted.length;
    const rank = distinct[0];
    if (n === 1) return { type: "single", mainRank: rank, length: 1, cards: sorted };
    if (n === 2) return { type: "pair", mainRank: rank, length: 2, cards: sorted };
    if (n === 3) return { type: "triple", mainRank: rank, length: 3, cards: sorted };
    if (n === 4) return { type: "bomb", mainRank: rank, length: 4, cards: sorted };
    return null;
  }

  if (sorted.length === 4 && distinct.length === 2) {
    const counts = distinct.map((r) => groups.get(r).length);
    if (counts.includes(3) && counts.includes(1)) {
      const tripleRank = distinct.find((r) => groups.get(r).length === 3);
      return { type: "triple_single", mainRank: tripleRank, length: 4, cards: sorted };
    }
  }

  if (sorted.length === 5 && distinct.length === 2) {
    const counts = distinct.map((r) => groups.get(r).length);
    if (counts.includes(3) && counts.includes(2)) {
      const tripleRank = distinct.find((r) => groups.get(r).length === 3);
      return { type: "triple_pair", mainRank: tripleRank, length: 5, cards: sorted };
    }
  }

  if (sorted.length >= 5 && distinct.length === sorted.length) {
    // all singles: possible straight
    if (distinct[distinct.length - 1] <= 11) { // exclude 2(12) and jokers
      let consecutive = true;
      for (let i = 1; i < distinct.length; i++) {
        if (distinct[i] !== distinct[i - 1] + 1) { consecutive = false; break; }
      }
      if (consecutive) {
        return { type: "straight", mainRank: distinct[distinct.length - 1], length: distinct.length, cards: sorted };
      }
    }
  }

  return null;
}

function compareCombo(a, b) {
  if (a.type === "rocket") return true;
  if (b.type === "rocket") return false;
  if (a.type === "bomb" && b.type !== "bomb") return true;
  if (b.type === "bomb" && a.type !== "bomb") return false;
  if (a.type !== b.type || a.length !== b.length) return false; // not comparable
  return a.mainRank > b.mainRank;
}

function comboLabel(combo) {
  const names = {
    single: "Carta única", pair: "Par", triple: "Trinca",
    triple_single: "Trinca+1", triple_pair: "Trinca+par",
    straight: "Sequência", bomb: "Bomba", rocket: "Rocket (par de coringas)",
  };
  return names[combo.type] || combo.type;
}

function cardLabel(c) {
  if (c.rank === "SJ") return "小王";
  if (c.rank === "BJ") return "大王";
  return c.rank;
}
function isRed(c) { return RED_SUITS.has(c.suit); }

/* ---------------- AI combo generation ---------------- */
function generateCandidateCombos(hand) {
  const groups = groupByRank(hand);
  const ranks = [...groups.keys()].sort((a, b) => a - b);
  const combos = [];

  for (const r of ranks) {
    const cards = groups.get(r);
    combos.push({ type: "single", mainRank: r, length: 1, cards: [cards[0]] });
    if (cards.length >= 2) combos.push({ type: "pair", mainRank: r, length: 2, cards: cards.slice(0, 2) });
    if (cards.length >= 3) combos.push({ type: "triple", mainRank: r, length: 3, cards: cards.slice(0, 3) });
    if (cards.length === 4) combos.push({ type: "bomb", mainRank: r, length: 4, cards: cards.slice(0, 4) });
  }

  // triple + single / triple + pair
  for (const r of ranks) {
    const cards = groups.get(r);
    if (cards.length < 3) continue;
    const triple = cards.slice(0, 3);
    const leftoverSingle = ranks.find((r2) => r2 !== r && groups.get(r2).length >= 1);
    if (leftoverSingle !== undefined) {
      combos.push({ type: "triple_single", mainRank: r, length: 4, cards: [...triple, groups.get(leftoverSingle)[0]] });
    }
    const leftoverPair = ranks.find((r2) => r2 !== r && groups.get(r2).length >= 2);
    if (leftoverPair !== undefined) {
      combos.push({ type: "triple_pair", mainRank: r, length: 5, cards: [...triple, ...groups.get(leftoverPair).slice(0, 2)] });
    }
  }

  // rocket
  if (groups.has(13) && groups.has(14)) {
    combos.push({ type: "rocket", mainRank: 999, length: 2, cards: [groups.get(13)[0], groups.get(14)[0]] });
  }

  // straights (length 5..12), only ranks 0..11 (3..A)
  const availableRanks = ranks.filter((r) => r <= 11);
  const availSet = new Set(availableRanks);
  for (let len = 5; len <= 12; len++) {
    for (let start = 0; start + len - 1 <= 11; start++) {
      let ok = true;
      for (let k = 0; k < len; k++) { if (!availSet.has(start + k)) { ok = false; break; } }
      if (ok) {
        const cards = [];
        for (let k = 0; k < len; k++) cards.push(groups.get(start + k)[0]);
        combos.push({ type: "straight", mainRank: start + len - 1, length: len, cards });
      }
    }
  }

  return combos;
}

function aiChooseFollow(hand, target) {
  const candidates = generateCandidateCombos(hand).filter(
    (c) => c.type === target.type && c.length === target.length && c.mainRank > target.mainRank
  );
  if (candidates.length > 0) {
    candidates.sort((a, b) => a.mainRank - b.mainRank);
    return candidates[0];
  }
  if (target.type !== "bomb" && target.type !== "rocket") {
    const bombs = generateCandidateCombos(hand).filter((c) => c.type === "bomb" || c.type === "rocket");
    if (bombs.length > 0 && Math.random() < 0.45) {
      bombs.sort((a, b) => (a.type === b.type ? a.mainRank - b.mainRank : (a.type === "bomb" ? -1 : 1)));
      return bombs[0];
    }
  } else if (target.type === "bomb") {
    const better = generateCandidateCombos(hand).filter(
      (c) => c.type === "rocket" || (c.type === "bomb" && c.mainRank > target.mainRank)
    );
    if (better.length > 0 && Math.random() < 0.5) return better[0];
  }
  return null; // pass
}

function aiChooseLead(hand) {
  const groups = groupByRank(hand);
  const ranks = [...groups.keys()].sort((a, b) => a - b);

  // try longest straight first (dump singles efficiently)
  const combos = generateCandidateCombos(hand);
  const straights = combos.filter((c) => c.type === "straight").sort((a, b) => b.length - a.length || a.mainRank - b.mainRank);
  if (straights.length > 0 && Math.random() < 0.7) return straights[0];

  for (const r of ranks) {
    const n = groups.get(r).length;
    if (n === 1) return { type: "single", mainRank: r, length: 1, cards: [groups.get(r)[0]] };
  }
  for (const r of ranks) {
    const n = groups.get(r).length;
    if (n === 2) return { type: "pair", mainRank: r, length: 2, cards: groups.get(r).slice(0, 2) };
  }
  for (const r of ranks) {
    const n = groups.get(r).length;
    if (n === 3) return { type: "triple", mainRank: r, length: 3, cards: groups.get(r).slice(0, 3) };
  }
  // only bombs/rocket left
  if (groups.has(13) && groups.has(14)) {
    return { type: "rocket", mainRank: 999, length: 2, cards: [groups.get(13)[0], groups.get(14)[0]] };
  }
  for (const r of ranks) {
    if (groups.get(r).length === 4) return { type: "bomb", mainRank: r, length: 4, cards: groups.get(r).slice(0, 4) };
  }
  return null;
}

function handStrength(hand) {
  let score = 0;
  const groups = groupByRank(hand);
  for (const [rank, cards] of groups) {
    if (cards.length === 4) score += 5;
    if (rank >= 12) score += cards.length * 1.2; // 2s
  }
  if (groups.has(13) && groups.has(14)) score += 6;
  else if (groups.has(13) || groups.has(14)) score += 1;
  return score;
}

/* ---------------- game state ---------------- */
let players; // [{hand:[], isLandlord:false}, ...] idx 0=you,1=botA,2=botB
let kitty = [];
let currentTrick = null; // {combo, ownerIdx} or null (free lead)
let turnIdx = 0;
let landlordIdx = -1;
let selectedUids = new Set();
let passStreak = 0;
let biddingOrder = [];
let biddingStep = 0;
let highestBid = 0;
let highestBidder = -1;
let gameOver = false;

const els = {
  phase: document.getElementById("phaseLabel"),
  handYou: document.getElementById("handYou"),
  handA: document.getElementById("handA"),
  handB: document.getElementById("handB"),
  lastYou: document.getElementById("lastYou"),
  lastA: document.getElementById("lastA"),
  lastB: document.getElementById("lastB"),
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
  endOverlay: document.getElementById("endOverlay"),
  endTitle: document.getElementById("endTitle"),
  endStats: document.getElementById("endStats"),
  playAgainBtn: document.getElementById("playAgainBtn"),
};

function setMessage(txt) { els.message.textContent = txt; }

function newRound() {
  gameOver = false;
  els.endOverlay.classList.add("hidden");
  const deck = shuffle(buildDeck());
  players = [
    { hand: deck.slice(0, 17), isLandlord: false, name: "Você" },
    { hand: deck.slice(17, 34), isLandlord: false, name: "Bot A" },
    { hand: deck.slice(34, 51), isLandlord: false, name: "Bot B" },
  ];
  kitty = deck.slice(51, 54);
  players.forEach((p) => p.hand.sort((a, b) => a.value - b.value));
  currentTrick = null;
  landlordIdx = -1;
  selectedUids.clear();
  passStreak = 0;
  gameOver = false;

  els.roleYou.textContent = "";
  els.roleA.textContent = "";
  els.roleB.textContent = "";
  els.lastA.innerHTML = "";
  els.lastB.innerHTML = "";
  els.lastYou.innerHTML = "";
  els.playBtn.disabled = true;
  els.passBtn.disabled = true;

  startBidding();
  render();
}

function startBidding() {
  const start = Math.floor(Math.random() * 3);
  biddingOrder = [start, (start + 1) % 3, (start + 2) % 3];
  biddingStep = 0;
  highestBid = 0;
  highestBidder = -1;
  els.phase.textContent = "Rodada de lances";
  els.bidBox.classList.remove("hidden");
  advanceBidding();
}

function advanceBidding() {
  if (biddingStep >= 3) {
    finishBidding();
    return;
  }
  const idx = biddingOrder[biddingStep];
  if (idx === 0) {
    els.bidPrompt.textContent = `Sua vez de dar lance (maior atual: ${highestBid})`;
    els.bidBox.querySelectorAll("button").forEach((b) => {
      const v = Number(b.dataset.bid);
      b.disabled = v !== 0 && v <= highestBid;
    });
  } else {
    els.bidBox.classList.add("hidden");
    setTimeout(() => {
      const hand = players[idx].hand;
      const strength = handStrength(hand);
      let bid = 0;
      const willingness = strength - highestBid * 1.5;
      if (willingness > 4) bid = 3;
      else if (willingness > 2) bid = Math.min(3, highestBid + (Math.random() < 0.7 ? 1 : 2));
      else if (willingness > 0 && Math.random() < 0.6) bid = highestBid + 1;
      if (bid > 3) bid = 3;
      if (bid <= highestBid) bid = 0;
      registerBid(idx, bid);
    }, 700);
  }
}

function registerBid(idx, bid) {
  if (bid > highestBid) { highestBid = bid; highestBidder = idx; }
  biddingStep++;
  const name = players[idx].name;
  setMessage(bid === 0 ? `${name} passou.` : `${name} deu lance ${bid}.`);
  if (highestBid === 3) { finishBidding(); return; }
  els.bidBox.classList.remove("hidden");
  advanceBidding();
}

function finishBidding() {
  els.bidBox.classList.add("hidden");
  if (highestBidder === -1) {
    setMessage("Ninguém deu lance. Redistribuindo...");
    setTimeout(newRound, 900);
    return;
  }
  landlordIdx = highestBidder;
  players[landlordIdx].isLandlord = true;
  players[landlordIdx].hand.push(...kitty);
  players[landlordIdx].hand.sort((a, b) => a.value - b.value);
  els.roleYou.textContent = players[0].isLandlord ? "(Landlord)" : "(Peasant)";
  els.roleA.textContent = players[1].isLandlord ? "Landlord" : "Peasant";
  els.roleB.textContent = players[2].isLandlord ? "Landlord" : "Peasant";
  els.phase.textContent = "Em jogo";
  setMessage(`${players[landlordIdx].name} é o Landlord! Recebeu as 3 cartas do monte.`);
  turnIdx = landlordIdx;
  currentTrick = null;
  passStreak = 0;
  render();
  setTimeout(playTurn, 900);
}

/* ---------------- turn flow ---------------- */
function playTurn() {
  if (gameOver) return;
  if (turnIdx === 0) {
    els.phase.textContent = "Sua vez";
    els.playBtn.disabled = false;
    els.passBtn.disabled = currentTrick === null || currentTrick.ownerIdx === 0;
    setMessage(currentTrick === null ? "Sua vez: jogue qualquer combinação." : "Sua vez: bata a jogada atual ou passe.");
    return;
  }
  els.playBtn.disabled = true;
  els.passBtn.disabled = true;
  els.phase.textContent = `Vez de ${players[turnIdx].name}`;
  setTimeout(() => {
    const hand = players[turnIdx].hand;
    let combo;
    if (currentTrick === null || currentTrick.ownerIdx === turnIdx) {
      combo = aiChooseLead(hand);
    } else {
      combo = aiChooseFollow(hand, currentTrick.combo);
    }
    if (combo) {
      applyPlay(turnIdx, combo);
    } else {
      applyPass(turnIdx);
    }
  }, 750 + Math.random() * 500);
}

function removeCardsFromHand(hand, cards) {
  const uids = new Set(cards.map((c) => c.uid));
  const kept = hand.filter((c) => !uids.has(c.uid));
  hand.length = 0;
  hand.push(...kept);
}

function applyPlay(idx, combo) {
  removeCardsFromHand(players[idx].hand, combo.cards);
  currentTrick = { combo, ownerIdx: idx };
  passStreak = 0;
  renderLastPlay(idx, combo);
  setMessage(`${players[idx].name} jogou: ${comboLabel(combo)} (${combo.cards.map(cardLabel).join(" ")})`);
  render();
  if (players[idx].hand.length === 0) { endRound(idx); return; }
  turnIdx = (idx + 1) % 3;
  setTimeout(playTurn, 500);
}

function applyPass(idx) {
  passStreak++;
  renderLastPlay(idx, null);
  setMessage(`${players[idx].name} passou.`);
  if (passStreak >= 2) {
    currentTrick = null;
    passStreak = 0;
  }
  render();
  turnIdx = (idx + 1) % 3;
  setTimeout(playTurn, 400);
}

function renderLastPlay(idx, combo) {
  const target = idx === 0 ? els.lastYou : idx === 1 ? els.lastA : els.lastB;
  target.innerHTML = "";
  if (!combo) {
    const p = document.createElement("div");
    p.className = "mini-card";
    p.style.opacity = "0.4";
    p.textContent = "passou";
    target.appendChild(p);
    return;
  }
  for (const c of combo.cards) {
    const el = document.createElement("div");
    el.className = "mini-card";
    if (isRed(c)) el.style.color = "#b3122a";
    el.textContent = cardLabel(c) + (c.suit ? c.suit : "");
    target.appendChild(el);
  }
}

function endRound(winnerIdx) {
  gameOver = true;
  els.playBtn.disabled = true;
  els.passBtn.disabled = true;
  const winnerIsLandlord = players[winnerIdx].isLandlord;
  const youWon = winnerIsLandlord === players[0].isLandlord;
  els.endTitle.textContent = youWon ? "Você venceu! \u{1F389}" : "Você perdeu.";
  els.endStats.textContent = `${players[winnerIdx].name} (${winnerIsLandlord ? "Landlord" : "Peasant"}) esvaziou a mão primeiro.`;
  els.endOverlay.classList.remove("hidden");
  render();
}

/* ---------------- rendering ---------------- */
function render() {
  els.kitty.innerHTML = "";
  const showKitty = landlordIdx === -1;
  for (const c of kitty) {
    const el = document.createElement("div");
    el.className = "mini-card";
    if (showKitty) {
      el.textContent = cardLabel(c) + (c.suit ? c.suit : "");
      if (isRed(c)) el.style.color = "#b3122a";
    } else {
      el.style.background = "#34506b";
    }
    els.kitty.appendChild(el);
  }

  els.handA.innerHTML = players[1].hand.map(() => `<div class="card-back"></div>`).join("");
  els.handB.innerHTML = players[2].hand.map(() => `<div class="card-back"></div>`).join("");

  els.handYou.innerHTML = "";
  for (const c of players[0].hand) {
    const el = document.createElement("div");
    el.className = "card" + (isRed(c) ? " red" : "");
    if (selectedUids.has(c.uid)) el.classList.add("selected");
    el.innerHTML = `<div class="rank">${cardLabel(c)}</div><div class="suit">${c.suit || ""}</div>`;
    el.addEventListener("click", () => toggleSelect(c.uid));
    els.handYou.appendChild(el);
  }
}

function toggleSelect(uid) {
  if (els.playBtn.disabled && els.passBtn.disabled) return;
  if (selectedUids.has(uid)) selectedUids.delete(uid);
  else selectedUids.add(uid);
  render();
}

/* ---------------- human actions ---------------- */
els.playBtn.addEventListener("click", () => {
  if (turnIdx !== 0 || gameOver) return;
  const cards = players[0].hand.filter((c) => selectedUids.has(c.uid));
  const combo = analyzeCombo(cards);
  if (!combo) { setMessage("Combinação inválida."); return; }
  if (currentTrick && currentTrick.ownerIdx !== 0) {
    if (!compareCombo(combo, currentTrick.combo)) {
      setMessage("Sua jogada não supera a atual.");
      return;
    }
  }
  selectedUids.clear();
  applyPlay(0, combo);
});

els.passBtn.addEventListener("click", () => {
  if (turnIdx !== 0 || gameOver) return;
  if (currentTrick === null || currentTrick.ownerIdx === 0) {
    setMessage("Você está liderando a rodada, precisa jogar.");
    return;
  }
  selectedUids.clear();
  applyPass(0);
});

els.hintBtn.addEventListener("click", () => {
  const hand = players[0].hand;
  let combo;
  if (currentTrick === null || currentTrick.ownerIdx === 0) combo = aiChooseLead(hand);
  else combo = aiChooseFollow(hand, currentTrick.combo);
  if (!combo) { setMessage("Nenhuma jogada sugerida (considere passar)."); return; }
  selectedUids = new Set(combo.cards.map((c) => c.uid));
  render();
  setMessage(`Sugestão: ${comboLabel(combo)}`);
});

els.bidBox.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", () => {
    if (biddingOrder[biddingStep] !== 0) return;
    registerBid(0, Number(b.dataset.bid));
  });
});

els.newBtn.addEventListener("click", newRound);
els.playAgainBtn.addEventListener("click", newRound);

newRound();
