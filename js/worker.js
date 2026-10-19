/**
 * Web worker: runs the reservoir over MNIST subsets and trains the readout.
 *
 * main -> worker:
 *   { cmd:'data', x8, labels, meta }
 *   { cmd:'compute', reqId, source, params, encoding, threshold, noiseSigma,
 *     capture, trainCount, testCount, method, ridgeLambda, sgd, demoIndex }
 *   { cmd:'demo', index }
 *   { cmd:'sample', params, values64 }   (one sample, keepState -> perSlot)
 *
 * worker -> main:
 *   { type:'ready' }
 *   { type:'progress', reqId, stage, done?, total? }
 *   { type:'result', reqId, source, ... }
 *   { type:'demo', index, perSlot, scores, inputs }
 *   { type:'sample', reqId, perSlot, features }
 *   { type:'error', message }
 */
import { createReservoir, mulberry32 } from './reservoir.js';
import { fitRidge, fitSGD, evaluate } from './readout.js';
import { pca2 } from './analytics.js';

let DATA = null;
let reservoir = null;
let reservoirSig = '';
let last = null; // { testInputs, testScores, dim, testCount }

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.cmd === 'data') {
      DATA = { x8: new Uint8Array(msg.x8), labels: new Uint8Array(msg.labels), meta: msg.meta };
      self.postMessage({ type: 'ready' });
    } else if (msg.cmd === 'compute') {
      await doCompute(msg);
    } else if (msg.cmd === 'demo') {
      doDemo(msg);
    } else if (msg.cmd === 'sample') {
      doSample(msg);
    }
  } catch (err) {
    self.postMessage({ type: 'error', reqId: msg.reqId, message: String((err && err.stack) || err) });
  }
};

function gaussian(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Encode raw 8x8 MNIST into reservoir input values (binary 0/1 or analog 0..1). */
function packInput(encoding, startIndex, count, threshold, noiseSigma, seed) {
  const out = new Float32Array(count * 64);
  const rng = mulberry32(seed);
  for (let m = 0; m < count; m++) {
    const base = (startIndex + m) * 64;
    for (let j = 0; j < 64; j++) {
      let px = DATA.x8[base + j] / 255;
      if (noiseSigma > 0) px += gaussian(rng) * noiseSigma;
      if (encoding === 'binary') px = px >= threshold ? 1 : 0;
      else px = Math.max(0, Math.min(1, px));
      out[m * 64 + j] = px;
    }
  }
  return out;
}

function getReservoir(params) {
  const sig = JSON.stringify(params);
  if (!reservoir || sig !== reservoirSig) {
    reservoir = createReservoir(params);
    reservoirSig = sig;
  }
  return reservoir;
}

async function doCompute(msg) {
  const t0 = performance.now();
  const {
    reqId = 0, source = 'playground',
    params, encoding = 'analog', threshold = 0.2, noiseSigma = 0, capture = 'all',
    trainCount, testCount, method = 'ridge', ridgeLambda = 1e-3, sgd = {}, demoIndex = 0,
    light = 1, lightTest = null,
  } = msg;
  const gTrain = light || 1;
  const gTest = lightTest != null ? lightTest : gTrain;

  const post = (stage, done, total) => self.postMessage({ type: 'progress', reqId, source, stage, done, total });
  const res = getReservoir(params);
  post('pack');
  const trainInputs = packInput(encoding, 0, trainCount, threshold, noiseSigma, 11);
  const testInputs = packInput(encoding, DATA.meta.train_count, testCount, threshold, noiseSigma, 22);

  post('run-train', 0, trainCount);
  const tSim0 = performance.now();
  const Xtr = res.runDataset(trainInputs, trainCount, {
    capture,
    gainScale: gTrain,
    onProgress: (done) => post('run-train', done, trainCount),
  });
  post('run-test', 0, testCount);
  const Xte = res.runDataset(testInputs, testCount, {
    capture,
    gainScale: gTest,
    onProgress: (done) => post('run-test', done, testCount),
  });
  const tSim1 = performance.now();

  const ytr = DATA.labels.subarray(0, trainCount);
  const yte = DATA.labels.subarray(DATA.meta.train_count, DATA.meta.train_count + testCount);
  const dim = (capture === 'all' ? 16 : 2) * res.dims.n;

  let model;
  let history = null;
  if (method === 'sgd') {
    const epochs = sgd.epochs ?? 200;
    let lastPost = 0;
    model = fitSGD(
      Xtr, ytr, dim, trainCount,
      { epochs, lr: sgd.lr ?? 0.08, batch: sgd.batch ?? 64 },
      [
        { name: 'train', X: Xtr, labels: ytr, count: trainCount },
        { name: 'test', X: Xte, labels: yte, count: testCount },
      ],
      (entry) => {
        if (entry.epoch - lastPost >= 4 || entry.epoch === epochs) {
          lastPost = entry.epoch;
          post('train', entry.epoch, epochs);
        }
      },
    );
    history = model.history;
  } else {
    model = fitRidge(Xtr, ytr, dim, trainCount, ridgeLambda);
  }
  const tFit = performance.now();

  const evTrain = evaluate(model, Xtr, ytr, dim, trainCount);
  const evTest = evaluate(model, Xte, yte, dim, testCount);
  const tEval = performance.now();

  const pcaPoints = Math.min(500, testCount);
  const pca = pca2(Xte, dim, pcaPoints);

  const demoIdx = Math.max(0, Math.min(testCount - 1, demoIndex));
  const demoVals = testInputs.subarray(demoIdx * 64, demoIdx * 64 + 64);
  const demo = res.runSample(demoVals, { keepState: true, gainScale: gTest });

  last = {
    testInputs,
    testScores: evTest.logits,
    dim,
    testCount,
    n: res.dims.n,
    lightTest: gTest,
  };

  self.postMessage({
    type: 'result',
    reqId,
    source,
    method,
    encoding,
    capture,
    dim,
    n: res.dims.n,
    light: gTrain,
    lightTest: gTest,
    trainAccuracy: evTrain.accuracy,
    testAccuracy: evTest.accuracy,
    confusion: evTest.confusion,
    testScores: evTest.logits,
    testInputs,
    pca: { xy: pca.xy, count: pcaPoints, labels: yte.slice(0, pcaPoints) },
    perSlot: demo.perSlot,
    demoIndex: demoIdx,
    history,
    counts: { trainCount, testCount },
    timeMs: {
      total: tEval - t0,
      sim: tSim1 - tSim0,
      fit: tFit - tSim1,
      eval: tEval - tFit,
    },
  });
}

function doDemo(msg) {
  const index = msg.index | 0;
  if (!reservoir || !last || index < 0 || index >= last.testCount) return;
  const vals = last.testInputs.subarray(index * 64, index * 64 + 64);
  const { perSlot } = reservoir.runSample(vals, { keepState: true, gainScale: last.lightTest || 1 });
  self.postMessage({
    type: 'demo',
    index,
    perSlot,
    scores: last.testScores.slice(index * 10, index * 10 + 10),
    inputs: Float32Array.from(vals),
  });
}

function doSample(msg) {
  const res = getReservoir(msg.params);
  const values = Float64Array.from(msg.values64);
  const r = res.runSample(values, { keepState: true, gainScale: msg.light || 1 });
  self.postMessage({
    type: 'sample',
    reqId: msg.reqId,
    perSlot: r.perSlot,
    features: r.features,
  });
}
