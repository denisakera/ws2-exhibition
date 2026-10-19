/**
 * Small analytics helpers for the web app: 2-component PCA for the state scatter.
 */

/** Covariance operator y = C v, C = Xc^T Xc / count (d x d). */
function makeCovMul(X, dim, count, mean) {
  const d = dim;
  const C = new Float64Array(d * d);
  for (let m = 0; m < count; m++) {
    const base = m * dim;
    for (let i = 0; i < d; i++) {
      const xi = X[base + i] - mean[i];
      if (xi === 0) continue;
      const row = i * d;
      for (let j = 0; j <= i; j++) C[row + j] += xi * (X[base + j] - mean[j]);
    }
  }
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < i; j++) C[j * d + i] = C[i * d + j];
    for (let j = 0; j <= i; j++) C[i * d + j] /= count;
  }
  return (v, out) => {
    for (let i = 0; i < d; i++) {
      let acc = 0;
      const row = i * d;
      for (let j = 0; j < d; j++) acc += C[row + j] * v[j];
      out[i] = acc;
    }
  };
}

/**
 * Project the first two principal components.
 * @returns {{xy: Float32Array, mean: Float64Array, components: Float64Array[]}}
 */
export function pca2(X, dim, count, seed = 42) {
  const d = dim;
  const mean = new Float64Array(d);
  for (let m = 0; m < count; m++) {
    const base = m * dim;
    for (let i = 0; i < d; i++) mean[i] += X[base + i];
  }
  for (let i = 0; i < d; i++) mean[i] /= count;

  const covMul = makeCovMul(X, dim, count, mean);
  const v = new Float64Array(d);
  const out = new Float64Array(d);

  // deterministic but non-degenerate start
  let s = seed >>> 0;
  for (let i = 0; i < d; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    v[i] = (s / 4294967296) - 0.5;
  }

  const components = [];
  let lambda1 = 0;
  for (let comp = 0; comp < 2; comp++) {
    let vv = v;
    // deflate previous component
    if (comp === 1) {
      const w = new Float64Array(d);
      for (let i = 0; i < d; i++) {
        let dot = 0;
        for (let j = 0; j < d; j++) dot += components[0][j] * v[j];
        w[i] = v[i] - dot * components[0][i];
      }
      vv = w;
    }
    let norm = 0;
    for (let i = 0; i < d; i++) norm += vv[i] * vv[i];
    norm = Math.sqrt(norm);
    if (norm < 1e-12) {
      vv = new Float64Array(d);
      vv[comp % d] = 1;
      norm = 1;
    }
    for (let i = 0; i < d; i++) vv[i] /= norm;

    for (let it = 0; it < 80; it++) {
      covMul(vv, out);
      if (comp === 1) {
        // deflate inside the iteration for stability
        let dot = 0;
        for (let i = 0; i < d; i++) dot += components[0][i] * out[i];
        for (let i = 0; i < d; i++) out[i] -= dot * components[0][i];
      }
      let nrm = 0;
      for (let i = 0; i < d; i++) nrm += out[i] * out[i];
      nrm = Math.sqrt(nrm);
      if (nrm < 1e-15) break;
      for (let i = 0; i < d; i++) vv[i] = out[i] / nrm;
      if (comp === 0) lambda1 = nrm;
    }
    components.push(vv);
  }

  const xy = new Float32Array(count * 2);
  for (let m = 0; m < count; m++) {
    const base = m * dim;
    let p0 = 0;
    let p1 = 0;
    for (let i = 0; i < d; i++) {
      const xc = X[base + i] - mean[i];
      p0 += xc * components[0][i];
      p1 += xc * components[1][i];
    }
    xy[m * 2] = p0;
    xy[m * 2 + 1] = p1;
  }
  return { xy, mean, components, lambda1 };
}
