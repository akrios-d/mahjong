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

// Greedy hand analysis used for the discard hint: groups tiles into
// triplets / complete runs / a pair / partial runs (needing one more tile),
// so the UI can highlight what you already have towards 4 groups + 1 pair
// and suggest which loose tile is safest to let go. This is a heuristic,
// not a full shanten search — it won't always find the mathematically
// optimal discard, but it reflects the same priorities the rules doc
// recommends: ditch the missing suit first, then keep pairs/triplets/runs.
function analyzeHand(hand, missingSuit) {
  const bySuitValue = new Map();
  for (const t of hand) {
    const k = `${t.suit}_${t.value}`;
    if (!bySuitValue.has(k)) bySuitValue.set(k, []);
    bySuitValue.get(k).push(t);
  }
  const used = new Set();
  const groups = [];
  const unusedAt = (suit, value) => (bySuitValue.get(`${suit}_${value}`) || []).find((t) => !used.has(t.uid));

  // 1. Triplets (three-of-a-kind already formed)
  for (const tiles of bySuitValue.values()) {
    const free = tiles.filter((t) => !used.has(t.uid));
    if (free.length >= 3) {
      const chosen = free.slice(0, 3);
      groups.push({ type: "triplet", tiles: chosen });
      chosen.forEach((t) => used.add(t.uid));
    }
  }
  // 2. Complete runs (three consecutive values, same suit)
  for (const suit of SUITS) {
    if (suit === missingSuit) continue;
    for (let v = 1; v <= 7; v++) {
      const a = unusedAt(suit, v), b = unusedAt(suit, v + 1), c = unusedAt(suit, v + 2);
      if (a && b && c) { groups.push({ type: "run", tiles: [a, b, c] }); [a, b, c].forEach((t) => used.add(t.uid)); }
    }
  }
  // 3. One pair (only one counts towards the winning shape)
  for (const tiles of bySuitValue.values()) {
    const free = tiles.filter((t) => !used.has(t.uid));
    if (free.length >= 2 && !groups.some((g) => g.type === "pair")) {
      const chosen = free.slice(0, 2);
      groups.push({ type: "pair", tiles: chosen });
      chosen.forEach((t) => used.add(t.uid));
    }
  }
  // 4. Partial runs: two tiles one (edge/middle wait) or two apart (closed wait)
  for (const suit of SUITS) {
    if (suit === missingSuit) continue;
    for (let v = 1; v <= 9; v++) {
      const a = unusedAt(suit, v);
      if (!a) continue;
      const b1 = unusedAt(suit, v + 1);
      if (b1) { groups.push({ type: "partial_run", tiles: [a, b1] }); used.add(a.uid); used.add(b1.uid); continue; }
      const b2 = unusedAt(suit, v + 2);
      if (b2) { groups.push({ type: "partial_run", tiles: [a, b2] }); used.add(a.uid); used.add(b2.uid); }
    }
  }

  const isolated = hand.filter((t) => !used.has(t.uid));
  let discardCandidates = isolated.filter((t) => t.suit === missingSuit);
  if (discardCandidates.length === 0) discardCandidates = isolated;
  if (discardCandidates.length === 0) {
    const weakest = groups.find((g) => g.type === "partial_run") || groups.find((g) => g.type === "pair");
    discardCandidates = weakest ? [weakest.tiles[weakest.tiles.length - 1]] : [hand[0]];
  }
  return { groups, isolated, discardSuggestion: discardCandidates[0] };
}

const GROUP_LABELS = {
  triplet: "Trinca formada", run: "Sequência completa", pair: "Par",
  partial_run: "Sequência parcial (falta 1)",
};

// Per-tile inspector: given the current hand, what does THIS specific tile
// (by uid) already contribute, and which tile(s) would complete/extend it?
// Used by the "tap a tile to inspect" UI so a player can check a tile's
// potential before deciding to discard it.
// Returns structured data only (status + group values + waits) — no
// pre-built text — so callers can render the explanation in their own
// language via shared/i18n.js (see mahjong.tileInfo.* keys).
function tileGuidance(hand, missingSuit, uid) {
  const tile = hand.find((t) => t.uid === uid);
  if (!tile) return null;
  const analysis = analyzeHand(hand, missingSuit);
  const group = analysis.groups.find((g) => g.tiles.some((t) => t.uid === uid));

  if (group && group.type === "triplet") {
    return { tile, status: "triplet", groupValues: group.tiles.map((t) => t.value), waits: [] };
  }
  if (group && group.type === "run") {
    return { tile, status: "run", groupValues: group.tiles.map((t) => t.value), waits: [] };
  }
  if (group && group.type === "pair") {
    return { tile, status: "pair", groupValues: group.tiles.map((t) => t.value), waits: [] };
  }
  if (group && group.type === "partial_run") {
    const vals = group.tiles.map((t) => t.value).sort((a, b) => a - b);
    const waits = [];
    if (vals[1] - vals[0] === 1) {
      if (vals[0] > 1) waits.push(vals[0] - 1);
      if (vals[1] < 9) waits.push(vals[1] + 1);
    } else if (vals[1] - vals[0] === 2) {
      waits.push(vals[0] + 1);
    }
    return { tile, status: "partial_run", groupValues: vals, waits };
  }
  // Isolated: no group yet — list what would turn it into one.
  const runWaits = [];
  if (tile.value - 2 >= 1) runWaits.push(tile.value - 2);
  if (tile.value - 1 >= 1) runWaits.push(tile.value - 1);
  if (tile.value + 1 <= 9) runWaits.push(tile.value + 1);
  if (tile.value + 2 <= 9) runWaits.push(tile.value + 2);
  return { tile, status: "isolated", groupValues: [], waits: runWaits };
}

// Rough scoring-multiplier estimate for the current hand shape (Sichuan
// mahjong style: 门清/碰碰胡/清一色/kong stack multiplicatively). This is an
// ESTIMATE based on the greedy hand analysis, not a guarantee of the final
// score — the engine itself only awards the win, it doesn't yet score fan.
// notes is an array of i18n key strings (mahjong.multiplier.*), not text —
// callers translate each via I18N.t().
function estimateMultiplier(hand, revealed, missingSuit) {
  const analysis = analyzeHand(hand, missingSuit);
  const notes = [];
  let mult = 1;
  const hasChi = (revealed || []).some((m) => m.type === "chi");
  const hasRunShape = analysis.groups.some((g) => g.type === "run" || g.type === "partial_run");
  if (!hasChi && !hasRunShape) { mult *= 2; notes.push("mahjong.multiplier.pengpeng"); }
  const suitsUsed = new Set();
  hand.forEach((t) => suitsUsed.add(t.suit));
  (revealed || []).forEach((m) => suitsUsed.add(m.suit));
  if (suitsUsed.size === 1) { mult *= 2; notes.push("mahjong.multiplier.oneSuit"); }
  if (!revealed || revealed.length === 0) { mult *= 2; notes.push("mahjong.multiplier.concealed"); }
  const kongCount = (revealed || []).filter((m) => m.type === "kong").length;
  for (let i = 0; i < kongCount; i++) { mult *= 2; notes.push("mahjong.multiplier.kong"); }
  return { mult, notes };
}

const api = {
  SUITS, SUIT_GLYPH, SUIT_LABEL, buildDeck, shuffle, tileGlyph, tileLabel, sameTile,
  sortHand, countsBySuit, canDecomposeSuit, isWinningHand, hasPong, hasKongFromHand,
  hasConcealedKong, chiOptions, suitCounts, suggestMissingSuit, analyzeHand, GROUP_LABELS,
  tileGuidance, estimateMultiplier,
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.MahjongRules = api;
