/**
 * Canvas plotting helpers (dependency-free).
 * Every function takes a canvas and lays itself out for a given CSS size.
 */
import { t } from './i18n.js';

export const DIGIT_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
];

export function setupCanvas(canvas, w, h) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  // no inline height: CSS keeps `height: auto` so the aspect ratio is preserved
  // when the canvas is clamped on narrow screens
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

function valueColor(t) {
  // blue -> white -> red, t in [0, 1]
  const c = Math.max(0, Math.min(1, t));
  const mix = (a, b, u) => Math.round(a + (b - a) * u);
  if (c < 0.5) {
    const u = c * 2;
    return `rgb(${mix(43, 255, u)},${mix(108, 255, u)},${mix(176, 255, u)})`;
  }
  const u = (c - 0.5) * 2;
  return `rgb(${mix(255, 197, 48, u)},${mix(255, 48, 48, u)},${mix(255, 48, 64, u)})`;
}

/** Draw an 8x8 (or any rows x cols) pixel image. */
export function drawPixels(canvas, w, h, pixels, rows, cols, opts = {}) {
  const ctx = setupCanvas(canvas, w, h);
  const { binary = false, pad = 2, bg = '#0b0f14' } = opts;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const cw = (w - 2 * pad) / cols;
  const ch = (h - 2 * pad) / rows;
  const size = Math.min(cw, ch);
  const ox = pad + (w - 2 * pad - size * cols) / 2;
  const oy = pad + (h - 2 * pad - size * rows) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = pixels[r * cols + c];
      const x = ox + c * size;
      const y = oy + r * size;
      if (binary) {
        ctx.fillStyle = v ? '#ffb454' : '#1c2530';
        ctx.fillRect(x + 0.5, y + 0.5, size - 1, size - 1);
      } else {
        const g = Math.round((v / (opts.max ?? 255)) * 255);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fillRect(x, y, size, size);
      }
    }
  }
  return ctx;
}

/** Pulse trains: 8 channels x 8 slots, with time playhead. */
export function drawPulseTrains(canvas, w, h, bits, opts = {}) {
  const { slotMs = 10, duty = 0.5, playhead = null, showTimeAxis = true } = opts;
  const ctx = setupCanvas(canvas, w, h);
  const left = 34;
  const right = 10;
  const top = 8;
  const bottom = showTimeAxis ? 22 : 8;
  const cols = 8;
  const rows = 8;
  const cellW = (w - left - right) / cols;
  const cellH = (h - top - bottom) / rows;

  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, w, h);

  // slot separators
  ctx.strokeStyle = '#223041';
  ctx.lineWidth = 1;
  for (let c = 1; c < cols; c++) {
    ctx.beginPath();
    ctx.moveTo(left + c * cellW, top);
    ctx.lineTo(left + c * cellW, h - bottom);
    ctx.stroke();
  }

  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let c = 0; c < 8; c++) {
    const y = top + c * cellH + cellH / 2;
    ctx.fillStyle = '#6b7f95';
    ctx.fillText(`${t('ch', 'kan')}${c}`, left - 4, y);
    const pulseH = cellH * 0.55;
    for (let t = 0; t < cols; t++) {
      const v = Math.max(0, Math.min(1, bits[c * 8 + t]));
      const x = left + t * cellW;
      ctx.fillStyle = '#233040';
      ctx.fillRect(x + 1, y - 1, cellW - 2, 2); // baseline
      if (v > 0.02) {
        ctx.fillStyle = '#ffb454';
        const h = pulseH * v;
        ctx.fillRect(x + 1, y - h / 2, (cellW - 2) * Math.min(1, duty), h);
      }
    }
  }

  if (showTimeAxis) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#6b7f95';
    for (let t = 0; t < cols; t++) {
      const x = left + t * cellW + cellW / 2;
      ctx.fillText(`${(t * slotMs).toFixed(0)}`, x, h - bottom + 5);
    }
    ctx.textAlign = 'right';
    ctx.fillText('ms', w - right, h - bottom + 5);
  }

  if (playhead !== null) {
    const cols2 = playhead * cols; // fractional slot position
    const x = left + Math.min(cols, Math.max(0, cols2)) * cellW;
    ctx.strokeStyle = '#57c7ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, top - 2);
    ctx.lineTo(x, h - bottom);
    ctx.stroke();
  }
}

/** Two heatmaps (fast x, slow s) of shape nodes x 8 slots. */
export function drawStateHeatmaps(canvas, w, h, perSlot, n, opts = {}) {
  const ctx = setupCanvas(canvas, w, h);
  const { slots = 8, reveal = slots, label = true } = opts;
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, w, h);

  const panels = [
    { name: t('x  fast', 'x  rychlý'), offset: 0 },
    { name: t('s  slow', 's  pomalý'), offset: n },
  ];
  const top = 14;
  const gap = 22;
  const panelH = (h - top - gap - 12) / 2;

  panels.forEach((panel, pi) => {
    const y0 = top + pi * (panelH + gap);
    // global min/max over revealed part
    let mn = Infinity;
    let mx = -Infinity;
    for (let t = 0; t < reveal; t++) {
      const base = t * 2 * n + panel.offset;
      for (let i = 0; i < n; i++) {
        const v = perSlot[base + i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    if (!Number.isFinite(mn)) { mn = 0; mx = 1; }
    if (mx - mn < 1e-9) mx = mn + 1e-9;

    const cellW = w / slots;
    const cellH = panelH / n;
    for (let t = 0; t < reveal; t++) {
      const base = t * 2 * n + panel.offset;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = valueColor((perSlot[base + i] - mn) / (mx - mn));
        ctx.fillRect(t * cellW, y0 + i * cellH, cellW + 0.5, Math.max(1, cellH));
      }
    }
    for (let t = 1; t < slots; t++) {
      ctx.strokeStyle = 'rgba(11,15,20,0.7)';
      ctx.beginPath();
      ctx.moveTo(t * cellW, y0);
      ctx.lineTo(t * cellW, y0 + panelH);
      ctx.stroke();
    }
    if (label) {
      ctx.fillStyle = '#6b7f95';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(panel.name, 2, y0 - 3);
      ctx.textAlign = 'right';
      ctx.fillText(`${mn.toFixed(2)} … ${mx.toFixed(2)}`, w - 2, y0 - 3);
    }
  });
  return { panels: 2 };
}

export function drawScatter(canvas, w, h, xy, labels, opts = {}) {
  const ctx = setupCanvas(canvas, w, h);
  const { highlight = -1, pad = 26 } = opts;
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, w, h);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const count = labels.length;
  for (let i = 0; i < count; i++) {
    const x = xy[i * 2];
    const y = xy[i * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) { minX = -1; maxX = 1; minY = -1; maxY = 1; }
  const rx = maxX - minX || 1;
  const ry = maxY - minY || 1;
  minX -= rx * 0.06; maxX += rx * 0.06; minY -= ry * 0.06; maxY += ry * 0.06;

  const sx = (x) => pad + ((x - minX) / (maxX - minX)) * (w - 2 * pad);
  const sy = (y) => h - pad - ((y - minY) / (maxY - minY)) * (h - 2 * pad);

  ctx.strokeStyle = '#223041';
  ctx.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad);

  for (let i = 0; i < count; i++) {
    const c = labels[i];
    ctx.fillStyle = DIGIT_COLORS[c % 10];
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(sx(xy[i * 2]), sy(xy[i * 2 + 1]), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (highlight >= 0 && highlight < count) {
    const x = sx(xy[highlight * 2]);
    const y = sy(xy[highlight * 2 + 1]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // mini legend
  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let c = 0; c < 10; c++) {
    const x = pad + 6 + c * ((w - 2 * pad) / 10);
    ctx.fillStyle = DIGIT_COLORS[c];
    ctx.fillRect(x - 5, 6, 10, 3);
    ctx.fillStyle = '#6b7f95';
    ctx.fillText(String(c), x, 10);
  }
  return { sx, sy };
}

/**
 * series: [{ points: [{x, y}...], color, width?, label? }]
 */
export function drawLineChart(canvas, w, h, series, opts = {}) {
  const ctx = setupCanvas(canvas, w, h);
  const { xlabel = '', ylabel = '', ymin = 0, ymax = 1, xmin = null, xmax = null, padL = 40, padR = 76, padT = 12, padB = 28 } = opts;
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, w, h);

  let xlo = xmin ?? Infinity;
  let xhi = xmax ?? -Infinity;
  for (const s of series) {
    for (const p of s.points) {
      if (xmin === null) xlo = Math.min(xlo, p.x);
      if (xmax === null) xhi = Math.max(xhi, p.x);
    }
  }
  if (!Number.isFinite(xlo) || !Number.isFinite(xhi) || xhi === xlo) { xlo = 0; xhi = 1; }

  const sx = (x) => padL + ((x - xlo) / (xhi - xlo)) * (w - padL - padR);
  const sy = (y) => h - padB - ((y - ymin) / (ymax - ymin)) * (h - padT - padB);

  ctx.strokeStyle = '#223041';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = padT + (g / 4) * (h - padT - padB);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillStyle = '#6b7f95';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const val = ymax - (g / 4) * (ymax - ymin);
    ctx.fillText(val >= 1 ? val.toFixed(1) : val.toFixed(2), padL - 5, y);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#6b7f95';
  ctx.fillText(xlabel, (padL + w - padR) / 2, h - 14);
  ctx.save();
  ctx.translate(10, (padT + h - padB) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(ylabel, 0, 0);
  ctx.restore();

  let legendY = padT + 2;
  for (const s of series) {
    if (!s.points.length) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width ?? 1.8;
    ctx.beginPath();
    s.points.forEach((p, i) => {
      const x = sx(p.x);
      const y = sy(p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (s.label) {
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(w - padR + 6, legendY);
      ctx.lineTo(w - padR + 20, legendY);
      ctx.stroke();
      ctx.fillStyle = '#9fb3c8';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(s.label, w - padR + 24, legendY);
      legendY += 12;
    }
  }
}

/** Confusion matrix (10x10, row-normalized color). */
export function drawConfusion(canvas, w, h, conf) {
  const ctx = setupCanvas(canvas, w, h);
  const pad = 26;
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, w, h);
  const size = Math.min(w - pad - 8, h - pad - 8) / 10;
  const ox = pad;
  const oy = 8;

  for (let t = 0; t < 10; t++) {
    let rowSum = 0;
    for (let p = 0; p < 10; p++) rowSum += conf[t * 10 + p];
    for (let p = 0; p < 10; p++) {
      const v = rowSum ? conf[t * 10 + p] / rowSum : 0;
      ctx.fillStyle = valueColor(0.15 + v * 0.85 * 0.85);
      ctx.fillRect(ox + p * size, oy + t * size, size, size);
      if (size > 16 && rowSum) {
        ctx.fillStyle = v > 0.5 ? '#0b0f14' : '#cbd8e6';
        ctx.font = `${Math.min(9, size * 0.42)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(conf[t * 10 + p]), ox + p * size + size / 2, oy + t * size + size / 2);
      }
    }
  }
  ctx.fillStyle = '#6b7f95';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let p = 0; p < 10; p++) {
    ctx.fillText(String(p), ox + p * size + size / 2, oy + 10 * size + 4);
  }
  ctx.save();
  ctx.translate(12, oy + 5 * size);
  ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'bottom';
  ctx.fillText(t('predicted', 'predikováno'), 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.fillText(t('true', 'skutečnost'), 4, 10 * size + oy + 22);
}

/** Probability bars for one sample. */
export function drawProbBars(canvas, w, h, probs, predicted, truth) {
  const ctx = setupCanvas(canvas, w, h);
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, w, h);
  const rowH = h / 10;
  const labelW = 18;
  for (let c = 0; c < 10; c++) {
    const y = c * rowH + 1;
    const barW = (w - labelW - 8) * Math.max(0, Math.min(1, probs[c]));
    ctx.fillStyle = '#1c2530';
    ctx.fillRect(labelW, y, w - labelW - 8, rowH - 2);
    ctx.fillStyle = c === predicted ? '#ffb454' : DIGIT_COLORS[c];
    ctx.globalAlpha = c === predicted ? 1 : 0.55;
    ctx.fillRect(labelW, y, barW, rowH - 2);
    ctx.globalAlpha = 1;
    if (c === truth) {
      ctx.strokeStyle = '#57c7ff';
      ctx.strokeRect(labelW - 1.5, y - 1, w - labelW - 5, rowH);
    }
    ctx.fillStyle = '#cbd8e6';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(c), 9, y + rowH / 2 - 1);
  }
}
