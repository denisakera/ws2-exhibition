/**
 * Two voices that are never synchronised.
 *
 *   model voice   the simulated reservoir, heard: the six liveliest nodes become six inharmonic tones whose
 *                 pitch and loudness follow the node state, the slow (memory) variable becomes a breathing hiss.
 *   sample voice  RECORDINGS of the physical sample: the lab's oscilloscope capture of 19 Oct 2026
 *                 (Rigol DHO814, 1.25 MSa/s) turned into audio by tools/make_ws2_audio.py:
 *                 ws2_real_1to1     the response at its own pace
 *                 ws2_slow26        the raw samples played 26x slower (audification)
 *                 ws2_residual26    every pulse minus the mean pulse: what does NOT repeat, 26x slower
 *                 ws2_rest_1to1/26  the sample at rest before the burst
 *
 * Nothing here is driven by what a visitor draws on the sample side: the sample voice runs by itself.
 * Sample and instrument cannot be separated in these recordings (mains hum, probe and amplifier noise
 * are in them too), and the page says so.
 */

const RATIOS = [1, 1.414, 1.932, 2.618, 3.37, 4.1];     // not a harmonic series: the model is not an instrument

/** Model voice: schedules the six tones and the hiss on `ctx`, `seconds` long, panned to the left. */
export function playModel(ctx, run, nodes, n, meanS, { seconds = 9.6, when = ctx.currentTime + 0.05, level = 0.5 } = {}) {
  const steps = run.steps;
  const out = ctx.createGain();
  out.gain.value = level;
  const pan = ctx.createStereoPanner();
  pan.pan.value = -0.7;
  out.connect(pan).connect(ctx.destination);
  const stops = [];
  nodes.forEach((node, k) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const freq = new Float32Array(steps);
    const amp = new Float32Array(steps);
    for (let t = 0; t < steps; t++) {
      const v = run.x[t * n + node];
      freq[t] = 110 * RATIOS[k] * (1 + 0.09 * v);
      amp[t] = 0.02 + 0.16 * Math.min(1, Math.abs(v) * 1.4);
    }
    osc.type = k % 2 ? 'triangle' : 'sine';
    osc.frequency.setValueCurveAtTime(freq, when, seconds);
    g.gain.setValueCurveAtTime(amp, when, seconds);
    osc.connect(g).connect(out);
    osc.start(when);
    osc.stop(when + seconds + 0.1);
    stops.push(osc);
  });
  // the slow variable (the memory) as a breathing hiss
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2600;
  band.Q.value = 1.4;
  const hg = ctx.createGain();
  const curve = new Float32Array(steps);
  let top = 1e-6;
  for (let t = 0; t < steps; t++) top = Math.max(top, meanS[t]);
  for (let t = 0; t < steps; t++) curve[t] = 0.015 + 0.2 * (meanS[t] / top);
  hg.gain.setValueCurveAtTime(curve, when, seconds);
  src.connect(band).connect(hg).connect(out);
  src.start(when);
  src.stop(when + seconds + 0.1);
  stops.push(src);
  return { stop: () => { for (const s of stops) { try { s.stop(); } catch { /* already stopped */ } } out.disconnect(); } };
}

/** Sample voice: loops a recording (an AudioBuffer), panned to the right. */
export function playBuffer(ctx, buffer, { level = 0.6, pan = 0.7 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.value = level;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  src.connect(g).connect(p).connect(ctx.destination);
  src.start();
  return { stop: () => { try { src.stop(); } catch { /* already stopped */ } g.disconnect(); } };
}

export async function loadBuffer(ctx, url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return ctx.decodeAudioData(await r.arrayBuffer());
}
