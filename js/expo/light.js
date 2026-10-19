/**
 * Advanced screen: the "light" experiment.
 *
 * Stored, measured offline on the simulation by tools/light_experiment.mjs:
 *   data/expo-light.json           accuracy at six light levels, for the readout trained in the dark
 *                                  and for the one retrained under that light (10 000 test digits)
 *   data/expo-light-readouts.json  the retrained readouts themselves
 * Live on the page: the visitor's own digit is run through the reservoir at the chosen light and
 * read by either readout (see main.js). The chart only draws the stored accuracies.
 */
import { fitCanvas, COLOR, FONT_MONO } from './canvas.js';
import { tx } from './copy.js';

const W = 920;
const H = 204;
const L = 66;
const R = W - 40;
const T = 36;
const B = H - 44;

export async function loadLight() {
  const [summary, readouts] = await Promise.all([
    fetch('data/expo-light.json').then((r) => { if (!r.ok) throw new Error(`light: ${r.status}`); return r.json(); }),
    fetch('data/expo-light-readouts.json').then((r) => { if (!r.ok) throw new Error(`light: ${r.status}`); return r.json(); }),
  ]);
  if (!Array.isArray(summary.levels) || summary.levels.length < 2) throw new Error('light: unexpected format');
  // level 0 (dark) has no retrained readout of its own: the dark-trained one is the same thing
  const byLight = new Map(readouts.readouts.map((r) => [r.light, { W: Float64Array.from(r.W), dim: readouts.dim, d: readouts.d, numClasses: 10 }]));
  return { ...summary, retrainedReadout: (light) => byLight.get(light) || null };
}

/**
 * @param {'old'|'new'} active  which readout the visitor is looking at, to mark it on its curve
 */
export function drawLightChart(canvas, data, sel, active) {
  const ctx = fitCanvas(canvas, W, H);
  ctx.clearRect(0, 0, W, H);
  const px = (light) => L + (light / 100) * (R - L);
  const py = (acc) => B - acc * (B - T);

  ctx.font = `14px ${FONT_MONO}`;
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = COLOR.lineSoft;
  ctx.lineWidth = 1;
  ctx.fillStyle = COLOR.mute;
  ctx.textAlign = 'right';
  for (const a of [0, 0.25, 0.5, 0.75, 1]) {
    ctx.beginPath(); ctx.moveTo(L, py(a)); ctx.lineTo(R, py(a)); ctx.stroke();
    ctx.fillText(String(Math.round(a * 100)), L - 10, py(a));
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const lv of data.levels) {
    ctx.beginPath(); ctx.moveTo(px(lv.light), T); ctx.lineTo(px(lv.light), B); ctx.stroke();
    ctx.fillText(`${lv.light} %`, px(lv.light), B + 22);
  }
  ctx.textAlign = 'left';
  ctx.fillText(tx('deepAxisX'), L, H - 8);
  ctx.fillText(tx('deepAxisY'), 6, 14);

  const s = data.levels[sel];
  ctx.strokeStyle = COLOR.line;
  ctx.beginPath(); ctx.moveTo(px(s.light), T - 6); ctx.lineTo(px(s.light), B); ctx.stroke();

  const line = (key, color, width, isActive) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
    ctx.globalAlpha = isActive ? 1 : 0.55;
    ctx.beginPath();
    data.levels.forEach((lv, i) => (i ? ctx.lineTo(px(lv.light), py(lv[key])) : ctx.moveTo(px(lv.light), py(lv[key]))));
    ctx.stroke();
    data.levels.forEach((lv, i) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(px(lv.light), py(lv[key]), i === sel ? (isActive ? 9 : 5) : 3.5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  };
  ctx.globalCompositeOperation = 'lighter';
  line('darkTrained', COLOR.warm, 2.4, active === 'old');
  line('retrained', COLOR.phos, 2.8, active === 'new');
  ctx.globalCompositeOperation = 'source-over';

  ctx.font = `15px ${FONT_MONO}`;
  ctx.textBaseline = 'middle';
  let x = L + 350;
  for (const [color, key] of [[COLOR.warm, 'deepDark'], [COLOR.phos, 'deepRetrained']]) {
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, 16); ctx.lineTo(x + 26, 16); ctx.stroke();
    ctx.fillStyle = COLOR.warmDim;
    ctx.fillText(tx(key), x + 34, 16);
    x += 34 + ctx.measureText(tx(key)).width + 28;
  }
}
