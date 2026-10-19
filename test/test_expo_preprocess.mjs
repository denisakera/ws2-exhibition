/**
 * Exhibition input pipeline: the dataset recipe is exact, a drawing takes the MNIST route,
 * and the full pipeline (draw -> 8x8 -> reservoir -> readout) keeps its accuracy.
 * Run: node test/test_expo_preprocess.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { inkTo28, to8x8, inkTo8x8 } from '../js/expo/preprocess.js';

const x8 = new Uint8Array(fs.readFileSync('data/mnist8x8.bin'));
const hd = new Uint8Array(fs.readFileSync('data/mnist28x28_hd.bin'));
const meta = JSON.parse(fs.readFileSync('data/meta.json', 'utf8'));
const labels = new Uint8Array(fs.readFileSync('data/labels.bin'));

// 1. to8x8 reproduces the dataset exactly
let maxDiff = 0;
for (let i = 0; i < meta.hd_count; i++) {
  const o = to8x8(hd.subarray(i * 784, (i + 1) * 784));
  for (let j = 0; j < 64; j++) maxDiff = Math.max(maxDiff, Math.abs(o[j] - x8[(meta.hd_index_start + i) * 64 + j]));
}
assert.equal(maxDiff, 0, `28->8 recipe differs from the dataset by ${maxDiff}`);
console.log(`ok  28x28 -> 8x8 equals data/mnist8x8.bin on ${meta.hd_count} images (max diff ${maxDiff})`);

// 2. empty / tiny drawings are rejected
assert.equal(inkTo8x8(new Uint8Array(360 * 360), 360, 360), null);
const dot = new Uint8Array(360 * 360);
for (let y = 100; y < 110; y++) for (let x = 100; x < 110; x++) dot[y * 360 + x] = 255;
assert.equal(inkTo8x8(dot, 360, 360), null);
console.log('ok  empty and tiny drawings are rejected');

// 3. a drawing is centred, whatever its position and size on the canvas
function blit(img28, W, scale, offX, offY) {
  const ink = new Uint8Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const sx = (x - offX) / scale - 0.5;
    const sy = (y - offY) / scale - 0.5;
    if (sx < 0 || sy < 0 || sx > 27 || sy > 27) continue;
    const x0 = Math.floor(sx); const y0 = Math.floor(sy);
    const tx = sx - x0; const ty = sy - y0;
    const g = (yy, xx) => img28[Math.min(27, yy) * 28 + Math.min(27, xx)];
    ink[y * W + x] = (1 - ty) * ((1 - tx) * g(y0, x0) + tx * g(y0, x0 + 1))
      + ty * ((1 - tx) * g(y0 + 1, x0) + tx * g(y0 + 1, x0 + 1));
  }
  return ink;
}
const com = (a) => {
  let m = 0; let cx = 0; let cy = 0;
  for (let i = 0; i < 64; i++) { m += a[i]; cx += a[i] * (i % 8); cy += a[i] * Math.floor(i / 8); }
  return [cx / m, cy / m];
};
const base = hd.subarray(0, 784);
for (const [scale, ox, oy] of [[9, 20, 20], [11, 30, 40], [7, 110, 90]]) {
  const [cx, cy] = com(inkTo8x8(blit(base, 360, scale, ox, oy), 360, 360));
  assert.ok(Math.abs(cx - 3.5) < 0.9 && Math.abs(cy - 3.5) < 0.9, `centroid off: ${cx.toFixed(2)}, ${cy.toFixed(2)}`);
}
console.log('ok  centroid lands in the middle for different sizes and positions');

// 4. the full pipeline keeps its accuracy when digits arrive as enlarged "drawings"
globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(url, 'utf8')) });
const { loadModel, runDigit } = await import('../js/expo/model.js');
const model = await loadModel();
let direct = 0; let drawn = 0; const N = 600;
for (let i = 0; i < N; i++) {
  const truth = labels[meta.hd_index_start + i];
  const ds = x8.subarray((meta.hd_index_start + i) * 64, (meta.hd_index_start + i + 1) * 64);
  if (runDigit(model, ds).pred === truth) direct++;
  const ink = blit(hd.subarray(i * 784, (i + 1) * 784), 360, 11, 26, 26);
  const img = inkTo8x8(ink, 360, 360);
  if (img && runDigit(model, img).pred === truth) drawn++;
}
console.log(`ok  pipeline on ${N} test digits: dataset 8x8 ${(100 * direct / N).toFixed(1)}%, re-drawn at 11x size ${(100 * drawn / N).toFixed(1)}%`);
assert.ok(drawn / N > 0.8, 'redrawn accuracy collapsed');
