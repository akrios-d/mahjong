"use strict";
/* Isomorphic rules module for the "real" Mahjong mini-game from Where Winds
   Meet: Sichuan-style (Bloody Mahjong family) — 3 numbered suits only (no
   honors/flowers), 4 players, Missing Suit (缺一门), Pong/Kong/Chi, win =
   4 groups + 1 pair, using only 2 of the 3 suits (the missing one must be
   fully gone from your hand before you can declare Hu).

   This module only knows about tiles and hand shapes; shared/mahjongEngine.js
   owns turn order, claims and game flow. */

const SUITS = ["bamboo", "dots", "characters"];
const SUIT_GLYPH = { bamboo: "🀐", dots: "🀙", characters: "🀇" }; // base glyph per suit, offset by value-1
const SUIT_LABEL = { bamboo: "Bambu", dots: "Bolinha", characters: "Caractere" };

function buildDeck() {
  const deck = [];
  let uid = 0;
  for (const suit of SUITS) {
    for (let v = 1; v <= 9; v++) {
      for (let c = 0; c < 4; c++) {
        deck.push({ uid: uid++, suit, value: v });
      }
    }
  }
  return deck; // 108
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function tileGlyph(t) {
  const base = { bamboo: 0x1F010, dots: 0x1F019, characters: 0x1F007 };
  return String.fromCodePoint(base[t.suit] + (t.value - 1));
}
function tileLabel(t) { return `${t.value} ${SUIT_LABEL[t.suit]}`; }
function sameTile(a, b) { return a.suit === b.suit && a.value === b.value; }
function sortHand(hand) {
  return [...hand].sort((a, b) => (a.suit === b.suit ? a.value - b.value : SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit)));
}

function countsBySuit(tiles) {
  const counts = { bamboo: Array(10).fill(0), dots: Array(10).fill(0), characters: Array(10).fill(0) };
  for (const t of tiles) counts[t.suit][t.value]++;
  return counts;
}

// Can this suit's tile counts (array[1..9]) decompose fully into runs/triplets?
function canDecomposeSuit(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return true;
  if (total % 3 !== 0) return false;
  let i = 1;
  while (i <= 9 && counts[i] === 0) i++;
  if (i > 9) return true;
  if (counts[i] >= 3) {
    counts[i] -= 3;
    if (canDecomposeSuit(counts)) { counts[i] += 3; return true; }
    counts[i] += 3;
  }
  if (i <= 7 && counts[i] > 0 && counts[i + 1] > 0 && counts[i + 2] > 0) {
    counts[i]--; counts[i + 1]--; counts[i + 2]--;
    if (canDecomposeSuit(counts)) { counts[i]++; counts[i + 1]++; counts[i + 2]++; return true; }
    counts[i]++; counts[i + 1]++; counts[i + 2]++;
  }
  return false;
}

// tiles: array of loose (non-revealed) tiles. revealedGroups: count of already-melded groups (Pong/Kong/Chi).
// Returns true if `tiles` + revealedGroups can form (4-revealedGroups) groups + 1 pair, using at most 2 suits.
function isWinningHand(tiles, revealedGroupCount, missingSuit) {
  const neededGroups = 4 - (revealedGroupCount || 0);
  const expectedLoose = neededGroups * 3 + 2;
  if (tiles.length !== expectedLoose) return false;
  if (missingSuit && tiles.some((t) => t.suit === missingSuit)) return false;

  const counts = countsBySuit(tiles);
  const suitsUsed = SUITS.filter((s) => counts[s].reduce((a, b) => a + b, 0) > 0);
  if (suitsUsed.length > 2) return false; // Sichuan rule: at most 2 suits in a winning hand

  for (const suit of suitsUsed) {
    for (let v = 1; v <= 9; v++) {
      if (counts[suit][v] >= 2) {
        counts[suit][v] -= 2;
        const groupsOk = SUITS.every((s) => canDecomposeSuit(counts[s].slice()));
        counts[suit][v] += 2;
        if (groupsOk) return true;
      }
    }
  }
  return false;
}

function hasPong(hand, tile) { return hand.filter((t) => sameTile(t, tile)).length >= 2; }
function hasKongFromHand(hand, tile) { return hand.filter((t) => sameTile(t, tile)).length >= 3; }
function hasConcealedKong(hand) {
  const counts = countsBySuit(hand);
  for (const s of SUITS) for (let v = 1; v <= 9; v++) if (counts[s][v] >= 4) return { suit: s, value: v };
  return null;
}
// Chi: needs the discarder to be the seat immediately before you (enforced by caller) and two tiles in
// hand that combine with `tile` into a run. Returns list of the two-tile combos available (there can be
// up to 3 distinct ways depending on where `tile` sits in the run).
function chiOptions(hand, tile) {
  if (!hand.some) return [];
  const has = (suit, value) => hand.some((t) => t.suit === suit && t.value === value);
  const options = [];
  const v = tile.value, s = tile.suit;
  if (v >= 3 && has(s, v - 1) && has(s, v - 2)) options.push([v - 2, v - 1]);
  if (v >= 2 && v <= 8 && has(s, v - 1) && has(s, v + 1)) options.push([v - 1, v + 1]);
  if (v <= 7 && has(s, v + 1) && has(s, v + 2)) options.push([v + 1, v + 2]);
  return options;
}

function suitCounts(hand) {
  const c = { bamboo: 0, dots: 0, characters: 0 };
  for (const t of hand) c[t.suit]++;
  return c;
}

// Simple heuristic used by AI to pick a missing suit: the one with fewest
// tiles, fewest pairs, least "connected" potential.
function suggestMissingSuit(hand) {
  const counts = countsBySuit(hand);
  let best = null, bestScore = Infinity;
  for (const s of SUITS) {
    const arr = counts[s];
    const total = arr.reduce((a, b) => a + b, 0);
    let pairs = 0, connections = 0;
    for (let v = 1; v <= 9; v++) {
      if (arr[v] >= 2) pairs++;
      if (arr[v] > 0 && arr[v + 1] > 0) connections++;
    }
    const score = total * 3 + pairs * 2 + connections;
    if (score < bestScore) { bestScore = score; best = s; }
  }
  return best;
}

const api = {
  SUITS, SUIT_GLYPH, SUIT_LABEL, buildDeck, shuffle, tileGlyph, tileLabel, sameTile,
  sortHand, countsBySuit, canDecomposeSuit, isWinningHand, hasPong, hasKongFromHand,
  hasConcealedKong, chiOptions, suitCounts, suggestMissingSuit,
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.MahjongRules = api;
