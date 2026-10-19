/**
 * Readout layer — the trainable part of the reservoir pipeline.
 *
 * The paper trains a fully connected layer with softmax + cross-entropy for
 * 200 epochs. We provide:
 *   - fitRidge: one-shot regularized least squares (instant; used for live tweaking)
 *   - fitSGD:   mini-batch gradient descent on softmax cross-entropy (paper-style)
 */
import { mulberry32 } from './reservoir.js';

export const NUM_CLASSES = 10;

function choleskySolve(A, d, B, nRhs) {
  const L = new Float64Array(d * d);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * d + j];
      for (let k = 0; k < j; k++) sum -= L[i * d + k] * L[j * d + k];
      if (i === j) {
        if (sum <= 1e-14) return null;
        L[i * d + j] = Math.sqrt(sum);
      } else {
        L[i * d + j] = sum / L[j * d + j];
      }
    }
  }
  const X = new Float64Array(d * nRhs);
  for (let r = 0; r < nRhs; r++) {
    const y = new Float64Array(d);
    for (let i = 0; i < d; i++) y[i] = B[i * nRhs + r];
    // forward substitution
    for (let i = 0; i < d; i++) {
      let sum = y[i];
      for (let k = 0; k < i; k++) sum -= L[i * d + k] * y[k];
      y[i] = sum / L[i * d + i];
    }
    // backward substitution
    for (let i = d - 1; i >= 0; i--) {
      let sum = y[i];
      for (let k = i + 1; k < d; k++) sum -= L[k * d + i] * y[k];
      y[i] = sum / L[i * d + i];
    }
    for (let i = 0; i < d; i++) X[i * nRhs + r] = y[i];
  }
  return X; // d x nRhs
}

/**
 * Ridge regression: solve (X^T X + lambda I) W = X^T Y, with bias feature appended.
 *
 * The covariance is computed from a transposed copy of X so the inner loops are
 * contiguous dot products (this keeps the full-MNIST fit interactive).
 *
 * @returns {{W: Float64Array, dim:number, d:number, numClasses:number, lambda:number}}
 *   W is row-major (d x 10), row `dim` is the bias.
 */
export function fitRidge(X, labels, dim, count, lambda) {
  const C = NUM_CLASSES;
  const d = dim + 1;

  // transpose (dim x count), float32 is enough and halves the footprint
  const Xt = new Float32Array(dim * count);
  for (let m = 0; m < count; m++) {
    const base = m * dim;
    for (let i = 0; i < dim; i++) Xt[i * count + m] = X[base + i];
  }

  const A = new Float64Array(d * d);
  const B = new Float64Array(d * C);

  for (let i = 0; i < dim; i++) {
    const rowI = i * count;
    for (let j = 0; j <= i; j++) {
      const rowJ = j * count;
      let m = 0;
      let a0 = 0;
      let a1 = 0;
      let a2 = 0;
      let a3 = 0;
      const lim = count - 3;
      for (; m < lim; m += 4) {
        a0 += Xt[rowI + m] * Xt[rowJ + m];
        a1 += Xt[rowI + m + 1] * Xt[rowJ + m + 1];
        a2 += Xt[rowI + m + 2] * Xt[rowJ + m + 2];
        a3 += Xt[rowI + m + 3] * Xt[rowJ + m + 3];
      }
      let acc = ((a0 + a1) + (a2 + a3));
      for (; m < count; m++) acc += Xt[rowI + m] * Xt[rowJ + m];
      A[i * d + j] = acc;
      A[j * d + i] = acc;
    }
    const bRow = i * C;
    let m = 0;
    const lim = count - 3;
    for (; m < lim; m += 4) {
      const x0 = Xt[rowI + m];
      const x1 = Xt[rowI + m + 1];
      const x2 = Xt[rowI + m + 2];
      const x3 = Xt[rowI + m + 3];
      B[bRow + labels[m]] += x0;
      B[bRow + labels[m + 1]] += x1;
      B[bRow + labels[m + 2]] += x2;
      B[bRow + labels[m + 3]] += x3;
    }
    for (; m < count; m++) B[bRow + labels[m]] += Xt[rowI + m];
    // bias row/column
    let rowSum = 0;
    for (let c = 0; c < C; c++) rowSum += B[bRow + c];
    A[i * d + dim] = rowSum;
    A[dim * d + i] = rowSum;
  }
  A[dim * d + dim] = count;
  const bBias = dim * C;
  for (let m = 0; m < count; m++) B[bBias + labels[m]] += 1;

  let lam = lambda;
  for (let i = 0; i < d; i++) A[i * d + i] += lam;
  let W = null;
  for (let attempt = 0; attempt < 6 && !W; attempt++) {
    const solved = choleskySolve(A, d, B, C);
    if (solved) {
      W = solved;
    } else {
      lam = Math.max(lam, 1e-12) * 10 + 1e-9;
      for (let i = 0; i < d; i++) A[i * d + i] += lam;
    }
  }
  if (!W) throw new Error('readout: ridge solve failed');
  return { W, dim, d, numClasses: C, lambda: lam, kind: 'ridge' };
}

/** Raw logits for every sample: Float32Array(count * 10). */
export function scores(model, X, dim, count) {
  const { W, d } = model;
  const C = NUM_CLASSES;
  const out = new Float32Array(count * C);
  for (let m = 0; m < count; m++) {
    const base = m * dim;
    for (let c = 0; c < C; c++) {
      let acc = W[(d - 1) * C + c];
      for (let i = 0; i < dim; i++) acc += X[base + i] * W[i * C + c];
      out[m * C + c] = acc;
    }
  }
  return out;
}

export function softmaxRow(logits, out, offset) {
  let max = -Infinity;
  for (let c = 0; c < NUM_CLASSES; c++) if (logits[offset + c] > max) max = logits[offset + c];
  let sum = 0;
  for (let c = 0; c < NUM_CLASSES; c++) {
    const e = Math.exp(logits[offset + c] - max);
    out[c] = e;
    sum += e;
  }
  for (let c = 0; c < NUM_CLASSES; c++) out[c] /= sum;
  return out;
}

/** Accuracy, confusion matrix, and logits. */
export function evaluate(model, X, labels, dim, count) {
  const logits = scores(model, X, dim, count);
  const conf = new Int32Array(NUM_CLASSES * NUM_CLASSES);
  let correct = 0;
  for (let m = 0; m < count; m++) {
    const off = m * NUM_CLASSES;
    let best = 0;
    for (let c = 1; c < NUM_CLASSES; c++) if (logits[off + c] > logits[off + best]) best = c;
    const truth = labels[m];
    conf[truth * NUM_CLASSES + best]++;
    if (best === truth) correct++;
  }
  return { accuracy: correct / count, confusion: conf, logits };
}

/**
 * Softmax SGD (paper-style training loop).
 * @returns {{W: Float64Array, dim:number, d:number, numClasses:number, history:Array, kind:string}}
 */
export function fitSGD(X, labels, dim, count, opts = {}, evalSets = [], onEpoch = null) {
  const C = NUM_CLASSES;
  const d = dim + 1;
  const { epochs = 200, lr = 0.08, batch = 64, seed = 7, l2 = 1e-6 } = opts;
  const rng = mulberry32(seed);
  const W = new Float64Array(d * C);
  const idx = new Int32Array(count);
  for (let i = 0; i < count; i++) idx[i] = i;
  const G = new Float64Array(d * C);
  const prob = new Float64Array(C);
  const history = [];

  for (let ep = 0; ep < epochs; ep++) {
    for (let i = count - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = idx[i];
      idx[i] = idx[j];
      idx[j] = t;
    }
    G.fill(0);
    let loss = 0;
    for (let start = 0; start < count; start += batch) {
      const end = Math.min(count, start + batch);
      const bs = end - start;
      for (let b = start; b < end; b++) {
        const m = idx[b];
        const base = m * dim;
        const logit = new Float64Array(C);
        for (let i = 0; i < d; i++) {
          const xi = i < dim ? X[base + i] : 1;
          const wRow = i * C;
          for (let c = 0; c < C; c++) logit[c] += xi * W[wRow + c];
        }
        softmaxRow(logit, prob, 0);
        loss += -Math.log(Math.max(1e-12, prob[labels[m]]));
        for (let i = 0; i < d; i++) {
          const xi = i < dim ? X[base + i] : 1;
          const gRow = i * C;
          for (let c = 0; c < C; c++) {
            G[gRow + c] += xi * (prob[c] - (c === labels[m] ? 1 : 0));
          }
        }
      }
      const step = lr / bs;
      for (let i = 0; i < d * C; i++) W[i] -= step * G[i];
      if (l2 > 0) {
        const shrink = lr * l2;
        for (let i = 0; i < d * C; i++) W[i] -= shrink * W[i];
      }
      G.fill(0);
    }
    const entry = { epoch: ep + 1, loss: loss / count };
    for (const set of evalSets) {
      entry[set.name] = evaluate({ W, dim, d, numClasses: C }, set.X, set.labels, dim, set.count).accuracy;
    }
    history.push(entry);
    if (onEpoch) onEpoch(entry);
  }
  return { W, dim, d, numClasses: C, history, kind: 'sgd' };
}
