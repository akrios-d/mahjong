"use strict";

/* ---------- Tile definitions (real Unicode Mahjong Tiles block) ---------- */
// 34 normal tile types (4 copies each = 136) + 8 unique flower/season tiles = 144.
const NORMAL_TYPES = [
  // Winds
  { id: "wind_e", glyph: "\u{1F000}" },
  { id: "wind_s", glyph: "\u{1F001}" },
  { id: "wind_w", glyph: "\u{1F002}" },
  { id: "wind_n", glyph: "\u{1F003}" },
  // Dragons
  { id: "dragon_r", glyph: "\u{1F004}" },
  { id: "dragon_g", glyph: "\u{1F005}" },
  { id: "dragon_w", glyph: "\u{1F006}" },
  // Characters (Wan) 1-9
  ...Array.from({ length: 9 }, (_, i) => ({ id: `char_${i + 1}`, glyph: String.fromCodePoint(0x1F007 + i) })),
  // Bamboos (Suo) 1-9
  ...Array.from({ length: 9 }, (_, i) => ({ id: `bam_${i + 1}`, glyph: String.fromCodePoint(0x1F010 + i) })),
  // Circles (Dots/Tong) 1-9
  ...Array.from({ length: 9 }, (_, i) => ({ id: `dot_${i + 1}`, glyph: String.fromCodePoint(0x1F019 + i) })),
];

const FLOWER_TYPES = Array.from({ length: 4 }, (_, i) => ({
  id: `flower_${i + 1}`, glyph: String.fromCodePoint(0x1F022 + i), group: "flower",
}));
const SEASON_TYPES = Array.from({ length: 4 }, (_, i) => ({
  id: `season_${i + 1}`, glyph: String.fromCodePoint(0x1F026 + i), group: "season",
}));

function buildDeck() {
  const deck = [];
  let uid = 0;
  for (const t of NORMAL_TYPES) {
    for (let c = 0; c < 4; c++) {
      deck.push({ uid: uid++, typeId: t.id, glyph: t.glyph, group: t.id });
    }
  }
  for (const t of [...FLOWER_TYPES, ...SEASON_TYPES]) {
    deck.push({ uid: uid++, typeId: t.id, glyph: t.glyph, group: t.group });
  }
  return deck; // length 144
}

/* ---------- Turtle-ish layered layout (half-tile grid units) ---------- */
// Layer specs: cols x rows, offset in whole tile-units (centered pyramid).
const LAYER_SPECS = [
  { cols: 8, rows: 10, ox: 0, oy: 0 },     // 80
  { cols: 6, rows: 8, ox: 1, oy: 1 },       // 48
  { cols: 4, rows: 3, ox: 2, oy: 3.5 },     // 12
  { cols: 2, rows: 2, ox: 3, oy: 4 },       // 4
]; // total 144

function buildLayout() {
  const slots = [];
  LAYER_SPECS.forEach((spec, z) => {
    for (let r = 0; r < spec.rows; r++) {
      for (let c = 0; c < spec.cols; c++) {
        const gx = Math.round((spec.ox + c) * 2);
        const gy = Math.round((spec.oy + r) * 2);
        slots.push({ gx, gy, z, col: c, row: r, layerIdx: z });
      }
    }
  });
  return slots; // length 144, half-unit grid coords
}

function rectsOverlap(a, b) {
  return a.gx < b.gx + 2 && a.gx + 2 > b.gx && a.gy < b.gy + 2 && a.gy + 2 > b.gy;
}

/* ---------- Game state ---------- */
let slots = [];
let tiles = []; // { ...deckTile, slot }
let selected = null;
let moves = 0;
let startTime = null;
let timerHandle = null;
let removedCount = 0;

const boardEl = document.getElementById("board");
const pairsLeftEl = document.getElementById("pairsLeft");
const movesEl = document.getElementById("moves");
const timerEl = document.getElementById("timer");
const winOverlay = document.getElementById("winOverlay");
const winTitle = document.getElementById("winTitle");
const winStats = document.getElementById("winStats");

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isCovered(tile) {
  return tiles.some(
    (o) => o.alive && o.slot.z > tile.slot.z && rectsOverlap(o.slot, tile.slot)
  );
}

function isSideOpen(tile, dir) {
  // dir: -1 left, +1 right. Open if no alive tile in same layer directly adjacent.
  return !tiles.some(
    (o) =>
      o.alive &&
      o !== tile &&
      o.slot.z === tile.slot.z &&
      o.slot.gy === tile.slot.gy &&
      o.slot.gx === tile.slot.gx + dir * 2
  );
}

function isFree(tile) {
  if (!tile.alive) return false;
  if (isCovered(tile)) return false;
  return isSideOpen(tile, -1) || isSideOpen(tile, 1);
}

function matches(a, b) {
  if (a.uid === b.uid) return false;
  if (a.group === "flower" || a.group === "season") return a.group === b.group;
  return a.typeId === b.typeId;
}

function newGame() {
  slots = buildLayout();
  const deck = shuffle(buildDeck());
  tiles = slots.map((slot, i) => ({ ...deck[i], slot, alive: true }));
  selected = null;
  moves = 0;
  removedCount = 0;
  startTime = Date.now();
  movesEl.textContent = "0";
  winOverlay.classList.add("hidden");
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = setInterval(updateTimer, 1000);
  updateTimer();
  render();
}

function updateTimer() {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  timerEl.textContent = `${mm}:${ss}`;
}

const TILE_W = 54, TILE_H = 72;
const HALF_W = TILE_W / 2, HALF_H = TILE_H / 2;

function render() {
  boardEl.innerHTML = "";
  const alive = tiles.filter((t) => t.alive);
  const left = alive.length / 2;
  pairsLeftEl.textContent = String(left);

  // sort so higher layers render (and receive click) above lower ones
  const sorted = [...alive].sort((a, b) => a.slot.z - b.slot.z);
  for (const t of sorted) {
    const el = document.createElement("div");
    const free = isFree(t);
    el.className = "tile" + (free ? " free" : " covered");
    if (selected === t) el.classList.add("selected");
    if (hintPairUids.includes(t.uid)) el.classList.add("hint");
    el.textContent = t.glyph;
    const x = t.slot.gx * HALF_W + t.slot.z * 4;
    const y = t.slot.gy * HALF_H - t.slot.z * 4;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.zIndex = String(t.slot.z * 200 + t.slot.gy);
    if (free) el.addEventListener("click", () => onTileClick(t, el));
    boardEl.appendChild(el);
  }
}

function onTileClick(tile, el) {
  clearHints();
  if (!selected) {
    selected = tile;
    render();
    return;
  }
  if (selected.uid === tile.uid) {
    selected = null;
    render();
    return;
  }
  if (matches(selected, tile)) {
    selected.alive = false;
    tile.alive = false;
    selected = null;
    moves++;
    movesEl.textContent = String(moves);
    render();
    checkEndState();
  } else {
    selected = tile;
    render();
  }
}

function findHintPair() {
  const free = tiles.filter((t) => t.alive && isFree(t));
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (matches(free[i], free[j])) return [free[i], free[j]];
    }
  }
  return null;
}

function clearHints() {
  document.querySelectorAll(".tile.hint").forEach((e) => e.classList.remove("hint"));
}

function checkEndState() {
  const alive = tiles.filter((t) => t.alive);
  if (alive.length === 0) {
    endGame(true);
    return;
  }
  if (!findHintPair()) {
    // stuck: prompt to shuffle
    setTimeout(() => {
      if (confirm("Sem jogadas válidas restantes! Embaralhar as peças restantes?")) {
        shuffleRemaining();
      }
    }, 50);
  }
}

function shuffleRemaining() {
  const alive = tiles.filter((t) => t.alive);
  const faces = alive.map((t) => ({ typeId: t.typeId, glyph: t.glyph, group: t.group, uid: t.uid }));
  shuffle(faces);
  alive.forEach((t, i) => {
    t.typeId = faces[i].typeId;
    t.glyph = faces[i].glyph;
    t.group = faces[i].group;
  });
  selected = null;
  render();
}

function endGame(won) {
  clearInterval(timerHandle);
  winOverlay.classList.remove("hidden");
  winTitle.textContent = won ? "Você limpou o tabuleiro! \u{1F389}" : "Fim de jogo";
  winStats.textContent = `Movimentos: ${moves} • Tempo: ${timerEl.textContent}`;
}

document.getElementById("newBtn").addEventListener("click", newGame);
document.getElementById("playAgainBtn").addEventListener("click", newGame);
document.getElementById("shuffleBtn").addEventListener("click", shuffleRemaining);
document.getElementById("hintBtn").addEventListener("click", () => {
  const pair = findHintPair();
  if (!pair) {
    hintPairUids = [];
    alert("Nenhum par livre disponível. Tente embaralhar.");
    render();
    return;
  }
  hintPairUids = pair.map((t) => t.uid);
  render();
  setTimeout(() => {
    hintPairUids = [];
    render();
  }, 2000);
});

let hintPairUids = [];

document.addEventListener("DOMContentLoaded", newGame);
if (document.readyState !== "loading") newGame();
