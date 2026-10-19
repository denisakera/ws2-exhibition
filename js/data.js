/**
 * Dataset loading and binarization.
 *
 * Assets are produced by tools/prepare_mnist.py:
 *   data/mnist8x8.bin      70000 x 64 uint8   (train then test)
 *   data/labels.bin        70000 uint8
 *   data/mnist28x28_hd.bin 1000 x 784 uint8   (first 1000 test images)
 *   data/meta.json
 */

let cachePromise = null;

export async function loadData() {
  if (!cachePromise) {
    cachePromise = (async () => {
      const [meta, x8buf, labbuf, hdbuf] = await Promise.all([
        fetch('data/meta.json').then((r) => r.json()),
        fetch('data/mnist8x8.bin').then((r) => r.arrayBuffer()),
        fetch('data/labels.bin').then((r) => r.arrayBuffer()),
        fetch('data/mnist28x28_hd.bin').then((r) => r.arrayBuffer()),
      ]);
      const x8 = new Uint8Array(x8buf);
      const labels = new Uint8Array(labbuf);
      const hd28 = new Uint8Array(hdbuf);
      if (x8.length !== meta.total * 64) throw new Error('mnist8x8.bin size mismatch');
      if (labels.length !== meta.total) throw new Error('labels.bin size mismatch');
      if (hd28.length !== meta.hd_count * 784) throw new Error('mnist28x28_hd.bin size mismatch');
      return { meta, x8, labels, hd28 };
    })();
  }
  return cachePromise;
}

/** Pixel value in [0,1] for sample index i, cell j (0..63). */
export function pixel(data, i, j) {
  return data.x8[i * 64 + j] / 255;
}

export function label(data, i) {
  return data.labels[i];
}

/** Binaries an 8x8 grayscale sample in place into `out` (Uint8Array(64)). */
export function binarizeSample(data, i, threshold, out) {
  const base = i * 64;
  const o = out || new Uint8Array(64);
  for (let j = 0; j < 64; j++) {
    o[j] = data.x8[base + j] / 255 >= threshold ? 1 : 0;
  }
  return o;
}

/** 28x28 grayscale for the first 1000 test images, or null. */
export function hdImage(data, testIndex) {
  if (testIndex >= data.meta.hd_count) return null;
  const base = testIndex * 784;
  return data.hd28.subarray(base, base + 784);
}

export function digitToText(labelValue) {
  return String(labelValue);
}
