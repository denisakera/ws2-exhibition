/**
 * Stylised picture of the reservoir: a tangle of filaments (nanotubes) with 64 nodes.
 *
 * What is data: the connections are exactly the model's recurrent wiring (rowPtr/cols of
 * js/reservoir.js), node brightness is the live |state| of that node, filament brightness follows
 * the state of the node it leaves, and the eight input ticks follow the pulse level of each
 * channel. What is artistic: where the nodes sit (a deterministic force layout), the curvature of
 * the filaments and the colours. The caption on screen says so.
 */
import { fitCanvas, COLOR, FONT_MONO, sampleSeries, clamp01 } from './canvas.js';
import { mulberry32 } from '../reservoir.js';
import { tx } from './copy.js';

const W = 920;
const H = 300;
const X0 = 150;
const X1 = W - 150;
const Y0 = 40;
const Y1 = H - 40;

function layout(model) {
  const { n } = model;
  const { rowPtr, cols } = model.reservoir;
  const rng = mulberry32(20260);
  const p = new Float64Array(2 * n);
  for (let i = 0; i < 2 * n; i++) p[i] = 0.2 + 0.6 * rng();
  const f = new Float64Array(2 * n);
  for (let iter = 0; iter < 400; iter++) {
    f.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = p[2 * i] - p[2 * j];
        const dy = p[2 * i + 1] - p[2 * j + 1];
        const d2 = dx * dx + dy * dy + 1e-4;
        const k = 0.0006 / d2;
        f[2 * i] += dx * k; f[2 * i + 1] += dy * k;
        f[2 * j] -= dx * k; f[2 * j + 1] -= dy * k;
      }
    }
    for (let i = 0; i < n; i++) {
      for (let e = rowPtr[i]; e < rowPtr[i + 1]; e++) {
        const j = cols[e];
        if (j === i) continue;
        const dx = p[2 * j] - p[2 * i];
        const dy = p[2 * j + 1] - p[2 * i + 1];
        const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
        const k = (d - 0.1) * 0.04 / d;
        f[2 * i] += dx * k; f[2 * i + 1] += dy * k;
        f[2 * j] -= dx * k; f[2 * j + 1] -= dy * k;
      }
    }
    for (let i = 0; i < n; i++) {
      f[2 * i] += (0.5 - p[2 * i]) * 0.01;
      f[2 * i + 1] += (0.5 - p[2 * i + 1]) * 0.01;
      p[2 * i] += Math.max(-0.02, Math.min(0.02, f[2 * i]));
      p[2 * i + 1] += Math.max(-0.02, Math.min(0.02, f[2 * i + 1]));
    }
  }
  // fill the drawing area
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, p[2 * i]); maxX = Math.max(maxX, p[2 * i]);
    minY = Math.min(minY, p[2 * i + 1]); maxY = Math.max(maxY, p[2 * i + 1]);
  }
  const pos = new Float32Array(2 * n);
  for (let i = 0; i < n; i++) {
    pos[2 * i] = X0 + ((p[2 * i] - minX) / (maxX - minX)) * (X1 - X0);
    pos[2 * i + 1] = Y0 + ((p[2 * i + 1] - minY) / (maxY - minY)) * (Y1 - Y0);
  }
  // one gently bent control point per filament, fixed
  const bend = new Float32Array(model.reservoir.cols.length);
  for (let e = 0; e < bend.length; e++) bend[e] = (rng() - 0.5) * 60;
  return { pos, bend };
}

export function createMaterial(canvas, model) {
  let ctx = fitCanvas(canvas, W, H);
  const { n } = model;
  const { rowPtr, cols } = model.reservoir;
  const { pos, bend } = layout(model);

  /**
   * @param {null|{run, p:number}} pb  current playback (run + fractional step), or null at rest
   */
  function draw(pb, alphaScale = 1) {
    ctx = fitCanvas(canvas, W, H);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    const act = new Float32Array(n);
    if (pb) for (let i = 0; i < n; i++) act[i] = clamp01(Math.abs(sampleSeries(pb.run.x, n, i, pb.p)) * 1.4);

    // filaments: the model's recurrent wiring, brighter when the node they leave is active
    for (let i = 0; i < n; i++) {
      for (let e = rowPtr[i]; e < rowPtr[i + 1]; e++) {
        const j = cols[e];
        if (j === i) continue;
        const ax = pos[2 * j]; const ay = pos[2 * j + 1];
        const bx = pos[2 * i]; const by = pos[2 * i + 1];
        const mx = (ax + bx) / 2 - (by - ay) * 0.0 + bend[e] * 0.5;
        const my = (ay + by) / 2 + bend[e] * 0.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(mx, my, bx, by);
        ctx.strokeStyle = COLOR.phos;
        ctx.globalAlpha = (0.07 + 0.55 * act[j]) * alphaScale;
        ctx.lineWidth = 0.8 + 1.2 * act[j];
        ctx.stroke();
      }
    }

    // nodes
    for (let i = 0; i < n; i++) {
      const x = pos[2 * i]; const y = pos[2 * i + 1];
      const a = act[i];
      ctx.fillStyle = COLOR.phos;
      ctx.globalAlpha = (0.10 + 0.22 * a) * alphaScale;
      ctx.beginPath(); ctx.arc(x, y, 5 + 11 * a, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = (0.35 + 0.65 * a) * alphaScale;
      ctx.fillStyle = a > 0.55 ? COLOR.warm : COLOR.phos;
      ctx.beginPath(); ctx.arc(x, y, 2.2 + 2.6 * a, 0, Math.PI * 2); ctx.fill();
    }

    // eight input ticks (left) and the readout bar (right)
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = `14px ${FONT_MONO}`;
    ctx.textBaseline = 'middle';
    for (let c = 0; c < 8; c++) {
      const y = Y0 + 8 + (c / 7) * (Y1 - Y0 - 16);
      const idx = pb ? Math.max(0, Math.min(model.steps - 1, Math.ceil(pb.p) - 1)) : -1;
      const u = pb && idx >= 0 ? pb.run.u[idx * 8 + c] : 0;
      ctx.globalAlpha = alphaScale;
      ctx.fillStyle = COLOR.line;
      ctx.fillRect(40, y - 1, 46, 2);
      ctx.fillStyle = COLOR.phos;
      ctx.globalAlpha = clamp01(u) * alphaScale;
      ctx.fillRect(40, y - 2.5, 46 * clamp01(u), 5);
    }
    ctx.globalAlpha = alphaScale;
    ctx.fillStyle = COLOR.mute;
    ctx.textAlign = 'left';
    ctx.fillText(tx('matInputs'), 40, Y1 + 30);
    ctx.fillStyle = COLOR.line;
    ctx.fillRect(W - 62, Y0, 2, Y1 - Y0);
    ctx.fillStyle = COLOR.mute;
    ctx.textAlign = 'right';
    ctx.fillText(tx('matReadout'), W - 40, Y1 + 30);
    ctx.globalAlpha = 1;
  }

  return { draw };
}
