/**
 * Bilingual (English ⇄ Čeština) layer for the whole page.
 *
 * English stays the authored language (in index.html and the modules); this file
 * adds the Czech overlay so the same page can be served in Czech without extra
 * HTML files:
 *
 *   ?lang=cs   → Czech version
 *   ?lang=en   → English (linked from the header of the Czech page)
 *   no param   → Czech, whatever the browser prefers
 *
 * `PAGE_CS` holds the Czech text for every `[data-i18n="key"]` element in
 * index.html; `t(en, cs)` picks a string inside the modules; `applyI18n()`
 * rewrites the static markup. Everything is Node-safe: outside a browser the
 * language is plain English, so the headless tests see the English page.
 */

function detectLang() {
  if (typeof location === 'undefined') return 'en'; // Node (tests, tooling)
  let wanted = null;
  try {
    wanted = new URLSearchParams(location.search).get('lang');
  } catch { /* ignore */ }
  if (wanted) {
    const code = wanted.toLowerCase().slice(0, 2);
    if (code === 'cs' || code === 'cz') return 'cs';
    return 'en';
  }
  return 'cs'; // Czech is the main language; English is one click away
}

/** Active UI language: 'en' or 'cs'. */
export const LANG = detectLang();

/** Pick the string for the active language: `t('English', 'Česky')`. */
export function t(en, cs) {
  return LANG === 'cs' ? cs : en;
}

/** Czech text for `[data-i18n]` keys in index.html (English is the fallback). */
export const PAGE_CS = {
  // header
  'brand.title': 'Rezervoárové počítání (reservoir computing) naživo v prohlížeči',
  'brand.sub1': 'Replika experimentu s nanotrubičkami WS₂ (Han et al.,',
  'brand.sub2': '2026) · doplněk pro ESP32',
  'nav.guide': 'Průvodce',
  'nav.playground': 'Sandbox',
  'nav.hardware': 'Hardware (ESP32)',
  'status.loading': 'načítání…',

  // guide frame
  'tour.prev': '‹ Zpět',
  'tour.next': 'Další ›',

  // playground
  'pg.controls': 'Ovládání',
  'pg.live': 'živý náhled při změně',
  'pg.reset': 'obnovit výchozí',
  'pg.full': 'Plný běh (10 000 / 2 000)',
  'pg.sgd': 'Trénovat 200 epoch (jako v článku)',
  'pg.hint': 'Živý náhled kvůli rychlosti používá malou podmnožinu (600 trénovacích / 300 testovacích číslic; na telefonech méně). Plný běh použije standardní rozdělení MNIST a ve workeru trvá ~15–30 s.',
  'pg.sample': 'Vstupní vzorek',
  'pg.orig': 'originál',
  'pg.binar': 'vstup rezervoáru',
  'pg.pulses': '8kanálový pulzní sled',
  'pg.random': 'náhodně',
  'pg.animate': 'animovat',
  'pg.states': 'Stavy rezervoáru',
  'pg.states.tag': 'x rychlý · s pomalý',
  'pg.space': 'Stavový prostor',
  'pg.space.tag': 'PCA testovacích stavů',
  'pg.space.hint': 'Klikněte na bod a prohlédněte si danou číslici.',
  'pg.readout': 'Čtecí vrstva',
  'm.testacc': 'přesnost (test)',
  'm.trainacc': 'přesnost (trénink)',
  'm.time': 'čas výpočtu',
  'm.dims': 'rozměr příznaků',
  'cap.confusion': 'matice záměn',
  'cap.history': 'křivka učení',
  'cap.probs': 'jistota predikce',

  // hardware
  'hw.layers': 'Skladba vrstev a montáž',
  'hw.layers.tag': 'článek vs. naše „dead-bug“ sestava',
  'hw.layers.hint': 'Vlevo: řez zařízením z článku (co která vrstva dělá). Vpravo: náš „dead-bug“ plán — oblouky zlatých drátků dosedají na film lehkým dotykem, vše zalité čirým UV resinem, 10 konců drátků ven na konektor. Praktické poznámky k montáži jsou níže.',
  'hw.schem.title': 'Schéma experimentu',
  'hw.schem.tag': 'zjednodušená sestava · skutečný vzorek WS₂ + ESP32',
  'hw.schem.hint': 'Zjednodušená sestava, na kterou tento projekt míří: 3,3 V přímo z ESP32 (bez převodníku úrovní i bez sériových rezistorů — obojí zůstává jen jako poznámka „volitelný vstup“), zlaté drátky v dead-bug stylu s lehkým dotykem, zalití čirým UV resinem, čtení přes TIA. Přejeďte myší po bloku — nebo po kartě v legendě níže — a uvidíte, co dělá. Bez vzorku WS₂ můžete firmware stejně spustit s jeho vestavěným softwarovým rezervoárem (model, který si můžete ladit v záložce Sandbox).',
  'hw.sample.title': 'Váš vzorek: 3 × 7 mm',
  'hw.sample.tag': 'rozmístění sond a zapojení',
  'hw.sample.hint': 'Příklad uspořádání pro čip 3 × 7 mm: 8 vstupů (4 na každé delší hraně, rozteč ≈1,7 mm, ≈0,8 mm uvnitř filmu), jedna zem na levém konci a jeden výstup na pravém — celkem 10 kontaktů. Pokud váš čip už má strukturované elektrody, dosedněte sondami na kontakty, ne na film. Níže: pohled shora, tabulka zapojení a praktický FAQ — řez skladbou vrstev najdete v panelu „Skladba vrstev a montáž“ nahoře v této záložce. Přejeďte myší po sondě nebo řádku tabulky a uvidíte zapojení.',
  'hw.esp.title': 'ESP32 — živé spojení',
  'hw.esp.tag': 'protokol v0.1 · firmware v tools/esp32/',
  'hw.esp.hint1': 'Web Serial vyžaduje Chrome nebo Edge, na',
  'hw.esp.hint2': 'nebo HTTPS. Firmware',
  'hw.esp.hint3': 'přehrává pulzní sled číslice — jeden zapojený pin posílá 64 pixelů sériově, 8 pinů paralelně — a stav každé číslice posílá zpět po USB sériovém portu. Bez připojeného vzorku WS₂ pochází stav z vestavěného modelu zařízení — stejné rovnice jako v záložce Sandbox — takže celý cyklus odeslání → pulzy → stav → trénink stále funguje.',
  'hw.connect': 'Připojit',
  'hw.disconnect': 'Odpojit',
  'hw.offline': 'offline',
  'hw.pulse.title': 'Nastavení pulzů',
  'hw.pulse.tag': 'na číslici',
  'hw.slot': 'Délka slotu (ms)',
  'hw.duty': 'Střída uvnitř slotu (%)',
  'hw.digitout': 'Výstup číslice',
  'hw.opt1': '1 pin — sériově (64 slotů)',
  'hw.opt8': '8 pinů — paralelně (jako v článku)',
  'hw.pin': 'Pulzní pin (režim 1 pinu)',
  'hw.sendpulse': 'Odeslat nastavení pulzů',
  'hw.free.title': 'Volně běžící pulz na stole',
  'hw.free.tag': 'v klidu',
  'hw.high': 'Vysoko (ms)',
  'hw.low': 'Nízko (ms)',
  'hw.count': 'Pulzů v dávce',
  'hw.pause': 'Pauza mezi dávkami (s)',
  'hw.enable': 'Běžet v klidu',
  'hw.sendfree': 'Odeslat nastavení volného běhu',
  'hw.wire.title': 'MNIST po drátě',
  'hw.samples': 'Vzorky z',
  'hw.srctest': 'testovací sada (štítky 0…)',
  'hw.srctrain': 'trénovací sada (štítky 0…)',
  'hw.howmany': 'Kolik',
  'hw.sendbatch': 'Odeslat dávku',
  'hw.stop': 'Zastavit',
  'hw.nothing': 'zatím nic odesláno.',
  'hw.real.title': 'Skutečný trénink',
  'hw.real.tag': 'ridge na odpovědích zařízení',
  'hw.split': 'Podíl tréninku (%)',
  'hw.trainreadout': 'Natrénovat čtecí vrstvu',
  'hw.resetdata': 'Vymazat data',
  'm.statedims': 'rozměr stavu',
  'm.states': 'nasbíraných stavů',
  'hw.confnote': 'Matice záměn testovací části.',
  'hw.proto.title': 'Protokol v0.1 (řádkový, USB sériový port)',
  'hw.proto.l1': 'úroveň na pixel 0…F, po řádcích',
  'hw.proto.l2': '1 pin: 64 sériových slotů · 8 pinů: slot t = sloupec t',
  'hw.proto.l3': 'konfigurace pulzů + rezervoáru (C chans 4 …)',
  'hw.proto.l4': 'výpis konfigurace / odezva',
  'hw.proto.l5': 'stav: 8 čtecích vektorů × 2n floatů',
  'hw.proto.l6': 'log / potvrzení',
  'hw.proto.hint1': 'Úplný seznam klíčů a postup nahrání firmwaru:',
  'hw.proto.hint2': '. Softwarový model a hardware sdílejí toto rozhraní stavů, takže vizualizace ze záložky Sandbox platí i pro odpovědi zařízení.',
  'hw.pin.title': 'Rozmístění pinů',
  'hw.pin.tag': 'ESP32 classic',
  'hw.pin.h1': 'Role',
  'hw.pin.h2': 'Piny',
  'hw.pin.h3': 'Poznámky',
  'hw.pin.r1c1': '8 pulzních výstupů',
  'hw.pin.r1c2a': 'plán pro ESP32 classic: GPIO 4, 5, 13, 14, 16, 17, 18, 19',
  'hw.pin.r1c2b': 'výchozí mapování firmwaru na C3: GPIO 4, 5, 6, 7, 10, 20, 21, 3',
  'hw.pin.r1c3': '3,3 V přímo (bez převodníku); otevřený drain + vnitřní pull-upy = ochrana proti zkratu zdarma',
  'hw.pin.r2c1': 'Vstup čtení',
  'hw.pin.r2c2': 'GPIO 34 (ADC1; kterékoli z 32–39)',
  'hw.pin.r2c3': '12 bitů — čte výstup TIA, jeden kanál stačí; nikdy ne holý vzorek; držte pod ≈3,1 V, RC + kalibrace',
  'hw.pin.r3c1': 'Smyčkové vstupy',
  'hw.pin.r3c1b': '(jen softwarový režim)',
  'hw.pin.r3c2': 'GPIO 32–39 (ADC1)',
  'hw.pin.r3c3': 'jen pro režim hardware-in-the-loop bez vzorku — propojky z 8 pulzních výstupů; se skutečným vzorkem WS₂ se nepoužívá',
  'hw.pin.r4c1': 'Sériový port / USB',
  'hw.pin.r4c2': 'nativní USB přemosťovač',
  'hw.pin.r4c3': 'vzory ven, stavy dovnitř, 921 600 baud',
  'hw.pin.r5c1': 'Zem',
  'hw.pin.r5c2': 'GND',
  'hw.pin.r5c3': 'jedna hvězdicová zem společná s převodníky a TIA',
  'hw.pin.hint1': 'Plán pro classic se vyhýbá strapping pinům (0, 2, 12, 15) i flash pinům (6–11). ESP32-C3 nemá GPIO 11–17 a piny 18/19 používá pro USB, proto firmware používá výše uvedené mapování pro C3; měňte je za běhu příkazem',
  'hw.pin.hint2': '. Pulzy jsou vždy jen obyčejné GPIO + převodníky — žádné DAC.',
  'hw.run.title': 'Jak probíhá běh',
  'hw.run.1': 'Prohlížeč pošle jednu číslici jako 64 úrovní pulzů (jeden nibble na pixel) po USB sériovém portu.',
  'hw.run.2a': 'Firmware přehraje vzor: s 8 piny jako paralelní pulzní sledy (slot',
  'hw.run.2b': '= sloupec',
  'hw.run.2c': '); s jedním pinem teče 64 pixelů jeden na slot, po řádcích. Volně běžící pulz mezitím odpočívá.',
  'hw.run.3': 'Po několika slotech se přečte stav — přes TIA/ADC u zapojeného vzorku; bez něj z modelu na zařízení (rovnice ze záložky Sandbox). 8 čtecích vektorů → jeden stavový vektor (16n floatů).',
  'hw.run.4': 'Stavy tečou zpět do prohlížeče, který natrénuje čtecí vrstvu a ukáže přesnost na rozdělení nasbíraných stavů na trénink/test.',
  'hw.run.5': 'Opakujte pro další číslici. Stejný cyklus pohání i experimenty z článku: separabilita 4bitových vzorů, plasticita STP/LTP·PPF, odolnost proti šumu.',

  // footer
  'footer.b': 'Vestavěná AI konzole',
  'footer.1': ': ptejte se na projekt nebo nechte agenta upravit tento web přirozeným jazykem —',
  'footer.2': ', tlačítko 🪄 (vpravo nahoře) nebo',
  'footer.3': '. LLM / AI agenti, kteří tuto stránku navštíví, ji mohou použít: viz'
};

/** Rewrite every `[data-i18n]` element into the active language (browser only). */
export function applyI18n(root) {
  if (typeof document === 'undefined') return;
  const scope = root || document;
  if (LANG !== 'cs') return; // English is what the markup already says
  if (typeof scope.querySelectorAll !== 'function') return; // test stub DOM
  for (const el of scope.querySelectorAll('[data-i18n]')) {
    const value = PAGE_CS[el.getAttribute('data-i18n')];
    if (value !== undefined) el.textContent = value;
  }
}

function setupDocument() {
  if (typeof document === 'undefined') return;
  if (!document.documentElement || typeof document.querySelectorAll !== 'function') return; // stub DOM
  const czech = LANG === 'cs';
  document.documentElement.lang = czech ? 'cs' : 'en';
  if (czech) {
    document.title = 'WS₂ rezervoárové počítání (reservoir computing) — replika v prohlížeči (doplněk pro ESP32)';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content',
      'Prohlížečová replika experimentu s rezervoárovým počítáním (reservoir computing) na nanotrubičkách WS₂ (Han et al., Nat. Commun. 2026), s vestavěnou AI konzolí pro LLM agenty i lidi: ptejte se nebo zadávejte změny přirozeným jazykem (Ctrl+Shift+L).');
  }
  const link = document.getElementById('lang-link');
  if (link) {
    link.textContent = czech ? 'English' : 'Česky';
    link.setAttribute('href', czech ? '?lang=en' : '?lang=cs');
    link.setAttribute('hreflang', czech ? 'en' : 'cs');
    link.setAttribute('lang', czech ? 'en' : 'cs');
    link.title = czech ? 'Switch to the English version' : 'Přepnout na českou verzi — switch to the Czech version';
  }
  applyI18n();
}

setupDocument();
