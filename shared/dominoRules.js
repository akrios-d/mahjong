"use strict";
/* Isomorphic (Node + browser) rules module for Brazilian-style 4-player
   Dominó em duplas.

   - 28 peças (double-six), 4 jogadores recebem 6 peças cada (24), as 4
     peças restantes formam o "morto": ficam de lado, viradas para baixo,
     e NUNCA são compradas/reveladas durante a partida.
   - Duplas: assentos {0,2} vs {1,3} (parceiros sentados de frente um pro outro).
   - Quem tem a maior carroça (peça dobrada) abre o jogo; se ninguém tiver
     nenhuma carroça (pode acontecer pois 4 peças ficam escondidas no morto),
     abre quem tiver a peça de maior soma de pontos.
   - Partida vai até 6 pontos. Pontuação por tipo de batida:
       batida normal ......... 1 ponto  (bate com peça comum)
       carroça ................ 2 pontos (bate com peça dobrada)
       lá-e-lô ................ 3 pontos (jogo fecha/tranca com as duas
                                          pontas do tabuleiro com o mesmo número)
       cruzada ................ 4 pontos (bate com peça dobrada e essa
                                          jogada deixa as duas pontas do
                                          tabuleiro com o mesmo número)
     Quando o jogo tranca (ninguém consegue jogar) sem as pontas iguais,
     quem tiver a dupla com menor soma de pontos na mão vence a mão e
     marca 1 ponto (batida normal "por pontos"). Em caso de empate de
     soma, a mão é redistribuída sem pontuar.
*/

function buildDominoDeck() {
  const deck = [];
  let id = 0;
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      deck.push({ id: id++, a, b });
    }
  }
  return deck; // 28 tiles
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function dealDomino() {
  const deck = shuffle(buildDominoDeck());
  const hands = [deck.slice(0, 6), deck.slice(6, 12), deck.slice(12, 18), deck.slice(18, 24)];
  const morto = deck.slice(24, 28);
  return { hands, morto };
}

function pipSum(hand) { return hand.reduce((s, t) => s + t.a + t.b, 0); }

function isDouble(tile) { return tile.a === tile.b; }

// Highest double across all 4 hands starts; fallback = tile with highest pip sum.
function findStarter(hands) {
  let best = null, bestSeat = -1, bestIsDouble = false;
  for (let seat = 0; seat < 4; seat++) {
    for (const t of hands[seat]) {
      const dbl = isDouble(t);
      const better =
        best === null ||
        (dbl && !bestIsDouble) ||
        (dbl === bestIsDouble && (dbl ? t.a > best.a : t.a + t.b > best.a + best.b));
      if (better) { best = t; bestSeat = seat; bestIsDouble = dbl; }
    }
  }
  return { seat: bestSeat, tile: best };
}

// board: { chain: [{a,b}], leftEnd, rightEnd } chain[i].b === chain[i+1].a
function emptyBoard() { return { chain: [], leftEnd: null, rightEnd: null }; }

function legalSides(tile, board) {
  if (board.chain.length === 0) return ["left"];
  const sides = [];
  if (tile.a === board.leftEnd || tile.b === board.leftEnd) sides.push("left");
  if (tile.a === board.rightEnd || tile.b === board.rightEnd) sides.push("right");
  return sides;
}

function hasAnyLegalMove(hand, board) {
  return hand.some((t) => legalSides(t, board).length > 0);
}

function applyMove(board, tile, side) {
  if (board.chain.length === 0) {
    board.chain.push({ a: tile.a, b: tile.b, id: tile.id });
    board.leftEnd = tile.a;
    board.rightEnd = tile.b;
    return;
  }
  if (side === "left") {
    const other = tile.a === board.leftEnd ? tile.b : tile.a;
    board.chain.unshift({ a: other, b: board.leftEnd, id: tile.id });
    board.leftEnd = other;
  } else {
    const other = tile.a === board.rightEnd ? tile.b : tile.a;
    board.chain.push({ a: board.rightEnd, b: other, id: tile.id });
    board.rightEnd = other;
  }
}

const TEAM_OF_SEAT = [0, 1, 0, 1]; // seats 0&2 = team 0, seats 1&3 = team 1

function teamOf(seat) { return TEAM_OF_SEAT[seat]; }

// Called right after a winning play (hand emptied). Returns {type, points, winningTeam}.
function scoreBatida(board, winningSeat) {
  const played = board._lastPlayed; // set by caller before calling
  const dbl = played ? isDouble(played) : false;
  const endsEqual = board.leftEnd === board.rightEnd;
  let type, points;
  if (!dbl) { type = "batida"; points = 1; }
  else if (endsEqual) { type = "cruzada"; points = 4; }
  else { type = "carroca"; points = 2; }
  return { type, points, winningTeam: teamOf(winningSeat) };
}

// Called when the board is blocked (nobody can play).
function scoreBlocked(board, hands) {
  const teamSum = [0, 0];
  for (let seat = 0; seat < 4; seat++) teamSum[teamOf(seat)] += pipSum(hands[seat]);
  if (teamSum[0] === teamSum[1]) return { type: "empate", points: 0, winningTeam: -1 };
  const winningTeam = teamSum[0] < teamSum[1] ? 0 : 1;
  const endsEqual = board.leftEnd !== null && board.leftEnd === board.rightEnd;
  return endsEqual
    ? { type: "laelo", points: 3, winningTeam }
    : { type: "batida", points: 1, winningTeam };
}

const BATIDA_LABELS = {
  batida: "Batida normal", carroca: "Carroça", laelo: "Lá-e-lô", cruzada: "Cruzada", empate: "Empate (redistribui)",
};

const DR_API = {
  buildDominoDeck, dealDomino, shuffle, pipSum, isDouble, findStarter,
  emptyBoard, legalSides, hasAnyLegalMove, applyMove, teamOf, scoreBatida,
  scoreBlocked, BATIDA_LABELS, TEAM_OF_SEAT,
};

if (typeof module !== "undefined" && module.exports) module.exports = DR_API;
if (typeof window !== "undefined") window.DominoRules = DR_API;
