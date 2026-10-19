/**
 * The advanced layer ("Co udělá světlo", "Jak se rozhoduje"), two tabs:
 *
 *   light    a dimmer sets the light on the sample; the visitor's own digit is run through the
 *            reservoir at that light, live, and read by the old (dark-trained) or the retrained readout
 *   decide   what "deciding" means: the score of each digit as a sum of votes, tap a digit to see
 *            how its score is made up
 *
 * Live here: the digit's response and the readout's verdict. Stored (measured offline on 10 000 test
 * digits, tools/light_experiment.mjs): the accuracy curves in the chart and the numbers under it.
 */
import { runDigit, liveliestNodes, UNSURE_MARGIN } from './model.js';
import { createScope, meanSlow } from './scope.js';
import { drawLightChart } from './light.js';
import { drawScores, drawSlots, drawMoments, MOMENT_W, slotContributions, fmt } from './decide.js';
import { clamp01, fitCanvas, COLOR } from './canvas.js';
import { tx, getLang } from './copy.js';

const SWEEP_MS_PER_STEP = 22;      // the response redraws in ~1.4 s whenever the light changes
const NOTCH_X0 = 40;
const NOTCH_W = 680;   // track length inside the 760 px dimmer (see expo.css)

export function initDeep({ model, light, slow, touch }) {
  const $ = (sel) => document.querySelector(sel);
  const scope = createScope($('#cv-deep-scope'), model);
  const n = model.n;
  const d = {
    view: 'light',
    sel: 0,                 // index into light.levels; 0 = dark
    retrained: false,
    img8: null,
    yours: false,
    darkRun: null,
    darkMeanS: null,
    nodes: [],
    lightRun: null,
    lightMeanS: null,
    sweepAt: 0,
    digit: 0,               // digit examined in the decision tab
    mask: new Array(8).fill(true),   // moments the readout may look at (the visitor covers some)
    contrib: [],            // per digit: contribution of each moment + bias
    shown: new Float64Array(10),     // animated scores
    lo: 0,
    hi: 1,
    flash: new Float64Array(8).fill(-1e9),
    play: null,             // the voting replay: { start }
    t0: 0,
    sig: '',
  };

  const pct = (v) => `${fmt(v * 100, 1)} %`;
  const notches = $('#dimmer-notches');
  light.levels.forEach((lv, i) => {
    const t = document.createElement('i');
    t.style.left = `${(i / (light.levels.length - 1)) * NOTCH_W}px`;
    notches.appendChild(t);
  });

  /** Scores when only the uncovered moments are read: offset + the contributions of those moments. */
  function maskedScores() {
    const sc = new Float64Array(10);
    for (let c = 0; c < 10; c++) {
      let v = d.contrib[c].bias;
      for (let t = 0; t < 8; t++) if (d.mask[t]) v += d.contrib[c].slots[t];
      sc[c] = v;
    }
    return sc;
  }

  function verdictOf(sc) {
    let pred = 0;
    for (let c = 1; c < 10; c++) if (sc[c] > sc[pred]) pred = c;
    let second = -1;
    for (let c = 0; c < 10; c++) if (c !== pred && (second < 0 || sc[c] > sc[second])) second = c;
    const margin = sc[pred] - sc[second];
    return { pred, second, margin, unsure: margin < UNSURE_MARGIN };
  }

  function startPlay() {
    d.mask.fill(false);
    d.play = { start: performance.now() + 500 };
  }

  /** A hundred little squares: filled = read correctly, empty = wrong. Two rows of fifty. */
  function drawTicks(canvas, count, fill) {
    const ctx = fitCanvas(canvas, 440, 34);
    ctx.clearRect(0, 0, 440, 34);
    const size = 7.2;
    const pitch = 8.7;
    for (let i = 0; i < 100; i++) {
      const x = (i % 50) * pitch;
      const y = Math.floor(i / 50) * 17 + 4;
      if (i < count) { ctx.fillStyle = fill; ctx.fillRect(x, y, size, 11); }
      else { ctx.strokeStyle = COLOR.mute; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, size - 1, 10); }
    }
  }

  function recompute(now) {
    const lv = light.levels[d.sel];
    const readout = d.retrained && lv.light > 0 ? light.retrainedReadout(lv.light) : model.readout;
    d.lightRun = runDigit(model, d.img8, { gain: lv.gain, readout: readout || model.readout });
    d.lightMeanS = meanSlow(d.lightRun, n);
    // what the light did: the nodes that changed most (shown on the scope) and the overall change
    const steps = model.steps;
    const diff = new Float64Array(n);
    let num = 0;
    let den = 0;
    for (let t = 0; t < steps; t++) {
      for (let i = 0; i < n; i++) {
        const e = d.lightRun.x[t * n + i] - d.darkRun.x[t * n + i];
        diff[i] += e * e;
        num += e * e;
        den += d.darkRun.x[t * n + i] ** 2;
      }
    }
    d.change = den > 0 ? Math.sqrt(num / den) : 0;
    if (lv.light > 0) {
      d.nodes = Array.from({ length: n }, (_, i) => i).sort((a, b) => diff[b] - diff[a]).slice(0, 6);
    } else {
      d.nodes = liveliestNodes(d.darkRun, n, 6);
    }
    d.sweepAt = now;
    renderText();
  }

  function renderText() {
    if (!d.darkRun) return;
    const lv = light.levels[d.sel];
    const dark = lv.light === 0;
    // --- light tab
    $('#dimmer-label').textContent = `${tx('deepLight')} · ${lv.light} %`;
    $('#dimmer-thumb').style.left = `${NOTCH_X0 + (d.sel / (light.levels.length - 1)) * NOTCH_W}px`;
    const changed = d.lightRun.pred !== d.darkRun.pred;
    $('#dv-digit').textContent = String(d.lightRun.pred);
    $('#dv-digit').classList.toggle('changed', changed);
    $('#dv-lead').textContent = tx('deepVerdictLead');
    $('#dv-dark').textContent = dark ? '' : tx('deepWasDark', d.darkRun.pred);
    $('#dv-src').textContent = tx(d.yours ? 'deepYours' : 'deepExample');
    $('#deep-caption').textContent = tx(dark ? 'deepCaptionDark' : d.retrained ? 'deepCaptionNew' : 'deepCaptionOld');
    $('#rd-old').textContent = tx('deepOld');
    $('#rd-new').textContent = tx('deepNew');
    $('#rd-old').classList.toggle('on', !d.retrained || dark);
    $('#rd-new').classList.toggle('on', d.retrained && !dark);
    $('#rd-new').disabled = dark;
    const nDark = Math.round(light.levels[0].darkTrained * 100);
    const nNow = Math.round((d.retrained && !dark ? lv.retrained : lv.darkTrained) * 100);
    d.counts = { dark: nDark, now: nNow, good: d.retrained || dark };
    $('#num-dark').textContent = String(nDark);
    $('#num-dark-label').textContent = tx('deepCountDark', nDark);
    $('#num-now').textContent = String(nNow);
    $('#num-now-label').textContent = dark ? tx('deepCountDark', nNow) : tx(d.retrained ? 'deepCountNew' : 'deepCountOld', nNow);
    $('#deep-method').textContent = tx('deepMethod', light.trainCount, light.testCount);

    // --- decision tab
    const ol = $('#dc-steps');
    ol.textContent = '';
    for (const line of tx('decSteps')) {
      const li = document.createElement('li');
      li.textContent = line;
      ol.appendChild(li);
    }
    $('#dc-who').textContent = tx(d.yours ? 'deepYours' : 'deepExample');
    $('#dc-moments-cap').textContent = tx('decMomentsCap');
    $('#dc-try').textContent = tx('decTry');
    $('#dc-play').textContent = tx('decPlay');
    $('#dc-all').textContent = tx('decAll');
    d.sig = '';
    $('#deep').dataset.view = d.view;
  }

  // dimmer: drag or tap, snaps to the measured light levels
  const dimmer = $('#dimmer');
  let dragging = null;
  const pick = (e) => {
    const r = dimmer.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * dimmer.offsetWidth - NOTCH_X0;
    const i = Math.max(0, Math.min(light.levels.length - 1, Math.round((x / NOTCH_W) * (light.levels.length - 1))));
    if (i !== d.sel) { d.sel = i; recompute(performance.now()); }
    touch();
  };
  dimmer.addEventListener('pointerdown', (e) => { dragging = e.pointerId; dimmer.setPointerCapture(e.pointerId); pick(e); });
  dimmer.addEventListener('pointermove', (e) => { if (dragging === e.pointerId) pick(e); });
  const stop = (e) => { if (dragging === e.pointerId) dragging = null; };
  dimmer.addEventListener('pointerup', stop);
  dimmer.addEventListener('pointercancel', stop);

  $('#rd-old').addEventListener('click', () => { touch(); d.retrained = false; recompute(performance.now()); });
  $('#rd-new').addEventListener('click', () => { touch(); d.retrained = true; recompute(performance.now()); });

  /** One frame of the decision tab: the replay, the gliding scores, the moments, the sentence. */
  function decideFrame(now) {
    const dt = Math.min(64, d.t0 ? now - d.t0 : 16);
    d.t0 = now;
    if (d.play) {
      const k = Math.max(0, Math.floor((now - d.play.start) / 650) + 1);
      for (let t = 0; t < 8; t++) {
        if (t < k && !d.mask[t]) { d.mask[t] = true; d.flash[t] = now; }
      }
      if (k >= 8) d.play = null;
    }
    const sc = maskedScores();
    const a = 1 - Math.exp(-dt / 120);
    let lo = 0;
    let hi = 1;
    for (let c = 0; c < 10; c++) { lo = Math.min(lo, sc[c]); hi = Math.max(hi, sc[c]); }
    d.lo += (lo - d.lo) * a;
    d.hi += (hi - d.hi) * a;
    for (let c = 0; c < 10; c++) d.shown[c] += (sc[c] - d.shown[c]) * a;
    const v = verdictOf(sc);
    drawScores($('#cv-scores'), d.shown, d.lo, d.hi, v.pred, d.digit, v.unsure);
    drawMoments($('#cv-moments'), d.img8, d.mask, d.flash, now);
    drawSlots($('#cv-slots'), d.contrib[d.digit], d.digit, d.mask);
    const covered = d.mask.filter((m) => !m).length;
    const sig = `${d.mask.join('')}|${d.digit}|${getLang()}`;
    if (sig !== d.sig) {
      d.sig = sig;
      $('#dc-readout').textContent = covered === 8 ? tx('decNone')
        : (d.digit === v.pred
          ? tx('decWinner', d.digit, fmt(sc[d.digit]), fmt(v.margin), v.second, v.unsure)
          : tx('decLoser', d.digit, fmt(sc[d.digit]), v.pred, fmt(sc[v.pred]))) + (covered ? tx('decCovered', covered) : '');
    }
  }

  // the visitor plays with the readout: cover a moment, pick a digit to take apart
  const momentsCv = $('#cv-moments');
  momentsCv.addEventListener('pointerdown', (e) => {
    const r = momentsCv.getBoundingClientRect();
    const t = Math.max(0, Math.min(7, Math.floor(((e.clientX - r.left) / r.width) * 8)));
    touch();
    d.play = null;
    d.mask[t] = !d.mask[t];
    d.flash[t] = performance.now();
  });
  const scoresCv = $('#cv-scores');
  scoresCv.addEventListener('pointerdown', (e) => {
    const r = scoresCv.getBoundingClientRect();
    d.digit = Math.max(0, Math.min(9, Math.floor(((e.clientX - r.left) / r.width) * 10)));
    touch();
  });
  $('#dc-play').addEventListener('click', () => { touch(); startPlay(); });
  $('#dc-all').addEventListener('click', () => { touch(); d.play = null; d.mask.fill(true); });

  return {
    /** Open with the visitor's digit (or an example) and the dark: that is where the story starts. */
    enter(img8, yours, now) {
      d.img8 = img8;
      d.yours = yours;
      d.view = 'light';
      d.sel = 0;
      d.retrained = false;
      d.darkRun = runDigit(model, img8);
      d.contrib = Array.from({ length: 10 }, (_, c) => slotContributions(model.readout, d.darkRun.features, c));
      d.mask.fill(true);
      d.play = null;
      d.shown.set(maskedScores());
      d.darkMeanS = meanSlow(d.darkRun, n);
      d.digit = d.darkRun.pred;
      recompute(now);
    },
    get view() { return d.view; },
    show(view) { d.view = view; if (view === 'decide' && d.darkRun) startPlay(); renderText(); },
    refresh: renderText,
    draw(now) {
      if (!d.lightRun) return;
      if (d.view === 'light') {
        const dark = d.sel === 0;
        const p = Math.min(model.steps, (now - d.sweepAt) / SWEEP_MS_PER_STEP);
        scope.draw({
          playback: { run: d.lightRun, nodes: d.nodes, meanS: d.lightMeanS, p },
          ghosts: dark ? [] : [{ run: d.darkRun, nodes: d.nodes, meanS: d.darkMeanS, ref: true, fill: d.nodes[0] }],
          slow,
        });
        drawLightChart($('#cv-light'), light, d.sel, d.retrained && !dark ? 'new' : 'old');
        if (d.counts) {
          drawTicks($('#cv-ticks-dark'), d.counts.dark, COLOR.warm);
          drawTicks($('#cv-ticks-now'), d.counts.now, d.counts.good ? COLOR.phos : COLOR.warmDim);
        }
      } else {
        decideFrame(now);
      }
    },
  };
}
