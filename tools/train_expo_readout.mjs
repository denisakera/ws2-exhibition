/**
 * Offline training of the exhibition readout.
 *
 * Runs the same reservoir (js/reservoir.js) and the same ridge fit (js/readout.js)
 * the Playground uses, on the MNIST 8x8 data, and writes the trained weights to
 * data/expo-readout.json so the exhibition page never trains at start-up and never
 * needs more than static files.
 *
 *   node tools/train_expo_readout.mjs                 train + write (20000 / 10000)
 *   node tools/train_expo_readout.mjs --compare       compare encodings, write nothing
 *   node tools/train_expo_readout.mjs --train 60000   use the full training set
 *
 * Every accuracy printed here (and stored in the JSON) is measured on the held-out
 * MNIST test images with the simulated reservoir. Nothing is estimated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReservoir, RESERVOIR_DEFAULTS } from '../js/reservoir.js';
import { fitRidge, evaluate } from '../js/readout.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : fallback;
};

const meta = JSON.parse(fs.readFileSync(path.join(root, 'data/meta.json'), 'utf8'));
const x8 = new Uint8Array(fs.readFileSync(path.join(root, 'data/mnist8x8.bin')));
const labels = new Uint8Array(fs.readFileSync(path.join(root, 'data/labels.bin')));

/** Same input packing as the Playground worker (no noise). */
function pack(encoding, threshold, start, count) {
  const out = new Float32Array(count * 64);
  for (let m = 0; m < count; m++) {
    for (let j = 0; j < 64; j++) {
      const px = x8[(start + m) * 64 + j] / 255;
      out[m * 64 + j] = encoding === 'binary' ? (px >= threshold ? 1 : 0) : px;
    }
  }
  return out;
}

function run({ encoding, threshold, capture, lambda, trainCount, testCount, params }) {
  const res = createReservoir(params);
  const dim = (capture === 'all' ? 16 : 2) * res.dims.n;
  const t0 = performance.now();
  const Xtr = res.runDataset(pack(encoding, threshold, 0, trainCount), trainCount, { capture });
  const Xte = res.runDataset(pack(encoding, threshold, meta.train_count, testCount), testCount, { capture });
  const t1 = performance.now();
  const ytr = labels.subarray(0, trainCount);
  const yte = labels.subarray(meta.train_count, meta.train_count + testCount);
  const model = fitRidge(Xtr, ytr, dim, trainCount, lambda);
  const t2 = performance.now();
  const train = evaluate(model, Xtr, ytr, dim, trainCount);
  const test = evaluate(model, Xte, yte, dim, testCount);
  return {
    model, dim, trainAccuracy: train.accuracy, testAccuracy: test.accuracy,
    simSeconds: (t1 - t0) / 1000, fitSeconds: (t2 - t1) / 1000,
  };
}

const params = { ...RESERVOIR_DEFAULTS };

if (flag('compare')) {
  const n = opt('train', 6000);
  const m = opt('test', 2000);
  for (const encoding of ['analog', 'binary']) {
    for (const capture of ['final', 'all']) {
      const r = run({ encoding, threshold: 0.2, capture, lambda: 1e-3, trainCount: n, testCount: m, params });
      console.log(`${encoding.padEnd(6)} ${capture.padEnd(5)} dim ${String(r.dim).padStart(4)}  `
        + `train ${(r.trainAccuracy * 100).toFixed(1)}%  test ${(r.testAccuracy * 100).toFixed(1)}%  `
        + `(sim ${r.simSeconds.toFixed(1)} s, fit ${r.fitSeconds.toFixed(1)} s)`);
    }
  }
} else {
  const encoding = argv.includes('--binary') ? 'binary' : 'analog';
  const capture = argv.includes('--final') ? 'final' : 'all';
  const threshold = 0.2;
  const trainCount = opt('train', 20000);
  const testCount = opt('test', 10000);
  const lambda = opt('lambda', 1e-3);
  const r = run({ encoding, threshold, capture, lambda, trainCount, testCount, params });
  console.log(`${encoding} ${capture} dim ${r.dim}: train ${(r.trainAccuracy * 100).toFixed(2)}%, `
    + `test ${(r.testAccuracy * 100).toFixed(2)}% on ${testCount} held-out MNIST test digits`);
  const out = {
    format: 'ws2-expo-readout-1',
    note: 'Ridge readout trained on the SIMULATED reservoir (js/reservoir.js). Not a measurement of the physical sample.',
    trained: new Date().toISOString().slice(0, 10),
    params,
    encoding,
    threshold,
    capture,
    lambda: r.model.lambda,
    dim: r.model.dim,
    d: r.model.d,
    trainCount,
    testCount,
    trainAccuracy: r.trainAccuracy,
    testAccuracy: r.testAccuracy,
    W: Array.from(r.model.W, (v) => Number(v.toPrecision(7))),
  };
  fs.writeFileSync(path.join(root, 'data/expo-readout.json'), JSON.stringify(out));
  console.log(`wrote data/expo-readout.json (${(fs.statSync(path.join(root, 'data/expo-readout.json')).size / 1024).toFixed(0)} kB)`);
}
