/**
 * Two-timescale echo-state reservoir.
 *
 * This is the model shared between the web app and the future ESP32 firmware.
 * It is physics-inspired by the WS2 nanotube cluster from the paper:
 *
 *   - fast leaky nonlinear nodes        (fast relaxation ~0.06 ms, SI Fig. 12;
 *                                        van der Waals barrier nonlinearity)
 *   - slow accumulator per node         (cumulative "read voltage" growth,
 *                                        Fig. 2l; nanobattery/parasitic capacitance)
 *   - sparse random recurrent wiring    (self-organized nanotube network)
 *
 * Input encoding matches the paper: 8 channels x 8 slots, bits -> 0/1 pulses.
 */

export const N_CHANNELS = 8;
export const N_SLOTS = 8;

export const RESERVOIR_DEFAULTS = {
  n: 64,                // number of nodes
  density: 0.08,        // fraction of nonzero recurrent weights per row
  rho: 0.9,             // target spectral radius of the recurrent matrix
  inputGain: 0.4,       // scale of input weights (tuned on MNIST)
  bias: 0.0,            // per-node bias
  tauFastMs: 0.06,      // fast relaxation time constant (paper SI Fig. 12)
  tauSlowMs: 20,        // slow accumulation time constant
  slotMs: 10,           // duration of one input slot (pixel)
  duty: 1.0,            // pulse duty cycle inside a slot (tuned on MNIST)
  k: 8,                 // simulation steps per slot
  nonlinearity: 'tanh', // 'tanh' | 'relu' | 'sigmoid'
  seed: 1234,
  mapping: 'row',       // 'row' (paper-like) | 'raster'
};

/** Deterministic 32-bit PRNG (bryc's mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NONLINEARITIES = {
  tanh: (x) => Math.tanh(x),
  relu: (x) => (x > 0 ? x : 0),
  sigmoid: (x) => 1 / (1 + Math.exp(-x)),
};

/**
 * Create a reservoir instance. Everything is deterministic for a given seed.
 *
 * bits layout (64 values, row-major 8x8):
 *   'row' mapping    -> channel c receives the pixels of row c, one per slot
 *   'raster' mapping -> slot t carries the pixels t*8 .. t*8+7 across channels
 */
export function createReservoir(config = {}) {
  const cfg = { ...RESERVOIR_DEFAULTS, ...config };
  const n = cfg.n | 0;
  const nIn = N_CHANNELS;
  const g = NONLINEARITIES[cfg.nonlinearity] || NONLINEARITIES.tanh;
  if (!(n > 0)) throw new Error('reservoir: n must be > 0');

  const rng = mulberry32(cfg.seed >>> 0);

  // ---- sparse recurrent weights, CSR ----
  const perRow = Math.max(1, Math.round(cfg.density * n));
  const rowPtr = new Int32Array(n + 1);
  const colsTmp = new Int32Array(n * perRow);
  const valsTmp = new Float64Array(n * perRow);
  let nnz = 0;
  for (let i = 0; i < n; i++) {
    rowPtr[i] = nnz;
    const used = new Set();
    const maxAttempts = 20 * perRow + 4 * n;
    let attempts = 0;
    while (used.size < perRow && attempts < maxAttempts) {
      used.add(Math.floor(rng() * n));
      attempts++;
    }
    for (const c of used) { // insertion order is deterministic
      colsTmp[nnz] = c;
      valsTmp[nnz] = rng() * 2 - 1;
      nnz++;
    }
  }
  rowPtr[n] = nnz;

  // ---- scale to the target spectral radius (power iteration) ----
  const spmv = (v, out) => {
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let j = rowPtr[i]; j < rowPtr[i + 1]; j++) acc += valsTmp[j] * v[colsTmp[j]];
      out[i] = acc;
    }
  };
  const v = new Float64Array(n).fill(1 / Math.sqrt(n));
  const nv = new Float64Array(n);
  let rhoEst = 0;
  for (let it = 0; it < 64; it++) {
    spmv(v, nv);
    let norm = 0;
    for (let i = 0; i < n; i++) norm += nv[i] * nv[i];
    norm = Math.sqrt(norm);
    if (norm < 1e-15) break;
    for (let i = 0; i < n; i++) v[i] = nv[i] / norm;
    rhoEst = norm;
  }
  const scale = rhoEst > 1e-12 ? cfg.rho / rhoEst : 1;
  const cols = new Int32Array(nnz);
  const vals = new Float32Array(nnz);
  for (let j = 0; j < nnz; j++) {
    cols[j] = colsTmp[j];
    vals[j] = valsTmp[j] * scale; // quantized to f32 (mirrored by tools/reference_esn.py)
  }

  // ---- input weights ----
  const win = new Float32Array(n * nIn);
  for (let i = 0; i < win.length; i++) win[i] = (rng() * 2 - 1) * cfg.inputGain;

  const kInner = Math.max(1, cfg.k | 0);
  const dt = cfg.slotMs / kInner;
  const aF = cfg.tauFastMs > 0 ? Math.min(1, dt / cfg.tauFastMs) : 1;
  const aS = cfg.tauSlowMs > 0 ? Math.min(1, dt / cfg.tauSlowMs) : 1;
  const activeSteps = Math.round(kInner * cfg.duty);

  const x = new Float64Array(n);
  const s = new Float64Array(n);
  const xNext = new Float64Array(n);
  const u = new Float64Array(nIn);

  /**
   * Run one digit sample.
   * @param {Uint8Array|number[]} bits 64 values, 0/1, row-major
   * @param {{gainScale?:number, keepState?:boolean, onStep?:(step:number, x:Float64Array, s:Float64Array, u:Float64Array)=>void}} [opts]
   *   onStep fires after every simulation step (8 slots x k steps) with the live state arrays.
   * @returns {{features: Float64Array, perSlot: Float64Array|null}}
   *   features: [x(n), s(n)] of the final slot (paper: "state at the final timestep")
   *   perSlot: 8 slots x [x(n), s(n)], if keepState is true
   */
  function runSample(bits, opts = {}) {
    if (!opts.keepState) restart();
    const { gainScale = 1 } = opts;
    const perSlot = opts.keepState ? new Float64Array(N_SLOTS * 2 * n) : null;

    for (let t = 0; t < N_SLOTS; t++) {
      for (let step = 0; step < kInner; step++) {
        const on = step < activeSteps ? 1 : 0;
        for (let c = 0; c < nIn; c++) {
          const bit = cfg.mapping === 'raster' ? bits[t * nIn + c] : bits[c * N_SLOTS + t];
          u[c] = on ? bit : 0;
        }
        for (let i = 0; i < n; i++) {
          let acc = cfg.bias;
          for (let j = rowPtr[i]; j < rowPtr[i + 1]; j++) acc += vals[j] * x[cols[j]];
          const base = i * nIn;
          for (let c = 0; c < nIn; c++) acc += win[base + c] * u[c] * gainScale;
          const y = g(acc);
          xNext[i] = (1 - aF) * x[i] + aF * y;
        }
        for (let i = 0; i < n; i++) {
          x[i] = xNext[i];
          s[i] = (1 - aS) * s[i] + aS * x[i];
        }
        if (opts.onStep) opts.onStep(t * kInner + step, x, s, u);
      }
      if (perSlot) {
        const o = t * 2 * n;
        perSlot.set(x, o);
        perSlot.set(s, o + n);
      }
    }

    const features = new Float64Array(2 * n);
    features.set(x, 0);
    features.set(s, n);
    return { features, perSlot };
  }

  function restart() {
    x.fill(0);
    s.fill(0);
  }

  /**
   * Run many samples; returns Float32Array of features, count x d where
   * d = 2n ('final') or 16n ('all': every slot's [x, s] concatenated).
   * @param {Uint8Array} bitsFlat count * 64 bits
   * @param {number} count
   * @param {{gainScale?:number, capture?:'final'|'all', onProgress?:(done:number)=>void}} [opts]
   */
  function runDataset(bitsFlat, count, opts = {}) {
    const { gainScale = 1, capture = 'final', onProgress } = opts;
    const perSample = capture === 'all' ? N_SLOTS * 2 * n : 2 * n;
    const out = new Float32Array(count * perSample);
    const scratch = new Float64Array(64);
    for (let m = 0; m < count; m++) {
      for (let j = 0; j < 64; j++) scratch[j] = bitsFlat[m * 64 + j];
      const { features, perSlot } = runSample(scratch, { gainScale, keepState: capture === 'all' });
      if (capture === 'all') {
        for (let j = 0; j < perSlot.length; j++) out[m * perSample + j] = perSlot[j];
      } else {
        for (let j = 0; j < 2 * n; j++) out[m * perSample + j] = features[j];
      }
      if (onProgress && (m % 256 === 255)) onProgress(m + 1);
    }
    if (onProgress) onProgress(count);
    return out;
  }

  return {
    cfg,
    dims: { n, nIn, slots: N_SLOTS, featureDim: 2 * n },
    rowPtr,
    cols,
    vals,
    win,
    rhoEst,
    runSample,
    runDataset,
    restart,
  };
}
