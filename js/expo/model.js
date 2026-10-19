/**
 * Exhibition model: the Playground's reservoir (js/reservoir.js) plus the readout
 * trained offline by tools/train_expo_readout.mjs (data/expo-readout.json).
 *
 * Everything the exhibition draws as a signal comes out of `runDigit`:
 *   x, s    state of every node after every simulation step (fast / slow variable)
 *   u       pulse level on each of the 8 input channels at every step
 *   scores  raw ridge-readout scores, one per digit
 * Nothing here is measured on the physical sample — it is the simulation.
 */
import { createReservoir, N_CHANNELS, N_SLOTS } from '../reservoir.js';
import { scores as readoutScores, NUM_CLASSES } from '../readout.js';

/**
 * Margin (best - second score) below which the screen says the model is unsure.
 * Measured on 3000 MNIST test digits: below 0.15 the readout is right 58 % of the time
 * (12.5 % of digits), at or above it 96.5 %.
 */
export const UNSURE_MARGIN = 0.15;

export async function loadModel(url = 'data/expo-readout.json') {
  const spec = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`readout: ${r.status}`);
    return r.json();
  });
  const reservoir = createReservoir(spec.params);
  const readout = { W: Float64Array.from(spec.W), dim: spec.dim, d: spec.d, numClasses: NUM_CLASSES };
  if (spec.dim !== N_SLOTS * 2 * reservoir.dims.n || spec.encoding !== 'analog' || spec.capture !== 'all') {
    throw new Error('readout: unexpected format');
  }
  const k = reservoir.cfg.k;
  return {
    spec,
    reservoir,
    readout,
    n: reservoir.dims.n,
    steps: N_SLOTS * k,
    stepsPerSlot: k,
    slotMs: reservoir.cfg.slotMs,
    stepMs: reservoir.cfg.slotMs / k,
  };
}

/**
 * Run one 8x8 drawing (0..255 per pixel) through the reservoir and the readout.
 * `opts.gain` is the light on the sample (input gain, 1 = dark, 2 = full light as in the lab
 * Guide); `opts.readout` replaces the dark-trained readout (e.g. one retrained under light).
 * @returns {{values: Float32Array, x: Float32Array, s: Float32Array, u: Float32Array,
 *   scores: Float32Array, pred: number, margin: number, unsure: boolean, steps: number}}
 */
export function runDigit(model, img8, opts = {}) {
  const { reservoir, n, steps } = model;
  const readout = opts.readout || model.readout;
  const values = new Float64Array(64);
  for (let j = 0; j < 64; j++) values[j] = img8[j] / 255;

  const x = new Float32Array(steps * n);
  const s = new Float32Array(steps * n);
  const u = new Float32Array(steps * N_CHANNELS);
  const { perSlot } = reservoir.runSample(values, {
    keepState: true,
    gainScale: opts.gain || 1,
    onStep: (step, xs, ss, us) => {
      x.set(xs, step * n);
      s.set(ss, step * n);
      u.set(us, step * N_CHANNELS);
    },
  });

  const features = Float32Array.from(perSlot);
  const sc = readoutScores(readout, features, readout.dim, 1);
  let pred = 0;
  for (let c = 1; c < NUM_CLASSES; c++) if (sc[c] > sc[pred]) pred = c;
  let second = -Infinity;
  for (let c = 0; c < NUM_CLASSES; c++) if (c !== pred && sc[c] > second) second = sc[c];
  const margin = sc[pred] - second;
  return { values: Float32Array.from(values), features, x, s, u, scores: sc, pred, margin, unsure: margin < UNSURE_MARGIN, steps };
}

/** The `count` nodes whose fast state varies most during the run (for the scope traces). */
export function liveliestNodes(run, n, count) {
  const var_ = new Float64Array(n);
  const mean = new Float64Array(n);
  const steps = run.steps;
  for (let t = 0; t < steps; t++) for (let i = 0; i < n; i++) mean[i] += run.x[t * n + i] / steps;
  for (let t = 0; t < steps; t++) {
    for (let i = 0; i < n; i++) {
      const d = run.x[t * n + i] - mean[i];
      var_[i] += d * d;
    }
  }
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => var_[b] - var_[a]).slice(0, count);
}
