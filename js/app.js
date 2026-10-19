/**
 * Main application: tabs, controls, compute orchestration, visualization.
 */
import { loadData, hdImage } from './data.js';
import { RESERVOIR_DEFAULTS } from './reservoir.js';
import { softmaxRow } from './readout.js';
import * as plots from './plots.js';
import { initEsp32 } from './esp32.js';
import { initSchematic } from './schematic.js';
import { initSampleLayout } from './samplelayout.js';
import { initLayers } from './layers.js';
import { initTour } from './tour.js';
import { t } from './i18n.js';

const $ = (sel) => document.querySelector(sel);

export const TEST_OFFSET = 60000;

const state = {
  data: null,
  worker: null,
  workerReady: false,
  reqCounter: 0,
  pending: new Map(),
  lastResult: null,
  scatterGeom: null,
  demoIndex: 42,
  demo: null, // { inputs, perSlot, scores }
  pulseAnim: null,
  // settings ------------------------------------------------------------
  settings: { ...RESERVOIR_DEFAULTS },
  encoding: 'analog',
  threshold: 0.2,
  noiseSigma: 0,
  capture: 'all',
  ridgeLambda: 1e-3,
  live: true,
  liveCounts: { train: 600, test: 300 },
  fullCounts: { train: 10000, test: 2000 },
};

function reservoirParams() {
  const s = state.settings;
  return {
    n: s.n, density: s.density, rho: s.rho, inputGain: s.inputGain, bias: s.bias,
    tauFastMs: s.tauFastMs, tauSlowMs: s.tauSlowMs, slotMs: s.slotMs, duty: s.duty,
    k: s.k, nonlinearity: s.nonlinearity, seed: s.seed, mapping: s.mapping,
  };
}

/* ------------------------------------------------------------------ tabs */

function initTabs() {
  for (const btn of document.querySelectorAll('#tabs button')) {
    btn.addEventListener('click', () => {
      for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('active', b === btn);
      for (const sec of document.querySelectorAll('main > section')) {
        sec.classList.toggle('active', sec.id === `tab-${btn.dataset.tab}`);
      }
      if (btn.dataset.tab === 'playground') renderSample();
    });
  }
}

export function openTab(name) {
  const btn = document.querySelector(`#tabs button[data-tab="${name}"]`);
  if (btn) btn.click();
}

/* -------------------------------------------------------------- controls */

const CONTROLS = [
  {
    key: 'encoding', label: t('Input encoding', 'Kódování vstupu'), kind: 'select',
    options: [
      ['analog', t('analog voltages (0…1 × scale) — best', 'analogová napětí (0…1 × měřítko) — nejlepší')],
      ['binary', t('binary pulses 0 V / 5 V — paper-style', 'binární pulzy 0 V / 5 V — jako v článku')],
    ],
    get: () => state.encoding, set: (v) => { state.encoding = v; },
    hint: t('The paper drives the device with 0 V / 5 V pulses. Analog (pulse height ∝ pixel brightness) carries more information and reaches higher accuracy.',
      'Článek budí zařízení pulzy 0 V / 5 V. Analogový režim (výška pulzu ∝ jas pixelu) přenáší více informace a dosahuje vyšší přesnosti.'),
  },
  {
    key: 'threshold', label: t('Binarization threshold', 'Práh binarizace'), kind: 'range', min: 0.05, max: 0.6, step: 0.01,
    get: () => state.threshold, set: (v) => { state.threshold = v; },
    format: (v) => v.toFixed(2),
    disabled: () => state.encoding !== 'binary',
  },
  {
    key: 'noiseSigma', label: t('Input noise σ (robustness)', 'Šum vstupu σ (robustnost)'), kind: 'range', min: 0, max: 0.4, step: 0.01,
    get: () => state.noiseSigma, set: (v) => { state.noiseSigma = v; },
    format: (v) => v.toFixed(2),
  },
  {
    key: 'n', label: t('Reservoir nodes', 'Uzly rezervoáru'), kind: 'select',
    options: [['32', '32'], ['48', '48'], ['64', t('64 (default)', '64 (výchozí)')], ['96', '96'], ['128', t('128 (slower)', '128 (pomalejší)')]],
    get: () => String(state.settings.n), set: (v) => { state.settings.n = Number(v); },
  },
  {
    key: 'density', label: t('Connectivity (weights per node)', 'Konektivita (váhy na uzel)'), kind: 'range', min: 0.02, max: 0.3, step: 0.005,
    get: () => state.settings.density, set: (v) => { state.settings.density = v; },
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: 'rho', label: t('Recurrent gain (spectral radius ρ)', 'Rekurentní zesílení (spektrální rádius ρ)'), kind: 'range', min: 0.5, max: 0.99, step: 0.01,
    get: () => state.settings.rho, set: (v) => { state.settings.rho = v; },
    format: (v) => v.toFixed(2),
  },
  {
    key: 'inputGain', label: t('Input gain', 'Zesílení vstupu'), kind: 'range', min: 0.05, max: 1.5, step: 0.05,
    get: () => state.settings.inputGain, set: (v) => { state.settings.inputGain = v; },
    format: (v) => v.toFixed(2),
  },
  {
    key: 'tauSlowMs', label: t('Slow memory τ (ms)', 'Pomalá paměť τ (ms)'), kind: 'range', min: 5, max: 200, step: 1,
    get: () => state.settings.tauSlowMs, set: (v) => { state.settings.tauSlowMs = v; },
    format: (v) => `${v.toFixed(0)} ms`,
  },
  {
    key: 'tauFastMs', label: t('Fast relaxation τ (ms)', 'Rychlá relaxace τ (ms)'), kind: 'range', min: 0.01, max: 5, step: 0.01,
    get: () => state.settings.tauFastMs, set: (v) => { state.settings.tauFastMs = v; },
    format: (v) => `${v.toFixed(2)} ms`,
    hint: t('Paper reports ≈ 0.06 ms (SI Fig. 12).', 'Článek uvádí ≈ 0,06 ms (SI obr. 12).'),
  },
  {
    key: 'slotMs', label: t('Pulse slot duration (ms)', 'Délka pulzního slotu (ms)'), kind: 'range', min: 2, max: 50, step: 1,
    get: () => state.settings.slotMs, set: (v) => { state.settings.slotMs = v; },
    format: (v) => `${v.toFixed(0)} ms`,
  },
  {
    key: 'duty', label: t('Pulse duty inside slot', 'Střída pulzu ve slotu'), kind: 'range', min: 0.1, max: 1, step: 0.05,
    get: () => state.settings.duty, set: (v) => { state.settings.duty = v; },
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
  {
    key: 'mapping', label: t('Input mapping', 'Mapování vstupu'), kind: 'select',
    options: [['row', t('row → channel (paper-like)', 'řádek → kanál (jako v článku)')], ['raster', t('raster scan', 'rasterové skenování')]],
    get: () => state.settings.mapping, set: (v) => { state.settings.mapping = v; },
  },
  {
    key: 'capture', label: t('Readout features', 'Příznaky čtecí vrstvy'), kind: 'select',
    options: [['all', t('all 8 slots (best)', 'všech 8 slotů (nejlepší)')], ['final', t('final slot only (paper; weaker)', 'jen poslední slot (jako v článku; slabší)')]],
    get: () => state.capture, set: (v) => { state.capture = v; },
  },
  {
    key: 'seed', label: t('Reservoir instance (seed)', 'Instance rezervoáru (seed)'), kind: 'range', min: 1, max: 9999, step: 1,
    get: () => state.settings.seed, set: (v) => { state.settings.seed = v | 0; },
    format: (v) => String(v | 0),
  },
  {
    key: 'ridgeLambda', label: t('Readout regularisation λ', 'Regularizace čtecí vrstvy λ'), kind: 'range', min: -6, max: -1, step: 0.1,
    get: () => Math.log10(state.ridgeLambda), set: (v) => { state.ridgeLambda = Math.pow(10, v); },
    format: (v) => Math.pow(10, v).toExponential(1),
  },
];

function buildControls() {
  const host = $('#controls');
  host.innerHTML = '';
  for (const c of CONTROLS) {
    const row = document.createElement('div');
    row.className = 'ctl';
    const head = document.createElement('div');
    head.className = 'ctl-head';
    const label = document.createElement('label');
    label.textContent = c.label;
    const value = document.createElement('span');
    value.className = 'ctl-value';
    head.append(label, value);
    row.append(head);

    let input;
    if (c.kind === 'select') {
      input = document.createElement('select');
      for (const [v, t] of c.options) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = t;
        input.append(opt);
      }
      input.value = c.get();
      value.textContent = '';
      input.addEventListener('change', () => {
        c.set(input.value);
        updateControlStates();
        scheduleCompute();
      });
    } else {
      input = document.createElement('input');
      input.type = 'range';
      input.min = c.min;
      input.max = c.max;
      input.step = c.step;
      input.value = c.get();
      const refresh = () => {
        const v = Number(input.value);
        c.set(v);
        value.textContent = c.format ? c.format(v) : String(v);
      };
      refresh();
      input.addEventListener('input', () => {
        refresh();
        scheduleCompute();
      });
    }
    input.dataset.key = c.key;
    row.append(input);
    if (c.hint) {
      const hint = document.createElement('div');
      hint.className = 'hint small';
      hint.textContent = c.hint;
      row.append(hint);
    }
    host.append(row);
  }
  updateControlStates();
}

function updateControlStates() {
  for (const c of CONTROLS) {
    const el = document.querySelector(`[data-key="${c.key}"]`);
    if (el && c.disabled) el.disabled = c.disabled();
  }
}

/* ---------------------------------------------------------------- worker */

function bootWorker() {
  const worker = new Worker('js/worker.js', { type: 'module' });
  state.worker = worker;
  worker.onmessage = (e) => handleWorkerMessage(e.data);
  worker.onerror = (e) => status(t(`worker error: ${e.message}`, `chyba workeru: ${e.message}`), true);

  const { x8, labels, meta } = state.data;
  worker.postMessage({
    cmd: 'data',
    x8: x8.buffer.slice(0),
    labels: labels.buffer.slice(0),
    meta,
  });
}

function handleWorkerMessage(msg) {
  if (msg.type === 'ready') {
    state.workerReady = true;
    status(t('ready', 'připraveno'));
    scheduleCompute({ force: true });
    return;
  }
  if (msg.type === 'progress') {
    if (msg.source !== 'guide') {
      const pct = msg.total ? ` ${msg.done}/${msg.total}` : '';
      const stage = {
        pack: t('encoding inputs', 'kódování vstupů'),
        'run-train': t('reservoir (train)', 'rezervoár (trénink)'),
        'run-test': t('reservoir (test)', 'rezervoár (test)'),
        train: t('readout training (epoch)', 'trénink čtecí vrstvy (epocha)'),
      }[msg.stage] || msg.stage;
      status(`${stage}${pct}`, false, true);
    }
    return;
  }
  if (msg.type === 'result') {
    const pending = state.pending.get(msg.reqId);
    if (pending) {
      state.pending.delete(msg.reqId);
      pending.resolve(msg);
    }
    state.lastResult = msg;
    renderResult(msg);
    status(`${t('ready', 'připraveno')} · ${t('train', 'trénink')} ${(msg.trainAccuracy * 100).toFixed(1)}% · ${t('test', 'test')} ${(msg.testAccuracy * 100).toFixed(1)}% · ${(msg.timeMs.total / 1000).toFixed(1)} s`);
    return;
  }
  if (msg.type === 'demo') {
    state.demo = { inputs: msg.inputs, perSlot: msg.perSlot, scores: msg.scores, index: msg.index };
    renderDemo();
    return;
  }
  if (msg.type === 'sample') {
    const pending = state.pending.get(msg.reqId);
    if (pending) {
      state.pending.delete(msg.reqId);
      pending.resolve(msg);
    }
    return;
  }
  if (msg.type === 'error') {
    const pending = state.pending.get(msg.reqId);
    if (pending) {
      state.pending.delete(msg.reqId);
      pending.reject(new Error(msg.message));
    }
    status(t(`error: ${msg.message}`, `chyba: ${msg.message}`), true);
  }
}

let debounceTimer = 0;

function scheduleCompute(opts = {}) {
  if (!state.workerReady) return;
  if (!state.live && !opts.force) {
    status(t('settings changed — press “Full run” or toggle live', 'nastavení změněno — stiskněte „Plný běh“ nebo zapněte živý náhled'), false);
    return;
  }
  clearTimeout(debounceTimer);
  status(t('queued…', 've frontě…'), false);
  debounceTimer = setTimeout(() => fireCompute(opts), 220);
}

export function fireCompute(opts = {}) {
  if (!state.workerReady) return Promise.resolve(null);
  const reqId = ++state.reqCounter;
  const counts = opts.counts || (opts.full ? state.fullCounts : state.liveCounts);
  const source = opts.source || 'playground';
  const msg = {
    cmd: 'compute',
    reqId,
    source,
    params: reservoirParams(),
    encoding: state.encoding,
    threshold: state.threshold,
    noiseSigma: opts.noiseSigma !== undefined ? opts.noiseSigma : state.noiseSigma,
    capture: state.capture,
    trainCount: counts.train,
    testCount: counts.test,
    method: opts.method || 'ridge',
    ridgeLambda: state.ridgeLambda,
    sgd: opts.sgd,
    demoIndex: state.demoIndex,
    light: opts.light,
    lightTest: opts.lightTest,
  };
  const promise = new Promise((resolve, reject) => state.pending.set(reqId, { resolve, reject, source }));
  state.worker.postMessage(msg);
  return promise;
}

/* --------------------------------------------------------------- results */

function status(text, isError = false, busy = false) {
  const el = $('#statusText');
  el.textContent = text;
  $('#status .dot').classList.toggle('error', isError);
  $('#status .dot').classList.toggle('busy', busy);
}

function renderResult(msg) {
  state.demo = null; // inputs/states of the previous run are stale now
  $('#acc-test').textContent = `${(msg.testAccuracy * 100).toFixed(1)}%`;
  $('#acc-train').textContent = `${(msg.trainAccuracy * 100).toFixed(1)}%`;
  $('#time-total').textContent = `${(msg.timeMs.total / 1000).toFixed(1)} s`;
  $('#dim-label').textContent = `${msg.dim}`;
  $('#results-badge').textContent = `${msg.method === 'sgd' ? 'SGD' : 'ridge'} · ${msg.counts.train}/${msg.counts.test}`;

  plots.drawConfusion($('#cv-confusion'), 220, 220, msg.confusion);

  const hist = $('#cv-history');
  if (msg.history) {
    const pts = (key) => msg.history.map((h) => ({ x: h.epoch, y: h[key] }));
    plots.drawLineChart(hist, 380, 210, [
      { points: pts('train'), color: '#57c7ff', label: t('train acc', 'přesnost trénink') },
      { points: pts('test'), color: '#ffb454', label: t('test acc', 'přesnost test') },
      { points: pts('loss'), color: '#e15759', label: t('loss', 'ztráta'), width: 1.2 },
    ], { xlabel: t('epoch', 'epocha'), ylabel: t('accuracy', 'přesnost'), ymin: 0, ymax: 1 });
    hist.style.display = '';
  } else {
    const ctx = plots.setupCanvas(hist, 380, 210);
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, 380, 210);
    ctx.fillStyle = '#6b7f95';
    ctx.font = '12px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(t('ridge readout — closed form, no epochs', 'čtecí vrstva ridge — uzavřený tvar, bez epoch'), 190, 96);
    ctx.fillText(t('use “Train 200 epochs (paper-style)” for the learning curve', 'křivku učení zobrazíte tlačítkem „Trénovat 200 epoch (jako v článku)“'), 190, 116);
  }

  renderScatter(msg);
  renderSample();
  if (msg.perSlot) {
    plots.drawStateHeatmaps($('#cv-states'), 420, 210, msg.perSlot, msg.n || state.settings.n);
    $('#states-hint').textContent = t(`nodes × 8 slots · x = fast state, s = slow memory · sample #${msg.demoIndex}`,
      `uzlů × 8 slotů · x = rychlý stav, s = pomalá paměť · vzorek #${msg.demoIndex}`);
  }
  // re-request demo details for the currently selected sample if needed
  if (state.demoIndex !== msg.demoIndex) requestDemo(state.demoIndex);
}

function renderScatter(msg) {
  const { pca } = msg;
  const geom = plots.drawScatter($('#cv-scatter'), 420, 230, pca.xy, pca.labels, {
    highlight: state.demoIndex < pca.count ? state.demoIndex : -1,
  });
  state.scatterGeom = geom ? { sx: geom.sx, sy: geom.sy, count: pca.count, xy: pca.xy } : null;
}

function requestDemo(index) {
  if (!state.workerReady || !state.lastResult) return;
  const maxIndex = state.lastResult.counts.testCount - 1;
  state.demoIndex = Math.max(0, Math.min(maxIndex, index));
  state.worker.postMessage({ cmd: 'demo', index: state.demoIndex });
}

function renderDemo() {
  if (!state.demo || !state.lastResult) return;
  const msg = state.lastResult;
  plots.drawStateHeatmaps($('#cv-states'), 420, 210, state.demo.perSlot, msg.n || state.settings.n);
  $('#states-hint').textContent = t(`nodes × 8 slots · x = fast state, s = slow memory · sample #${state.demo.index} (truth ${demoLabel()})`,
    `uzlů × 8 slotů · x = rychlý stav, s = pomalá paměť · vzorek #${state.demo.index} (skutečnost ${demoLabel()})`);
  // prediction bars
  const probs = new Float64Array(10);
  softmaxRow(state.demo.scores, probs, 0);
  plots.drawProbBars($('#cv-probs'), 220, 220, probs, argmax(state.demo.scores), demoLabel());
  // scatter highlight
  if (msg.pca && state.demo.index < msg.pca.count) {
    plots.drawScatter($('#cv-scatter'), 420, 230, msg.pca.xy, msg.pca.labels, { highlight: state.demo.index });
  }
  renderSample();
}

function argmax(arr) {
  let best = 0;
  for (let i = 1; i < 10; i++) if (arr[i] > arr[best]) best = i;
  return best;
}

function demoLabel() {
  if (!state.data) return '?';
  return state.data.labels[TEST_OFFSET + state.demoIndex];
}

/* ---------------------------------------------------------- sample views */

function renderSample() {
  if (!state.data) return;
  const idx = state.demoIndex;
  $('#sample-label').textContent = t(`#${idx} · truth ${demoLabel()}`, `#${idx} · skutečnost ${demoLabel()}`);

  // original (28x28 if available, else 8x8)
  const hd = hdImage(state.data, idx);
  if (hd) {
    const tmp = new Uint8Array(784);
    tmp.set(hd);
    plots.drawPixels($('#cv-orig'), 96, 96, tmp, 28, 28, { pad: 0 });
  } else {
    plots.drawPixels($('#cv-orig'), 96, 96, state.data.x8.subarray(idx * 64 + TEST_OFFSET * 64, idx * 64 + 64 + TEST_OFFSET * 64), 8, 8, { pad: 0 });
  }

  // what the reservoir actually received (thresholded/noisy when available)
  const values = getSampleValues(idx);
  plots.drawPixels($('#cv-binar'), 96, 96, values, 8, 8, { binary: false, pad: 0, max: 1 });
  drawPulses(values);

  if (state.lastResult && state.demo && state.demo.index === idx) {
    const probs = new Float64Array(10);
    softmaxRow(state.demo.scores, probs, 0);
    plots.drawProbBars($('#cv-probs'), 220, 220, probs, argmax(state.demo.scores), demoLabel());
  }
}

function getSampleValues(idx) {
  if (state.demo && state.demo.index === idx) return state.demo.inputs;
  const res = state.lastResult;
  if (res && res.testInputs && idx < res.counts.testCount) {
    return res.testInputs.subarray(idx * 64, idx * 64 + 64);
  }
  const values = new Float32Array(64);
  for (let j = 0; j < 64; j++) {
    const px = state.data.x8[(TEST_OFFSET + idx) * 64 + j] / 255;
    values[j] = state.encoding === 'binary' ? (px >= state.threshold ? 1 : 0) : px;
  }
  return values;
}

function drawPulses(values, playhead = null) {
  plots.drawPulseTrains($('#cv-pulses'), 430, 170, values, {
    slotMs: state.settings.slotMs,
    duty: state.settings.duty,
    playhead,
  });
}

function startPulseAnimation() {
  stopPulseAnimation();
  if (!$('#pulse-play').checked) return;
  const start = performance.now();
  const loop = () => {
    const values = getSampleValues(state.demoIndex);
    const t = ((performance.now() - start) % 2600) / 2600;
    drawPulses(values, t * 8);
    state.pulseAnim = requestAnimationFrame(loop);
  };
  state.pulseAnim = requestAnimationFrame(loop);
}

function stopPulseAnimation() {
  if (state.pulseAnim) cancelAnimationFrame(state.pulseAnim);
  state.pulseAnim = null;
}

/* ------------------------------------------------------------------ init */

async function init() {
  if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) {
    state.liveCounts = { train: 400, test: 200 }; // keep the live preview snappy on phones
  }
  initTabs();
  buildControls();
  initSchematic($('#schematic'));
  initSampleLayout($('#sample-layout'));
  initLayers($('#layers'));
  initEsp32({
    data: () => state.data,
    encoding: () => state.encoding,
    threshold: () => state.threshold,
    testOffset: TEST_OFFSET,
  });
  status(t('loading MNIST assets…', 'načítám data MNIST…'));

  state.data = await loadData();
  status(t('starting worker…', 'spouštím worker…'));
  bootWorker();

  // sample navigation
  $('#sample-prev').addEventListener('click', () => requestDemo(state.demoIndex - 1));
  $('#sample-next').addEventListener('click', () => requestDemo(state.demoIndex + 1));
  $('#sample-random').addEventListener('click', () => {
    const max = state.lastResult ? state.lastResult.counts.testCount : 300;
    requestDemo(Math.floor(Math.random() * max));
  });
  $('#pulse-play').addEventListener('change', () => startPulseAnimation());

  $('#btn-full').addEventListener('click', () => {
    status(t('full run: 10 000 train / 2 000 test…', 'plný běh: 10 000 trénink / 2 000 test…'), false, true);
    fireCompute({ full: true });
  });
  $('#btn-sgd').addEventListener('click', () => {
    status(t('paper-style training: softmax SGD, 200 epochs…', 'trénink jako v článku: softmax SGD, 200 epoch…'), false, true);
    fireCompute({ method: 'sgd', sgd: { epochs: 200, lr: 0.08, batch: 64 } });
  });
  $('#btn-reset').addEventListener('click', () => {
    state.settings = { ...RESERVOIR_DEFAULTS };
    state.encoding = 'analog';
    state.threshold = 0.2;
    state.noiseSigma = 0;
    state.capture = 'all';
    state.ridgeLambda = 1e-3;
    buildControls();
    scheduleCompute({ force: true });
  });
  $('#live-toggle').checked = state.live;
  $('#live-toggle').addEventListener('change', (e) => {
    state.live = e.target.checked;
    if (state.live) scheduleCompute({ force: true });
  });

  // scatter click -> nearest point becomes the selected sample
  $('#cv-scatter').addEventListener('click', (e) => {
    if (!state.scatterGeom || !state.lastResult) return;
    const { sx, sy, count, xy } = state.scatterGeom;
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best = -1;
    let bestDist = 12 * 12;
    for (let i = 0; i < count; i++) {
      const dx = sx(xy[i * 2]) - x;
      const dy = sy(xy[i * 2 + 1]) - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        best = i;
      }
    }
    if (best >= 0) requestDemo(best);
  });

  startPulseAnimation();

  initTour({
    data: state.data,
    compute: (opts) => fireCompute({ ...opts, source: 'guide' }),
    sampleStates: (values64) => {
      const reqId = ++state.reqCounter;
      const promise = new Promise((resolve, reject) => state.pending.set(reqId, { resolve, reject, source: 'guide' }));
      state.worker.postMessage({ cmd: 'sample', reqId, params: reservoirParams(), values64: Array.from(values64) });
      return promise;
    },
    settings: () => ({ encoding: state.encoding, threshold: state.threshold, slotMs: state.settings.slotMs, duty: state.settings.duty, n: state.settings.n }),
    defaultSample: 42,
    openTab,
  });
}

init().catch((err) => status(t(`init failed: ${err.message}`, `inicializace selhala: ${err.message}`), true));
