/**
 * "What does deciding mean": the readout layer's decision, made visible and playable.
 *
 * The readout is linear: the score of digit c is  bias_c + sum over the 1024 features of
 * weight(feature, c) * feature. The features are 8 pulse moments x (64 fast + 64 slow node states),
 * so the score splits exactly into one contribution per moment plus the bias. The visitor can cover
 * moments (the readout then simply does not look at them) and watch the scores, and the winner, move.
 * "Deciding" is taking the digit with the largest score.
 */
import { fitCanvas, COLOR, FONT_MONO } from './canvas.js';
import { tx, getLang } from './copy.js';

const NUM_CLASSES = 10;

/** Contribution of each of the 8 moments to the score of digit `c`, and the bias term. */
export function slotContributions(readout, features, c, slots = 8) {
  const { W, d } = readout;
  const per = readout.dim / slots;
  const out = new Float64Array(slots);
  for (let t = 0; t < slots; t++) {
    let acc = 0;
    for (let k = 0; k < per; k++) {
      const j = t * per + k;
      acc += W[j * NUM_CLASSES + c] * features[j];
    }
    out[t] = acc;
  }
  return { slots: out, bias: W[(d - 1) * NUM_CLASSES + c] };
}

export const fmt = (v, digits = 2) => v.toFixed(digits).replace('.', getLang() === 'cs' ? ',' : '.').replace('-', '−');

const SW = 980;
const SH = 270;

/**
 * Ten scores as bars that glide to their values. `shown` are the (animated) scores, `lo`/`hi` the
 * animated axis; `pred` is the digit that currently wins, `sel` the digit examined below.
 */
export function drawScores(canvas, shown, lo, hi, pred, sel, unsure) {
  const ctx = fitCanvas(canvas, SW, SH);
  ctx.clearRect(0, 0, SW, SH);
  const top = 62;
  const bottom = SH - 62;
  const y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const slot = SW / NUM_CLASSES;

  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y(0)); ctx.lineTo(SW, y(0)); ctx.stroke();

  // the gap to the runner-up: the thing that decides whether the readout layer is sure
  let second = -Infinity;
  for (let c = 0; c < NUM_CLASSES; c++) if (c !== pred) second = Math.max(second, shown[c]);
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = COLOR.warmDim;
  ctx.beginPath(); ctx.moveTo(0, y(second)); ctx.lineTo(SW, y(second)); ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = `15px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (let c = 0; c < NUM_CLASSES; c++) {
    const x = c * slot + slot / 2;
    const v = shown[c];
    const win = c === pred;
    const y0 = y(0);
    const y1 = y(v);
    if (c === sel) {
      ctx.fillStyle = 'rgba(122, 255, 176, 0.07)';
      ctx.fillRect(c * slot + 4, 30, slot - 8, SH - 34);
      ctx.strokeStyle = COLOR.phos; ctx.lineWidth = 2;
      ctx.strokeRect(c * slot + 4, 30, slot - 8, SH - 34);
    }
    ctx.fillStyle = win ? COLOR.warm : COLOR.phosDim;
    ctx.fillRect(x - 24, Math.min(y0, y1), 48, Math.max(2, Math.abs(y1 - y0)));
    ctx.fillStyle = win ? COLOR.warm : COLOR.mute;
    ctx.fillText(fmt(v), x, v >= 0 ? y1 - 8 : y1 + 20);
    ctx.font = `500 24px ${FONT_MONO}`;
    ctx.fillStyle = win ? COLOR.warm : COLOR.warmDim;
    ctx.fillText(String(c), x, SH - 10);
    ctx.font = `15px ${FONT_MONO}`;
    if (win) {
      ctx.fillStyle = unsure ? COLOR.warmDim : COLOR.phos;
      ctx.fillText(tx(unsure ? 'decUnsureTag' : 'decLeadTag'), x, 24);
    }
  }
}

const MW = 980;
const MH = 124;
export const MOMENT_W = MW / 8;

/**
 * The eight moments, each as the visitor's 8x8 digit with one column lit: moment t is column t.
 * A covered moment is greyed out. `flash[t]` is when a moment last switched (it glows briefly).
 */
export function drawMoments(canvas, img8, mask, flash, now) {
  const ctx = fitCanvas(canvas, MW, MH);
  ctx.clearRect(0, 0, MW, MH);
  const cell = 8;
  const gs = cell * 8;
  ctx.textAlign = 'center';
  ctx.font = `500 17px ${FONT_MONO}`;
  for (let t = 0; t < 8; t++) {
    const on = mask[t];
    const x0 = t * MOMENT_W + 6;
    const w = MOMENT_W - 12;
    const age = now - flash[t];
    const glow = age >= 0 && age < 700 ? 1 - age / 700 : 0;
    ctx.fillStyle = on ? `rgba(122, 255, 176, ${0.06 + 0.22 * glow})` : 'rgba(255, 255, 255, 0.02)';
    ctx.fillRect(x0, 0, w, MH);
    ctx.strokeStyle = on ? COLOR.phos : COLOR.line;
    ctx.lineWidth = on ? 2 : 1;
    ctx.strokeRect(x0 + 0.5, 0.5, w - 1, MH - 1);
    const gx = x0 + (w - gs) / 2;
    const gy = 10;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const v = img8 ? img8[r * 8 + c] / 255 : 0;
        const inCol = c === t;
        if (v > 0) {
          const alpha = (0.15 + 0.85 * v) * (on ? (inCol ? 1 : 0.5) : 0.2);
          ctx.fillStyle = inCol && on ? `rgba(122, 255, 176, ${alpha})` : `rgba(239, 232, 214, ${alpha})`;
          ctx.fillRect(gx + c * cell + 1, gy + r * cell + 1, cell - 2, cell - 2);
        }
      }
    }
    ctx.strokeStyle = on ? COLOR.phos : COLOR.mute;
    ctx.lineWidth = 1;
    ctx.strokeRect(gx + t * cell + 0.5, gy + 0.5, cell - 1, gs - 1);
    ctx.fillStyle = on ? COLOR.phos : COLOR.mute;
    ctx.fillText(on ? String(t + 1) : `${t + 1} ×`, x0 + w / 2, MH - 12);
  }
}

const PW = 980;
const PH = 224;

/** The score of one digit as eight moment contributions plus the bias; covered moments are hollow. */
export function drawSlots(canvas, contrib, digit, mask) {
  const ctx = fitCanvas(canvas, PW, PH);
  ctx.clearRect(0, 0, PW, PH);
  const bars = [...contrib.slots, contrib.bias];
  let m = 0.05;
  for (const v of bars) m = Math.max(m, Math.abs(v));
  const mid = 118;
  const half = 64;
  const slot = PW / bars.length;

  ctx.font = `15px ${FONT_MONO}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = COLOR.mute;
  ctx.fillText(tx('decSlots', digit), 8, 20);
  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(PW, mid); ctx.stroke();

  ctx.textAlign = 'center';
  bars.forEach((v, i) => {
    const x = i * slot + slot / 2;
    const h = (v / m) * half;
    const isBias = i === bars.length - 1;
    const covered = !isBias && !mask[i];
    const bx = x - 26;
    const by = h >= 0 ? mid - h : mid;
    const bh = Math.max(2, Math.abs(h));
    if (covered) {
      ctx.strokeStyle = COLOR.mute;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(bx + 0.5, by + 0.5, 51, bh - 1);
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = v >= 0 ? COLOR.phos : COLOR.warmDim;
      if (isBias) ctx.fillStyle = v >= 0 ? COLOR.phosDim : COLOR.mute;
      ctx.fillRect(bx, by, 52, bh);
    }
    ctx.fillStyle = covered ? COLOR.mute : COLOR.warmDim;
    ctx.fillText(`${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`, x, h >= 0 ? mid - h - 10 : mid - h + 22);
    ctx.fillStyle = COLOR.mute;
    ctx.fillText(isBias ? tx('decBias') : String(i + 1), x, PH - 6);
  });
}
