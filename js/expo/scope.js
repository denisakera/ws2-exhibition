/**
 * The virtual oscilloscope.
 *
 * Every curve is data from `runDigit` (js/expo/model.js): the fast state of the six nodes that
 * move most during this run, and the mean magnitude of the slow state of all 64 nodes ("memory"). Lines
 * connect the model's own simulation steps; nothing is smoothed or invented between them. The
 * playhead only reveals the already computed run, slowed down so it can be watched.
 * Earlier runs stay as faint ghosts (trace persistence).
 */
import { fitCanvas, COLOR, FONT_MONO } from './canvas.js';
import { tx } from './copy.js';

const W = 920;
const H = 520;
const L = 64;
const R = W - 24;
const T = 52;
const B = 452;
const DIV_X = 8;   // one division = one pulse slot (10 ms of model time)
const DIV_Y = 6;

export function createScope(canvas, model) {
  let ctx = fitCanvas(canvas, W, H);
  const n = model.n;
  const steps = model.steps;
  const px = (k) => L + (k / steps) * (R - L);
  const py = (v) => (T + B) / 2 - v * ((B - T) / 2) * 0.96;

  function graticule() {
    ctx.fillStyle = COLOR.graphite;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = COLOR.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    ctx.strokeStyle = COLOR.lineSoft;
    ctx.beginPath();
    for (let i = 0; i <= DIV_X; i++) {
      const x = L + (i / DIV_X) * (R - L);
      ctx.moveTo(x, T); ctx.lineTo(x, B);
    }
    for (let j = 0; j <= DIV_Y; j++) {
      const y = T + (j / DIV_Y) * (B - T);
      ctx.moveTo(L, y); ctx.lineTo(R, y);
    }
    ctx.stroke();
    // centre axes with fine ticks, as on an instrument screen
    const cy = (T + B) / 2;
    ctx.strokeStyle = COLOR.line;
    ctx.beginPath();
    ctx.moveTo(L, cy); ctx.lineTo(R, cy);
    for (let i = 0; i <= DIV_X * 5; i++) {
      const x = L + (i / (DIV_X * 5)) * (R - L);
      ctx.moveTo(x, cy - 4); ctx.lineTo(x, cy + 4);
    }
    ctx.stroke();
  }

  function labels(slow) {
    ctx.font = `15px ${FONT_MONO}`;
    ctx.fillStyle = COLOR.mute;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    for (let i = 0; i <= DIV_X; i++) {
      ctx.fillText(String(i * model.slotMs), L + (i / DIV_X) * (R - L), B + 26);
    }
    ctx.textAlign = 'left';
    ctx.fillText(tx('scopeTime', slow), L, H - 22);
    ctx.fillText(tx('scopeValue'), L, 32);
  }

  function legend() {
    ctx.font = `15px ${FONT_MONO}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = COLOR.mute;
    const slowText = tx('scopeSlow');
    const fastText = tx('scopeFast');
    let x = R;
    ctx.fillText(slowText, x, 32);
    x -= ctx.measureText(slowText).width + 14;
    ctx.strokeStyle = COLOR.warm; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 26, 27); ctx.lineTo(x, 27); ctx.stroke();
    x -= 26 + 30;
    ctx.fillText(fastText, x, 32);
    x -= ctx.measureText(fastText).width + 14;
    ctx.strokeStyle = COLOR.phos;
    ctx.beginPath(); ctx.moveTo(x - 26, 27); ctx.lineTo(x, 27); ctx.stroke();
  }

  /** Polyline of one series up to fractional step `p`. */
  function path(series, stride, i, p) {
    ctx.beginPath();
    ctx.moveTo(px(0), py(0));
    const whole = Math.min(steps, Math.floor(p));
    for (let k = 1; k <= whole; k++) ctx.lineTo(px(k), py(series[(k - 1) * stride + i]));
    if (p > whole && whole < steps) {
      const prev = whole >= 1 ? series[(whole - 1) * stride + i] : 0;
      const next = series[whole * stride + i];
      const f = p - whole;
      ctx.lineTo(px(p), py(prev + (next - prev) * f));
    }
  }

  function strokeGlow(color, widthCore, alpha) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.12;
    ctx.lineWidth = widthCore * 4.5;
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.4;
    ctx.lineWidth = widthCore * 2;
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = widthCore;
    ctx.stroke();
  }

  function head(series, stride, i, p, color) {
    if (p <= 0 || p >= steps) return;
    const whole = Math.floor(p);
    const prev = whole >= 1 ? series[(whole - 1) * stride + i] : 0;
    const next = series[Math.min(steps - 1, whole) * stride + i];
    const y = py(prev + (next - prev) * (p - whole));
    ctx.globalAlpha = 0.25; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(px(p), y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(px(p), y, 3.6, 0, Math.PI * 2); ctx.fill();
  }

  /**
   * @param {{playback: null|{run, nodes:number[], meanS:Float32Array, p:number}, ghosts: Array<{run, nodes, meanS}>, slow:number}} view
   */
  function draw(view) {
    ctx = fitCanvas(canvas, W, H);
    graticule();
    labels(view.slow);
    legend();

    ctx.save();
    ctx.beginPath();
    ctx.rect(L - 2, T - 6, R - L + 4, B - T + 12);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';

    // persistence: earlier runs, oldest faintest
    view.ghosts.forEach((g, gi) => {
      if (g.ref) {
        // the same nodes in the dark: a clear dashed reference, and the area between it and the live
        // trace of the node that changed most (what the light did to the material)
        const pbk = view.playback;
        if (pbk && g.fill != null && pbk.p > 0) {
          const whole = Math.min(steps, Math.floor(pbk.p));
          ctx.beginPath();
          ctx.moveTo(px(0), py(0));
          for (let k = 1; k <= whole; k++) ctx.lineTo(px(k), py(pbk.run.x[(k - 1) * n + g.fill]));
          for (let k = whole; k >= 1; k--) ctx.lineTo(px(k), py(g.run.x[(k - 1) * n + g.fill]));
          ctx.closePath();
          ctx.fillStyle = COLOR.phos; ctx.globalAlpha = 0.2; ctx.fill();
        }
        ctx.setLineDash([9, 7]);
        for (const i of g.nodes) {
          path(g.run.x, n, i, steps);
          ctx.strokeStyle = COLOR.warm; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.8; ctx.stroke();
        }
        ctx.setLineDash([]);
        return;
      }
      const a = 0.1 + 0.07 * gi;
      for (const i of g.nodes) {
        path(g.run.x, n, i, steps);
        ctx.strokeStyle = COLOR.phos; ctx.globalAlpha = a; ctx.lineWidth = 1.4; ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;

    const pb = view.playback;
    if (pb) {
      pb.nodes.forEach((i, rank) => {
        path(pb.run.x, n, i, pb.p);
        strokeGlow(COLOR.phos, 2.2, 0.95 - rank * 0.1);
      });
      path(pb.meanS, 1, 0, pb.p);
      strokeGlow(COLOR.warm, 2.8, 0.9);
      head(pb.run.x, n, pb.nodes[0], pb.p, COLOR.phos);
      head(pb.meanS, 1, 0, pb.p, COLOR.warm);
      // playhead
      if (pb.p > 0 && pb.p < steps) {
        ctx.globalAlpha = 0.35; ctx.strokeStyle = COLOR.phos; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px(pb.p), T); ctx.lineTo(px(pb.p), B); ctx.stroke();
      }
    } else {
      // no input: the model sits at rest, zero everywhere
      ctx.beginPath(); ctx.moveTo(px(0), py(0)); ctx.lineTo(px(steps), py(0));
      strokeGlow(COLOR.phos, 2, 0.55);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    if (!pb || pb.p <= 0) {
      ctx.font = `17px ${FONT_MONO}`;
      ctx.fillStyle = COLOR.phosDim;
      ctx.textAlign = 'left';
      ctx.fillText(tx('scopeRest'), L + 16, (T + B) / 2 - 18);
    }
  }

  return { draw };
}

/**
 * The "memory" curve: mean magnitude of the slow state over all nodes at each step. A signed
 * mean would cancel to ~0, the magnitude shows what the pulses have left behind and how it decays.
 */
export function meanSlow(run, n) {
  const steps = run.steps;
  const out = new Float32Array(steps);
  for (let t = 0; t < steps; t++) {
    let acc = 0;
    for (let i = 0; i < n; i++) acc += Math.abs(run.s[t * n + i]);
    out[t] = acc / n;
  }
  return out;
}
