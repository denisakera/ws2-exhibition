/**
 * Exhibition mode controller: one continuous screen, five phases.
 *
 *   idle    the simulation runs on its own on random MNIST test digits
 *   draw    a visitor draws a digit
 *   run     drawing -> 8x8 -> pulses -> response of the simulated reservoir
 *   result  the readout's interpretation, then the reflection
 *   (idle again after a timeout, or after "try again" -> draw)
 *
 * Everything on screen is the simulation: js/reservoir.js + the readout from
 * tools/train_expo_readout.mjs. There is no hardware, serial or network code in this mode.
 */
import { loadData } from '../data.js';
import { loadModel, runDigit, liveliestNodes } from './model.js';
import { inkTo8x8 } from './preprocess.js';
import { createDrawSurface } from './draw.js';
import { createScope, meanSlow } from './scope.js';
import { createMaterial } from './material.js';
import { loadLight } from './light.js';
import { initDeep } from './deep.js';
import { drawPulses, drawGrid8, drawBars } from './pulse.js';
import { setStageScale, STAGE_W, STAGE_H, clamp01, easeInOut } from './canvas.js';
import * as voice from './voice.js';
import { initMeasured, loadMeasured, loadPairs } from './measured.js';
import { initAnswers, loadAnswers, loadAfternoon } from './answers.js';
import { tx, setLang, getLang, onLang, applyCopy, FUT_CHAPTER_SIZES } from './copy.js';

const $ = (sel) => document.querySelector(sel);

// ---- timing (ms) ---------------------------------------------------------------------------
const PLAY_MS_PER_STEP = 150;      // 64 simulation steps are played over ~9.6 s
const T_INK = 1600;                // drawing dissolves into the 8x8 grid
const T_UNFOLD = 2400;             // rows unfold into the eight pulse rails
// The run waits for the visitor after each of its first three stages ("Dál").
const NEXT_KEYS = ['nextToPulses', 'nextToMaterial', 'nextToRead', 'nextToResult'];
// Each stage explains itself in three beats that appear one after another (ms after the stage
// starts); "Dál" only appears once the animation is done and the last beat has had time to be read.
const BEAT_AT = [[300, 2700, 5100], [300, 2700, 5100], [0, 3300, 6600], [300, 2700, 5100]];
const BEAT_DWELL = 2600;
const IDLE_LEAD = 900;
const IDLE_HOLD = 4200;            // finished idle run stays on screen
const DRAW_TIMEOUT = 45000;        // no touch while drawing -> idle
const RESULT_TIMEOUT = 50000;      // nobody pressed "try again" -> idle
const BARS_REVEAL = 1000;
const RELOAD_AFTER = 6 * 3600e3;   // quiet soft reload against slow leaks, only while idle
const STALL_MS = 15000;            // no animation frame this long (tab visible) -> reload

const $stage = $('#stage');
const state = {
  phase: 'idle',
  phaseAt: 0,
  lastActivity: 0,
  lastFrame: performance.now(),
  bootAt: performance.now(),
  pb: null,            // { run, nodes, meanS, startAt, p }
  ghosts: [],          // finished runs kept as faint persistence
  sub: null,           // the visitor's run: { run, img8, inkSnap, nodes, meanS }
  lastIdle8: null,
  future: 0,           // index of the card on the finale screen
  stage: { i: 0, at: 0 },   // run: 0 drawing->points, 1 points->pulses, 2 response, 3 reading
  nextKey: null,            // copy key of the visible "Dál" button, or null while a stage is still animating
  stepKey: 'stepIdle',
  beats: { stage: -1, shown: 0 },   // narration beats currently on screen
  idleLabel: -1,
  idleNextAt: 0,
  warnUntil: 0,
  previewTimer: 0,
  errors: [],
};
let model = null;
let data = null;
let scope = null;
let material = null;
let surface = null;
let slow = 72;
let light = null;      // measured light experiment (data/expo-light*.json), or null
let deep = null;       // the advanced layer (js/expo/deep.js), or null
let measured = null;   // the sound of the sample (js/expo/measured.js), or null
let measuredData = null;
let pairsData = null;
let answers = null;      // the stack of 200 pulses (js/expo/answers.js), or null
let answersData = null;
let afternoonData = null;

// ---- helpers -------------------------------------------------------------------------------

/** Side of the apparatus: only `?side=left` mirrors the screen. Nothing is remembered, so a stray key never sticks. */
function sideFromEnv() {
  let v = null;
  try { v = new URLSearchParams(location.search).get('side'); } catch { /* ignore */ }
  return v === 'left' ? 'left' : 'right';
}

function setSide(side) {
  $stage.classList.toggle('apparatus-left', side === 'left');
  $stage.classList.toggle('apparatus-right', side !== 'left');
}

function fitStage() {
  const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  $stage.style.transform = `translate(${(-STAGE_W * s) / 2}px, ${(-STAGE_H * s) / 2}px) scale(${s})`;
  setStageScale(s);
  surface?.redraw();
}

function setStep(key) {
  if (state.stepKey === key) return;
  state.stepKey = key;
  $('#step').textContent = tx(key);
}

/** The finale: one card at a time, tapped through by the visitor. */
// every card has a voice that reads its guess (the second half of the card), never the title.
// Recordings: audio/card01_cs.mp3 ... (the number is the card's position); otherwise the machine's own voice.
const cardVoiceId = (i) => `card${String(i + 1).padStart(2, '0')}`;

function voiceLabel() {
  $('#btn-voice').textContent = tx(voice.isPlaying() && !state.readAll ? 'voiceStop' : 'voicePlay');
  $('#btn-voice-all').textContent = tx(state.readAll ? 'voiceAllStop' : 'voiceAll');
  $('#btn-voice-all').classList.toggle('on', !!state.readAll);
}

function cardText() {
  return String(tx('futCards')[state.future][3]).replace(/\s+/g, ' ');
}

function updateVoice() {
  voice.stop();
  state.voiceSrc = null;
  $('#future').classList.remove('has-voice');
  voiceLabel();
  const index = state.future;
  const lang = getLang();
  voice.sourceFor(cardVoiceId(index), lang).then((src) => {
    if (!src || state.phase !== 'future' || state.future !== index || getLang() !== lang) return;
    state.voiceSrc = src;
    $('#future').classList.add('has-voice');
  });
}

function stopReadAll() {
  state.readAll = false;
  voice.stop();
  voiceLabel();
}

/** Reads the card on screen, then turns to the next one by itself, until the last card. */
function readAllStep() {
  if (!state.readAll || state.phase !== 'future') return;
  const index = state.future;
  const lang = getLang();
  voice.sourceFor(cardVoiceId(index), lang).then((src) => {
    if (!state.readAll || state.phase !== 'future' || state.future !== index) return;
    if (!src) { stopReadAll(); return; }
    voice.speak(src, voice.speakable(cardText(), lang), lang, () => {
      voiceLabel();
      if (!state.readAll) return;
      if (state.future >= tx('futCards').length - 1) { stopReadAll(); return; }
      setTimeout(() => {
        if (!state.readAll || state.phase !== 'future') return;
        state.future += 1;
        renderFuture(true);
        setTimeout(readAllStep, 800);
      }, 900);
    });
    voiceLabel();
  });
}

/** Two cards show the real thing instead of the simulated signal column; the three pictures never repeat. */
function cardPhoto(i, count) {
  if (i === 0) return 'sample';                      // "the substance beside the screen": the real sample on its board
  if (i === count - 1) return 'sem';                 // the letter to the nanotubes: the nanotubes themselves
  return null;
}
const PHOTOS = { sample: ['img/lab-sample.jpg', 'photoSample'], sem: ['img/sem-nanotubes.jpg', 'photoSem'], bench: ['img/lab-bench.jpg', 'photoBench'] };

function renderFuture(animate = false) {
  const cards = tx('futCards');
  const [kind, title, know, body] = cards[state.future];
  const photo = cardPhoto(state.future, cards.length);
  $stage.classList.toggle('photo-on', !!photo);
  setProv();
  if (photo) {
    $('#fu-photo-img').src = PHOTOS[photo][0];
    $('#fu-photo-cap').textContent = tx(PHOTOS[photo][1]);
  }
  $('#fu-title').textContent = title;
  // a provocation has two voices: what is known (checked) and what if (a guess)
  const kn = $('#fu-know');
  kn.textContent = know;
  if (know) kn.dataset.label = tx('futKnow'); else delete kn.dataset.label;
  const bd = $('#fu-body');
  bd.textContent = body;
  if (kind !== 'q' && kind !== 'l') bd.dataset.label = tx('futWhatIf'); else delete bd.dataset.label;
  // the letters from the AI are set as continuous text with the attribution underneath
  if (kind === 'l') delete kn.dataset.label;
  $('#future').classList.toggle('letter', kind === 'l');
  const dots = $('#fu-dots');
  if (dots.children.length !== cards.length) {
    dots.textContent = '';
    let end = 0;
    FUT_CHAPTER_SIZES.forEach((size, c) => {
      for (let i = 0; i < size; i++) {
        const dot = document.createElement('i');
        if (i === 0 && c > 0) dot.className = 'gap';
        dots.appendChild(dot);
      }
      end += size;
    });
    for (let i = end; i < cards.length; i++) dots.appendChild(document.createElement('i'));
  }
  [...dots.children].forEach((d, i) => d.classList.toggle('on', i === state.future));
  updateVoice();
  if (animate) {
    const box = $('#future');
    box.classList.remove('fu-in');
    void box.offsetWidth;
    box.classList.add('fu-in');
  }
}

function setNext(key) {
  if (state.nextKey === key) return;
  state.nextKey = key;
  const btn = $('#btn-next');
  btn.textContent = key ? tx(key) : '';
  btn.classList.toggle('ready', !!key);
}

/** "Dál": the visitor moves the run on to its next stage. */
function advance() {
  if (state.phase !== 'run' || !state.nextKey) return;
  const now = performance.now();
  setNext(null);
  touch(now);
  if (state.stage.i >= 3) { enterResult(now); return; }
  state.stage = { i: state.stage.i + 1, at: now };
}

function renderBeats() {
  const host = $('#narration');
  const { stage, shown } = state.beats;
  const lines = stage >= 0 ? tx(`narr${stage}`) : [];
  while (host.children.length > shown) host.lastChild.remove();
  for (let k = 0; k < shown; k++) {
    let p = host.children[k];
    if (!p) {
      p = document.createElement('p');
      p.className = 'beat';
      host.appendChild(p);
      requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('in')));
    }
    p.textContent = lines[k];
    p.classList.toggle('old', k < shown - 1);
  }
}

function clearBeats() {
  state.beats = { stage: -1, shown: 0 };
  $('#narration').textContent = '';
}

/** Reveal the beats of run stage `i` that are due `e` ms after the stage began. */
function showBeats(i, e) {
  const at = BEAT_AT[i];
  let shown = 0;
  while (shown < at.length && e >= at[shown]) shown++;
  if (state.beats.stage === i && state.beats.shown === shown) return;
  if (state.beats.stage !== i) $('#narration').textContent = '';
  state.beats = { stage: i, shown };
  renderBeats();
}

const beatsRead = (i, e) => e >= BEAT_AT[i][BEAT_AT[i].length - 1] + BEAT_DWELL;

function setPhase(name, now = performance.now()) {
  state.readAll = false;
  voice.stop();
  measured?.stop();
  answers?.stop();
  document.querySelector('#about')?.classList.remove('open');
  document.querySelector('#btn-about')?.classList.remove('on');
  state.phase = name;
  state.phaseAt = now;
  state.lastActivity = now;
  setNext(null);
  clearBeats();
  if (name === 'run') state.stage = { i: 0, at: now };
  const side = $stage.classList.contains('apparatus-left') ? 'apparatus-left' : 'apparatus-right';
  $stage.className = `phase-${name} ${side}`;
  if (name === 'idle') {
    setLang('cs');
    state.pb = null;
    state.idleNextAt = now + 600;
    setStep('stepIdle');
  } else if (name === 'draw') {
    state.pb = null;
    surface.clear();
    $('#drawbox').classList.remove('warn');
    setStep('stepDraw');
  } else if (name === 'result') {
    setStep('step4');
  } else if (name === 'future') {
    setStep('stepFuture');
    state.future = 0;
    renderFuture(true);
  } else if (name === 'answers') {
    setStep('stepAnswers');
    answers?.enter();
  } else if (name === 'sound') {
    setStep('stepMeasured');
    measured?.enter();
  } else if (name === 'deep') {
    setStep('stepDeep');
    deep.enter(state.sub ? state.sub.img8 : state.lastIdle8, !!state.sub, now);
  }
  syncNav();
  setProv();
}

/** The top navigation shows where the visitor is: result, one of the two experiments, or the future. */
const SIM_PHASES = ['idle', 'draw', 'run', 'result', 'deep'];

/** The footer tells what the curves on this screen are: the simulation (most screens) or a recording (two tabs). */
function setProv() {
  const photo = state.phase === 'future' && $stage.classList.contains('photo-on');
  $('#prov').textContent = tx(photo ? 'provPhoto' : state.phase === 'answers' ? 'provRecorded' : state.phase === 'sound' ? 'provSound' : 'provenance');
}

/** The three main sections are tabs in the bar; the sub-navigation shows only inside the simulation's deep views. */
function syncNav() {
  $('#tab-sim').classList.toggle('on', SIM_PHASES.includes(state.phase));
  $('#tab-sound')?.classList.toggle('on', state.phase === 'sound');
  $('#tab-answers')?.classList.toggle('on', state.phase === 'answers');
  $('#tab-future').classList.toggle('on', state.phase === 'future');
  const here = state.phase === 'deep' ? deep.view : state.phase;
  for (const btn of document.querySelectorAll('#nav button')) btn.classList.toggle('on', btn.dataset.go === here);
}

function go(where) {
  touch();
  if (where === 'sim') {
    if (!SIM_PHASES.includes(state.phase)) setPhase(state.sub ? 'result' : 'draw');
  } else if (where === 'sound' || where === 'future' || where === 'answers') {
    if (state.phase !== where) setPhase(where);
  } else if (where === 'light' || where === 'decide') {
    if (state.phase !== 'deep') setPhase('deep');
    deep.show(where);
    syncNav();
  } else if (state.phase !== where) {
    setPhase(where);
  }
}

/** Compute everything the screen needs from one simulated run. */
function playbackFor(run, now, lead = 0) {
  return { run, nodes: liveliestNodes(run, model.n, 6), meanS: meanSlow(run, model.n), startAt: now + lead, p: 0 };
}

function pushGhost(pb) {
  if (!pb) return;
  state.ghosts.push({ run: pb.run, nodes: pb.nodes, meanS: pb.meanS });
  if (state.ghosts.length > 3) state.ghosts.shift();
}

// ---- idle: the simulation runs by itself ---------------------------------------------------

function startIdleRun(now) {
  let idx;
  let label;
  do {
    idx = data.meta.train_count + Math.floor(Math.random() * data.meta.test_count);
    label = data.labels[idx];
  } while (label === state.idleLabel);
  state.idleLabel = label;
  const img8 = data.x8.subarray(idx * 64, idx * 64 + 64);
  state.lastIdle8 = img8;   // the advanced layer shows this digit when nobody has drawn one
  const run = runDigit(model, img8);
  pushGhost(state.pb);
  state.pb = playbackFor(run, now, IDLE_LEAD);
  drawGrid8($('#cv-idle8'), img8);
}

// ---- drawing -------------------------------------------------------------------------------

function touch(now = performance.now()) {
  state.lastActivity = now;
}

function updatePreview() {
  state.previewTimer = 0;
  const ink = surface.getInk();
  const side = surface.inkSize;
  drawGrid8($('#cv-preview'), inkTo8x8(ink, side, side));
}

function onDrawChange(kind) {
  touch();
  $('#drawbox').classList.toggle('inked', surface.hasInk);
  if (kind === 'down' || kind === 'clear') $('#drawbox').classList.remove('warn');
  if (!state.previewTimer) state.previewTimer = setTimeout(updatePreview, kind === 'clear' ? 0 : 90);
}

function submit() {
  if (state.phase !== 'draw') return;
  const side = surface.inkSize;
  const img8 = inkTo8x8(surface.getInk(), side, side);
  if (!img8) {
    const box = $('#drawbox');
    box.classList.add('warn');
    setTimeout(() => box.classList.remove('warn'), 2400);
    return;
  }
  const now = performance.now();
  const run = runDigit(model, img8);
  // keep the drawing for the dissolve, in warm white
  const snap = document.createElement('canvas');
  snap.width = side;
  snap.height = side;
  const c = snap.getContext('2d');
  c.drawImage(surface.inkCanvas, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = '#efe8d6';
  c.fillRect(0, 0, side, side);
  pushGhost(state.pb);
  state.sub = { run, img8, inkSnap: snap };
  state.pb = playbackFor(run, now);   // p stays 0 until the run segment of the timeline begins
  setPhase('run', now);
}

// ---- per-frame update ----------------------------------------------------------------------

function runTimeline(now) {
  const st = state.stage;
  const e = now - st.at;
  let ink = 0;
  let unfold = 0;
  let slot = -1;
  let slotFrac = 0;
  let ready = false;

  if (st.i === 0) {
    ink = 1 - easeInOut(clamp01(e / T_INK));
    ready = e >= T_INK && beatsRead(0, e);
    setStep('step1');
  } else if (st.i === 1) {
    unfold = easeInOut(clamp01(e / T_UNFOLD));
    ready = e >= T_UNFOLD && beatsRead(1, e);
    setStep('step2');
  } else if (st.i === 2) {
    unfold = 1;
    const p = Math.min(model.steps, e / PLAY_MS_PER_STEP);
    state.pb.p = p;
    ready = p >= model.steps && beatsRead(2, e);
    if (p < model.steps) {
      const sp = p / model.stepsPerSlot;
      slot = Math.min(7, Math.floor(sp));
      slotFrac = sp - slot;
    }
    setStep('step3');
  } else {
    unfold = 1;
    state.pb.p = model.steps;
    ready = beatsRead(3, e);
    setStep('step4');
  }
  showBeats(st.i, e);
  setNext(ready ? NEXT_KEYS[st.i] : null);
  return { ink, unfold, slot, slotFrac };
}

function enterResult(now) {
  setPhase('result', now);
  renderResultText();
  const digit = $('#digit');
  digit.classList.remove('reveal');
  void digit.offsetWidth;   // restart the animation
  digit.classList.add('reveal');
}

function renderResultText() {
  const run = state.sub?.run;
  if (!run) return;
  $('#result-lead').textContent = tx(run.unsure ? 'resultUnsure' : 'resultLead');
  $('#digit').textContent = String(run.pred);
  $('#digit').classList.toggle('unsure', run.unsure);
  $('#result-hint').textContent = run.unsure ? tx('resultUnsureHint') : '';
}

function update(now) {
  if (voice.isPlaying() || measured?.isPlaying() || answers?.isPlaying()) state.lastActivity = now;   // a card being read aloud is not an idle screen
  if (state.phase === 'idle') {
    if (now >= state.idleNextAt) {
      const pb = state.pb;
      const done = pb && pb.p >= model.steps && now - pb.startAt - model.steps * PLAY_MS_PER_STEP > IDLE_HOLD;
      if (!pb || done) startIdleRun(now);
    }
    if (state.pb) state.pb.p = clamp01((now - state.pb.startAt) / (model.steps * PLAY_MS_PER_STEP)) * model.steps;
    if (now - state.lastActivity > 60000 && now - state.bootAt > RELOAD_AFTER) location.reload();
  } else if (state.phase === 'draw' || (state.phase === 'run' && state.nextKey)) {
    if (now - state.lastActivity > DRAW_TIMEOUT) setPhase('idle', now);
  } else if (state.phase === 'result' || state.phase === 'deep' || state.phase === 'future' || state.phase === 'sound' || state.phase === 'answers') {
    if (now - state.lastActivity > RESULT_TIMEOUT) setPhase('idle', now);
  }
}

function render(now) {
  let pb = state.pb && state.pb.p >= 0 ? state.pb : null;
  if (state.phase === 'future' && pb) {
    const span = model.steps * PLAY_MS_PER_STEP * 1.6;
    pb = { ...pb, p: Math.min(model.steps, ((now - state.phaseAt) % span) / PLAY_MS_PER_STEP) };
  }
  scope.draw({
    playback: pb,
    ghosts: state.ghosts,
    slow,
  });

  if (state.phase === 'run') {
    const tl = runTimeline(now);
    drawPulses($('#cv-pulse'), state.sub.run, state.sub.inkSnap, tl);
    material.draw(tl.unfold >= 1 ? state.pb : null);
  } else if (state.phase === 'future') {
    material.draw(pb);
  } else if (state.phase === 'deep') {
    deep?.draw(now);
  } else if (state.phase === 'sound') {
    measured?.draw(now);
  } else if (state.phase === 'answers') {
    answers?.draw(now);
  } else if (state.phase === 'result') {
    const reveal = easeInOut(clamp01((now - state.phaseAt) / BARS_REVEAL));
    drawBars($('#cv-bars'), state.sub.run.scores, state.sub.run.pred, reveal);
  } else {
    material.draw(state.phase === 'idle' ? state.pb : null);
  }
}

// ---- grain: a few pre-rendered noise frames, cycled ----------------------------------------

function makeGrain() {
  const cv = $('#grain');
  cv.width = 480;
  cv.height = 270;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const c = document.createElement('canvas');
    c.width = cv.width;
    c.height = cv.height;
    const g = c.getContext('2d');
    const img = g.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    frames.push(c);
  }
  const ctx = cv.getContext('2d');
  let k = 0;
  setInterval(() => { ctx.drawImage(frames[k++ % frames.length], 0, 0); }, 140);
}

// ---- wiring --------------------------------------------------------------------------------

function refreshLang() {
  state.readAll = false;
  applyCopy();
  setProv();
  const step = state.stepKey;
  state.stepKey = null;
  setStep(step);
  for (const b of document.querySelectorAll('#lang button')) b.classList.toggle('on', b.dataset.lang === getLang());
  renderBeats();
  renderResultText();
  deep?.refresh();
  measured?.refresh();
  answers?.refresh();
  if (state.phase === 'future') renderFuture();
  $('#btn-next').textContent = state.nextKey ? tx(state.nextKey) : '';
}

function recoverFromError(err) {
  console.error('[expo]', err);
  const now = performance.now();
  state.errors = state.errors.filter((t) => now - t < 60000);
  state.errors.push(now);
  if (state.errors.length >= 4) { location.reload(); return; }
  try { setPhase('idle', now); } catch { location.reload(); }
}

function wire() {
  $stage.addEventListener('pointerdown', (e) => {
    touch();
    if (state.phase === 'idle' && performance.now() - state.phaseAt > 700 && !e.target.closest('#lang, #tabs, #about')) {
      setPhase('draw');
    }
  });
  $('#btn-clear').addEventListener('click', () => { surface.clear(); });
  $('#btn-send').addEventListener('click', submit);
  $('#btn-again').addEventListener('click', () => { setPhase('draw'); });
  $('#btn-next').addEventListener('click', advance);
  for (const b of document.querySelectorAll('#nav button, #tabs button[data-go], .door')) b.addEventListener('click', () => go(b.dataset.go));
  $('#btn-fu-next').addEventListener('click', () => {
    touch();
    stopReadAll();
    state.future = (state.future + 1) % tx('futCards').length;
    renderFuture(true);
  });
  const about = (open) => { $('#about').classList.toggle('open', open); $('#btn-about').classList.toggle('on', open); };
  $('#btn-about').addEventListener('click', () => { touch(); about(!$('#about').classList.contains('open')); });
  $('#btn-about-close').addEventListener('click', () => { touch(); about(false); });
  $('#about').addEventListener('pointerdown', (e) => { if (e.target.id === 'about') { touch(); about(false); } });
  $('#btn-voice').addEventListener('click', () => {
    touch();
    if (voice.isPlaying()) { stopReadAll(); return; }
    state.readAll = false;
    voice.speak(state.voiceSrc, voice.speakable(cardText(), getLang()), getLang(), voiceLabel);
    voiceLabel();
  });
  $('#btn-voice-all').addEventListener('click', () => {
    touch();
    if (state.readAll) { stopReadAll(); return; }
    state.readAll = true;
    voiceLabel();
    readAllStep();
  });
  $('#btn-fu-back').addEventListener('click', () => { go('sim'); });
  $('#btn-deep-back').addEventListener('click', () => { setPhase('result'); });
  for (const b of document.querySelectorAll('#lang button')) {
    b.addEventListener('click', () => { touch(); setLang(b.dataset.lang); });
  }
  onLang(refreshLang);

  // a gallery screen must not zoom, scroll, select or open menus
  for (const type of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'gesturechange']) {
    document.addEventListener(type, (e) => e.preventDefault());
  }
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  // staff: L moves the signal column to the other side of the screen
  document.addEventListener('keydown', (e) => {
    if (e.key === 'l' || e.key === 'L') setSide($stage.classList.contains('apparatus-left') ? 'right' : 'left');
  });
  window.addEventListener('resize', fitStage);
  window.addEventListener('error', (e) => recoverFromError(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => recoverFromError(e.reason));

  // watchdog: if frames stop while the page is visible, start over
  setInterval(() => {
    if (!document.hidden && performance.now() - state.lastFrame > STALL_MS) location.reload();
  }, 5000);
}

function frame(now) {
  state.lastFrame = now;
  try {
    update(now);
    render(now);
  } catch (err) {
    recoverFromError(err);
  }
  requestAnimationFrame(frame);
}

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.has('kiosk')) document.body.classList.add('kiosk');
  setSide(sideFromEnv());
  fitStage();
  applyCopy();
  for (const b of document.querySelectorAll('#lang button')) b.classList.toggle('on', b.dataset.lang === getLang());
  $('#step').textContent = tx('stepIdle');
  makeGrain();

  try {
    const czech = 'MŮŽE HMOTA POČÍTAT? řešíš ěščřžýáíé';
    await Promise.all([
      document.fonts.load("400 40px 'Instrument Serif'", czech),
      document.fonts.load("italic 400 40px 'Instrument Serif'", czech),
      document.fonts.load("400 20px 'IBM Plex Mono'", czech),
      document.fonts.load("500 20px 'IBM Plex Mono'", czech),
    ]);
    [model, data] = await Promise.all([loadModel(), loadData()]);
    light = await loadLight().catch(() => null);   // the advanced screen is optional
    measuredData = await loadMeasured().catch(() => null);   // so is the sound of the sample
    pairsData = await loadPairs().catch(() => null);         // and its two-pulse view
    answersData = await loadAnswers().catch(() => null);     // and the stack of 200 answers
    afternoonData = await loadAfternoon().catch(() => null);  // and the whole afternoon
  } catch (err) {
    console.error('[expo] load failed', err);
    setTimeout(() => location.reload(), 10000);
    return;
  }
  slow = Math.round(PLAY_MS_PER_STEP / model.stepMs);
  scope = createScope($('#cv-scope'), model);
  material = createMaterial($('#cv-material'), model);
  surface = createDrawSurface($('#cv-draw'), { onChange: onDrawChange });
  surface.redraw();
  fitStage();
  wire();
  if (light) deep = initDeep({ model, light, slow, touch });
  else for (const b of document.querySelectorAll('[data-go=light], [data-go=decide]')) b.remove();
  if (answersData) answers = initAnswers({ data: answersData, afternoon: afternoonData, touch });
  else $('#tab-answers').remove();
  if (measuredData) {
    const fallback8 = () => data.x8.subarray((data.meta.train_count + 7) * 64, (data.meta.train_count + 8) * 64);
    measured = initMeasured({
      model, data: measuredData, pairs: pairsData, touch,
      getRun: () => (state.sub ? state.sub.run : runDigit(model, state.lastIdle8 || fallback8())),
    });
  } else {
    $('#tab-sound').remove();
  }
  setPhase('idle');
  requestAnimationFrame(frame);

  // handles for staff and tests
  window.__expo = { state, setPhase, submit, surface, model, get data() { return data; } };
}

boot();
