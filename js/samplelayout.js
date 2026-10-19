/**
 * Sample section: probe layout for a 3 × 7 mm chip and how everything connects.
 * Renders a top-view SVG (dimensioned) + probe/connection table + FAQ,
 * with hover linking between probes and table rows.
 */
import { LANG, t } from './i18n.js';
const NS = 'http://www.w3.org/2000/svg';

const MM = 100; // px per millimetre in the drawing
const OX = 150;
const OY = 120;
const px = (mm) => OX + mm * MM;
const py = (mm) => OY + mm * MM;

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

const PROBES = [
  { key: 'in1', kind: 'in', mm: [1.0, 0.8], ch: 1, side: 'top' },
  { key: 'in2', kind: 'in', mm: [2.7, 0.8], ch: 2, side: 'top' },
  { key: 'in3', kind: 'in', mm: [4.3, 0.8], ch: 3, side: 'top' },
  { key: 'in4', kind: 'in', mm: [6.0, 0.8], ch: 4, side: 'top' },
  { key: 'in5', kind: 'in', mm: [1.0, 2.2], ch: 5, side: 'bottom' },
  { key: 'in6', kind: 'in', mm: [2.7, 2.2], ch: 6, side: 'bottom' },
  { key: 'in7', kind: 'in', mm: [4.3, 2.2], ch: 7, side: 'bottom' },
  { key: 'in8', kind: 'in', mm: [6.0, 2.2], ch: 8, side: 'bottom' },
  { key: 'gnd', kind: 'gnd', mm: [0.9, 1.5] },
  { key: 'out', kind: 'out', mm: [6.6, 1.5] },
];

const PROBE_STYLE = {
  in: { fill: '#ffb454', stroke: '#ffd08a', text: '#05121d' },
  gnd: { fill: '#6b7f95', stroke: '#9fb3c8', text: '#05121d' },
  out: { fill: '#59c98f', stroke: '#9fe8c3', text: '#05121d' },
};

const FAQ_CS = [
  {
    q: 'Jaké vrstvy má vzorek z článku?',
    a: 'Zdola nahoru: křemíkový wafer → 500nm izolant SiO₂ (brání zkratům do Si) → rohož z nanotrubiček WS₂ (submilimetrové trubičky, ~32 % pórů) → Cr 20 nm (adheze) → Au 120 nm (kontaktní kov), naparáno e-beamem a strukturováno litografií + lift-offem. PMMA rezist použitý při strukturování se v lift-offu rozpustí a není součástí hotové skladby. U shluku sedí elektrody Cr/Au na povrchu sítě a obvodová kabeláž zůstává mimo aktivní film.',
  },
  {
    q: 'Potřebuji zemní (návratovou) sondu?',
    a: 'Ano. Každý pulz potřebuje uzavřený obvod: 8 vstupů vhání proud do sítě a zemní elektroda ho vrací. Také definuje 0 V pro pulzy. Volitelné vylepšení: dvě zemní sondy v protilehlých rozích vyprůměrují nevyrovnané přechodové odpory.',
  },
  {
    q: 'Potřebuji výstupní sondu?',
    a: 'Ano. Na výstupu se měří odezva rezervoáru. Článek zde čte napětí (obr. 2l); v naší sestavě výstup vede do TIA (nebo vysokoodporového bufferu) a pak do ADC ESP32. Bez něj jen posíláte pulzy do pasivního filmu.',
  },
  {
    q: 'Stačí mi méně než 10 kontaktů?',
    a: 'Méně vstupů (řekněme 4) také funguje — síť smíchá, co dostane, jen přesnost klesne. GND a OUT jsou povinné. Pokud je málo manipulátorů, může mnoho bodů najednou kontaktovat pružinová (pogo) deska.',
  },
  {
    q: 'Snímat napětí, nebo proud?',
    a: 'Obě varianty jsou správné. (a) Snímání napětí: vysokoodporový diferenční buffer → ADC — to je „čtené napětí“ z článku. (b) Snímání proudu: virtuální zem TIA → ADC — doporučeno pro první sestavu (začněte s Rf = 1 MΩ; je-li signál malý, 10 MΩ; přidejte malý Cf a svorky BAT54S, aby vstup ADC zůstal v rozsahu 0–3,1 V).',
  },
  {
    q: 'Jak zajistit, aby kontakty držely?',
    a: 'Kontakty už na čipu: dejte malou kapku dvousložkového stříbrného epoxidu (např. EPO-TEK H20E), položte do ní zlatý drátek 25–50 µm a plně vytvrdněte (150 °C/1 h nebo 24 h při pokojové teplotě) — částečně vytvrzený epoxid způsobuje drift na úrovni µA. Stříbrný lak stačí na rychlé testy, ale driftuje. Na oživení raději použijte wolframové sondy — i článek budí zařízení zlatými drátky nebo W sondami. Nikdy nevažte ultrazvukem přímo na rohož nanotrubiček.',
  },
  {
    q: 'Zlatá vrstva se odlupuje — proč?',
    a: 'Zlato samo o sobě na SiO₂ drží špatně. Potřebujete adhezní vrstvu: Cr nebo Ti (2–10 nm) pod zlatem (100–120 nm) — článek používá Cr 20 nm / Au 120 nm. Očistěte povrch (rozpouštědlo + O₂ plazma) a depozici držte v jednom vakuovém cyklu. Pokud se kontakty už odloupily, přemostěte je stříbrným epoxidem, místo abyste nanášeli novou vrstvu na kontaminovaný povrch.',
  },
  {
    q: 'Můžu na vzorek něco přitlačit?',
    a: 'Ano — tlak v místech kontaktu je normální (tak sondy fungují). Mezi závažíčko nebo svěrku a čip dejte malou PDMS podložku (1–2 mm), která zatížení rozloží; 5–20 g na kontaktní plochu nic nezkazí. Pro deset pevných kontaktů je opakovatelným řešením pogo-pin deska s malou silou (0,25–0,5 N na pin) a dvěma šetrnými šroubky. Jakmile se odpor ustálí, tlak už nezvyšujte.',
  },
  {
    q: 'Rozpadne se nanotrubičkový film pod tlakem?',
    a: 'Na prach ne — trubičky jsou pevné a materiál je stabilní desítky let, ale rohož je porézní náhodná síť (~32 % pórů): nadměrný lokální tlak ji nevratně stlačí (změní odpor a vlastně přepojí váš rezervoár) a tření nebo sonikace uvolňují svazky na okrajích. Nikdy netřete, nesonikujte, přitlačte jednou a nechte být. Také zabraňte tomu, aby hrot prošel filmem do Si — poškrábané SiO₂ může zkratovat kanály.',
  },
  {
    q: 'Když resin nasákne do sítě — co se změní?',
    a: 'Fungovat bude dál, ale s jinými vlastnostmi. Resin vyplní dutiny kolem kontaktů trubička–trubička (samotné vedení se nemění): vzroste kapacita (pomalejší dynamika, delší paměť), nelinearita přechodů se mírně zjemní, posune se základ fotoodezvy a drift se po úplném vytvrzení obvykle ustálí. Berte to jako nové zařízení: znovu změřte a přetrénujte čtecí vrstvu (postup změna → přetrénování v aplikaci). Rovnoměrné plné prosycení je reprodukovatelnější než částečné nasáknutí.',
  },
  {
    q: 'Můžu vynechat 8 elektrických vstupů a budit rezervoár jen světlem?',
    a: 'Pro NOVÝ světlem buzený experiment ano — úlohy v článku však byly buzené elektricky a světlo do zařízení jen zasahovalo (obr. 4–5). Článek ukazuje potřebnou fyziku: při nulovém předpětí jsou nanotrubička WS₂ i její rozhraní fotovoltaické — obr. 2h uvádí zkratové fotoproudy ~nA na jedné trubičce, obr. 2i totéž pro 0D rozhraní a obr. 2j ukazuje odezvu v celé viditelné oblasti (zakázaný pás ≈1,8 eV; použili 488/532/633 nm). Se samotnými kontakty OUT + GND se tedy modulovaná LED nebo laser stávají vstupem a jejich na historii závislý (posuvně feroelektrický, „programovatelný“) charakter je přesně ta paměť, kterou rezervoár potřebuje. Praktická očekávání: signál při nulovém předpětí je menší a pomalejší než u buzeného případu — použijte vysoce zesilující TIA (Rf = 10–100 MΩ, malý Cf), udržujte tmu, odečtěte základ a nejprve charakterizujte náběh/pokles. Nejbližší úloha z článku: predikce časových řad (obr. 3i,j), jejíž vstup je jediný skalární průběh; prostorové úlohy jako MNIST by potřebovaly strukturované světlo (8 LED, svazek vláken nebo DMD/SLM) místo 8 sond. Čtení zůstává na 2 elektrických kontaktech. Stačí obyčejná LED (0,3–0,9 mW/cm² byla úroveň modulace v článku).',
  },
  {
    q: 'Opravdu potřebuji převodníky úrovní?',
    a: 'Ne — u uvolněné sestavy jsou volitelné. Jediný úkol převodníků je zvednout logiku 3,3 V z ESP32 na pulzy 0–5 V z článku, aby budicí úrovně (a uváděné proudy 0,2–1,4 µA) přesně odpovídaly. Vzorek můžete budit přímo z GPIO přes sériový rezistor 100 Ω–1 kΩ: film je vysoceodporová síť, takže proud zůstane hluboko pod limity ESP32 i při zkratu sondy. Co za to dáte: ~35 % nižší amplitudu pulzů a menší odezvové proudy — kompenzujte na čtecí straně (TIA Rf 1 → 10 MΩ, delší sloty, průměrování). Pokud později chcete přesných 5 V, minimální převodník je jeden malý MOSFET + 10kΩ pull-up na USB 5 V na kanál. Ve světelné variantě není co převádět.',
  },
  {
    q: 'Můžu vynechat i sériové rezistory?',
    a: 'Jsou především ochrana, takže u uvolněné, dvakrát zkontrolované sestavy ano — se dvěma výhradami. Bez nich chyba v zapojení (sonda proti sondě nebo sonda na nízkoodporové cestě) nechá pin ESP32 budit téměř zkrat: několik desítek mA může překročit parametry pinu a lokálně poškodit vzorek. Řešení zdarma: nastavte GPIO do režimu otevřeného drainu s vnitřními pull-upy (~45 kΩ) — to je vestavěný sériový rezistor; při odporech vzorku v MΩ a pulzech v ms signál nezmění (úbytek na pull-upu < 1 %). A vždy před připojením ESP32 proměřte všechny dvojice sond multimetrem na zkrat. Ve světelné variantě není na budicí straně co chránit.',
  },
  {
    q: 'Může ESP32 číst vzorek přímo, nebo je potřeba analogový obvod?',
    a: 'Analogy je potřeba — nikdy nepřipojujte vzorek přímo na ADC ESP32. Zařízení má odpory řádu MΩ, zatímco ADC očekává zdroj s nízkou impedancí (jeho vzorkovací síť uzel zatíží, takže byste četli špatné hodnoty a rušili rezervoár). TIA je právě ten stupeň: drží OUT na virtuální zemi, převádí proud na napětí (Vout = I × Rf — 1 µA → 1 V při 1 MΩ), udrží šířku pásma i s dlouhými kabely a budí ADC z nízké impedance. Alternativa jako v článku je sledovač napětí (vysokoodporové snímání napětí, styl osciloskopu). Volitelně: externí ADC (ADS1115, 16 bitů ≈860 SPS — pro sloty 10–100 ms bohatě stačí; nebo MCP3208, 12 bitů ≈100 kSPS), pokud vám vadí šum a nelinearita ADC ESP32. Praktické tipy: rail-to-rail CMOS operační zesilovač snímající zem (MCP6002, TLV9002, OPA2340), Cf 10–100 pF přes Rf, 1 kΩ + svorky BAT54S na vstupu, RC (1–10 kΩ + 100 nF) u pinu ADC, použijte ADC1 (GPIO 32–39) a v firmware průměrujte/kalibrujte.',
  },
];

const FAQ_EN = [
  {
    q: 'What are the layers of the paper\'s sample?',
    a: 'Bottom to top: silicon wafer → 500 nm SiO₂ insulator (prevents shorts to the Si) → the WS₂ nanotube mat (sub-mm tubes, ~32 % porous) → Cr 20 nm (adhesion) → Au 120 nm (contact metal), e-beam evaporated and patterned by lithography + liftoff. The PMMA resist used for patterning is dissolved in the liftoff step and is not part of the finished stack. For the cluster, the Cr/Au electrodes sit on the web surface and peripheral wiring stays outside the active film.',
  },
  {
    q: 'Do I need a ground (return) probe?',
    a: 'Yes. Every pulse needs a closed circuit: the 8 inputs inject current into the network, and the ground electrode returns it. It also defines 0 V for the pulses. Optional upgrade: two ground probes at opposite corners average out uneven contact resistances.',
  },
  {
    q: 'Do I need the output probe?',
    a: 'Yes. The output is where the reservoir response is measured. The paper reads a voltage here (Fig. 2l); in our build it feeds the TIA (or a high-Z buffer) and then the ESP32 ADC. Without it, you are just sending pulses into a passive film.',
  },
  {
    q: 'Can I get away with fewer than 10 contacts?',
    a: 'Fewer inputs (say 4) still work — the network mixes whatever it gets, accuracy just drops. GND and OUT are not optional. If manipulators are scarce, a spring-pin (pogo) PCB fixture can contact many points at once.',
  },
  {
    q: 'Voltage sense or current sense?',
    a: 'Both are valid. (a) Voltage sense: high-impedance differential buffer → ADC — this is the paper\'s "read voltage". (b) Current sense: TIA virtual ground → ADC — recommended for the first build (start Rf = 1 MΩ; if the signal is small, 10 MΩ; add a small Cf and BAT54S clamps so the ADC input stays within 0–3.1 V).',
  },
  {
    q: 'How do I make the contacts stick?',
    a: 'Pads already on the chip: place a small dot of 2-component silver epoxy (e.g. EPO-TEK H20E), lay a 25–50 µm gold wire in it, and cure fully (150 °C/1 h or 24 h room temperature) — partially cured epoxy causes µA-level drift. Silver paint works for quick tests but drifts. Prefer tungsten probes for bring-up — the paper itself drives the device with gold wires or tungsten probes. Never ultrasonic wire-bond directly onto the nanotube mat.',
  },
  {
    q: 'My gold layer peels off — why?',
    a: 'Gold adheres poorly to SiO₂ on its own. You need an adhesion layer: Cr or Ti (2–10 nm) under the Au (100–120 nm) — the paper uses Cr 20 nm / Au 120 nm. Clean the surface (solvent + O₂ plasma) and keep the deposition in one vacuum run. If pads already peeled, bridge them with silver epoxy instead of re-depositing on a contaminated surface.',
  },
  {
    q: 'Can I press something on top of the sample?',
    a: 'Yes — pressure at the contact points is normal (that is how probes work). Put a small PDMS pad (1–2 mm) between the weight or clamp and the chip to spread the load; 5–20 g over the contact area is harmless. For ten fixed contacts, a low-force pogo-pin PCB fixture (0.25–0.5 N per pin) with two gentle screws is the repeatable solution. Stop increasing force once the resistance reading stabilises.',
  },
  {
    q: 'Will the nanotube film crumble under pressure?',
    a: 'Not to dust — the tubes are strong and the material is stable for decades, but the mat is a porous random network (~32 % porosity): excess local pressure compacts it irreversibly (changing its resistance and effectively rewiring your reservoir), and rubbing or sonication makes it shed bundles at the edges. Never rub, never sonicate, press once and leave it. Also avoid tips punching through the film into the Si — scratched SiO₂ can short channels.',
  },
  {
    q: 'If resin soaks into the network — what changes?',
    a: 'It keeps working, with changed properties. The resin fills the voids around the tube-to-tube contacts (conduction itself is unaffected): capacitance rises (slower dynamics, longer memory), junction nonlinearity softens a little, the photoresponse baseline shifts, and drift usually settles once fully cured. Treat it as a new device: re-measure and retrain the readout (the app\'s change → retrain flow). A full uniform infusion is more reproducible than partial wicking.',
  },
  {
    q: 'Can I skip the 8 electrical inputs and drive the reservoir with light only?',
    a: 'Yes for a NEW light-driven experiment — though the paper\'s own tasks were electrically driven, with light only perturbing the device (Figs. 4–5). The article shows the physics needed: at zero bias the WS₂ nanotube and its interfaces are photovoltaic — Fig. 2h gives ~nA short-circuit photocurrents on a single tube, Fig. 2i the same for a 0D interface, and Fig. 2j shows the response spans the visible range (≈1.8 eV bandgap; they used 488/532/633 nm). So with just OUT + GND contacts a modulated LED or laser becomes the input, and its history-dependent (sliding-ferroelectric, "programmable") character is exactly the memory a reservoir needs. Practical expectations: the zero-bias signal is smaller and slower than the driven case — use a high-gain TIA (Rf = 10–100 MΩ, small Cf), keep it dark, subtract the baseline, and characterise rise/fall first. Closest paper task: time-series prediction (Fig. 3i,j), whose input is a single scalar waveform; spatial tasks like MNIST would need patterned light (8 LEDs, fibre bundle, or DMD/SLM) instead of the 8 probes. The readout stays 2 electrical contacts. An ordinary LED suffices (0.3–0.9 mW/cm² was the paper\'s modulation level).',
  },
  {
    q: 'Do I really need the level shifters?',
    a: 'No — they are optional for a relaxed build. Their only job is to lift the ESP32\'s 3.3 V logic to the paper\'s 0–5 V pulses so drive levels (and the reported 0.2–1.4 µA currents) correspond exactly. You can drive the sample directly from a GPIO through a 100 Ω–1 kΩ series resistor: the film is a high-resistance network, so the current stays far below the ESP32\'s limits even during a probe short. What you give up: ~35 % lower pulse amplitude and smaller response currents — compensate on the read side (TIA Rf 1 → 10 MΩ, slower slots, averaging). If you later want the exact 5 V, one small MOSFET + 10 kΩ pull-up to USB 5 V per channel is the minimal shifter. In the light-only variant there is nothing to shift at all.',
  },
  {
    q: 'Can I skip the series resistors too?',
    a: 'They are primarily protection, so yes for a relaxed, double-checked build — with two caveats. Without them, a wiring mistake (probe touching probe, or a probe on a low-resistance path) lets an ESP32 pin drive a near-short: a few tens of mA can exceed the pin\'s rating and damage the sample locally. Zero-cost fix: set the GPIOs to open-drain with internal pull-ups (~45 kΩ) — that becomes a built-in series resistor; at MΩ sample resistances and ms pulses the signal is unaffected (pull-up drop < 1 %). And always measure all probe pairs for shorts with a multimeter before connecting the ESP32. In the light-only variant there is nothing to protect on the drive side at all.',
  },
  {
    q: 'Can the ESP32 read the sample directly, or is an analog circuit needed?',
    a: 'An analog stage is needed — never connect the sample straight to the ESP32 ADC. The device is MΩ-class, while the ADC expects a low-impedance source (its sampling network effectively loads the node, so you would read wrong values and disturb the reservoir). The TIA is that stage: it holds OUT at virtual ground, converts current to voltage (Vout = I × Rf — 1 µA → 1 V at 1 MΩ), keeps the bandwidth up even with long cables, and drives the ADC from a low-impedance output. A voltage follower is the paper-like alternative (high-Z voltage sensing, scope-style). Optional: an external ADC (ADS1115, 16-bit ≈860 SPS — plenty for 10–100 ms slots; or MCP3208, 12-bit ≈100 kSPS) if the ESP32 ADC\'s noise and nonlinearity bother you. Practical tips: rail-to-rail ground-sensing CMOS op-amp (MCP6002, TLV9002, OPA2340), Cf 10–100 pF across Rf, 1 kΩ + BAT54S clamps at the input, RC (1–10 kΩ + 100 nF) at the ADC pin, use ADC1 (GPIO 32–39), and average/calibrate in firmware.',
  },
];

export function initSampleLayout(root) {
  if (!root) return;

  const svg = n('svg', {
    viewBox: '0 0 1000 530',
    class: 'schematic-svg sample-svg',
    role: 'img',
    'aria-label': t('Top view of a 3 by 7 millimetre sample with 8 input probes, one ground probe and one output probe',
      'Pohled shora na vzorek 3 × 7 mm s 8 vstupními sondami, jednou zemní a jednou výstupní sondou'),
  });
  const scroller = document.createElement('div');
  scroller.className = 'svg-scroll';
  scroller.append(svg);
  root.append(scroller);

  const defs = n('defs', {}, svg);
  const marker = n('marker', {
    id: 'sarrow', viewBox: '0 0 10 10', refX: '8.5', refY: '5',
    markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse',
  }, defs);
  n('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#ffb454' }, marker);

  // ------------------------------ frame ------------------------------
  label(svg, 500, 26, t('Top view — probe placement for a 3 × 7 mm sample', 'Pohled shora — rozmístění sond pro vzorek 3 × 7 mm'), { size: 14, weight: 600, fill: '#fff' });

  // 7 mm dimension
  n('path', { d: 'M150,70 H850', stroke: '#6b7f95', 'stroke-width': 1, fill: 'none' }, svg);
  n('path', { d: 'M150,64 V76 M850,64 V76', stroke: '#6b7f95', 'stroke-width': 1, fill: 'none' }, svg);
  label(svg, 500, 60, '7.0 mm', { size: 10 });

  // substrate
  n('rect', { x: 150, y: 120, width: 700, height: 300, rx: 6, fill: '#0f1722', stroke: '#6b7f95', 'stroke-width': 1.5 }, svg);
  label(svg, 172, 140, t('substrate (Si/SiO₂)', 'substrát (Si/SiO₂)'), { size: 9, anchor: 'start' });

  // WS2 film
  n('rect', { x: 205, y: 165, width: 620, height: 210, rx: 60, fill: '#16281c', stroke: '#2f6b4a' }, svg);
  let i = 0;
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 9; gx++) {
      i++;
      if (i % 5 === 0) continue; // organic look
      n('circle', { cx: 235 + gx * 65, cy: 198 + gy * 52, r: 3.5, fill: '#edc948', opacity: 0.7 }, svg);
    }
  }
  label(svg, 515, 398, t('WS₂ film / nanotube cluster — scale the probe positions to your film', 'Film WS₂ / shluk nanotrubiček — rozmístění sond přizpůsobte svému filmu'), { size: 9 });

  // 3 mm dimension
  n('path', { d: 'M875,120 V420', stroke: '#6b7f95', 'stroke-width': 1, fill: 'none' }, svg);
  n('path', { d: 'M869,120 H881 M869,420 H881', stroke: '#6b7f95', 'stroke-width': 1, fill: 'none' }, svg);
  label(svg, 893, 270, '3.0 mm', { size: 10, rotate: -90 });

  // pitch annotation between in1 and in2
  n('path', { d: 'M250,182 H417', stroke: '#6b7f95', 'stroke-width': 1, fill: 'none' }, svg);
  n('path', { d: 'M250,176 V188 M417,176 V188', stroke: '#6b7f95', 'stroke-width': 1, fill: 'none' }, svg);
  label(svg, 333, 173, '≈1.7 mm', { size: 9 });

  // ------------------------- pulse buses -----------------------------
  n('path', { d: 'M150,105 H850', stroke: '#57c7ff', 'stroke-width': 1.5, fill: 'none' }, svg);
  label(svg, 500, 96, t('→ ESP32 GPIO — level shifter & 100 Ω both optional (see FAQ); 3.3 V direct is fine', '→ GPIO ESP32 — převodník úrovní i 100 Ω jsou volitelné (viz FAQ); 3,3 V přímo stačí'), { size: 9.5 });
  n('path', { d: 'M150,455 H850', stroke: '#57c7ff', 'stroke-width': 1.5, fill: 'none' }, svg);
  label(svg, 500, 470, t('→ same channels (inputs may sit on either edge)', '→ stejné kanály (vstupy mohou být na kterékoliv hraně)'), { size: 9.5 });

  const groups = new Map();
  for (const p of PROBES) {
    const [mx, my] = p.mm;
    const x = px(mx);
    const y = py(my);
    const g = n('g', { 'data-key': p.key, class: 'probe' }, svg);
    groups.set(p.key, g);
    const st = PROBE_STYLE[p.kind];
    if (p.kind === 'in') {
      if (p.side === 'top') {
        n('path', { d: `M${x},${y - 9} V105`, stroke: '#57c7ff', 'stroke-width': 1.2, fill: 'none' }, svg);
      } else {
        n('path', { d: `M${x},${y + 9} V455`, stroke: '#57c7ff', 'stroke-width': 1.2, fill: 'none' }, svg);
      }
    }
    if (p.key === 'gnd') {
      n('path', { d: `M${x},${y} H110`, stroke: '#6b7f95', 'stroke-width': 1.4, fill: 'none' }, svg);
      n('path', { d: 'M110,270 v8', stroke: '#6b7f95', 'stroke-width': 1.4, fill: 'none' }, svg);
      [[24, 0], [14, 6], [6, 12]].forEach(([w, dy]) => {
        n('path', { d: `M${110 - w / 2},${278 + dy} H${110 + w / 2}`, stroke: '#6b7f95', 'stroke-width': 1.4, fill: 'none' }, svg);
      });
      label(svg, 110, 252, t('to star GND', 'do hvězdicové země'), { size: 9 });
    }
    if (p.key === 'out') {
      n('path', { d: `M${x + 9},${y} H900`, stroke: '#ffb454', 'stroke-width': 1.4, fill: 'none', 'marker-end': 'url(#sarrow)' }, svg);
      label(svg, 908, 270, '→ TIA → ADC', { size: 9.5, anchor: 'start' });
    }
    n('circle', { cx: x, cy: y, r: 8.5, fill: st.fill, stroke: st.stroke, 'stroke-width': 1.2 }, g);
    const txt = p.kind === 'in' ? String(p.ch) : p.kind === 'gnd' ? 'G' : 'O';
    label(g, x, y + 3.5, txt, { size: 10, fill: st.text, weight: 600 });
  }

  // ------------------------------ table -------------------------------
  const wrap = document.createElement('div');
  const table = document.createElement('table');
  table.className = 'pin-table probe-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const h of [t('Probe', 'Sonda'), t('Position (mm, from top-left)', 'Poloha (mm, zleva shora)'), t('Connects to', 'Připojeno na'), t('Role', 'Role')]) {
    const th = document.createElement('th');
    th.textContent = h;
    hr.append(th);
  }
  thead.append(hr);
  const tbody = document.createElement('tbody');
  const rows = new Map();
  for (const p of PROBES) {
    const [mx, my] = p.mm;
    const tr = document.createElement('tr');
    tr.dataset.key = p.key;
    rows.set(p.key, tr);
    const cells = p.kind === 'in'
      ? [String(p.ch), `${mx.toFixed(1)}, ${my.toFixed(1)}`,
         t(`Level-shifter ch ${p.ch} (via 100 Ω)`, `převodník úrovní kanál ${p.ch} (přes 100 Ω)`),
         t(`pulse input · ${p.side} edge`, `pulzní vstup · ${p.side === 'top' ? 'horní' : 'dolní'} hrana`)]
      : p.kind === 'gnd'
        ? ['GND', `${mx.toFixed(1)}, ${my.toFixed(1)}`, t('Star ground (common)', 'Hvězdicová zem (společná)'),
           t('return path — required', 'návratová cesta — povinná')]
        : ['OUT', `${mx.toFixed(1)}, ${my.toFixed(1)}`, 'TIA (Rf) → ADC',
           t('response readout — required', 'čtení odezvy — povinné')];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrap.append(table);

  // -------------------------------- FAQ --------------------------------
  const faq = document.createElement('div');
  faq.className = 'faq';
  for (const item of (LANG === 'cs' ? FAQ_CS : FAQ_EN)) {
    const qa = document.createElement('div');
    qa.className = 'qa';
    const h = document.createElement('h3');
    h.textContent = item.q;
    const p = document.createElement('p');
    p.textContent = item.a;
    qa.append(h, p);
    faq.append(qa);
  }
  wrap.append(faq);
  root.append(wrap);

  // --------------------------- hover linking ---------------------------
  const highlight = (key, on) => {
    const g = groups.get(key);
    const tr = rows.get(key);
    if (g) g.classList.toggle('hl', on);
    if (tr) tr.classList.toggle('hl', on);
  };
  for (const key of groups.keys()) {
    const g = groups.get(key);
    const tr = rows.get(key);
    for (const el of [g, tr]) {
      if (!el) continue;
      el.addEventListener('mouseenter', () => highlight(key, true));
      el.addEventListener('mouseleave', () => highlight(key, false));
    }
  }
}
