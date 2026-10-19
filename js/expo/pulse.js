/**
 * Information becoming electrical input: the 8x8 picture unfolds into eight pulse trains.
 *
 * This is the model's own encoding made visible (js/reservoir.js, 'row' mapping): the pixel in
 * row r, column c becomes the pulse level of channel r in time slot c, and a darker pixel is a
 * higher pulse. `unfold` goes from 0 (the 8x8 grid) to 1 (eight rails); `slot` is the slot the
 * model is currently being fed, or -1 before/after the run.
 */
import { fitCanvas, COLOR, FONT_MONO, clamp01, lerp, easeInOut } from './canvas.js';
import { tx } from './copy.js';

export const PULSE_W = 760;
export const PULSE_H = 560;

const CELL = 52;
const GRID_X = (PULSE_W - 8 * CELL) / 2;
const GRID_Y = 70;
const RAIL_X = 74;
const RAIL_W = PULSE_W - RAIL_X - 14;
const SLOT_W = RAIL_W / 8;
const RAIL_Y = 56;
const RAIL_H = 50;
const RAIL_STEP = 60;
const PULSE_MAX = 44;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{values: Float32Array}|null} run   64 levels 0..1, row-major
 * @param {HTMLCanvasElement|null} inkCanvas  the drawing, shown while it turns into points
 * @param {{ink:number, unfold:number, slot:number, slotFrac:number}} st
 *   ink: 1 = drawing visible .. 0 = pixel grid; unfold: 0..1; slot/slotFrac: playback position
 */
export function drawPulses(canvas, run, inkCanvas, st) {
  const ctx = fitCanvas(canvas, PULSE_W, PULSE_H);
  ctx.clearRect(0, 0, PULSE_W, PULSE_H);
  ctx.textBaseline = 'middle';

  // rails and labels fade in with the unfolding
  const railA = clamp01((st.unfold - 0.2) / 0.5);
  if (railA > 0) {
    ctx.globalAlpha = railA;
    ctx.font = `15px ${FONT_MONO}`;
    ctx.textAlign = 'right';
    for (let r = 0; r < 8; r++) {
      const base = RAIL_Y + r * RAIL_STEP + RAIL_H;
      ctx.fillStyle = COLOR.mute;
      ctx.fillText(`K${r + 1}`, RAIL_X - 14, base - RAIL_H / 2);
      ctx.fillStyle = COLOR.line;
      ctx.fillRect(RAIL_X, base, RAIL_W, 1);
    }
    ctx.strokeStyle = COLOR.lineSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= 8; c++) {
      const x = RAIL_X + c * SLOT_W;
      ctx.moveTo(x, RAIL_Y - 4); ctx.lineTo(x, RAIL_Y + 7 * RAIL_STEP + RAIL_H);
    }
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR.mute;
    ctx.fillText(tx('railsNote'), RAIL_X, RAIL_Y - 30);
    ctx.globalAlpha = 1;
  }

  if (!run) return;

  // the drawing, dissolving into the grid
  if (st.ink > 0 && inkCanvas) {
    ctx.globalAlpha = st.ink;
    ctx.drawImage(inkCanvas, GRID_X, GRID_Y, 8 * CELL, 8 * CELL);
    ctx.globalAlpha = 1;
  }

  const gridA = 1 - st.ink;
  ctx.globalCompositeOperation = 'lighter';
  for (let r = 0; r < 8; r++) {
    const delay = r * 0.07;
    const t = easeInOut(clamp01((st.unfold - delay) / (1 - 7 * 0.07)));
    for (let c = 0; c < 8; c++) {
      const v = run.values[r * 8 + c];
      const gx = GRID_X + c * CELL;
      const gy = GRID_Y + r * CELL;
      const railBase = RAIL_Y + r * RAIL_STEP + RAIL_H;
      const pw = SLOT_W * 0.78;
      const ph = Math.max(2, v * PULSE_MAX);
      const x = lerp(gx + 2, RAIL_X + c * SLOT_W + (SLOT_W - pw) / 2, t);
      const w = lerp(CELL - 4, pw, t);
      const h = lerp(CELL - 4, ph, t);
      const y = lerp(gy + 2, railBase - ph, t);

      // brightness: how strongly the model is fed in this slot right now
      let live = 0.55;
      if (st.slot >= 0) {
        live = c < st.slot ? 0.3 : c === st.slot ? 1 : 0.5;
      }
      if (t < 1 && gridA <= 0) continue;
      const a = t < 1 ? gridA * (0.15 + 0.85 * v) : live;
      ctx.fillStyle = t >= 1 ? COLOR.phos : COLOR.warm;
      ctx.globalAlpha = clamp01(a);
      ctx.fillRect(x, y, w, h);
      if (t >= 1 && v > 0.02 && c === st.slot) {
        ctx.globalAlpha = 0.18;
        ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // grid outline while it is still a picture
  if (st.unfold < 1) {
    ctx.strokeStyle = COLOR.line;
    ctx.globalAlpha = gridA * (1 - st.unfold);
    ctx.lineWidth = 1;
    ctx.strokeRect(GRID_X + 0.5, GRID_Y + 0.5, 8 * CELL, 8 * CELL);
    ctx.globalAlpha = 1;
  }

  // playhead on the rails
  if (st.slot >= 0) {
    const x = RAIL_X + (st.slot + st.slotFrac) * SLOT_W;
    ctx.strokeStyle = COLOR.phos;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, RAIL_Y - 8); ctx.lineTo(x, RAIL_Y + 7 * RAIL_STEP + RAIL_H + 6);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** The idle thumbnail and the live preview: an 8x8 picture as hard pixels. */
export function drawGrid8(canvas, img8) {
  const ctx = canvas.getContext('2d');
  const s = canvas.width / 8;
  ctx.fillStyle = COLOR.graphite;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!img8) return;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const v = img8[r * 8 + c] / 255;
      if (v <= 0) continue;
      ctx.fillStyle = `rgba(239, 232, 214, ${0.12 + 0.88 * v})`;
      ctx.fillRect(c * s + 1, r * s + 1, s - 2, s - 2);
    }
  }
}

/** Ten score bars, 0-9, strongest highlighted. `reveal` 0..1 grows them. */
export function drawBars(canvas, scores, pred, reveal) {
  const W = 760;
  const H = 130;
  const ctx = fitCanvas(canvas, W, H);
  ctx.clearRect(0, 0, W, H);
  let max = 1e-6;
  for (let c = 0; c < 10; c++) if (scores[c] > max) max = scores[c];
  const slot = W / 10;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (let c = 0; c < 10; c++) {
    const v = Math.max(0, scores[c]) / max;
    const h = Math.max(2, 78 * v * reveal);
    const x = c * slot + slot / 2;
    const hit = c === pred;
    ctx.fillStyle = hit ? COLOR.warm : COLOR.phosDim;
    ctx.fillRect(x - 14, 84 - h, 28, h);
    ctx.font = `${hit ? 500 : 400} 22px ${FONT_MONO}`;
    ctx.fillStyle = hit ? COLOR.warm : COLOR.mute;
    ctx.fillText(String(c), x, 116);
  }
  ctx.fillStyle = COLOR.line;
  ctx.fillRect(0, 85, W, 1);
}
