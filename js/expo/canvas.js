/**
 * Canvas helpers for the fixed-size exhibition stage.
 *
 * Every canvas has a logical size (its CSS size on the 1920x1080 stage). The backing store
 * follows how large the stage is really shown, so a 4K touchscreen stays sharp and a small
 * monitor does not waste fill rate. Drawing code always works in logical coordinates.
 */

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export const COLOR = {
  ink: '#050606',
  graphite: '#0c0f0d',
  line: '#24302a',
  lineSoft: '#17211b',
  warm: '#efe8d6',
  warmDim: '#a8a290',
  mute: '#6d756e',
  phos: '#86ffa8',
  phosDim: '#2f8f52',
};

export const FONT_MONO = "'IBM Plex Mono', Consolas, monospace";
export const FONT_SERIF = "'Instrument Serif', 'Times New Roman', serif";

let stageScale = 1;

export function setStageScale(s) {
  stageScale = s;
}

/** Match the backing store to the logical size; returns the 2D context ready for logical drawing. */
export function fitCanvas(canvas, logicalW, logicalH) {
  const ratio = Math.max(1, Math.min(2, (window.devicePixelRatio || 1) * stageScale));
  const w = Math.round(logicalW * ratio);
  const h = Math.round(logicalH * ratio);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(w / logicalW, 0, 0, h / logicalH, 0, 0);
  return ctx;
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/** Value of a (steps x n) series at fractional step `p` for node `i`; before the first step it is 0. */
export function sampleSeries(series, n, i, p) {
  if (p <= 0) return 0;
  const a = Math.floor(p);
  const f = p - a;
  const v0 = a >= 1 ? series[(a - 1) * n + i] : 0;
  const idx = Math.min(a, series.length / n - 1);
  const v1 = series[idx * n + i];
  return lerp(v0, v1, f);
}
