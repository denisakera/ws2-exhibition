/**
 * "200 odpovědí": the recorded pulses of 19 Oct 2026 (our own ESP32 rig and a Rigol oscilloscope), stacked one under
 * another like the plot of pulsar CP 1919 (H. Craft, 1970). Two samples of the same material:
 *
 *   burst      the 200 pulses of one burst. Each line is one pulse: its deviation from the average pulse in how fast the
 *              voltage changes around the pulse's edge (data/ws2-edges.json, mV per microsecond), magnified. The edges
 *              of the picture are calmed as an artistic choice (a button switches that off, and the page says so).
 *   afternoon  the 73 captures of the whole afternoon, in the order they were recorded (data/ws2-afternoon.json,
 *              tools/make_ws2_afternoon.py). Each line is the first pulse of one capture: its difference from the average
 *              of all of them, in millivolts. The shifts between lines are the drift of the whole circuit (sample, probe,
 *              wires, temperature ...) and are not attributed to the material.
 *
 * Colours show when a line came, or how large its deviation was. Sound is an artistic mapping (pitch follows the
 * deviation). Recorded data, not live; the deviation is the sample and the instrument together.
 */
import { fitCanvas } from './canvas.js';
import { tx, getLang } from './copy.js';

const W = 1760;
const H = 650;
const G = { left: 96, right: 1664, top: 78, bottom: 580 };
const MAGS = { burst: [30, 60, 100], aft: [1, 2, 4] };
const N_BURST_LINES = 80;

const PALETTES = [
  [[141, 107, 255], [76, 195, 255], [134, 255, 168], [239, 232, 214], [255, 176, 92], [255, 111, 165]],
  [[70, 20, 130], [190, 30, 110], [255, 80, 40], [255, 170, 40], [255, 240, 170]],
  [[40, 70, 200], [0, 140, 220], [0, 210, 205], [140, 255, 200], [240, 255, 235]],
  [[255, 0, 170], [160, 60, 255], [0, 200, 255], [0, 255, 160], [220, 255, 0]],
  [[60, 255, 160], [40, 200, 255], [140, 100, 255], [255, 100, 200]],
];

export async function loadAnswers(url = 'data/ws2-edges.json') {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
export async function loadAfternoon(url = 'data/ws2-afternoon.json') {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

export function initAnswers({ data, afternoon, touch }) {
  const $ = (s) => document.querySelector(s);
  const cv = $('#cv-ans');
  const section = $('#answers');
  let set = 'burst';              // 'burst' | 'aft'
  let sig = 'fall';
  let magIdx = 1;
  let envelope = true;
  let palette = 0;
  let colorBy = 'time';
  let dev = null;
  let tms = null;
  let devSize = null;
  let hot = -1;
  let down = false;
  let spread = 0;
  let center = 0;
  let target = null;
  let introAt = performance.now();
  let playing = false;
  let playFrom = 0;
  let lastPlayed = -1;
  let lastLine = -1;
  let ctx = null;
  let voice = null;
  const isAft = () => set === 'aft';
  const nLines = () => (isAft() ? dev.length : N_BURST_LINES);
  const pulseOf = (k) => (isAft() ? Math.round(k) : Math.round((Math.round(k) * (dev.length - 1)) / (N_BURST_LINES - 1)));
  const lineOf = (pi) => (isAft() ? pi : (pi * (N_BURST_LINES - 1)) / (dev.length - 1));

  // ---- sound: every action answers with a sound -----------------------------------------------
  const audio = () => { if (!ctx) ctx = new AudioContext(); ctx.resume(); return ctx; };
  function blip(f = 660, dur = 0.07, vol = 0.07, type = 'sine') {
    const a = audio();
    const t = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  const NOTE = (semi) => 261.63 * Math.pow(2, semi / 12);
  function voiceFor(pi) {
    const a = audio();
    const now = a.currentTime;
    if (voice) { voice.g.gain.cancelScheduledValues(now); voice.g.gain.setTargetAtTime(0, now, 0.03); voice.o.stop(now + 0.2); }
    const o = a.createOscillator();
    const g = a.createGain();
    const d = dev[pi];
    const scale = isAft() ? 0.16 : 0.9;                 // semitones per unit of deviation
    const curve = new Float32Array(d.length);
    for (let j = 0; j < d.length; j++) curve[j] = 220 * Math.pow(2, Math.max(-12, Math.min(12, d[j] * scale)) / 12) * (1 + 0.04 * pi / Math.max(1, dev.length - 1));
    o.type = 'sine';
    o.frequency.setValueCurveAtTime(curve, now, 0.55);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.14, now + 0.04);
    g.gain.setTargetAtTime(0, now + 0.45, 0.06);
    o.connect(g).connect(a.destination);
    o.start(now);
    o.stop(now + 0.7);
    voice = { o, g };
  }

  // ---- data -----------------------------------------------------------------------------------
  function prepare() {
    if (isAft()) {
      const P = afternoon.captures.map((c) => c.mv);
      const n = P.length;
      const m = P[0].length;
      const mean = Array.from({ length: m }, (_, j) => P.reduce((a, r) => a + r[j], 0) / n);
      dev = P.map((r) => r.map((v, j) => v - mean[j]));
      tms = P[0].map((_, j) => afternoon.startUs + afternoon.stepUs * j);
    } else {
      const P = data[sig].map((r) => r.map((v) => (sig === 'fall' ? -v : v)));   // the falling edge flipped: its peak points up
      const n = P.length;
      const m = P[0].length;
      const mean = Array.from({ length: m }, (_, j) => P.reduce((a, r) => a + r[j], 0) / n);
      dev = P.map((r) => {
        const d = r.map((v, j) => v - mean[j]);
        return d.map((_, j) => (d[Math.max(0, j - 1)] + d[j] + d[Math.min(m - 1, j + 1)]) / 3);
      });
      tms = P[0].map((_, j) => data.windowUs[0] + data.dtUs * (j + 1));
    }
    const sz = dev.map((r) => Math.sqrt(r.reduce((a, v) => a + v * v, 0) / r.length));
    const lo = Math.min(...sz);
    const hi = Math.max(...sz);
    devSize = sz.map((v) => (v - lo) / (hi - lo || 1));
  }
  prepare();

  function rgbAt(f) {
    const S = PALETTES[palette];
    const x = Math.max(0, Math.min(0.9999, f)) * (S.length - 1);
    const i = Math.floor(x);
    const t = x - i;
    return S[i].map((v, k) => Math.round(v + (S[i + 1][k] - v) * t));
  }
  const colorPos = (pi) => (colorBy === 'time' ? pi / (dev.length - 1) : devSize[pi]);
  const lineColor = (pi, a = 1) => { const c = rgbAt(colorPos(pi)); return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`; };
  const tint = (pi) => { const c = rgbAt(colorPos(pi)).map((v) => Math.round(7 + v * 0.14)); return `rgb(${c[0]}, ${c[1] + 1}, ${c[2] + 1})`; };

  // ---- texts ----------------------------------------------------------------------------------
  const num = (v, d = 1) => v.toFixed(d).replace('.', getLang() === 'cs' ? ',' : '.');
  function captureLabel(cap) {
    const v = cap.value;
    if (cap.mode === 'reference' || cap.mode === 'fastref') return tx('ansTypeRef');
    if (cap.mode === 'fastpairs') return tx('ansTypePair', v, 'µs');
    if (cap.mode === 'pairs') return tx('ansTypePair', v, 'ms');
    if (cap.mode === 'conditioning') return tx('ansTypeCond', v);
    return tx('ansTypeRec', v);
  }
  function refresh() {
    const a = isAft();
    section.classList.toggle('aft', a);
    $('#ans-title').textContent = tx(a ? 'ansAftTitle' : 'ansTitle');
    $('#ans-sub').textContent = tx(a ? 'ansAftSub' : 'ansSub');
    $('#ans-ref').textContent = tx(a ? 'ansAftRef' : 'ansRef');
    $('#ans-note').textContent = tx(a ? 'ansAftNote' : 'ansNote');
    $('#ans-set').textContent = tx('ansSet', tx('ansSetNames')[a ? 1 : 0]);
    $('#ans-fall').textContent = tx('ansFall');
    $('#ans-rise').textContent = tx('ansRise');
    $('#ans-fall').classList.toggle('on', sig === 'fall');
    $('#ans-rise').classList.toggle('on', sig === 'rise');
    $('#ans-mag').textContent = tx('ansMag', MAGS[set][magIdx]);
    $('#ans-env').textContent = tx('ansEnv');
    $('#ans-env').classList.toggle('on', envelope);
    $('#ans-pal').textContent = tx('ansPal', tx('ansPalNames')[palette]);
    $('#ans-by').textContent = tx(colorBy === 'time' ? (a ? 'ansByOrder' : 'ansByTime') : 'ansBySize');
    $('#ans-story').textContent = tx('ansStoryBtn');
    $('#ans-play').textContent = tx(playing ? 'ansStop' : (a ? 'ansAftPlay' : 'ansPlay'));
    $('#ans-play').classList.toggle('on', playing);
    readout();
  }
  function readout() {
    const a = isAft();
    if (playing) { $('#ans-read').textContent = tx(a ? 'ansAftPlaying' : 'ansPlaying', Math.max(0, hot) + 1); return; }
    if (hot < 0) { $('#ans-read').textContent = tx('ansIdle'); return; }
    if (a) {
      const t0 = Date.parse(afternoon.captures[0].utc);
      const cap = afternoon.captures[hot];
      $('#ans-read').textContent = tx('ansAftHover', hot + 1, afternoon.captures.length, num((Date.parse(cap.utc) - t0) / 60000), captureLabel(cap));
    } else {
      $('#ans-read').textContent = tx('ansHover', hot + 1, num(Math.max(...dev[hot].map(Math.abs))));
    }
  }

  // ---- drawing --------------------------------------------------------------------------------
  function draw(now) {
    const c = fitCanvas(cv, W, H);
    c.clearRect(0, 0, W, H);
    const a = isAft();
    const n = dev.length;
    const m = dev[0].length;
    const L = nLines();
    const dy = (G.bottom - G.top) / (L - 1);
    const amp = a ? (H / 620) * 0.35 * MAGS.aft[magIdx] : (H / 620) * 0.11 * MAGS.burst[magIdx];
    const t0 = a ? afternoon.startUs : -80;
    const t1 = a ? afternoon.startUs + afternoon.stepUs * (m - 1) : 80;
    const xs = tms.map((t) => G.left + ((t - t0) / (t1 - t0)) * (G.right - G.left));
    const win = tms.map((t) => (a ? 1 : Math.exp(-0.5 * Math.pow(t / 20, 2))));
    const intro = Math.min(1, (now - introAt) / 2600);
    c.save();
    c.beginPath(); c.rect(G.left, 0, G.right - G.left, H); c.clip();
    c.lineJoin = 'round';
    const partPx = Math.min(26, dy * 5) * spread;
    for (let k = 0; k < L; k++) {
      const pi = pulseOf(k);
      const f = Math.max(0, Math.min(1, (intro - (k / L) * 0.75) / 0.25));
      if (f <= 0) continue;
      const dist = k - center;
      const part = k === Math.round(center) ? 0 : Math.sign(dist) * partPx * Math.exp(-Math.pow(dist / 3.2, 2));
      const base = G.top + k * dy + part - (1 - f) * 40;
      const y = (j) => base - dev[pi][j] * amp * (envelope || a ? win[j] : 1) * f;
      c.beginPath();
      c.moveTo(xs[0], y(0));
      for (let j = 1; j < m; j++) c.lineTo(xs[j], y(j));
      c.save();
      c.lineTo(xs[m - 1], base + dy * 1.5);
      c.lineTo(xs[0], base + dy * 1.5);
      c.closePath();
      c.fillStyle = tint(pi);
      c.fill();
      c.restore();
      c.beginPath();
      c.moveTo(xs[0], y(0));
      for (let j = 1; j < m; j++) c.lineTo(xs[j], y(j));
      const on = pi === hot;
      c.strokeStyle = on ? '#ffffff' : lineColor(pi, 0.55 + 0.45 * f);
      c.lineWidth = on ? 3 : 1.6;
      c.shadowColor = on ? lineColor(pi) : lineColor(pi, 0.9);
      c.shadowBlur = on ? 20 : (L > 100 ? 0 : 7);
      c.stroke();
      c.shadowBlur = 0;
    }
    c.restore();
    c.font = "13px 'IBM Plex Mono', monospace";
    c.fillStyle = '#6d756e';
    c.textAlign = 'center';
    const ticks = a ? [-100, 0, 100, 200, 300] : [-60, -30, 0, 30, 60];
    for (const t of ticks) c.fillText(`${t > 0 ? '+' : t < 0 ? '−' : ''}${Math.abs(t)} µs`, G.left + ((t - t0) / (t1 - t0)) * (G.right - G.left), G.bottom + 28);

    // the chosen line alone: its real deviation from the average
    if (hot >= 0) {
      const bw = 380;
      const bh = 120;
      const bx = W - bw - 6;
      const by = 0;
      c.fillStyle = 'rgba(5, 6, 6, 0.92)';
      c.fillRect(bx, by, bw, bh);
      c.strokeStyle = '#24302a'; c.lineWidth = 1; c.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      const dmax = Math.max(a ? 20 : 8, ...dev[hot].map(Math.abs));
      c.beginPath();
      for (let j = 0; j < m; j++) {
        const x = bx + 12 + (j / (m - 1)) * (bw - 24);
        const yy = by + bh / 2 + 8 - (dev[hot][j] / dmax) * (bh / 2 - 26);
        if (j === 0) c.moveTo(x, yy); else c.lineTo(x, yy);
      }
      c.strokeStyle = lineColor(hot); c.lineWidth = 1.8; c.stroke();
      c.fillStyle = '#a8a290'; c.textAlign = 'left'; c.font = "13px 'IBM Plex Mono', monospace";
      c.fillText(`#${hot + 1}  ±${dmax.toFixed(0)} ${a ? 'mV' : 'mV/µs'}`, bx + 12, by + 18);
    }
  }

  // ---- the finger ----------------------------------------------------------------------------
  const logical = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const lineAt = (y) => Math.max(0, Math.min(nLines() - 1, ((y - G.top) / (G.bottom - G.top)) * (nLines() - 1)));

  function move(e) {
    if (playing) return;
    touch();
    const k = lineAt(logical(e).y);
    target = k;
    const pi = pulseOf(k);
    if (Math.round(k) !== lastLine) {
      lastLine = Math.round(k);
      if (!down) blip(1300 + 6 * lastLine, 0.012, 0.018, 'triangle');      // a comb: a soft tick for every line
    }
    if (pi !== hot) { hot = pi; readout(); if (down) voiceFor(pi); }
  }
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerdown', (e) => { down = true; cv.setPointerCapture(e.pointerId); move(e); if (!playing) voiceFor(pulseOf(lineAt(logical(e).y))); });
  const up = () => { down = false; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (!down && !playing) { target = null; hot = -1; lastLine = -1; readout(); } });

  // ---- buttons -------------------------------------------------------------------------------
  const reset = () => { introAt = performance.now(); hot = -1; target = null; playing = false; lastLine = -1; };
  const pick = (s) => { touch(); sig = s; prepare(); reset(); blip(s === 'fall' ? NOTE(0) : NOTE(7), 0.18, 0.09); refresh(); };
  $('#ans-fall').addEventListener('click', () => pick('fall'));
  $('#ans-rise').addEventListener('click', () => pick('rise'));
  $('#ans-set').addEventListener('click', () => {
    touch();
    set = isAft() ? 'burst' : 'aft';
    magIdx = isAft() ? 1 : 1;
    prepare(); reset();
    blip(isAft() ? NOTE(9) : NOTE(2), 0.2, 0.09);
    refresh();
  });
  $('#ans-mag').addEventListener('click', () => { touch(); magIdx = (magIdx + 1) % MAGS[set].length; blip(NOTE(magIdx * 5), 0.08, 0.08, 'triangle'); refresh(); });
  $('#ans-env').addEventListener('click', () => { touch(); envelope = !envelope; blip(envelope ? NOTE(12) : NOTE(-5), 0.12, 0.09); refresh(); });
  $('#ans-pal').addEventListener('click', () => { touch(); palette = (palette + 1) % PALETTES.length; blip(NOTE(palette * 3), 0.16, 0.09); refresh(); });
  $('#ans-by').addEventListener('click', () => { touch(); colorBy = colorBy === 'time' ? 'size' : 'time'; blip(colorBy === 'time' ? NOTE(2) : NOTE(9), 0.12, 0.08); refresh(); });
  const story = (open) => $('#ans-story-card').classList.toggle('open', open);
  $('#ans-story').addEventListener('click', () => { touch(); blip(NOTE(9), 0.1, 0.08); story(true); });
  $('#ans-story-close').addEventListener('click', () => { touch(); blip(NOTE(2), 0.08, 0.07); story(false); });
  $('#ans-story-card').addEventListener('pointerdown', (e) => { if (e.target.id === 'ans-story-card') { touch(); story(false); } });
  $('#ans-play').addEventListener('click', () => {
    touch();
    playing = !playing;
    playFrom = performance.now();
    lastPlayed = -1;
    blip(NOTE(7), 0.08, 0.09);
    if (!playing) { target = null; hot = -1; }
    refresh();
  });

  function frame(now) {
    if (playing) {
      const per = isAft() ? 150 : 90;                   // ms per line: the recording, slowed so that it can be followed
      const total = dev.length;
      const i = Math.floor((now - playFrom) / per);
      if (i >= total) { playing = false; target = null; hot = -1; refresh(); }
      else {
        hot = i;
        target = lineOf(i);
        if (i !== lastPlayed) { lastPlayed = i; blip(NOTE(-12 + (i % 12)), 0.05, 0.05, 'triangle'); if (i % 4 === 0) voiceFor(i); readout(); }
      }
    }
    spread += ((target === null ? 0 : 1) - spread) * 0.14;
    if (target !== null) center += (target - center) * 0.28;
    draw(now);
  }

  if (!afternoon) $('#ans-set').style.display = 'none';
  refresh();
  return {
    draw: frame,
    refresh,
    isPlaying: () => playing || down,
    stop() { story(false); playing = false; down = false; target = null; hot = -1; if (voice) { try { voice.o.stop(); } catch { /* done */ } voice = null; } },
    enter() { story(false); set = 'burst'; sig = 'fall'; magIdx = 1; prepare(); reset(); refresh(); },
  };
}
