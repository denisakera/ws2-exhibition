/**
 * Touch drawing surface.
 *
 * Strokes are kept as point lists (in logical 720x720 coordinates) so the visible canvas can be
 * repainted after a resize, and are also rasterised into a small hidden "ink" canvas whose alpha
 * channel is what the preprocessing (js/expo/preprocess.js) turns into the 8x8 input.
 * Only one pointer draws at a time, so a second finger or a palm does not add stray ink.
 */
import { fitCanvas, COLOR } from './canvas.js';

export const SURFACE = 720;
const INK = 360;          // hidden raster size
const BRUSH = 54;         // logical px, roughly a fingertip drawn with a marker

export function createDrawSurface(canvas, { onChange } = {}) {
  const ink = document.createElement('canvas');
  ink.width = INK;
  ink.height = INK;
  const ictx = ink.getContext('2d', { willReadFrequently: true });
  let ctx = null;
  let strokes = [];
  let active = null;   // { id, stroke }

  function paintSegment(c, a, b, k) {
    c.beginPath();
    c.moveTo(a[0] * k, a[1] * k);
    c.lineTo(b[0] * k, b[1] * k);
    c.stroke();
  }

  function setupInk() {
    ictx.lineCap = 'round';
    ictx.lineJoin = 'round';
    ictx.strokeStyle = '#fff';
    ictx.fillStyle = '#fff';
    ictx.lineWidth = BRUSH * (INK / SURFACE);
  }
  setupInk();

  function paintDisplay(a, b) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(134, 255, 168, 0.16)';
    ctx.lineWidth = BRUSH + 22;
    paintSegment(ctx, a, b, 1);
    ctx.strokeStyle = COLOR.warm;
    ctx.lineWidth = BRUSH;
    paintSegment(ctx, a, b, 1);
  }

  function redraw() {
    ctx = fitCanvas(canvas, SURFACE, SURFACE);
    ctx.clearRect(0, 0, SURFACE, SURFACE);
    for (const s of strokes) {
      if (s.length === 1) paintDisplay(s[0], [s[0][0] + 0.01, s[0][1]]); // a tap is a dot
      for (let i = 1; i < s.length; i++) paintDisplay(s[i - 1], s[i]);
    }
  }

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * SURFACE, ((e.clientY - r.top) / r.height) * SURFACE];
  }

  function addPoint(p) {
    const s = active.stroke;
    const last = s[s.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) return;
    s.push(p);
    paintDisplay(last || p, last ? p : [p[0] + 0.01, p[1]]);
    const k = INK / SURFACE;
    paintSegment(ictx, last || p, p, k);
    if (!last) {
      ictx.beginPath();
      ictx.arc(p[0] * k, p[1] * k, (BRUSH * k) / 2, 0, Math.PI * 2);
      ictx.fill();
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (active) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const stroke = [];
    strokes.push(stroke);
    active = { id: e.pointerId, stroke };
    addPoint(toLogical(e));
    onChange?.('down');
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events.length ? events : [e]) addPoint(toLogical(ev));
    onChange?.('move');
  });

  const finish = (e) => {
    if (!active || e.pointerId !== active.id) return;
    active = null;
    onChange?.('up');
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  return {
    redraw,
    get hasInk() { return strokes.length > 0; },
    clear() {
      strokes = [];
      active = null;
      ictx.clearRect(0, 0, INK, INK);
      if (ctx) ctx.clearRect(0, 0, SURFACE, SURFACE);
      onChange?.('clear');
    },
    /** Alpha channel of the hidden ink raster (INK x INK, 0..255). */
    getInk() {
      const d = ictx.getImageData(0, 0, INK, INK).data;
      const a = new Uint8Array(INK * INK);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
      return a;
    },
    inkCanvas: ink,
    inkSize: INK,
  };
}
