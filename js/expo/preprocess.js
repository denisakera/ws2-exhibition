/**
 * Hand drawing -> the 8x8 input the reservoir was built for.
 *
 * The dataset images in data/mnist8x8.bin are `round-half-even(mean of 4x4 blocks)` of the
 * 28x28 MNIST image padded by 2 px on every side (verified exactly against the 1000
 * images stored at both resolutions, see test/test_expo_preprocess.mjs). A drawing
 * therefore takes the MNIST route first: crop to the ink, fit it into a 20x20 box
 * keeping the aspect ratio, centre it by centre of mass in 28x28 — and then the
 * identical 28x28 -> 8x8 reduction as the dataset.
 *
 * Pure functions on typed arrays, no DOM: the same code runs in the page and in Node.
 */

export const INK_THRESHOLD = 24;   // alpha (0..255) above which a pixel counts as ink
export const MIN_EXTENT = 0.18;    // smallest accepted drawing, as a fraction of the canvas side

/** Fractional-box average of a source window into tw x th (values stay 0..255). */
function areaResample(src, W, x0, y0, w, h, tw, th) {
  const out = new Float64Array(tw * th);
  for (let oy = 0; oy < th; oy++) {
    const ya = y0 + (oy * h) / th;
    const yb = y0 + ((oy + 1) * h) / th;
    for (let ox = 0; ox < tw; ox++) {
      const xa = x0 + (ox * w) / tw;
      const xb = x0 + ((ox + 1) * w) / tw;
      let acc = 0;
      let wsum = 0;
      for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
        const wy = Math.min(y + 1, yb) - Math.max(y, ya);
        for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
          const wt = (Math.min(x + 1, xb) - Math.max(x, xa)) * wy;
          acc += src[y * W + x] * wt;
          wsum += wt;
        }
      }
      out[oy * tw + ox] = wsum > 0 ? acc / wsum : 0;
    }
  }
  return out;
}

/**
 * @param {Uint8Array|Uint8ClampedArray} ink  W*H ink strength 0..255 (e.g. the alpha channel)
 * @returns {Uint8Array|null} 784 values MNIST-style, or null when there is too little ink
 */
export function inkTo28(ink, W, H) {
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (ink[y * W + x] > INK_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  if (Math.max(w, h) < MIN_EXTENT * Math.min(W, H)) return null;

  const scale = 20 / Math.max(w, h);
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const box = areaResample(ink, W, minX, minY, w, h, tw, th);

  // MNIST digits peak at full intensity; stretch the anti-aliased box the same way
  let peak = 0;
  for (let i = 0; i < box.length; i++) if (box[i] > peak) peak = box[i];
  const gain = peak > 0 ? 255 / peak : 1;

  // centre by centre of mass inside 28x28
  let mass = 0;
  let cx = 0;
  let cy = 0;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const v = box[y * tw + x];
      mass += v;
      cx += v * x;
      cy += v * y;
    }
  }
  if (mass <= 0) return null;
  cx /= mass;
  cy /= mass;
  const offX = Math.max(0, Math.min(28 - tw, Math.round(13.5 - cx)));
  const offY = Math.max(0, Math.min(28 - th, Math.round(13.5 - cy)));

  const out = new Uint8Array(784);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      out[(y + offY) * 28 + (x + offX)] = Math.min(255, Math.round(box[y * tw + x] * gain));
    }
  }
  return out;
}

/** The dataset's own 28x28 -> 8x8 reduction (pad 2, mean of 4x4 blocks, rounded). */
export function to8x8(img28) {
  const out = new Uint8Array(64);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      let acc = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const y = r * 4 + dy - 2;
          const x = c * 4 + dx - 2;
          if (y >= 0 && y < 28 && x >= 0 && x < 28) acc += img28[y * 28 + x];
        }
      }
      // round half to even, as the dataset was built (NumPy), not Math.round
      const q = Math.floor(acc / 16);
      const rem = acc - q * 16;
      out[r * 8 + c] = rem > 8 || (rem === 8 && q % 2 === 1) ? q + 1 : q;
    }
  }
  return out;
}

/** Drawing -> 8x8 (0..255), or null when there is nothing meaningful to send. */
export function inkTo8x8(ink, W, H) {
  const img = inkTo28(ink, W, H);
  return img ? to8x8(img) : null;
}
