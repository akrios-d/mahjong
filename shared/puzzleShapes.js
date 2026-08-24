"use strict";
/* Jigsaw piece geometry for the collaborative puzzle game.
   Piece edges are NOT the classic tab-and-blob knob shape — instead each
   internal edge is a smooth organic wavy line, built by walking a small
   Markov chain (a persistence-biased random walk over a discrete
   displacement state -2..2) along every edge in the grid, seeded once so
   every client reconstructs byte-identical piece boundaries from the same
   small signature instead of re-rolling randomness locally. Adjacent
   pieces are guaranteed to interlock exactly because both read the exact
   same global control points for their shared edge — only the traversal
   direction differs. */
(function (root) {
  function seededRandom(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // One persistence-biased Markov walk, reused across every edge in the
  // grid so the whole puzzle's waviness has a coherent, non-i.i.d. feel.
  function makeMarkovWalker(rand) {
    let state = 0;
    return function step() {
      const r = rand();
      let delta;
      if (r < 0.5) delta = 0;
      else if (r < 0.75) delta = 1;
      else if (r < 0.9) delta = -1;
      else delta = rand() < 0.5 ? 2 : -2;
      state = Math.max(-2, Math.min(2, state + delta));
      return state;
    };
  }

  // signature = { H: H[r][c] -> [d1,d2,d3,d4], V: V[r][c] -> [d1,d2,d3,d4] }
  // H[r][c]: edge between piece(r,c) and piece(r+1,c), for r in 0..rows-2
  // V[r][c]: edge between piece(r,c) and piece(r,c+1), for c in 0..cols-2
  function generateSignature(rows, cols, seed) {
    const rand = seededRandom(seed);
    const step = makeMarkovWalker(rand);
    const H = [], V = [];
    for (let r = 0; r < rows - 1; r++) {
      H.push([]);
      for (let c = 0; c < cols; c++) H[r].push([step(), step(), step(), step()]);
    }
    for (let r = 0; r < rows; r++) {
      V.push([]);
      for (let c = 0; c < cols - 1; c++) V[r].push([step(), step(), step(), step()]);
    }
    return { H, V };
  }

  function computeLayout(rows, cols, aspect) {
    const targetW = 640;
    const targetH = targetW / aspect;
    const cellW = targetW / cols;
    const cellH = targetH / rows;
    const targetX = 40, targetY = 40;
    const spaceW = Math.max(targetX * 2 + targetW, 1040);
    const spaceH = targetY + targetH + 40 + Math.ceil((rows * cols) / 6) * 90 + 60;
    return { targetW, targetH, cellW, cellH, targetX, targetY, spaceW, spaceH, rows, cols };
  }

  const T_STEPS = [0.2, 0.4, 0.6, 0.8];

  // Global (canonical, unscattered) control points for edge H[r][c], in
  // forward direction (low col -> high col).
  function hEdgeGlobalPoints(r, c, layout, signature) {
    const y = layout.targetY + (r + 1) * layout.cellH;
    const x0 = layout.targetX + c * layout.cellW;
    const x1 = layout.targetX + (c + 1) * layout.cellW;
    const amp = layout.cellH * 0.09;
    const d = signature.H[r][c];
    const pts = [{ x: x0, y }];
    T_STEPS.forEach((t, i) => pts.push({ x: x0 + t * (x1 - x0), y: y + d[i] * amp }));
    pts.push({ x: x1, y });
    return pts;
  }
  // Global control points for edge V[r][c], forward direction (low row -> high row).
  function vEdgeGlobalPoints(r, c, layout, signature) {
    const x = layout.targetX + (c + 1) * layout.cellW;
    const y0 = layout.targetY + r * layout.cellH;
    const y1 = layout.targetY + (r + 1) * layout.cellH;
    const amp = layout.cellW * 0.09;
    const d = signature.V[r][c];
    const pts = [{ x, y: y0 }];
    T_STEPS.forEach((t, i) => pts.push({ x: x + d[i] * amp, y: y0 + t * (y1 - y0) }));
    pts.push({ x, y: y1 });
    return pts;
  }

  // Returns the closed polygon (global, canonical/unscattered position) for
  // piece (r,c), clockwise starting at its top-left target corner.
  function buildPiecePolygon(r, c, layout, signature) {
    const { rows, cols, targetX, targetY, cellW, cellH } = layout;
    const ox = targetX + c * cellW, oy = targetY + r * cellH;
    const pts = [];

    // top
    if (r === 0) pts.push({ x: ox, y: oy }, { x: ox + cellW, y: oy });
    else pts.push(...hEdgeGlobalPoints(r - 1, c, layout, signature));

    // right
    if (c === cols - 1) pts.push({ x: ox + cellW, y: oy + cellH });
    else pts.push(...vEdgeGlobalPoints(r, c, layout, signature).slice(1));

    // bottom (reversed)
    if (r === rows - 1) pts.push({ x: ox, y: oy + cellH });
    else pts.push(...hEdgeGlobalPoints(r, c, layout, signature).slice(0, -1).reverse());

    // left (reversed), drop the final point (== first point already pushed)
    if (c === 0) { /* nothing extra, top-left corner already the start */ }
    else pts.push(...vEdgeGlobalPoints(r, c - 1, layout, signature).slice(1, -1).reverse());

    return pts.map((p) => ({ x: p.x - ox, y: p.y - oy })); // local coords
  }

  // Draws a smooth path through `points` (local coords, already offset by
  // dx,dy) onto a 2D context using quadratic curves through midpoints.
  function tracePath(ctx, points, dx, dy) {
    const p = points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
      ctx.quadraticCurveTo(p[i].x, p[i].y, mx, my);
    }
    ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
  }

  function pointInPolygon(x, y, points, dx, dy) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x + dx, yi = points[i].y + dy;
      const xj = points[j].x + dx, yj = points[j].y + dy;
      const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  const api = { generateSignature, computeLayout, buildPiecePolygon, tracePath, pointInPolygon };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.PuzzleShapes = api;
})(typeof window !== "undefined" ? window : globalThis);
