/**
 * Experiment schematic — the relaxed physical build around the real WS₂ sample
 * and the ESP32: 3.3 V direct drive, dead-bug gold wires, clear UV encasement,
 * TIA readout. Renders an SVG diagram (hover-highlighted) plus a synchronized legend.
 */
import { LANG, t } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';

const COLORS = {
  digital: { stroke: '#57c7ff', fill: '#14273a' },
  device: { stroke: '#59c98f', fill: '#122a1e' },
  analog: { stroke: '#ffb454', fill: '#2b2114' },
  power: { stroke: '#b07aa1', fill: '#2a1d2c' },
  optional: { stroke: '#6b7f95', fill: '#10161d', dash: '7 4' },
};

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

function box(parent, { key, num, x, y, w, h, title, subs = [], kind = 'digital' }) {
  const c = COLORS[kind];
  const g = n('g', { 'data-key': key, class: 'comp' }, parent);
  const rect = n('rect', {
    x, y, width: w, height: h, rx: 10,
    fill: c.fill, stroke: c.stroke, 'stroke-width': 1.4,
  }, g);
  if (c.dash) rect.setAttribute('stroke-dasharray', c.dash);
  label(g, x + w / 2, y + 22, title, { size: 13, weight: 600, fill: '#ffffff' });
  subs.forEach((s, i) => label(g, x + w / 2, y + 40 + i * 14, s, { size: 10 }));
  if (num) {
    n('circle', { cx: x + 15, cy: y + 15, r: 9.5, fill: '#0b0f14', stroke: c.stroke, 'stroke-width': 1.2 }, g);
    label(g, x + 15, y + 18.5, String(num), { size: 10, fill: '#ffffff', weight: 600 });
  }
  return g;
}

function arrow(parent, pts, { kind = 'digital', dashed = false, head = true } = {}) {
  const c = COLORS[kind] || COLORS.digital;
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  const attrs = { d, fill: 'none', stroke: c.stroke, 'stroke-width': 1.6, 'stroke-linejoin': 'round' };
  if (dashed) attrs['stroke-dasharray'] = '6 4';
  if (head) attrs['marker-end'] = `url(#arrow-${kind})`;
  n('path', attrs, parent);
}

const LEGEND_EN = [
  {
    key: 'pc', num: 1, title: 'PC / browser (this page)',
    text: 'Sends digit patterns over USB serial, receives the reservoir states, trains the readout layer and shows accuracy. This is the "judge", not part of the physics.',
  },
  {
    key: 'esp32', num: 2, title: 'ESP32 DevKit (classic)',
    text: 'Plays the 8 pulse trains with the RMT peripheral (jitter-free timing) directly at 3.3 V — no level shifter needed. Open-drain mode with internal pull-ups (~45 kΩ) gives free short protection. Samples the TIA output with its 12-bit ADC and streams over USB.',
  },
  {
    key: 'contacts', num: 3, title: 'Dead-bug gold wires',
    text: '25–50 µm gold wires with shallow spring arcs, tips lightly touching the film or pads. Measure each channel\'s resistance as you land it, then lock each tip with a tiny UV-resin dot before potting the rest.',
  },
  {
    key: 'device', num: 4, title: 'WS₂ nanotube cluster',
    text: 'Sub-millimetre WS₂ nanotubes on Si/SiO₂ with Cr/Au contacts — about 10⁸ van der Waals junctions, encased in clear UV resin (the 10 wire ends stay exposed). Still light-sensitive, which is what the laser demo needs.',
  },
  {
    key: 'tia', num: 5, title: 'Transimpedance amplifier (the readout front-end)',
    text: 'Turns the tiny device current into a voltage the ADC can read, while giving the network a defined load. OUT sits at virtual ground (0 V), so cable capacitance never slows the signal, and gain is set by one resistor: Vout = I × Rf (1 MΩ → 1 µA = 1 V; use 10 MΩ for smaller currents). Use a rail-to-rail, ground-sensing CMOS op-amp, add Cf 10–100 pF across Rf plus a 1 kΩ and clamp protection at the input. The ESP32 ADC reads the op-amp output — never the bare sample.',
  },
  {
    key: 'scope', num: 6, title: 'Oscilloscope (optional)',
    text: 'Not required by the app, but invaluable while bringing up: checks pulse shapes and the raw device response. The paper records read voltages with one.',
  },
  {
    key: 'power', num: 7, title: 'Power',
    text: 'USB only — the devkit\'s 3.3 V rail feeds the ESP32 and the pulse outputs. No 5 V rail, no level shifters in this build.',
  },
  {
    key: 'laser', num: 10, title: '532 nm laser or LED (optional)',
    text: 'The paper\'s mimetic optogenetics: illuminating the sample shifts its response, degrading accuracy until the readout is retrained (paper Fig. 4). With 0.3–0.9 mW/cm², an ordinary LED is enough. Purely an optional extension.',
  },
  {
    key: 'gnd', num: 'G', title: 'Common ground (star)',
    text: 'ESP32, sample and TIA share one ground point. A single star ground avoids ground loops spoiling the µA-level measurements.',
  },
];

/** Czech overlay for the legend (English stays in LEGEND_EN, tests use it). */
const LEGEND_CS = [
  {
    key: 'pc', num: 1, title: 'PC / prohlížeč (tato stránka)',
    text: 'Posílá vzory číslic po USB sériovém portu, přijímá stavy rezervoáru, trénuje čtecí vrstvu a ukazuje přesnost. Je to „rozhodčí“, ne součást fyziky.',
  },
  {
    key: 'esp32', num: 2, title: 'ESP32 DevKit (classic)',
    text: 'Přehrává 8 pulzních sledů pomocí periferie RMT (časování bez jitteru) přímo na 3,3 V — převodník úrovní není potřeba. Režim otevřeného drainu s vnitřními pull-upy (~45 kΩ) dává ochranu proti zkratu zdarma. Snímá výstup TIA svým 12bitovým ADC a streamuje po USB.',
  },
  {
    key: 'contacts', num: 3, title: 'Zlaté drátky (dead-bug)',
    text: 'Zlaté drátky 25–50 µm s mělkými oblouky — drátek sám je pružina — a hroty se lehce dotýkají filmu nebo kontaktů. U každého kanálu při dosednutí změřte odpor, teprve pak hrot zajistěte kapkou UV resinu a nakonec zalijte zbytek.',
  },
  {
    key: 'device', num: 4, title: 'Shluk nanotrubiček WS₂',
    text: 'Submilimetrové nanotrubičky WS₂ na Si/SiO₂ s kontakty Cr/Au — asi 10⁸ van der Waalsových přechodů, zalité čirým UV resinem (10 konců drátků zůstává odkrytých). Stále citlivé na světlo, což laserové demo potřebuje.',
  },
  {
    key: 'tia', num: 5, title: 'Transimpedanční zesilovač (vstupní stupeň čtení)',
    text: 'Převádí nepatrný proud zařízení na napětí, které ADC přečte, a zároveň dává síti definovanou zátěž. OUT drží na virtuální zemi (0 V), takže kapacita kabelu signál nikdy nezpomalí, a zesílení určuje jediný rezistor: Vout = I × Rf (1 MΩ → 1 µA = 1 V; pro menší proudy použijte 10 MΩ). Použijte rail-to-rail CMOS operační zesilovač snímající zem, přidejte Cf 10–100 pF přes Rf, 1 kΩ a ochranné svorky na vstupu. ADC ESP32 čte výstup operačního zesilovače — nikdy ne holý vzorek.',
  },
  {
    key: 'scope', num: 6, title: 'Osciloskop (volitelný)',
    text: 'Aplikace ho nevyžaduje, ale při oživování je k nezaplacení: kontroluje tvary pulzů a surovou odezvu zařízení. Článek s ním nahrává čtená napětí.',
  },
  {
    key: 'power', num: 7, title: 'Napájení',
    text: 'Jen USB — 3,3V větev devkitu napájí ESP32 i pulzní výstupy. V této sestavě žádná 5V větev ani převodníky úrovní.',
  },
  {
    key: 'laser', num: 10, title: 'Laser nebo LED 532 nm (volitelné)',
    text: 'Mimetická optogenetika z článku: osvětlení vzorku mění jeho odezvu a zhoršuje přesnost, dokud se čtecí vrstva nepřetrénuje (obr. 4 v článku). Při 0,3–0,9 mW/cm² stačí obyčejná LED. Čistě volitelné rozšíření.',
  },
  {
    key: 'gnd', num: 'G', title: 'Společná zem (hvězda)',
    text: 'ESP32, vzorek a TIA sdílejí jeden zemnící bod. Jediná hvězdicová zem zabrání zemním smyčkám kazit měření na úrovni µA.',
  },
];

const LEGEND = LANG === 'cs' ? LEGEND_CS : LEGEND_EN;

export function initSchematic(root) {
  if (!root) return;

  const svg = n('svg', {
    viewBox: '0 0 1040 580',
    class: 'schematic-svg',
    role: 'img',
    'aria-label': t('Experiment schematic: PC, ESP32 driving 3.3 V pulses directly, dead-bug gold wires on the WS2 sample, transimpedance amplifier',
      'Schéma experimentu: PC, ESP32 budící pulzy 3,3 V přímo, zlaté drátky dead-bug na vzorku WS2, transimpedanční zesilovač'),
  });
  const scroller = document.createElement('div');
  scroller.className = 'svg-scroll';
  scroller.append(svg);
  root.append(scroller);

  const defs = n('defs', {}, svg);
  for (const [kind, c] of Object.entries(COLORS)) {
    const m = n('marker', {
      id: `arrow-${kind}`, viewBox: '0 0 10 10', refX: '8.5', refY: '5',
      markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse',
    }, defs);
    n('path', { d: 'M0,0 L10,5 L0,10 z', fill: c.stroke }, m);
  }

  // hover registry: key -> [elements]
  const groupsByKey = new Map();
  const addGroup = (key, g) => {
    if (!groupsByKey.has(key)) groupsByKey.set(key, []);
    groupsByKey.get(key).push(g);
  };

  // ------------------------------ boxes ------------------------------
  addGroup('pc', box(svg, {
    key: 'pc', num: 1, x: 30, y: 50, w: 150, h: 84, kind: 'digital',
    title: t('PC / browser', 'PC / prohlížeč'), subs: ['Web Serial', t('trains the readout', 'trénuje čtecí vrstvu')],
  }));
  addGroup('esp32', box(svg, {
    key: 'esp32', num: 2, x: 250, y: 40, w: 200, h: 110, kind: 'digital',
    title: 'ESP32 DevKit', subs: [t('8× pulses — 3.3 V direct', '8× pulzy — 3,3 V přímo'), t('12-bit ADC (ADC1)', '12bitový ADC (ADC1)'), t('USB serial bridge', 'USB sériový převodník')],
  }));

  // optional front-end note (dashed, not part of the main path)
  const opt = n('g', {}, svg);
  n('rect', { x: 505, y: 140, width: 215, height: 64, rx: 10, fill: COLORS.optional.fill, stroke: COLORS.optional.stroke, 'stroke-width': 1.2, 'stroke-dasharray': '7 4' }, opt);
  label(opt, 612, 160, t('Optional front-end', 'Volitelný vstupní stupeň'), { size: 11.5, weight: 600, fill: '#cbd8e6' });
  label(opt, 612, 176, t('level shifter + 100 Ω —', 'převodník úrovní + 100 Ω —'), { size: 9 });
  label(opt, 612, 189, t('only for the paper\'s exact 0–5 V', 'jen pro přesných 0–5 V z článku'), { size: 9 });

  addGroup('contacts', box(svg, {
    key: 'contacts', num: 3, x: 780, y: 52, w: 230, h: 80, kind: 'digital',
    title: t('Dead-bug gold wires', 'Zlaté drátky (dead-bug)'), subs: [t('spring arcs, light touch', 'pružinové oblouky, lehký dotyk'), t('tips verified, UV-tacked', 'hroty ověřené, zajištěné UV')],
  }));

  // ---------------------------- device -------------------------------
  addGroup('device', box(svg, {
    key: 'device', num: 4, x: 770, y: 210, w: 240, h: 190, kind: 'device',
    title: t('WS₂ nanotube cluster', 'Shluk nanotrubiček WS₂'), subs: [],
  }));
  n('rect', { x: 790, y: 246, width: 200, height: 118, rx: 8, fill: '#0c1a12', stroke: '#2f6b4a' }, svg);
  label(svg, 890, 316, 'WS₂', { size: 12, fill: '#edc948', weight: 600 });
  const blob = [
    [845, 285, 5], [862, 302, 7], [888, 282, 6], [905, 298, 8], [875, 318, 5],
    [846, 320, 6], [900, 325, 5], [880, 270, 5], [920, 290, 6], [935, 305, 5],
    [860, 290, 4], [890, 305, 6], [912, 315, 4], [868, 332, 5], [902, 288, 5], [880, 345, 4],
  ];
  for (const [cx, cy, r] of blob) {
    n('circle', { cx, cy, r, fill: '#edc948', opacity: 0.85 }, svg);
  }
  n('rect', { x: 794, y: 250, width: 9, height: 110, rx: 2, fill: '#233040', stroke: '#2f6b4a' }, svg);
  n('rect', { x: 977, y: 250, width: 9, height: 110, rx: 2, fill: '#233040', stroke: '#2f6b4a' }, svg);
  label(svg, 798.5, 305, t('in ×8', 'vst. ×8'), { size: 8, rotate: -90 });
  label(svg, 981.5, 305, t('out', 'výst.'), { size: 8, rotate: -90 });

  // dead-bug wire arcs from the contact box to the chip, with contact dots
  for (const cx of [835, 875, 915, 955]) {
    n('path', { d: `M${cx},134 C${cx - 10},168 ${cx - 10},210 ${cx},244`, stroke: '#e0b84c', 'stroke-width': 1.6, fill: 'none' }, svg);
    n('circle', { cx, cy: 246, r: 2.8, fill: '#ffb454' }, svg);
  }

  // clear UV encasement over the chip (wire ends stay exposed)
  n('rect', { x: 786, y: 242, width: 208, height: 126, rx: 10, fill: 'rgba(87,199,255,0.08)', stroke: '#57c7ff', 'stroke-width': 1.1, 'stroke-dasharray': '6 4' }, svg);
  label(svg, 890, 392, t('Si/SiO₂ · Cr/Au · encased in clear UV (ends exposed)', 'Si/SiO₂ · Cr/Au · zalité čirým UV (konce odkryté)'), { size: 9 });

  // --------------------------- readout chain --------------------------
  addGroup('tia', box(svg, {
    key: 'tia', num: 5, x: 480, y: 270, w: 200, h: 100, kind: 'analog',
    title: t('Transimpedance amp', 'Transimpedanční zesilovač'), subs: ['op-amp · Rf = 1–10 MΩ', t('µA → V for the ADC', 'µA → V pro ADC')],
  }));
  addGroup('scope', box(svg, {
    key: 'scope', num: 6, x: 480, y: 410, w: 200, h: 80, kind: 'optional',
    title: t('Oscilloscope', 'Osciloskop'), subs: [t('optional bring-up', 'volitelné oživení')],
  }));

  // ------------------------------ power -------------------------------
  addGroup('power', box(svg, {
    key: 'power', num: 7, x: 250, y: 300, w: 180, h: 90, kind: 'power',
    title: t('Power', 'Napájení'), subs: [t('USB only — 3.3 V from devkit', 'jen USB — 3,3 V z devkitu'), t('no 5 V rail needed', '5V větev není třeba')],
  }));

  // ------------------------------ laser -------------------------------
  addGroup('laser', box(svg, {
    key: 'laser', num: 10, x: 30, y: 300, w: 190, h: 90, kind: 'optional',
    title: t('Laser / LED (optional)', 'Laser / LED (volitelné)'), subs: [t('mimetic optogenetics', 'mimetická optogenetika'), t('paper: 532 nm, Fig. 4', 'článek: 532 nm, obr. 4')],
  }));

  // ------------------------------ wires -------------------------------
  arrow(svg, [[180, 92], [248, 92]], { kind: 'digital' });
  arrow(svg, [[450, 80], [778, 80]], { kind: 'digital' });
  arrow(svg, [[770, 320], [682, 320]], { kind: 'analog' });
  arrow(svg, [[480, 290], [415, 290], [415, 152]], { kind: 'analog' });
  arrow(svg, [[330, 300], [330, 152]], { kind: 'power' });
  arrow(svg, [[700, 320], [700, 395], [682, 395], [682, 408]], { kind: 'optional', dashed: true });
  arrow(svg, [[125, 390], [125, 540], [792, 540], [792, 402]], { kind: 'optional', dashed: true });

  // ----------------------------- grounding ----------------------------
  const gnd = n('g', { 'data-key': 'gnd', class: 'comp' }, svg);
  const drawGnd = (x, y) => {
    n('path', { d: `M${x},${y} v8`, stroke: '#6b7f95', 'stroke-width': 1.4, fill: 'none' }, gnd);
    [[24, 0], [14, 6], [6, 12]].forEach(([w, dy]) => {
      n('path', { d: `M${x - w / 2},${y + 8 + dy} h${w}`, stroke: '#6b7f95', 'stroke-width': 1.4, fill: 'none' }, gnd);
    });
  };
  drawGnd(340, 390);
  drawGnd(580, 370);
  label(svg, 352, 418, 'GND', { size: 9, anchor: 'start' });
  label(svg, 592, 398, 'GND', { size: 9, anchor: 'start' });
  addGroup('gnd', gnd);

  // ------------------------------ labels ------------------------------
  label(svg, 214, 78, 'USB serial', { size: 9.5 });
  label(svg, 214, 108, t('patterns ⇄ states', 'vzory ⇄ stavy'), { size: 9 });
  label(svg, 614, 68, t('8 channels · 3.3 V direct (open-drain ok)', '8 kanálů · 3,3 V přímo (open-drain ok)'), { size: 9 });
  label(svg, 725, 306, t('I ≈ µA level', 'I ≈ úroveň µA'), { size: 9 });
  label(svg, 423, 225, '0 – 3 V → ADC', { size: 9, anchor: 'start' });
  label(svg, 338, 225, t('3.3 V', '3,3 V'), { size: 9, anchor: 'start' });
  label(svg, 460, 532, t('light modulates the device (optogenetics demo)', 'světlo moduluje zařízení (demo optogenetiky)'), { size: 9 });
  label(svg, 258, 130, t('ADC1 → readout', 'ADC1 → čtení'), { size: 8.5, anchor: 'start' });
  label(svg, 442, 130, 'GPIO 4…19', { size: 8.5, anchor: 'end' });

  // ------------------------------ legend ------------------------------
  const legend = document.createElement('div');
  legend.className = 'legend-grid';
  const cardsByKey = new Map();
  for (const item of LEGEND) {
    const card = document.createElement('div');
    card.className = 'legend-card';
    card.dataset.key = item.key;
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(item.num);
    const body = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = item.title;
    const p = document.createElement('p');
    p.textContent = item.text;
    body.append(b, p);
    card.append(num, body);
    legend.append(card);
    if (!cardsByKey.has(item.key)) cardsByKey.set(item.key, []);
    cardsByKey.get(item.key).push(card);
  }
  root.append(legend);

  // --------------------------- hover linking ---------------------------
  const highlight = (key, on) => {
    for (const g of groupsByKey.get(key) || []) g.classList.toggle('hl', on);
    for (const c of cardsByKey.get(key) || []) c.classList.toggle('hl', on);
  };
  const bind = (el, key) => {
    el.addEventListener('mouseenter', () => highlight(key, true));
    el.addEventListener('mouseleave', () => highlight(key, false));
  };
  for (const [key, groups] of groupsByKey) for (const g of groups) bind(g, key);
  for (const [key, cards] of cardsByKey) for (const c of cards) bind(c, key);
}
