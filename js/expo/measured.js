/**
 * "Zvuk vzorku": the third main section. The lab's oscilloscope capture of 19 Oct 2026, seen, heard and played.
 *
 *   picture  the 200 real pulses (log time): the pulse that starts, what is left after it ends, the end
 *            level of all 200. The way in starts the model and the slowed sample together.
 *   sound    the sample (recordings made by tools/make_ws2_audio.py) in three modes, with the simulation
 *            (the model) in the other ear. They are never synchronised with each other.
 *   touch    drag a finger along a curve: the voltage becomes a tone (an artistic mapping, said on screen);
 *            tap the lower chart: pick any of the 200 pulses; tap the chip: show how every pulse differs
 *            from the average, magnified 20x (it is the thing the sound "what does not repeat" is made of).
 *
 * Everything here is recorded data, not live. The recordings contain the instrument too (mains hum, probe noise).
 */
import { fitCanvas, COLOR, FONT_MONO } from './canvas.js';
import { tx, getLang } from './copy.js';
import { playModel, playBuffer, loadBuffer } from './sonify.js';
import { liveliestNodes } from './model.js';
import { meanSlow } from './scope.js';

const W = 980;
const H = 600;
const FILES = { slow: 'ws2_slow26', resid: 'ws2_residual26', rest: 'ws2_rest26' };
const SLOW = 26.0417;                  // 1.25 MSa/s played at 48 kHz
const PERIOD_S = 0.02 * SLOW;          // one pulse of the slowed recording
const PREROLL_MS = 2;                  // the slowed excerpts start 2 ms before a rising edge
const MAG = 20;                        // magnification of the difference-from-average view

// the three panels (logical pixels)
const A = { x0: 64, x1: 964, y0: 36, y1: 300 };
const B = { x0: 64, x1: 470, y0: 346, y1: 540 };
const C = { x0: 540, x1: 964, y0: 346, y1: 540, lo: 500, hi: 540 };
const CHIP = { x: 700, y: 4, w: 264, h: 26 };
const T_MIN = 0.002;
const T_MAX = 10;

const px = (t, x0, x1) => x0 + (Math.log(Math.max(t, T_MIN) / T_MIN) / Math.log(T_MAX / T_MIN)) * (x1 - x0);
const tOf = (x, x0, x1) => T_MIN * Math.pow(T_MAX / T_MIN, (x - x0) / (x1 - x0));
const fmt = (v, d = 0) => v.toFixed(d).replace('.', getLang() === 'cs' ? ',' : '.').replace('-', '−');

export async function loadMeasured(url = 'data/ws2-measured.json') {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

export async function loadPairs(url = 'data/ws2-pairs.json') {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

export function initMeasured({ model, data, pairs, touch, getRun }) {
  const $ = (s) => document.querySelector(s);
  const canvas = $('#cv-meas');
  const { rise, fall, pulses } = data;
  const n = pulses.rise.length;
  const riseMean = rise.mV;
  const fallMean = fall.mV;
  let ctx = null;
  let live = [];
  let timer = null;
  let token = 0;
  let mode = null;            // 'slow' | 'resid' | 'rest' | null
  let withModel = false;
  let startedAt = 0;
  let duration = 0;
  let pick = null;            // a pulse chosen by touch, or null (then the sounding pulse is followed)
  let dev = true;             // show the difference from the average pulse, magnified (the way in; the chip switches back)
  let cursor = null;          // { panel: 'A' | 'B', ms } while a finger is on a curve
  let tone = null;
  let view = 'pulse';         // 'pulse' | 'pair'
  let gi = 0;                 // index of the chosen gap in the pair view
  let cursorUs = null;        // a finger on the pair chart: microseconds after the end of pulse one
  let cursor2Us = null;       // a finger on the second chart: microseconds after the start of a pulse
  let auto = true;            // the pair view plays by itself, the six gaps one after another
  let lastTouchAt = 0;
  let needReplay = false;
  let lastIndex = pulses.audioFirst;
  const cache = {};

  function valueAt(tMs, curve, tArr) {
    if (tMs <= tArr[0]) return curve[0];
    for (let i = 1; i < tArr.length; i++) {
      if (tMs <= tArr[i]) {
        const f = (tMs - tArr[i - 1]) / (tArr[i] - tArr[i - 1]);
        return curve[i - 1] + (curve[i] - curve[i - 1]) * f;
      }
    }
    return curve[curve.length - 1];
  }

  function ensureCtx() {
    if (!ctx) ctx = new AudioContext({ sampleRate: 48000 });
    return ctx.resume();
  }

  function refreshButtons() {
    for (const b of document.querySelectorAll('#meas-modes button[data-mode]')) b.classList.toggle('on', b.dataset.mode === mode);
    $('#meas-model').classList.toggle('on', withModel);
    $('#meas-stop').disabled = !(mode || withModel);
    $('#meas-hint').textContent = view === 'pair' && pairs ? tx('measPairNote', pairs.gaps[gi]) : tx(withModel && mode ? 'measHintBoth' : mode ? 'measHintSample' : withModel ? 'measHintModel' : 'measHintNone');
    $('#meas-auto').textContent = tx(auto ? 'measAutoOn' : 'measAutoOff');
    $('#meas-auto').classList.toggle('on', auto);
    $('#measured').classList.toggle('view-pair', view === 'pair');
    $('#measured').classList.toggle('view-pulse', view !== 'pair');
    for (const b of document.querySelectorAll('#meas-views button')) b.classList.toggle('on', b.dataset.view === view);
    for (const b of document.querySelectorAll('#meas-gaps button')) b.classList.toggle('on', Number(b.dataset.gap) === (pairs ? pairs.gaps[gi] : -1));
    refreshFacts();
  }

  function refreshFacts() {
    if (view === 'pair' && pairs) {
      const p = pairs.pairs[String(pairs.gaps[gi])];
      $('#mf1n').textContent = `${fmt(p.carry, p.carry < 10 ? 1 : 0)} %`;
      $('#mf1').textContent = tx('measPairF1', p.carry);
      $('#mf2n').textContent = `+${fmt(p.excess, 0)} %`;
      $('#mf2').textContent = tx('measPairF2');
      $('#mf3n').textContent = '95 µs';
      $('#mf3').textContent = tx('measPairF3');
    } else {
      $('#mf1n').textContent = '200';
      $('#mf1').textContent = tx('measF1');
      $('#mf2n').textContent = tx('measF2n');
      $('#mf2').textContent = tx('measF2');
      $('#mf3n').textContent = tx('measF3n');
      $('#mf3').textContent = tx('measF3');
    }
  }

  function setView(v) {
    if (v === view || (v === 'pair' && !pairs)) return;
    view = v;
    auto = true;
    pick = null;
    cursor = null;
    cursorUs = null;
    stopTone();
    mode = v === 'pair' ? 'pair' : 'slow';
    play();
  }

  /** The visitor chooses a gap: the automatic sweep stops (it comes back by itself after a while). */
  function setGap(i, later = false) {
    lastTouchAt = performance.now();
    const changed = i !== gi || auto;
    gi = i;
    auto = false;
    if (later) { if (changed) { needReplay = true; refreshButtons(); } return; }   // while dragging: play on release
    if (mode === 'pair') play(); else refreshButtons();
  }

  $('#meas-auto').addEventListener('click', () => { touch(); auto = !auto; lastTouchAt = performance.now(); if (mode === 'pair') play(); else refreshButtons(); });

  /** The sweep follows the sound: which of the six gaps is sounding now. */
  function followSweep(now) {
    if (view !== 'pair' || !pairs || !auto) return;
    const order = pairs.sweep.order;
    let seg;
    if (mode === 'pair' && ctx && duration > 0) {
      let t = (ctx.currentTime - startedAt) % duration;
      seg = 0;
      for (let k = 0; k < order.length; k++) { if (t < pairs.sweep.durations[k]) { seg = k; break; } t -= pairs.sweep.durations[k]; seg = k; }
    } else {
      seg = Math.floor(now / 2400) % order.length;      // without sound the screen still shows the story
    }
    const idx = pairs.gaps.indexOf(order[seg]);
    if (idx !== gi) { gi = idx; refreshButtons(); }
  }

  function resumeAuto(now) {
    if (view === 'pair' && !auto && performance.now() - lastTouchAt > 25000 && !down.on) {
      auto = true;
      if (mode === 'pair') play(); else refreshButtons();
    }
  }

  function stopTone() {
    if (!tone || !ctx) return;
    const { osc, gain } = tone;
    tone = null;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    osc.stop(ctx.currentTime + 0.3);
  }

  function stop() {
    token++;
    clearInterval(timer);
    for (const v of live) v.stop();
    live = [];
    mode = null;
    withModel = false;
    cursor = null;
    stopTone();
    refreshButtons();
  }

  async function buffer(key) {
    const file = key === 'pair_sweep' ? 'ws2_pairs_sweep' : key.startsWith('pair_') ? `ws2_pair_${key.slice(5)}` : FILES[key];
    if (!cache[key]) cache[key] = await loadBuffer(ctx, `audio/${file}.wav`);
    return cache[key];
  }

  async function play() {
    for (const v of live) v.stop();
    live = [];
    clearInterval(timer);
    const mine = ++token;
    duration = 0;   // until the recording has loaded there is nothing to follow
    refreshButtons();
    if (!mode && !withModel) return;
    await ensureCtx();
    if (mine !== token) return;
    if (withModel) {
      const run = getRun();
      const nodes = liveliestNodes(run, model.n, 6);
      const mean = meanSlow(run, model.n);
      const once = () => live.push(playModel(ctx, run, nodes, model.n, mean));
      once();
      timer = setInterval(once, 10400);
    }
    if (mode) {
      const buf = await buffer(mode === 'pair' ? (auto ? 'pair_sweep' : `pair_${pairs.gaps[gi]}`) : mode);
      if (mine !== token) return;
      live.push(playBuffer(ctx, buf, { level: mode === 'resid' ? 0.9 : 0.6, pan: withModel ? 0.7 : 0 }));
      startedAt = ctx.currentTime;
      duration = buf.duration;
    }
  }

  if (pairs) {
    const row = $('#meas-gaps');
    pairs.gaps.forEach((g, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.gap = String(g);
      b.textContent = `${g} µs`;
      b.addEventListener('click', () => { touch(); setGap(i); });
      row.appendChild(b);
    });
  } else {
    $('#meas-views').style.display = 'none';
  }
  for (const b of document.querySelectorAll('#meas-views button')) b.addEventListener('click', () => { touch(); setView(b.dataset.view); });
  const choose = (m) => { touch(); pick = null; mode = mode === m ? null : m; play(); };
  for (const b of document.querySelectorAll('#meas-modes button[data-mode]')) b.addEventListener('click', () => choose(b.dataset.mode));
  $('#meas-modes button[data-mode="pair"]').addEventListener('click', () => { /* handled by choose */ });
  $('#meas-model').addEventListener('click', () => { touch(); withModel = !withModel; play(); });
  $('#meas-stop').addEventListener('click', () => { touch(); stop(); });

  // ---- touch on the picture ----------------------------------------------------------------------------
  const toLogical = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const inside = (p, P) => p.x >= P.x0 - 8 && p.x <= P.x1 + 8 && p.y >= P.y0 - 8 && p.y <= P.y1 + 8;

  /** The pulse whose curve is shown bright: the one picked by touch, else the one that sounds. */
  const shownPulse = () => (pick !== null ? pick : lastIndex);

  function playTone(f) {
    ensureCtx().then(() => {
      if (!cursor) return;
      if (!tone) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.value = 0;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        gain.gain.setTargetAtTime(0.16, ctx.currentTime, 0.03);
        tone = { osc, gain };
      } else {
        tone.osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.02);
      }
    });
  }

  // ---- the pair view's geometry (logical pixels)
  const Q1 = { x0: 64, x1: 964, y0: 36, y1: 300 };
  const Q2 = { x0: 64, x1: 470, y0: 346, y1: 540 };
  const Q3 = { x0: 540, x1: 964, y0: 346, y1: 540 };
  const US0 = -30;
  const US1 = 650;
  const qx = (us) => Q1.x0 + ((us - US0) / (US1 - US0)) * (Q1.x1 - Q1.x0);

  function nearestGap(us) {
    let best = 0;
    pairs.gaps.forEach((g, i) => { if (Math.abs(g - Math.max(us, 0)) < Math.abs(pairs.gaps[best] - Math.max(us, 0))) best = i; });
    return best;
  }

  function touchPair(p) {
    lastTouchAt = performance.now();
    if (inside(p, Q3)) {
      const slot = (Q3.x1 - Q3.x0) / pairs.gaps.length;
      setGap(Math.max(0, Math.min(pairs.gaps.length - 1, Math.floor((p.x - Q3.x0) / slot))));
      return;
    }
    if (inside(p, Q1)) {
      cursor2Us = null;
      cursorUs = Math.max(US0, Math.min(US1, US0 + ((p.x - Q1.x0) / (Q1.x1 - Q1.x0)) * (US1 - US0)));
      // the second pulse follows the finger and snaps to the nearest gap that was really measured
      const near = nearestGap(cursorUs);
      if (near !== gi || auto) setGap(near, true);
      const tr = pairs.pairs[String(pairs.gaps[gi])].trace;
      const idx = Math.max(0, Math.min(tr[0].length - 1, Math.round((cursorUs - US0) / pairs.binUs)));
      const mv = tr.reduce((a2, t) => a2 + t[idx], 0) / tr.length;
      playTone(160 * Math.pow(2, Math.max(-20, mv) / 200));
      return;
    }
    if (inside(p, Q2)) {
      cursorUs = null;
      cursor2Us = Math.max(0, Math.min(400, ((p.x - Q2.x0) / (Q2.x1 - Q2.x0)) * 400));
      const P = pairs.pairs[String(pairs.gaps[gi])];
      const i = Math.min(P.p1[0].length - 1, Math.round(cursor2Us / pairs.binUs));
      const d = P.p2.reduce((a2, t) => a2 + t[i], 0) / P.p2.length - P.p1.reduce((a2, t) => a2 + t[i], 0) / P.p1.length;
      playTone(440 * Math.pow(2, Math.max(-150, Math.min(150, d * 6)) / 200));      // the difference between the two answers
      return;
    }
    cursorUs = null;
    cursor2Us = null;
    stopTone();
  }

  function touchAt(p) {
    touch();
    if (view === 'pair') { touchPair(p); return; }
    if (p.x >= CHIP.x && p.x <= CHIP.x + CHIP.w && p.y >= CHIP.y && p.y <= CHIP.y + CHIP.h) {
      if (!down.chipDone) { dev = !dev; down.chipDone = true; }
      cursor = null;
      stopTone();
      return;
    }
    if (inside(p, C) && p.y > C.y0 - 40) {
      pick = Math.max(0, Math.min(n - 1, Math.round(((p.x - C.x0) / (C.x1 - C.x0)) * (n - 1))));
      return;
    }
    const panel = inside(p, A) ? 'A' : inside(p, B) ? 'B' : null;
    if (!panel) { cursor = null; stopTone(); return; }
    const P = panel === 'A' ? A : B;
    const ms = Math.max(T_MIN, Math.min(T_MAX, tOf(Math.max(P.x0, Math.min(P.x1, p.x)), P.x0, P.x1)));
    cursor = { panel, ms };
    const k = shownPulse();
    const tArr = panel === 'A' ? rise.tMs : fall.tMs;
    const v = valueAt(ms, panel === 'A' ? pulses.rise[k] : pulses.fall[k], tArr);
    // an artistic mapping: the higher the value, the higher the tone. In the magnified view the tone follows the
    // difference from the average pulse around 440 Hz, otherwise the voltage itself.
    const diff = (v - valueAt(ms, panel === 'A' ? riseMean : fallMean, tArr)) * MAG;
    playTone(dev ? 440 * Math.pow(2, Math.max(-150, Math.min(150, diff)) / 200) : 160 * Math.pow(2, Math.max(-20, v) / 200));
  }

  const down = { on: false, chipDone: false };
  canvas.addEventListener('pointerdown', (e) => { down.on = true; down.chipDone = false; canvas.setPointerCapture(e.pointerId); touchAt(toLogical(e)); });
  canvas.addEventListener('pointermove', (e) => { if (down.on) touchAt(toLogical(e)); });
  const up = () => {
    down.on = false; cursor = null; cursorUs = null; cursor2Us = null; stopTone();
    if (needReplay) { needReplay = false; if (mode === 'pair') play(); }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  // ---- what is sounding ---------------------------------------------------------------------------------
  function playhead(now) {
    if ((mode === 'slow' || mode === 'resid') && ctx && duration > 0) {
      const t = (ctx.currentTime - startedAt) % duration;
      const k = Math.min(19, Math.floor(t / PERIOD_S));
      lastIndex = pulses.audioFirst + k;
      return { sec: (t - k * PERIOD_S) / SLOW, live: true };
    }
    lastIndex = pulses.audioFirst + (Math.floor(now / 900) % 20);   // nothing to follow: show the pulses one by one
    return { sec: null, live: false };
  }

  // ---- drawing ------------------------------------------------------------------------------------------
  function drawPair(now) {
    resumeAuto(now);
    followSweep(now);
    const c = fitCanvas(canvas, W, H);
    c.clearRect(0, 0, W, H);
    const g = pairs.gaps[gi];
    const P = pairs.pairs[String(g)];
    const nb = P.trace[0].length;
    const mean = (rows, i) => rows.reduce((a, r) => a + r[i], 0) / rows.length;
    const xs = (i) => qx(pairs.binUs * i + US0);
    const amp = pairs.refAmpMv;
    const yv = (v, Q, lo, hi) => Q.y1 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (Q.y1 - Q.y0);
    const y1 = (v) => yv(v, Q1, -20, 520);

    // ---- Q1: the end of the first pulse and the start of the second, on a real time axis
    c.font = `14px ${FONT_MONO}`;
    c.fillStyle = COLOR.mute;
    c.textAlign = 'left';
    c.fillText(tx('measPairChartP1'), Q1.x0, 20);
    c.strokeStyle = COLOR.lineSoft;
    c.lineWidth = 1;
    for (let us = 0; us <= 600; us += 100) {
      c.beginPath(); c.moveTo(qx(us), Q1.y0); c.lineTo(qx(us), Q1.y1); c.stroke();
      c.fillStyle = COLOR.mute; c.textAlign = 'center';
      c.fillText(`${us}`, qx(us), Q1.y1 + 18);
    }
    for (const v of [0, 250, 500]) {
      c.beginPath(); c.moveTo(Q1.x0, y1(v)); c.lineTo(Q1.x1, y1(v)); c.stroke();
      c.textAlign = 'right'; c.fillStyle = COLOR.mute;
      c.fillText(`${v}`, Q1.x0 - 8, y1(v) + 4);
    }
    const path = (arr, tOff, color, width, alpha, dash) => {
      c.strokeStyle = color; c.lineWidth = width; c.globalAlpha = alpha; c.setLineDash(dash || []);
      c.beginPath();
      for (let i = 0; i < arr.length; i++) { const x = xs(i); const y = y1(arr[i]); if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); }
      c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    };
    // what remains at the moment the second pulse starts: the shaded area under the tail up to the second rising edge
    const iGap = Math.round((g - US0) / pairs.binUs);
    const iEnd = Math.round((0 - US0) / pairs.binUs);
    const tailMean = Array.from({ length: nb }, (_, i) => mean(P.trace, i));
    c.fillStyle = 'rgba(134, 255, 168, 0.16)';
    c.beginPath();
    c.moveTo(xs(iEnd), y1(0));
    for (let i = iEnd; i <= iGap && i < nb; i++) c.lineTo(xs(i), y1(tailMean[i]));
    c.lineTo(xs(Math.min(iGap, nb - 1)), y1(0));
    c.closePath(); c.fill();
    path(pairs.refTailMv, 0, COLOR.warmDim, 1.6, 0.9, [5, 5]);
    for (const t of P.trace) path(t, 0, COLOR.phosDim, 1.1, 0.55);
    path(tailMean, 0, COLOR.phos, 2.8, 1);
    // markers: end of pulse one, start of pulse two, and what is left between them
    c.setLineDash([3, 4]); c.strokeStyle = COLOR.warmDim; c.lineWidth = 1;
    for (const us of [0, g]) { c.beginPath(); c.moveTo(qx(us), Q1.y0); c.lineTo(qx(us), Q1.y1); c.stroke(); }
    c.setLineDash([]);
    c.font = `14px ${FONT_MONO}`;
    c.fillStyle = COLOR.warm;
    const lx0 = Math.max(qx(0), qx(g)) + 10;
    c.textAlign = 'left';
    c.fillText(tx('measPairEnd1'), g < 60 ? lx0 : qx(0) + 8, Q1.y0 + 16);
    c.fillText(tx('measPairStart2'), g < 60 ? lx0 : qx(g) + 8, Q1.y0 + 36);
    const remain = tailMean[Math.min(iGap, nb - 1)];
    c.fillStyle = COLOR.phos;
    c.beginPath(); c.arc(qx(g), y1(remain), 6, 0, Math.PI * 2); c.fill();
    c.font = `500 17px ${FONT_MONO}`;
    c.textAlign = g < 100 ? 'left' : 'right';
    c.fillText(tx('measPairRemain', fmt(P.carry, P.carry < 10 ? 1 : 0)), g < 100 ? qx(g) + 14 : qx(g) - 14, y1(remain) - 12);
    // the measured gaps as little ticks on the axis, and a handle on the second pulse: drag it
    c.fillStyle = COLOR.phosDim;
    for (const gg of pairs.gaps) c.fillRect(qx(gg) - 1, Q1.y1 - 7, 2, 7);
    const hy = Q1.y0 + 62;
    const pulse = down.on ? 1 : 0.55 + 0.45 * Math.sin(now / 420);
    c.strokeStyle = COLOR.phos; c.lineWidth = 2; c.globalAlpha = 0.35 + 0.65 * pulse;
    c.beginPath(); c.arc(qx(g), hy, 17 + (down.on ? 0 : 4 * pulse), 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
    c.fillStyle = COLOR.phos;
    c.beginPath(); c.arc(qx(g), hy, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = COLOR.ink;
    c.font = `500 15px ${FONT_MONO}`; c.textAlign = 'center';
    c.fillText('\u25c2\u25b8', qx(g), hy + 5);
    c.font = `13px ${FONT_MONO}`;
    c.fillStyle = COLOR.warmDim;
    c.textAlign = 'left';
    c.fillText(`- - ${tx('measPairRef')}`, Q1.x0 + 8, Q1.y1 - 10);

    // ---- Q2: the response of both pulses from their own start
    const y2 = (v) => yv(v, Q2, -20, 520);
    const x2 = (i) => Q2.x0 + (i / (P.p1[0].length - 1)) * (Q2.x1 - Q2.x0);
    c.font = `14px ${FONT_MONO}`; c.fillStyle = COLOR.mute; c.textAlign = 'left';
    c.fillText(tx('measPairChartP2'), Q2.x0, 336);
    c.strokeStyle = COLOR.lineSoft;
    for (const v of [0, 250, 500]) { c.beginPath(); c.moveTo(Q2.x0, y2(v)); c.lineTo(Q2.x1, y2(v)); c.stroke(); }
    const m1 = Array.from({ length: P.p1[0].length }, (_, i) => mean(P.p1, i));
    const m2 = Array.from({ length: P.p2[0].length }, (_, i) => mean(P.p2, i));
    const upto = Math.round(120 / pairs.binUs);      // the early part where the memory shows
    c.fillStyle = 'rgba(134, 255, 168, 0.20)';
    c.beginPath();
    for (let i = 0; i <= upto; i++) { const x = x2(i); if (i === 0) c.moveTo(x, y2(m2[i])); else c.lineTo(x, y2(m2[i])); }
    for (let i = upto; i >= 0; i--) c.lineTo(x2(i), y2(m1[i]));
    c.closePath(); c.fill();
    const line2 = (arr, color, width) => { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); arr.forEach((v, i) => { if (i === 0) c.moveTo(x2(i), y2(v)); else c.lineTo(x2(i), y2(v)); }); c.stroke(); };
    line2(m1, COLOR.warmDim, 2);
    line2(m2, COLOR.phos, 2.6);
    c.font = `13px ${FONT_MONO}`;
    c.textAlign = 'left';
    c.fillStyle = COLOR.warmDim; c.fillText(tx('measPair1'), Q2.x0 + 150, y2(m1[Math.round(150 / pairs.binUs)]) + 28);
    c.fillStyle = COLOR.phos; c.fillText(tx('measPair2'), Q2.x0 + 150, y2(m2[Math.round(150 / pairs.binUs)]) - 14);
    c.fillStyle = COLOR.mute; c.textAlign = 'center';
    for (const us of [0, 100, 200, 300, 400]) c.fillText(`${us}`, Q2.x0 + (us / 400) * (Q2.x1 - Q2.x0), Q2.y1 + 18);

    // ---- Q3: what is left before the second pulse, for every gap (tap a bar)
    const slot = (Q3.x1 - Q3.x0) / pairs.gaps.length;
    const y3 = (v) => Q3.y1 - (Math.min(v, 55) / 55) * (Q3.y1 - Q3.y0);
    c.font = `14px ${FONT_MONO}`; c.fillStyle = COLOR.mute; c.textAlign = 'left';
    c.fillText(tx('measPairChartP3'), Q3.x0, 336);
    pairs.gaps.forEach((gg, i) => {
      const v = pairs.pairs[String(gg)].carry;
      const x = Q3.x0 + i * slot + 10;
      const on = i === gi;
      c.fillStyle = on ? COLOR.phos : COLOR.phosDim;
      c.fillRect(x, y3(v), slot - 20, Math.max(2, Q3.y1 - y3(v)));
      c.textAlign = 'center';
      c.fillStyle = on ? COLOR.warm : COLOR.mute;
      c.fillText(`${fmt(v, v < 10 ? 1 : 0)}`, x + (slot - 20) / 2, y3(v) - 8);
      c.fillText(`${gg}`, x + (slot - 20) / 2, Q3.y1 + 18);
    });

    // ---- a finger on the second chart: the two answers and what separates them
    if (cursor2Us !== null) {
      const i = Math.min(P.p1[0].length - 1, Math.round(cursor2Us / pairs.binUs));
      const a1 = mean(P.p1, i);
      const a2 = mean(P.p2, i);
      const x = Q2.x0 + (cursor2Us / 400) * (Q2.x1 - Q2.x0);
      c.strokeStyle = COLOR.warm; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, Q2.y0); c.lineTo(x, Q2.y1); c.stroke();
      c.fillStyle = COLOR.warmDim; c.beginPath(); c.arc(x, y2(a1), 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = COLOR.phos; c.beginPath(); c.arc(x, y2(a2), 5, 0, Math.PI * 2); c.fill();
      const label = `${fmt(cursor2Us, 0)} µs · Δ ${a2 - a1 >= 0 ? '+' : ''}${fmt(a2 - a1, 0)} mV`;
      c.font = `500 16px ${FONT_MONO}`;
      const w = c.measureText(label).width + 20;
      const lx = Math.max(Q2.x0, Math.min(Q2.x1 - w, x + 10));
      c.fillStyle = 'rgba(5, 7, 6, 0.85)'; c.fillRect(lx, Q2.y1 - 40, w, 28);
      c.strokeStyle = COLOR.warm; c.strokeRect(lx + 0.5, Q2.y1 - 39.5, w - 1, 27);
      c.fillStyle = COLOR.warm; c.textAlign = 'left'; c.fillText(label, lx + 10, Q2.y1 - 20);
    }

    // ---- the finger: a cursor along the time axis and its voltage
    if (cursorUs !== null) {
      const idx = Math.max(0, Math.min(nb - 1, Math.round((cursorUs - US0) / pairs.binUs)));
      const v = tailMean[idx];
      const x = qx(cursorUs);
      c.strokeStyle = COLOR.warm; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, Q1.y0); c.lineTo(x, Q1.y1); c.stroke();
      c.fillStyle = COLOR.warm;
      c.beginPath(); c.arc(x, y1(v), 7, 0, Math.PI * 2); c.fill();
      const label = `${fmt(cursorUs, 0)} µs · ${fmt(v, 0)} mV`;
      c.font = `500 17px ${FONT_MONO}`;
      const w = c.measureText(label).width + 20;
      const lx = Math.max(Q1.x0, Math.min(Q1.x1 - w, x + 12));
      c.fillStyle = 'rgba(5, 7, 6, 0.85)'; c.fillRect(lx, Q1.y0 + 50, w, 28);
      c.strokeStyle = COLOR.warm; c.strokeRect(lx + 0.5, Q1.y0 + 50.5, w - 1, 27);
      c.fillStyle = COLOR.warm; c.textAlign = 'left'; c.fillText(label, lx + 10, Q1.y0 + 70);
    }
    c.font = `13px ${FONT_MONO}`; c.fillStyle = COLOR.mute; c.textAlign = 'left';
    c.fillText(tx('measPairTouchHint'), Q1.x0, 590);
  }

  function draw(now) {
    if (view === 'pair' && pairs) { drawPair(now); return; }
    const c = fitCanvas(canvas, W, H);
    c.clearRect(0, 0, W, H);
    const ph = playhead(now);
    const k = shownPulse();

    // ---- A: the pulse that starts
    const aLo = dev ? -150 : 0;
    const aHi = dev ? 150 : 560;
    const ya = (v) => A.y1 - ((Math.max(aLo, Math.min(aHi, v)) - aLo) / (aHi - aLo)) * (A.y1 - A.y0);
    c.font = `14px ${FONT_MONO}`;
    c.fillStyle = COLOR.mute;
    c.textAlign = 'left';
    c.fillText(tx(dev ? 'measChartADev' : 'measChartA', MAG), A.x0, 20);
    c.strokeStyle = COLOR.lineSoft;
    c.lineWidth = 1;
    for (const t of [0.01, 0.1, 1, 10]) {
      const x = px(t, A.x0, A.x1);
      c.beginPath(); c.moveTo(x, A.y0); c.lineTo(x, A.y1); c.stroke();
      c.fillStyle = COLOR.mute;
      c.textAlign = 'center';
      c.fillText(`${fmt(t, t < 0.1 ? 2 : t < 1 ? 1 : 0)} ms`, x, A.y1 + 18);
    }
    for (const v of (dev ? [-100, 0, 100] : [0, 250, 500])) {
      c.beginPath(); c.moveTo(A.x0, ya(v)); c.lineTo(A.x1, ya(v)); c.stroke();
      c.textAlign = 'right';
      c.fillStyle = COLOR.mute;
      c.fillText(`${v}`, A.x0 - 8, ya(v) + 4);
    }
    const trace = (arr, mean, tArr, yfn, P, color, width, alpha) => {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.globalAlpha = alpha;
      c.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const x = px(tArr[i], P.x0, P.x1);
        const y = yfn(dev ? (arr[i] - mean[i]) * MAG : arr[i]);
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
      c.globalAlpha = 1;
    };
    const step = dev ? 4 : 10;
    for (let i = 0; i < n; i += step) if (i !== k) trace(pulses.rise[i], riseMean, rise.tMs, ya, A, COLOR.phosDim, 1.1, dev ? 0.35 : 0.5);
    if (!dev) trace(riseMean, riseMean, rise.tMs, ya, A, COLOR.warm, 2, 0.9);
    trace(pulses.rise[k], riseMean, rise.tMs, ya, A, COLOR.phos, 2.6, 1);
    c.font = `15px ${FONT_MONO}`;
    c.fillStyle = COLOR.phos;
    if (!dev) {
      c.textAlign = 'left';
      c.fillText(tx('measFast'), px(0.0035, A.x0, A.x1), ya(95));
      c.textAlign = 'right';
      c.fillText(tx('measSlow'), px(9.5, A.x0, A.x1), ya(425));
    }

    // the chip that switches the view
    c.strokeStyle = COLOR.phosDim;
    c.lineWidth = 1;
    c.fillStyle = dev ? COLOR.phos : 'rgba(134, 255, 168, 0.06)';
    c.fillRect(CHIP.x, CHIP.y, CHIP.w, CHIP.h);
    c.strokeRect(CHIP.x + 0.5, CHIP.y + 0.5, CHIP.w - 1, CHIP.h - 1);
    c.font = `13px ${FONT_MONO}`;
    c.textAlign = 'center';
    c.fillStyle = dev ? COLOR.ink : COLOR.phos;
    c.fillText(tx(dev ? 'measChipBack' : 'measChipDev', MAG), CHIP.x + CHIP.w / 2, CHIP.y + 18);

    // ---- B: after the pulse ends
    const bLo = dev ? -150 : -20;
    const bHi = dev ? 150 : 120;
    const yb = (v) => B.y1 - ((Math.max(bLo, Math.min(bHi, v)) - bLo) / (bHi - bLo)) * (B.y1 - B.y0);
    c.font = `14px ${FONT_MONO}`;
    c.fillStyle = COLOR.mute;
    c.textAlign = 'left';
    c.fillText(tx('measChartB'), B.x0, 336);
    c.strokeStyle = COLOR.lineSoft;
    for (const t of [0.01, 0.1, 1, 10]) {
      const x = px(t, B.x0, B.x1);
      c.beginPath(); c.moveTo(x, B.y0); c.lineTo(x, B.y1); c.stroke();
      c.fillStyle = COLOR.mute;
      c.textAlign = 'center';
      c.fillText(fmt(t, t < 0.1 ? 2 : t < 1 ? 1 : 0), x, B.y1 + 18);
    }
    c.beginPath(); c.moveTo(B.x0, yb(0)); c.lineTo(B.x1, yb(0)); c.stroke();
    for (let i = 0; i < n; i += step) if (i !== k) trace(pulses.fall[i], fallMean, fall.tMs, yb, B, COLOR.phosDim, 1.1, dev ? 0.35 : 0.5);
    if (!dev) trace(fallMean, fallMean, fall.tMs, yb, B, COLOR.warm, 2, 0.9);
    trace(pulses.fall[k], fallMean, fall.tMs, yb, B, COLOR.phos, 2.6, 1);

    // ---- C: the end level of every one of the 200 pulses (tap to pick one)
    const yc = (v) => C.y1 - ((Math.max(C.lo, Math.min(C.hi, v)) - C.lo) / (C.hi - C.lo)) * (C.y1 - C.y0);
    const xc = (i) => C.x0 + (i / (n - 1)) * (C.x1 - C.x0);
    c.fillStyle = COLOR.mute;
    c.textAlign = 'left';
    c.font = `14px ${FONT_MONO}`;
    c.fillText(tx('measChartC'), C.x0, 336);
    c.strokeStyle = COLOR.lineSoft;
    for (const v of [500, 520, 540]) {
      c.beginPath(); c.moveTo(C.x0, yc(v)); c.lineTo(C.x1, yc(v)); c.stroke();
      c.textAlign = 'right';
      c.fillStyle = COLOR.mute;
      c.fillText(`${v}`, C.x0 - 6, yc(v) + 4);
    }
    if (pick === null) {
      c.fillStyle = 'rgba(134, 255, 168, 0.10)';
      c.fillRect(xc(pulses.audioFirst), C.y0, xc(pulses.audioFirst + 19) - xc(pulses.audioFirst), C.y1 - C.y0);
    }
    c.strokeStyle = COLOR.warmDim;
    c.lineWidth = 1.2;
    c.beginPath();
    data.endOfHighMv.forEach((v, i) => { if (i === 0) c.moveTo(xc(i), yc(v)); else c.lineTo(xc(i), yc(v)); });
    c.stroke();
    c.fillStyle = COLOR.phos;
    c.beginPath(); c.arc(xc(k), yc(data.endOfHighMv[k]), 5, 0, Math.PI * 2); c.fill();
    if (pick !== null) {
      c.strokeStyle = COLOR.phos;
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(xc(k), C.y0); c.lineTo(xc(k), C.y1); c.stroke();
    }
    c.fillStyle = COLOR.mute;
    c.textAlign = 'center';
    c.fillText(tx('measPulseNo', k + 1), (C.x0 + C.x1) / 2, C.y1 + 18);

    // ---- the dot that runs in step with the slowed sound
    if (ph.live && pick === null) {
      const ms = ph.sec * 1000 - PREROLL_MS;
      let x = null;
      let y = null;
      if (ms > T_MIN && ms <= 10) {
        const v = valueAt(ms, pulses.rise[k], rise.tMs);
        x = px(ms, A.x0, A.x1);
        y = ya(dev ? (v - valueAt(ms, riseMean, rise.tMs)) * MAG : v);
      } else if (ms > 10 && ms - 10 <= 10) {
        const f = ms - 10;
        const v = valueAt(f, pulses.fall[k], fall.tMs);
        x = px(f, B.x0, B.x1);
        y = yb(dev ? (v - valueAt(f, fallMean, fall.tMs)) * MAG : v);
      }
      if (x !== null) {
        c.fillStyle = COLOR.warm;
        c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill();
      }
    }

    // ---- the finger: a cursor with a reading (and the tone, made in touchAt)
    if (cursor) {
      const isA = cursor.panel === 'A';
      const P = isA ? A : B;
      const yfn = isA ? ya : yb;
      const curve = isA ? pulses.rise[k] : pulses.fall[k];
      const mean = isA ? riseMean : fallMean;
      const tArr = isA ? rise.tMs : fall.tMs;
      const x = px(cursor.ms, P.x0, P.x1);
      const v = valueAt(cursor.ms, curve, tArr);
      const shown = dev ? v - valueAt(cursor.ms, mean, tArr) : v;
      const y = yfn(dev ? shown * MAG : v);
      c.strokeStyle = COLOR.warm;
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, P.y0); c.lineTo(x, P.y1); c.stroke();
      c.fillStyle = COLOR.warm;
      c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill();
      const label = `${fmt(cursor.ms, cursor.ms < 0.1 ? 3 : 2)} ms · ${dev ? `Δ ${shown >= 0 ? '+' : ''}` : ''}${fmt(shown, 1)} mV`;
      c.font = `500 17px ${FONT_MONO}`;
      const w = c.measureText(label).width + 20;
      const lx = Math.max(P.x0, Math.min(P.x1 - w, x + 12));
      const ly = Math.max(P.y0 + 4, Math.min(P.y1 - 34, y - 40));
      c.fillStyle = 'rgba(5, 7, 6, 0.85)';
      c.fillRect(lx, ly, w, 28);
      c.strokeStyle = COLOR.warm;
      c.strokeRect(lx + 0.5, ly + 0.5, w - 1, 27);
      c.fillStyle = COLOR.warm;
      c.textAlign = 'left';
      c.fillText(label, lx + 10, ly + 20);
    }

    // ---- a line that says what a finger can do
    c.font = `13px ${FONT_MONO}`;
    c.fillStyle = COLOR.mute;
    c.textAlign = 'left';
    c.fillText(tx('measTouchHint'), A.x0, 590);
  }

  refreshButtons();
  return {
    draw,
    stop,
    isPlaying: () => !!(mode || withModel || tone),
    refresh: refreshButtons,
    /** Entered by a tap on the tab (a user gesture): the most interesting sound starts at once. */
    enter() { stop(); pick = null; dev = true; view = 'pulse'; cursorUs = null; cursor2Us = null; auto = true; mode = 'slow'; withModel = true; play(); },
  };
}
