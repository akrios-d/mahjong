"use strict";
/* Isomorphic (Node + browser) rules module for Landlord / Dou Dizhu (斗地主).
   Deck, combo analysis/comparison and simple AI, shared between the
   multiplayer server (authoritative) and any client-side helpers (hints). */

const RANKS = ["3","4","5","6","7","8","9","10","J","Q","K","A","2","SJ","BJ"];
const SUITS = ["♠","♥","♦","♣"]; // ♠ ♥ ♦ ♣
const RED_SUITS = new Set(["♥","♦"]);

function buildDeck() {
  const deck = [];
  let uid = 0;
  for (let ri = 0; ri < 13; ri++) {
    for (const s of SUITS) deck.push({ uid: uid++, rank: RANKS[ri], suit: s, value: ri });
  }
  deck.push({ uid: uid++, rank: "SJ", suit: null, value: 13 });
  deck.push({ uid: uid++, rank: "BJ", suit: null, value: 14 });
  return deck; // 54
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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
    const n = sorted.length, rank = distinct[0];
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
    if (distinct[distinct.length - 1] <= 11) {
      let consecutive = true;
      for (let i = 1; i < distinct.length; i++) {
        if (distinct[i] !== distinct[i - 1] + 1) { consecutive = false; break; }
      }
      if (consecutive) return { type: "straight", mainRank: distinct[distinct.length - 1], length: distinct.length, cards: sorted };
    }
  }
  return null;
}

function compareCombo(a, b) {
  if (a.type === "rocket") return true;
  if (b.type === "rocket") return false;
  if (a.type === "bomb" && b.type !== "bomb") return true;
  if (b.type === "bomb" && a.type !== "bomb") return false;
  if (a.type !== b.type || a.length !== b.length) return false;
  return a.mainRank > b.mainRank;
}

function comboLabel(combo) {
  const names = {
    single: "Carta única", pair: "Par", triple: "Trinca",
    triple_single: "Trinca+1", triple_pair: "Trinca+par",
    straight: "Sequência", bomb: "Bomba", rocket: "Rocket",
  };
  return names[combo.type] || combo.type;
}

function cardLabel(c) {
  if (c.rank === "SJ") return "小王";
  if (c.rank === "BJ") return "大王";
  return c.rank;
}
function isRed(c) { return RED_SUITS.has(c.suit); }

/* ---------------- AI ---------------- */
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
  for (const r of ranks) {
    const cards = groups.get(r);
    if (cards.length < 3) continue;
    const triple = cards.slice(0, 3);
    const leftoverSingle = ranks.find((r2) => r2 !== r && groups.get(r2).length >= 1);
    if (leftoverSingle !== undefined) combos.push({ type: "triple_single", mainRank: r, length: 4, cards: [...triple, groups.get(leftoverSingle)[0]] });
    const leftoverPair = ranks.find((r2) => r2 !== r && groups.get(r2).length >= 2);
    if (leftoverPair !== undefined) combos.push({ type: "triple_pair", mainRank: r, length: 5, cards: [...triple, ...groups.get(leftoverPair).slice(0, 2)] });
  }
  if (groups.has(13) && groups.has(14)) combos.push({ type: "rocket", mainRank: 999, length: 2, cards: [groups.get(13)[0], groups.get(14)[0]] });
  const availSet = new Set(ranks.filter((r) => r <= 11));
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
    const better = generateCandidateCombos(hand).filter((c) => c.type === "rocket" || (c.type === "bomb" && c.mainRank > target.mainRank));
    if (better.length > 0 && Math.random() < 0.5) return better[0];
  }
  return null;
}

function aiChooseLead(hand) {
  const groups = groupByRank(hand);
  const ranks = [...groups.keys()].sort((a, b) => a - b);
  const combos = generateCandidateCombos(hand);
  const straights = combos.filter((c) => c.type === "straight").sort((a, b) => b.length - a.length || a.mainRank - b.mainRank);
  if (straights.length > 0 && Math.random() < 0.7) return straights[0];
  for (const r of ranks) if (groups.get(r).length === 1) return { type: "single", mainRank: r, length: 1, cards: [groups.get(r)[0]] };
  for (const r of ranks) if (groups.get(r).length === 2) return { type: "pair", mainRank: r, length: 2, cards: groups.get(r).slice(0, 2) };
  for (const r of ranks) if (groups.get(r).length === 3) return { type: "triple", mainRank: r, length: 3, cards: groups.get(r).slice(0, 3) };
  if (groups.has(13) && groups.has(14)) return { type: "rocket", mainRank: 999, length: 2, cards: [groups.get(13)[0], groups.get(14)[0]] };
  for (const r of ranks) if (groups.get(r).length === 4) return { type: "bomb", mainRank: r, length: 4, cards: groups.get(r).slice(0, 4) };
  return null;
}

function handStrength(hand) {
  let score = 0;
  const groups = groupByRank(hand);
  for (const [rank, cards] of groups) {
    if (cards.length === 4) score += 5;
    if (rank >= 12) score += cards.length * 1.2;
  }
  if (groups.has(13) && groups.has(14)) score += 6;
  else if (groups.has(13) || groups.has(14)) score += 1;
  return score;
}

const api = {
  RANKS, SUITS, buildDeck, shuffle, groupByRank, analyzeCombo, compareCombo,
  comboLabel, cardLabel, isRed, generateCandidateCombos, aiChooseFollow, aiChooseLead, handStrength,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.LandlordRules = api;
