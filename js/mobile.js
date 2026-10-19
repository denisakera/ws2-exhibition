/**
 * Phone version of "Může hmota počítat?" (mobile.html): one scrolling page with the simulation, the recorded sounds,
 * the stack of 200 answers and the finale cards. It reuses the installation's model, texts, voice and data.
 * Everything here is simulation or recorded measurement, nothing is live.
 */
import { tx, getLang, setLang, onLang, applyCopy } from './expo/copy.js';
import { loadModel, runDigit, liveliestNodes } from './expo/model.js';
import { inkTo8x8 } from './expo/preprocess.js';
import { createDrawSurface } from './expo/draw.js';
import { fitCanvas } from './expo/canvas.js';
import { playModel, playBuffer, loadBuffer } from './expo/sonify.js';
import { meanSlow } from './expo/scope.js';
import * as voice from './expo/voice.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const getJson = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(u)))).catch(() => null);

// the web version speaks Czech unless the phone is set to another language
const nav = (navigator.language || 'cs').toLowerCase();
if (!nav.startsWith('cs') && !nav.startsWith('sk')) setLang('en');

let model = null;
let lastRun = null;
let ctx = null;
const audio = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume(); return ctx; };

// ------------------------------------------------------------------ one sound at a time
let live = null;                 // { stop }
let liveKey = null;
let liveTimer = 0;
function stopSound() {
  clearTimeout(liveTimer);
  live?.stop();
  live = null;
  liveKey = null;
  refreshSound();
}
function startSound(key, player, ms = 0) {
  stopSound();
  voice.stop();
  live = player;
  liveKey = key;
  if (ms) liveTimer = setTimeout(stopSound, ms);
  refreshSound();
}

// ------------------------------------------------------------------ simulation
const pad = $('#cv-draw');
const surface = createDrawSurface(pad, { onChange: onDraw });
const prev = $('#cv-prev');
let img8 = null;
let runToken = 0;

function drawPreview() {
  const c = prev.getContext('2d');
  c.clearRect(0, 0, 64, 64);
  if (!img8) return;
  for (let i = 0; i < 64; i++) {
    const v = img8[i] / 255;
    c.fillStyle = `rgba(239,232,214,${0.08 + 0.92 * v})`;
    c.fillRect((i % 8) * 8, Math.floor(i / 8) * 8, 7, 7);
  }
}
function onDraw(kind) {
  if (kind === 'up' || kind === 'clear') {
    img8 = surface.hasInk ? inkTo8x8(surface.getInk(), surface.inkSize, surface.inkSize) : null;
    drawPreview();
  }
  $('#btn-send').disabled = !surface.hasInk;
  if (kind === 'down') $('#sim-msg').textContent = '';
}
$('#btn-clear').addEventListener('click', () => { surface.clear(); $('#sim-msg').textContent = ''; });
$('#btn-send').disabled = true;
new ResizeObserver(() => surface.redraw()).observe(pad);

$('#btn-send').addEventListener('click', () => {
  img8 = surface.hasInk ? inkTo8x8(surface.getInk(), surface.inkSize, surface.inkSize) : null;
  drawPreview();
  if (!img8) { $('#sim-msg').textContent = tx('tooSmall'); return; }
  if (!model) return;
  audio();                                           // unlock sound on the visitor's touch
  lastRun = runDigit(model, img8);
  refreshSound();
  $('#run').hidden = false;
  $('#result').hidden = true;
  $('#run-label').textContent = tx('mobRunning');
  $('#run').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const token = ++runToken;
  const t0 = performance.now();
  const tick = (now) => {
    if (token !== runToken) return;
    const p = Math.min(1, (now - t0) / 2600);
    drawTraces(p);
    if (p < 1) requestAnimationFrame(tick); else showResult();
  };
  requestAnimationFrame(tick);
});

function drawTraces(p) {
  const cv = $('#cv-run');
  const w = cv.clientWidth, h = cv.clientHeight;
  const c = fitCanvas(cv, w, h);
  c.clearRect(0, 0, w, h);
  if (!lastRun) return;
  const { x, steps } = lastRun;
  const n = model.n;
  const nodes = liveliestNodes(lastRun, n, 6);
  const upto = Math.max(2, Math.floor(steps * p));
  c.lineWidth = 1.5;
  nodes.forEach((node, k) => {
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t < steps; t++) { const v = x[t * n + node]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const rowH = (h - 20) / nodes.length;
    const top = 10 + k * rowH;
    c.strokeStyle = `rgba(134,255,168,${0.95 - k * 0.1})`;
    c.beginPath();
    for (let t = 0; t < upto; t++) {
      const px = 8 + ((w - 16) * t) / (steps - 1);
      const py = top + rowH * 0.9 - ((x[t * n + node] - lo) / (hi - lo || 1)) * rowH * 0.8;
      if (t === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.stroke();
  });
  c.fillStyle = '#6d756e';
  c.font = '10px IBM Plex Mono, monospace';
  c.fillText(tx('mobTraces'), 8, h - 4);
}

function showResult() {
  const r = lastRun;
  $('#run-label').textContent = '';
  $('#result').hidden = false;
  $('#res-lead').textContent = tx(r.unsure ? 'resultUnsure' : 'resultLead');
  $('#res-digit').textContent = r.pred;
  const lo = Math.min(...r.scores), hi = Math.max(...r.scores);
  $('#bars').innerHTML = Array.from(r.scores, (v, d) =>
    `<div class="${d === r.pred ? 'top' : ''}" style="height:${6 + 94 * (v - lo) / (hi - lo || 1)}%"><span>${d}</span></div>`).join('');
  $('#sim-msg').textContent = r.unsure ? tx('resultUnsureHint') : '';
  refreshSound();
}

$('#btn-model').addEventListener('click', () => {
  if (liveKey === 'model-sim') { stopSound(); return; }
  playModelSound('model-sim');
});
function playModelSound(key) {
  if (!lastRun) return false;
  const a = audio();
  const nodes = liveliestNodes(lastRun, model.n, 6);
  startSound(key, playModel(a, lastRun, nodes, model.n, meanSlow(lastRun, model.n)), 10400);
  return true;
}

// ------------------------------------------------------------------ sounds of the sample
const CLIPS = [
  { key: 'model', title: 'measModelName', sub: 'measModelSub', model: true },
  { key: 'slow', title: 'measModeSlow', sub: 'measModeSlowSub', file: 'ws2_slow26' },
  { key: 'resid', title: 'measModeResid', sub: 'measModeResidSub', file: 'ws2_residual26' },
  { key: 'rest', title: 'measModeRest', sub: 'measModeRestSub', file: 'ws2_rest26' },
  { key: 'pair', title: 'measModePair', sub: 'measModePairSub', file: 'ws2_pairs_sweep' },
];
const buffers = {};
function renderClips() {
  $('#clips').innerHTML = CLIPS.map((c) =>
    `<button type="button" class="clip" data-clip="${c.key}"><i>▶</i><span><b>${tx(c.title)}</b><small>${tx(c.sub)}</small></span></button>`).join('');
  refreshSound();
}
$('#clips').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-clip]');
  if (!btn) return;
  const clip = CLIPS.find((c) => c.key === btn.dataset.clip);
  $('#clip-msg').textContent = '';
  if (liveKey === clip.key) { stopSound(); return; }
  const a = audio();
  if (clip.model) {
    if (!playModelSound(clip.key)) $('#clip-msg').textContent = tx('mobNeedRun');
    return;
  }
  try {
    buffers[clip.file] ??= await loadBuffer(a, `audio/${clip.file}.wav`);
    startSound(clip.key, playBuffer(a, buffers[clip.file], { level: 0.7, pan: 0 }));
  } catch { $('#clip-msg').textContent = '…'; }
});

function refreshSound() {
  for (const b of $$('.clip')) {
    const on = b.dataset.clip === liveKey;
    b.classList.toggle('on', on);
    b.querySelector('i').textContent = on ? '■' : '▶';
  }
  const m = $('#btn-model');
  m.textContent = tx(liveKey === 'model-sim' ? 'mobStopSound' : 'mobPlayModel');
  m.classList.toggle('on', liveKey === 'model-sim');
}

// ------------------------------------------------------------------ 200 answers
const PALETTES = [
  [[141, 107, 255], [76, 195, 255], [134, 255, 168], [239, 232, 214], [255, 176, 92], [255, 111, 165]],
  [[70, 20, 130], [190, 30, 110], [255, 80, 40], [255, 170, 40], [255, 240, 170]],
  [[40, 70, 200], [0, 140, 220], [0, 210, 205], [140, 255, 200], [240, 255, 235]],
  [[255, 0, 170], [160, 60, 255], [0, 200, 255], [0, 255, 160], [220, 255, 0]],
  [[60, 255, 160], [40, 200, 255], [140, 100, 255], [255, 100, 200]],
];
const MAGS = { burst: [30, 60, 100], aft: [1, 2, 4] };
const MAG_F = [0.55, 1, 1.7];
const N_BURST_LINES = 44;
const A = { data: null, aft: null, set: 'burst', pal: 0, mag: 1, sel: 22, dev: null, p95: 1, timer: 0 };

function prepareAnswers() {
  const aft = A.set === 'aft';
  const src = aft ? A.aft.captures.map((c) => c.mv) : A.data.fall.map((r) => r.map((v) => -v));
  const m = src[0].length;
  const mean = Array.from({ length: m }, (_, j) => src.reduce((s, r) => s + r[j], 0) / src.length);
  A.dev = src.map((r) => {
    const d = r.map((v, j) => v - mean[j]);
    return aft ? d : d.map((_, j) => (d[Math.max(0, j - 1)] + d[j] + d[Math.min(m - 1, j + 1)]) / 3);
  });
  const all = A.dev.flat().map(Math.abs).sort((a, b) => a - b);
  A.p95 = all[Math.floor(all.length * 0.95)] || 1;
  const n = nLines();
  const range = $('#a-range');
  range.max = n - 1;
  A.sel = Math.min(A.sel, n - 1);
  range.value = A.sel;
}
const ampOf = (h) => h * (A.set === 'aft' ? 0.095 : 0.075) * MAG_F[A.mag];
const nLines = () => (A.set === 'aft' ? A.dev.length : N_BURST_LINES);
const pulseOf = (k) => (A.set === 'aft' ? k : Math.round((k * (A.dev.length - 1)) / (N_BURST_LINES - 1)));
const rgbAt = (f) => {
  const P = PALETTES[A.pal];
  const x = Math.max(0, Math.min(1, f)) * (P.length - 1);
  const i = Math.min(P.length - 2, Math.floor(x));
  const t = x - i;
  return P[i].map((v, k) => Math.round(v + (P[i + 1][k] - v) * t));
};

function drawAnswers() {
  if (!A.dev) return;
  const cv = $('#cv-ans');
  const w = cv.clientWidth, h = cv.clientHeight;
  const c = fitCanvas(cv, w, h);
  c.clearRect(0, 0, w, h);
  const n = nLines();
  const amp = ampOf(h);
  const top = amp * 0.9 + 10, bottom = 14;
  const sp = (h - top - bottom) / (n - 1);
  const padX = 10;
  const m = A.dev[0].length;
  c.lineJoin = 'round';
  for (let k = 0; k < n; k++) {
    const row = A.dev[pulseOf(k)];
    const base = top + k * sp;
    const [r, g, b] = rgbAt(k / (n - 1));
    const sel = k === A.sel;
    c.beginPath();
    for (let j = 0; j < m; j++) {
      const px = padX + ((w - 2 * padX) * j) / (m - 1);
      const win = Math.pow(Math.sin((Math.PI * j) / (m - 1)), 0.6);
      const py = base - Math.max(-1.4, Math.min(1.4, row[j] / A.p95)) * amp * win;
      if (j === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.lineTo(w - padX, base + 2); c.lineTo(padX, base + 2); c.closePath();
    c.fillStyle = '#070a08';
    c.fill();
    c.beginPath();
    for (let j = 0; j < m; j++) {
      const px = padX + ((w - 2 * padX) * j) / (m - 1);
      const win = Math.pow(Math.sin((Math.PI * j) / (m - 1)), 0.6);
      const py = base - Math.max(-1.4, Math.min(1.4, row[j] / A.p95)) * amp * win;
      if (j === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.strokeStyle = sel ? '#ffffff' : `rgb(${r},${g},${b})`;
    c.lineWidth = sel ? 2.4 : 1.1;
    c.stroke();
  }
}

function answersText() {
  const aft = A.set === 'aft';
  $('#ans-sub').textContent = tx(aft ? 'ansAftSub' : 'ansSub');
  $('#a-ref').textContent = tx(aft ? 'ansAftRef' : 'ansRef');
  $('#a-note').textContent = tx(aft ? 'ansAftNote' : 'ansNote');
  $('#a-set').textContent = tx('ansSet', tx('ansSetNames')[aft ? 1 : 0]);
  $('#a-set').style.display = A.aft ? '' : 'none';
  $('#a-pal').textContent = tx('ansPal', tx('ansPalNames')[A.pal]);
  $('#a-mag').textContent = tx('ansMag', MAGS[A.set][A.mag]);
  $('#a-play').textContent = tx(A.timer ? 'ansStop' : (aft ? 'ansAftPlay' : 'ansPlay'));
  $('#a-play').classList.toggle('on', !!A.timer);
  const pi = pulseOf(A.sel);
  $('#a-read').textContent = aft
    ? tx('mobCapture', A.sel + 1, A.dev.length)
    : tx('ansHover', pi + 1, Math.max(...A.dev[pi].map(Math.abs)).toFixed(0));
}

let lastTone = 0;
function answerTone() {
  const now = performance.now();
  if (now - lastTone < 80) return;
  lastTone = now;
  const a = audio();
  const d = A.dev[pulseOf(A.sel)];
  const t = a.currentTime;
  const scale = A.set === 'aft' ? 0.16 : 0.9;
  const curve = Float32Array.from(d, (v) => 220 * Math.pow(2, Math.max(-12, Math.min(12, v * scale)) / 12) * (1 + 0.04 * A.sel / Math.max(1, nLines() - 1)));
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sine';
  o.frequency.setValueCurveAtTime(curve, t, 0.4);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.14, t + 0.03);
  g.gain.setTargetAtTime(0, t + 0.3, 0.05);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + 0.5);
}
function select(k, sound = true) {
  A.sel = Math.max(0, Math.min(nLines() - 1, k));
  $('#a-range').value = A.sel;
  answersText();
  drawAnswers();
  if (sound) answerTone();
}
function stopAnswerPlay() { clearInterval(A.timer); A.timer = 0; if (A.dev) answersText(); }

function initAnswers() {
  prepareAnswers();
  select(A.sel, false);
  $('#a-range').addEventListener('input', (e) => { stopAnswerPlay(); select(+e.target.value); });
  $('#a-set').addEventListener('click', () => { stopAnswerPlay(); A.set = A.set === 'burst' ? 'aft' : 'burst'; A.mag = 1; prepareAnswers(); select(A.sel, false); });
  $('#a-pal').addEventListener('click', () => { A.pal = (A.pal + 1) % PALETTES.length; answersText(); drawAnswers(); });
  $('#a-mag').addEventListener('click', () => { A.mag = (A.mag + 1) % 3; answersText(); drawAnswers(); });
  $('#a-play').addEventListener('click', () => {
    if (A.timer) { stopAnswerPlay(); return; }
    audio();
    select(0);
    A.timer = setInterval(() => {
      if (A.sel >= nLines() - 1) { stopAnswerPlay(); return; }
      select(A.sel + 1);
    }, 110);
    answersText();
  });
  // a tap on the picture picks the nearest line (dragging still scrolls the page)
  const cv = $('#cv-ans');
  let down = null;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down = null; return; }
    down = null;
    const r = cv.getBoundingClientRect();
    const amp = ampOf(r.height);
    const top = amp * 0.9 + 10;
    const sp = (r.height - top - 14) / (nLines() - 1);
    stopAnswerPlay();
    select(Math.round((e.clientY - r.top - top) / sp));
  });
  new ResizeObserver(drawAnswers).observe(cv);
}
$('#a-story-btn').addEventListener('click', () => { const s = $('#a-story'); s.hidden = !s.hidden; });

// ------------------------------------------------------------------ the cards of the finale
let speaking = -1;
const cardVoiceId = (i) => `card${String(i + 1).padStart(2, '0')}`;
function renderCards() {
  const cards = tx('futCards');
  $('#cards').innerHTML = cards.map(([kind, title, know, body], i) => {
    const photo = i === 0 ? ['img/lab-sample.jpg', 'photoSample'] : i === cards.length - 1 ? ['img/sem-nanotubes.jpg', 'photoSem'] : null;
    return `<article class="card ${kind}" data-i="${i}">
      ${photo ? `<img src="${photo[0]}" alt="" loading="lazy"><figcaption>${tx(photo[1])}</figcaption>` : ''}
      <h3>${title}</h3>
      ${know ? `<p class="k">${tx('futKnow')}</p><p class="know">${know}</p><p class="k">${tx('futWhatIf')}</p>` : ''}
      <p class="guess">${String(body).replace(/\n\s+/g, '\n')}</p>
      <button type="button" class="ghost listen">${tx('voicePlay')}</button>
    </article>`;
  }).join('');
  speaking = -1;
}
$('#cards').addEventListener('click', async (e) => {
  const btn = e.target.closest('.listen');
  if (!btn) return;
  const i = +btn.closest('.card').dataset.i;
  if (speaking === i) { voice.stop(); speaking = -1; renderListen(); return; }
  stopSound();
  const lang = getLang();
  const src = await voice.sourceFor(cardVoiceId(i), lang);
  if (!src) { btn.hidden = true; return; }
  const text = String(tx('futCards')[i][3]).replace(/\s+/g, ' ');
  speaking = i;
  voice.speak(src, voice.speakable(text, lang), lang, () => { speaking = -1; renderListen(); });
  renderListen();
});
function renderListen() {
  for (const card of $$('.card')) card.querySelector('.listen').textContent = tx(+card.dataset.i === speaking ? 'voiceStop' : 'voicePlay');
}

// ------------------------------------------------------------------ language, nav chips
function renderAll() {
  applyCopy(document);
  for (const b of $$('#lang button')) b.classList.toggle('on', b.dataset.lang === getLang());
  renderClips();
  renderCards();
  if (A.dev) answersText();
  if (lastRun && !$('#result').hidden) showResult();
  $('#btn-clear').textContent = tx('clear');
  refreshSound();
}
for (const b of $$('#lang button')) b.addEventListener('click', () => { voice.stop(); setLang(b.dataset.lang); });
onLang(() => renderAll());

const chipFor = new Map($$('#chips a').map((a) => [a.getAttribute('href').slice(1), a]));
const obs = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) for (const [id, a] of chipFor) a.classList.toggle('on', id === e.target.id);
}, { rootMargin: '-35% 0px -55% 0px' });
for (const id of chipFor.keys()) { const el = document.getElementById(id); if (el) obs.observe(el); }

// ------------------------------------------------------------------ start
renderAll();
(async () => {
  const [m, edges, aft] = await Promise.all([
    loadModel().catch(() => null),
    getJson('data/ws2-edges.json'),
    getJson('data/ws2-afternoon.json'),
  ]);
  model = m;
  if (!model) $('#sim-msg').textContent = '…';
  if (edges) { A.data = edges; A.aft = aft; initAnswers(); }
  else $('#answers').hidden = true;
  renderAll();
})();
