"use strict";
/* Collaborative jigsaw puzzle orchestration. Human-only (like Desenho —
   there's no meaningful "AI" for dragging puzzle pieces), any number of
   players in a room can drag pieces at once. The uploaded image itself is
   NOT part of the regular polled state (it would be wasteful to resend a
   large data URL on every single piece move) — the server relays it once,
   separately, via a dedicated "image" message (see server.js). */
(function (root) {
  const PS = typeof module !== "undefined" && module.exports ? require("./puzzleShapes.js") : root.PuzzleShapes;
  const RU = typeof module !== "undefined" && module.exports ? require("./roomUtils.js") : root.RoomUtils;

  const SNAP_DIST = 22; // logical units (puzzle space is ~1000 wide)

  function update(room) { room.hooks.update(); }
  function log(room, text) { RU.pushLog(room, text); }

  function activeSeats(room) {
    return room.seats.map((s, i) => i).filter((i) => !!room.seats[i].ws);
  }

  function viewFor(room, seatIdx) {
    const base = RU.viewBase(room, seatIdx);
    if (!room.started) return base;
    const s = room.state;
    return {
      ...base,
      phase: s.phase,
      hasImage: !!s.imageData,
      rows: s.rows,
      cols: s.cols,
      layout: s.layout,
      signature: s.signature,
      pieces: s.pieces,
      lockedCount: s.pieces ? s.pieces.filter((p) => p.locked).length : 0,
      totalCount: s.pieces ? s.pieces.length : 0,
    };
  }

  function init(room) {
    room.state = {
      phase: "setup", // setup (waiting for an image + grid choice) -> playing -> solved
      imageData: null,
      aspect: 1,
      rows: 0, cols: 0,
      layout: null,
      signature: null,
      pieces: null,
      log: room.state ? room.state.log : [],
    };
    log(room, "Sala pronta. Envie uma foto pra começar o quebra-cabeça.");
    update(room);
  }

  function submitUploadImage(room, seatIdx, dataUrl, aspect) {
    const s = room.state;
    if (s.phase === "playing") return { ok: false, error: "Já tem um quebra-cabeça em andamento." };
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return { ok: false, error: "Imagem inválida." };
    if (dataUrl.length > 3_000_000) return { ok: false, error: "Imagem grande demais." };
    s.imageData = dataUrl;
    s.aspect = aspect > 0 ? aspect : 1;
    log(room, `${room.seats[seatIdx].name} enviou a foto.`);
    update(room);
    room.hooks.image && room.hooks.image(dataUrl);
    return { ok: true };
  }

  function submitStartPuzzle(room, seatIdx, rows, cols) {
    const s = room.state;
    if (!s.imageData) return { ok: false, error: "Envie uma foto primeiro." };
    rows = Math.max(2, Math.min(8, Math.round(rows) || 4));
    cols = Math.max(2, Math.min(8, Math.round(cols) || 4));
    const layout = PS.computeLayout(rows, cols, s.aspect);
    const seed = Math.floor(Math.random() * 0xffffffff);
    const signature = PS.generateSignature(rows, cols, seed);

    const pieces = [];
    let id = 0;
    const scatterCols = Math.max(1, Math.floor(layout.spaceW / 90));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const targetX = layout.targetX + c * layout.cellW;
        const targetY = layout.targetY + r * layout.cellH;
        const slot = id;
        const scatterX = 20 + (slot % scatterCols) * 90 + (Math.random() * 20 - 10);
        const scatterY = layout.targetY + layout.targetH + 30 + Math.floor(slot / scatterCols) * 90 + (Math.random() * 20 - 10);
        pieces.push({
          id: id++, r, c, targetX, targetY,
          x: scatterX, y: scatterY,
          locked: false, z: id,
        });
      }
    }

    s.rows = rows; s.cols = cols;
    s.layout = layout;
    s.signature = signature;
    s.pieces = pieces;
    s.phase = "playing";
    log(room, `${room.seats[seatIdx].name} montou o quebra-cabeça: ${rows}x${cols} peças. Bora!`);
    update(room);
    return { ok: true };
  }

  function submitMovePiece(room, seatIdx, pieceId, x, y) {
    const s = room.state;
    if (s.phase !== "playing") return { ok: false, error: "Nenhum quebra-cabeça em andamento." };
    const piece = s.pieces.find((p) => p.id === pieceId);
    if (!piece || piece.locked) return { ok: false, error: "Peça inválida." };
    piece.x = x; piece.y = y;
    s.zCounter = (s.zCounter || 0) + 1;
    piece.z = s.zCounter;
    update(room);
    return { ok: true };
  }

  function submitDropPiece(room, seatIdx, pieceId, x, y) {
    const s = room.state;
    if (s.phase !== "playing") return { ok: false, error: "Nenhum quebra-cabeça em andamento." };
    const piece = s.pieces.find((p) => p.id === pieceId);
    if (!piece || piece.locked) return { ok: false, error: "Peça inválida." };
    const dist = Math.hypot(x - piece.targetX, y - piece.targetY);
    if (dist <= SNAP_DIST) {
      piece.x = piece.targetX; piece.y = piece.targetY; piece.locked = true;
    } else {
      piece.x = x; piece.y = y;
    }
    const allLocked = s.pieces.every((p) => p.locked);
    if (allLocked) {
      s.phase = "solved";
      log(room, "Quebra-cabeça completo! 🎉");
    }
    update(room);
    return { ok: true, locked: piece.locked };
  }

  function requestNewHand(room) {
    const s = room.state;
    if (!s) return;
    s.phase = "setup";
    s.pieces = null; s.rows = 0; s.cols = 0;
    log(room, "Pronto pra outra rodada — escolha o tamanho da grade e comece de novo.");
    update(room);
  }

  const api = {
    viewFor, deal: init, submitUploadImage, submitStartPuzzle, submitMovePiece,
    submitDropPiece, requestNewHand, activeSeats,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.PuzzleEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
