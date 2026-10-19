/**
 * Layer stack section: the paper's device cross-section vs. our dead-bug build,
 * with mounting/packaging notes.
 */
import { LANG, t } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';

function n(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
}

function label(parent, x, y, str, { size = 10, fill = '#8fa3b8', anchor = 'middle', weight = 400, rotate = null } = {}) {
  const t = n('text', { x, y, 'font-size': size, fill, 'text-anchor': anchor, 'font-weight': weight }, parent);
  if (rotate !== null) t.setAttribute('transform', `rotate(${rotate} ${x} ${y})`);
  t.textContent = str;
  return t;
}

const NOTES_EN = [
  {
    q: 'Dead-bug wires: land one at a time',
    a: 'Use 25–50 µm gold wire. Give every wire a shallow arc so the wire itself works as a spring — that is what makes the "light touch". Land one tip, measure that channel\'s resistance with a multimeter, and only then lock the tip with a tiny UV tack dot. A tip that is still drifting must not be potted yet.',
  },
  {
    q: 'Film side up — no flipping needed',
    a: 'In the dead-bug geometry the wires come from above, so the WS₂ network stays face-up and the tips touch it (or the Cr/Au pads if the chip has them). The classic trap — contacting the bare Si backside — only happens if you flip the chip onto a pad array. Never land a tip on the substrate edge or back.',
  },
  {
    q: 'Route the 10 ends with strain relief',
    a: 'Count your lines: exactly 8 pulse inputs + GND + OUT. Tape or glue the wires to the carrier before they leave the pot, so pulling a wire never lifts its tip. Keep runs short, route GND separately to the star point, and — before connecting the ESP32 — measure every probe pair for shorts.',
  },
];

/** Czech overlay for the mounting notes (tests use NOTES_EN). */
const NOTES_CS = [
  {
    q: 'Drátky dead-bug: nasazujte jeden po druhém',
    a: 'Použijte zlatý drátek 25–50 µm. Každému dejte mělký oblouk, aby drátek sám fungoval jako pružina — to je ten „lehký dotyk“. Nasaďte jeden hrot, multimetrem změřte odpor daného kanálu, a teprve pak hrot zajistěte kapkou UV resinu. Hrot, který ještě driftuje, zatím nezalévejte.',
  },
  {
    q: 'Film lícem nahoru — nic nepřevracet',
    a: 'V geometrii dead-bug přicházejí drátky shora, takže síť WS₂ zůstává lícem nahoru a hroty se jí dotýkají (nebo kontaktů Cr/Au, má-li je čip). Klasická past — kontaktování holého zadního Si — hrozí jen při převrácení čipu na pole kontaktů. Nikdy nesaďte hrot na hranu ani zadní stranu substrátu.',
  },
  {
    q: 'Vyveďte 10 konců s odlehčením tahu',
    a: 'Spočítejte linky: přesně 8 pulzních vstupů + GND + OUT. Než drátky opustí zalití, připevněte je k nosné destičce, aby tah za drátek nikdy nezvedl hrot. Veďte krátké trasy, GND tahejte zvlášť do hvězdicového bodu a — než připojíte ESP32 — proměřte každou dvojici sond na zkrat.',
  },
];

const NOTES = LANG === 'cs' ? NOTES_CS : NOTES_EN;

export function initLayers(root) {
  if (!root) return;

  const svg = n('svg', {
    viewBox: '0 0 1000 440',
    class: 'schematic-svg',
    role: 'img',
    'aria-label': t('Cross-section: paper device stack vs dead-bug gold-wire mounting plan',
      'Řez: skladba zařízení z článku vs. plán montáže se zlatými drátky dead-bug'),
  });
  const scroller = document.createElement('div');
  scroller.className = 'svg-scroll';
  scroller.append(svg);
  root.append(scroller);

  const defs = n('defs', {}, svg);
  const gray = n('marker', { id: 'larrow', viewBox: '0 0 10 10', refX: '8.5', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, defs);
  n('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#cbd8e6' }, gray);

  const tubes = (x, y, w, h, step = 34) => {
    let i = 0;
    for (let gy = 0; gy < Math.floor(h / 16); gy++) {
      for (let gx = 0; gx < Math.floor(w / step); gx++) {
        i++;
        if (i % 4 === 0) continue;
        n('circle', { cx: x + 14 + gx * step, cy: y + 10 + gy * 16, r: 2.6, fill: '#edc948', opacity: 0.75 }, svg);
      }
    }
  };

  // ================= LEFT: paper stack =================
  label(svg, 265, 26, t("Paper's device stack (Methods)", 'Skladba zařízení z článku (Methods)'), { size: 13.5, weight: 600, fill: '#fff' });

  // probe
  n('path', { d: 'M340,110 L352,194', stroke: '#cbd8e6', 'stroke-width': 1.6, fill: 'none' }, svg);
  n('path', { d: 'M352,194 l-3,-9 l3,3 l3,-3 z', fill: '#cbd8e6' }, svg);
  label(svg, 336, 102, t('Au wire / W probe', 'Au drátek / W sonda'), { size: 9 });

  // electrodes (Au on Cr) on top of the network
  n('rect', { x: 120, y: 196, width: 100, height: 20, fill: '#d4af37' }, svg);
  n('rect', { x: 120, y: 216, width: 100, height: 6, fill: '#9aa4ae' }, svg);
  n('rect', { x: 300, y: 196, width: 100, height: 20, fill: '#d4af37' }, svg);
  n('rect', { x: 300, y: 216, width: 100, height: 6, fill: '#9aa4ae' }, svg);
  label(svg, 132, 168, 'Au · 120 nm', { size: 9, anchor: 'start' });
  n('path', { d: 'M170,172 L172,196', stroke: '#8fa3b8', 'stroke-width': 0.8, fill: 'none' }, svg);
  label(svg, 132, 184, 'Cr · 20 nm', { size: 9, anchor: 'start' });
  n('path', { d: 'M170,188 L185,216', stroke: '#8fa3b8', 'stroke-width': 0.8, fill: 'none' }, svg);

  // network
  n('rect', { x: 60, y: 222, width: 420, height: 70, rx: 12, fill: '#16281c', stroke: '#2f6b4a' }, svg);
  tubes(70, 228, 400, 60);
  label(svg, 270, 258, t('WS₂ nanotube network — the reservoir (random, porous)', 'Síť nanotrubiček WS₂ — rezervoár (náhodná, porézní)'), { size: 9.5, fill: '#cfe8d6' });

  // SiO2 + Si
  n('rect', { x: 40, y: 292, width: 460, height: 18, fill: '#35506b' }, svg);
  label(svg, 50, 305, 'SiO₂ · 500 nm', { size: 9, anchor: 'start' });
  n('rect', { x: 40, y: 310, width: 460, height: 42, fill: '#2b3648' }, svg);
  label(svg, 270, 336, t('Si wafer — support', 'Si wafer — nosný'), { size: 10 });

  // readout lead
  n('path', { d: 'M400,206 H492', stroke: '#cbd8e6', 'stroke-width': 1.4, fill: 'none', 'marker-end': 'url(#larrow)' }, svg);
  label(svg, 492, 196, t('→ TIA / scope', '→ TIA / osciloskop'), { size: 9, anchor: 'end' });

  label(svg, 270, 372, t('PMMA is only the e-beam resist — removed in acetone lift-off (not a final layer)', 'PMMA je jen e-beam rezist — odstraní se acetonovým lift-offem (není finální vrstva)'), { size: 8.5 });

  // divider
  n('path', { d: 'M530,40 V420', stroke: '#223041', 'stroke-width': 1, 'stroke-dasharray': '5 5', fill: 'none' }, svg);

  // ================= RIGHT: our dead-bug build =================
  label(svg, 765, 26, t('Your build — dead-bug wires + UV', 'Vaše sestava — drátky dead-bug + UV'), { size: 13.5, weight: 600, fill: '#fff' });

  // connector strip with the 10 exposed wire ends
  n('rect', { x: 600, y: 92, width: 340, height: 24, rx: 6, fill: '#1e3d2c', stroke: '#2f6b4a' }, svg);
  for (let i = 0; i < 10; i++) {
    n('rect', { x: 614 + i * 32.8, y: 99, width: 8, height: 10, fill: '#e0b84c' }, svg);
  }
  label(svg, 770, 84, t('10 exposed wire ends → connector / ESP32', '10 odkrytých konců drátků → konektor / ESP32'), { size: 9.5 });

  // gold wire arcs — the wire is the spring
  const wires = [
    ['M651,116 C660,150 664,190 676,222', 676],
    ['M749,116 C760,150 770,190 782,222', 782],
    ['M847,116 C840,150 850,190 862,222', 862],
    ['M913,116 C920,150 910,190 898,222', 898],
  ];
  for (const [d, tipX] of wires) {
    n('path', { d, stroke: '#e0b84c', 'stroke-width': 1.6, fill: 'none' }, svg);
    n('circle', { cx: tipX, cy: 224, r: 2.8, fill: '#ffb454' }, svg);
  }

  // UV tack dots at the tips
  for (const [, tipX] of wires) {
    n('ellipse', { cx: tipX, cy: 229, rx: 13, ry: 7, fill: 'rgba(87,199,255,0.16)', stroke: '#57c7ff', 'stroke-width': 1 }, svg);
  }

  // sample: mat (face up) on SiO2 + Si
  n('rect', { x: 620, y: 236, width: 300, height: 32, rx: 8, fill: '#16281c', stroke: '#2f6b4a' }, svg);
  tubes(630, 240, 290, 26);
  label(svg, 770, 256, t('WS₂ network', 'Síť WS₂'), { size: 8.5, fill: '#cfe8d6' });
  // optional Cr/Au pads on the mat surface
  n('rect', { x: 636, y: 227, width: 64, height: 9, fill: '#d4af37' }, svg);
  n('rect', { x: 856, y: 227, width: 64, height: 9, fill: '#d4af37' }, svg);
  n('rect', { x: 620, y: 268, width: 300, height: 6, fill: '#35506b' }, svg);
  n('rect', { x: 620, y: 274, width: 300, height: 26, fill: '#2b3648' }, svg);
  label(svg, 770, 291, t('Si / SiO₂ — film face up', 'Si / SiO₂ — film lícem nahoru'), { size: 9, fill: '#cbd8e6' });

  // clear UV encasement (wire ends stay exposed)
  n('rect', { x: 605, y: 214, width: 360, height: 92, rx: 14, fill: 'rgba(87,199,255,0.10)', stroke: '#57c7ff', 'stroke-width': 1.2, 'stroke-dasharray': '6 4' }, svg);
  label(svg, 622, 231, 'UV', { size: 8, fill: '#57c7ff' });

  // carrier
  n('rect', { x: 560, y: 300, width: 420, height: 20, rx: 4, fill: '#26303e', stroke: '#3a4757' }, svg);
  label(svg, 770, 314, t('carrier plate — glass or FR4', 'nosná destička — sklo nebo FR4'), { size: 9 });

  label(svg, 770, 348, t('Au wire tips: light touch on film or Cr/Au pads', 'Hroty zlatých drátků: lehký dotyk filmu nebo kontaktů Cr/Au'), { size: 9, fill: '#cbd8e6' });
  label(svg, 770, 404, t('clear UV encasement — the 10 wire ends stay exposed', 'čiré UV zalití — 10 konců drátků zůstává odkrytých'), { size: 9.5, fill: '#ffb454' });

  // ================= notes =================
  const notes = document.createElement('div');
  notes.className = 'faq';
  for (const item of NOTES) {
    const qa = document.createElement('div');
    qa.className = 'qa';
    const h = document.createElement('h3');
    h.textContent = item.q;
    const p = document.createElement('p');
    p.textContent = item.a;
    qa.append(h, p);
    notes.append(qa);
  }
  root.append(notes);
}
