/**
 * The "light" experiment on the exhibition model, measured once and stored for the advanced screen.
 *
 * Same idea and same mapping as the lab Guide (js/tour.js, "Light patterns and their effect"):
 * light 0..100 % shifts the reservoir's input gain by x1.00 .. x2.00, the way photoconductance
 * shifts the real device. For every light level:
 *   1. the readout trained in the dark (data/expo-readout.json) is tested under light,
 *   2. a new readout is trained under that light and tested under that light.
 * Everything runs on the SIMULATED reservoir with MNIST digits; none of it is a measurement of the
 * physical sample, and the numbers need not match the paper's.
 *
 *   node tools/light_experiment.mjs        writes data/expo-light.json and data/expo-light-readouts.json (about 3.5 minutes)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReservoir } from '../js/reservoir.js';
import { fitRidge, evaluate } from '../js/readout.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'data/meta.json'), 'utf8'));
const x8 = new Uint8Array(fs.readFileSync(path.join(root, 'data/mnist8x8.bin')));
const labels = new Uint8Array(fs.readFileSync(path.join(root, 'data/labels.bin')));
const dark = JSON.parse(fs.readFileSync(path.join(root, 'data/expo-readout.json'), 'utf8'));

const trainCount = dark.trainCount;
const testCount = dark.testCount;
const res = createReservoir(dark.params);
const dim = dark.dim;

const pack = (start, count) => {
  const out = new Float32Array(count * 64);
  for (let i = 0; i < out.length; i++) out[i] = x8[start * 64 + i] / 255;
  return out;
};
const trainIn = pack(0, trainCount);
const testIn = pack(meta.train_count, testCount);
const ytr = labels.subarray(0, trainCount);
const yte = labels.subarray(meta.train_count, meta.train_count + testCount);
const darkModel = { W: Float64Array.from(dark.W), dim, d: dark.d, numClasses: 10 };

const levels = [];
const readouts = [];   // the readout retrained under each light level, for the live advanced screen
for (const light of [0, 20, 40, 60, 80, 100]) {
  const gain = 1 + light / 100;
  const t0 = performance.now();
  const Xte = res.runDataset(testIn, testCount, { capture: 'all', gainScale: gain });
  const darkTrained = evaluate(darkModel, Xte, yte, dim, testCount).accuracy;
  let retrained = darkTrained;
  if (light > 0) {
    const Xtr = res.runDataset(trainIn, trainCount, { capture: 'all', gainScale: gain });
    const model = fitRidge(Xtr, ytr, dim, trainCount, dark.lambda);
    retrained = evaluate(model, Xte, yte, dim, testCount).accuracy;
    readouts.push({ light, gain, W: Array.from(model.W, (v) => Number(v.toPrecision(6))) });
  }
  levels.push({ light, gain, darkTrained, retrained });
  console.log(`light ${String(light).padStart(3)} %  gain x${gain.toFixed(2)}  dark-trained ${(darkTrained * 100).toFixed(1)} %  retrained ${(retrained * 100).toFixed(1)} %  (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
}

fs.writeFileSync(path.join(root, 'data/expo-light.json'), JSON.stringify({
  note: 'Simulated reservoir, MNIST digits. Light = input gain x1..x2 as in the lab Guide. Not a measurement of the physical sample.',
  measured: new Date().toISOString().slice(0, 10),
  trainCount,
  testCount,
  levels,
}, null, 1));
fs.writeFileSync(path.join(root, 'data/expo-light-readouts.json'), JSON.stringify({
  note: 'Readouts retrained under each light level (ridge, same settings as data/expo-readout.json). Simulation only.',
  dim, d: dark.d, readouts,
}));
console.log('wrote data/expo-light.json and data/expo-light-readouts.json');
