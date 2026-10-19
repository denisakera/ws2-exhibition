/**
 * Layman's guided tour: six steps from digit to pulse to reservoir to readout.
 * Receives an API object from app.js (data, compute, sampleStates, ...).
 */
import * as plots from './plots.js';
import { softmaxRow } from './readout.js';
import { t } from './i18n.js';

const SAMPLE_CYCLE = [42, 0, 1, 2, 7, 100, 253];

export function initTour(api) {
  const sidebar = document.querySelector('#tour-steps');
  const titleEl = document.querySelector('#tour-title');
  const bodyEl = document.querySelector('#tour-body');
  const stageEl = document.querySelector('#tour-stage');
  const prevBtn = document.querySelector('#tour-prev');
  const nextBtn = document.querySelector('#tour-next');

  let index = 0;
  let cleanup = null;
  const results = { cleanAccuracy: null };

  const T = api.settings();
  function sampleValues(i, threshold) {
    const vals = new Float32Array(64);
    for (let j = 0; j < 64; j++) {
      const px = api.data.x8[(60000 + i) * 64 + j] / 255;
      vals[j] = api.settings().encoding === 'binary' ? (px >= (threshold ?? T.threshold) ? 1 : 0) : px;
    }
    return vals;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function canvasIn(stage, w, h, cls) {
    const cv = el('canvas');
    cv.className = cls || '';
    stage.append(cv);
    return { cv, ctx: plots.setupCanvas(cv, w, h) };
  }

  const steps = [
    {
      id: 'intro',
      title: t('A brain the size of a grain of sand', 'Mozek velký jako zrnko písku'),
      html: t(`
        <p>A <b>reservoir computer</b> doesn't learn like a normal neural network. It uses a physical
        system — anything that reacts to signals in a rich, nonlinear way — as a kind of short-term
        memory. Only the very last layer is trained.</p>
        <p>This page recreates a real experiment from Masaryk University and Nature Communications:
        a tiny cluster of <b>tungsten-disulfide nanotubes</b> (about 100 million nanoscale contacts,
        about the synapse count of a fruit-fly brain) is driven with electrical pulses and used to
        recognise handwritten digits.</p>
        <p>In this browser version the nanotube cluster is replaced by a small mathematical model with
        the same job. Everything else — the pulses, the pipeline, the training — is the same idea.
        The <b>Hardware</b> tab can already drive a real ESP32 (or its on-board model) with these exact
        pulses and train on the responses.</p>`, `
        <p><b>Rezervoárový počítač (reservoir computer)</b> se neučí jako běžná neuronová síť. Využívá fyzikální systém —
        cokoli, co bohatě a nelineárně reaguje na signály — jako jakousi krátkodobou paměť. Trénuje se
        jen úplně poslední vrstva.</p>
        <p>Tato stránka znovu vytváří skutečný experiment z Masarykovy univerzity a časopisu Nature
        Communications: maličký shluk <b>nanotrubiček sulfidu wolframu</b> (asi 100 milionů
        nanometrových kontaktů, zhruba tolik synapsí jako mozek octomilky) se budí elektrickými pulzy
        a rozpoznává ručně psané číslice.</p>
        <p>V této prohlížečové verzi shluk nanotrubiček nahrazuje malý matematický model se stejným
        úkolem. Vše ostatní — pulzy, zpracování, trénink — je stejná myšlenka. Záložka <b>Hardware</b>
        už umí těmito přesnými pulzy budit skutečný ESP32 (nebo jeho vestavěný model) a trénovat
        na jeho odpovědích.</p>`),
      setup(stage) {
        const { cv } = canvasIn(stage, 300, 150);
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#0b0f14';
        ctx.fillRect(0, 0, 300, 150);
        ctx.fillStyle = '#57c7ff';
        ctx.font = '13px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(t('digit → pulses → reservoir → readout', 'číslice → pulzy → rezervoár → čtení'), 150, 62);
        ctx.fillStyle = '#8fa3b8';
        ctx.font = '11px ui-sans-serif, system-ui';
        ctx.fillText(t('the last layer is the only one that learns', 'učí se jen poslední vrstva'), 150, 86);
      },
    },

    {
      id: 'digit',
      title: t('A digit is just a picture', 'Číslice je jen obrázek'),
      html: t(`<p>We start with 28×28 grayscale images of handwritten digits (the famous MNIST dataset).
      For the experiment the images are reduced to a small <b>8×8 grid</b> — 64 numbers, each one a
      pixel's brightness.</p>
      <p>These 64 numbers are what we will turn into electricity.</p>`, `<p>Začínáme obrázky ručně
      psaných číslic 28×28 ve stupních šedi (slavná datová sada MNIST). Pro experiment se obrázky
      zmenší na malou mřížku <b>8×8</b> — 64 čísel, z nichž každé udává jas pixelu.</p>
      <p>Právě těchto 64 čísel přeměníme na elektřinu.</p>`),
      setup(stage) {
        let i = 0;
        const wrap = el('div', 'stage-row');
        const cvBig = el('canvas');
        const cvSmall = el('canvas');
        wrap.append(cvBig, cvSmall);
        const btn = el('button', 'secondary', t('another digit ↻', 'další číslice ↻'));
        const label = el('span', 'hint small');
        stage.append(wrap, btn, label);
        const draw = () => {
          const idx = SAMPLE_CYCLE[i % SAMPLE_CYCLE.length];
          const hd = idx < 1000 ? api.data.hd28.subarray(idx * 784, idx * 784 + 784) : null;
          if (hd) plots.drawPixels(cvBig, 128, 128, hd, 28, 28, { pad: 4 });
          plots.drawPixels(cvSmall, 128, 128, api.data.x8.subarray((60000 + idx) * 64, (60000 + idx) * 64 + 64), 8, 8, { pad: 4 });
          label.textContent = t(`digit ${api.data.labels[60000 + idx]} · 28×28 original (left) → 8×8 input (right)`,
            `číslice ${api.data.labels[60000 + idx]} · originál 28×28 (vlevo) → vstup 8×8 (vpravo)`);
        };
        btn.addEventListener('click', () => { i++; draw(); });
        draw();
      },
    },

    {
      id: 'pulses',
      title: t('Pixels become electrical pulses', 'Pixely se mění na elektrické pulzy'),
      html: t(`<p>The paper's device is driven with voltage pulses: a bright pixel becomes a pulse,
      a dark pixel none (0 V / 5 V). In the analog mode we use here, the pulse <i>height</i> follows
      the pixel brightness instead — like a dimmer switch — which carries more information.</p>
      <p>Slide the threshold and watch which pixels survive as pulses.</p>`, `<p>Zařízení v článku se
      budí napěťovými pulzy: světlý pixel = pulz, tmavý = žádný (0 V / 5 V). V analogovém režimu,
      který tu používáme, místo toho <i>výška</i> pulzu sleduje jas pixelu — jako stmívač — a přenáší
      více informace.</p>
      <p>Posuňte práh a sledujte, které pixely přežijí jako pulzy.</p>`),
      setup(stage) {
        const sampleIdx = api.defaultSample ?? 42;
        const slider = el('input');
        slider.type = 'range';
        slider.min = '0.05';
        slider.max = '0.6';
        slider.step = '0.01';
        slider.value = String(api.settings().threshold);
        const readout = el('span', 'ctl-value');
        const row = el('div', 'stage-row');
        const cvGrid = el('canvas');
        const cvPulses = el('canvas');
        row.append(cvGrid, cvPulses);
        stage.append(row, slider, readout);

        const draw = () => {
          const th = Number(slider.value);
          readout.textContent = t(`threshold ${th.toFixed(2)}`, `práh ${th.toFixed(2)}`);
          const vals = sampleValues(sampleIdx, th);
          plots.drawPixels(cvGrid, 170, 170, vals, 8, 8, { binary: false, pad: 6, max: 1 });
          const binary = new Float32Array(64);
          for (let j = 0; j < 64; j++) binary[j] = vals[j] >= th ? 1 : 0;
          plots.drawPulseTrains(cvPulses, 360, 170, binary, { slotMs: T.slotMs, duty: T.duty });
        };
        slider.addEventListener('input', draw);
        draw();
      },
    },

    {
      id: 'reservoir',
      title: t('The reservoir: ripples with memory', 'Rezervoár: vlny s pamětí'),
      html: t(`<p>Each pulse train enters the reservoir. Inside, many interconnected nonlinear nodes react —
      think of stones thrown into a pond at fixed time intervals. The pattern of ripples depends on
      <i>all</i> the stones, and fades slowly: that fading memory is what lets the system "see" time.</p>
      <p>Below: the pulse trains (left) and the live state of 64 nodes over the 8 pulse slots (right).
      Bright = excited, dark = quiet. The slow layer keeps a memory of earlier slots.</p>`, `<p>Každý
      pulzní sled vstupuje do rezervoáru. Uvnitř reaguje mnoho propojených nelineárních uzlů —
      představte si kameny házené do rybníka v pravidelných intervalech. Vzor vln závisí na
      <i>všech</i> kamenech a pomalu mizí: právě tato mizející paměť dává systému schopnost „vidět“
      čas.</p>
      <p>Dole: pulzní sledy (vlevo) a živý stav 64 uzlů během 8 pulzních slotů (vpravo).
      Světlé = vybuzené, tmavé = klidné. Pomalá vrstva si pamatuje dřívější sloty.</p>`),
      setup(stage) {
        const row = el('div', 'stage-row');
        const cvPulses = el('canvas');
        const cvStates = el('canvas');
        row.append(cvPulses, cvStates);
        const controls = el('div', 'stage-row');
        const replay = el('button', 'secondary', t('replay ↻', 'přehrát ↻'));
        const note = el('span', 'hint small', t('computing states…', 'počítám stavy…'));
        controls.append(replay, note);
        stage.append(row, controls);

        const sampleIdx = api.defaultSample ?? 42;
        const vals = sampleValues(sampleIdx);
        plots.drawPulseTrains(cvPulses, 380, 180, vals, { slotMs: T.slotMs, duty: T.duty });

        let perSlot = null;
        let raf = 0;
        let start = 0;

        const animate = () => {
          const t = (performance.now() - start) / 1400;
          const reveal = Math.min(8, Math.floor(t * 8) + 1);
          plots.drawStateHeatmaps(cvStates, 380, 180, perSlot, api.settings().n || 64, { reveal });
          if (t < 2.4) raf = requestAnimationFrame(animate);
        };

        api.sampleStates(vals).then((res) => {
          perSlot = res.perSlot;
          note.textContent = t('64 nodes × 8 slots — x fast state (top), s slow memory (bottom)',
            '64 uzlů × 8 slotů — x rychlý stav (nahoře), s pomalá paměť (dole)');
          start = performance.now();
          raf = requestAnimationFrame(animate);
        }).catch((err) => {
          note.textContent = t(`error: ${err.message}`, `chyba: ${err.message}`);
        });

        replay.addEventListener('click', () => {
          start = performance.now();
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(animate);
        });
        cleanup = () => cancelAnimationFrame(raf);
      },
    },

    {
      id: 'readout',
      title: t('The readout learns to read the ripples', 'Čtecí vrstva se učí číst vlny'),
      html: t(`<p>The reservoir itself never learns — it just ripples. A small <b>readout layer</b> looks
      at the state of the nodes after the last pulse and votes for a digit.</p>
      <p>In the paper this readout is trained for 200 epochs. Here we use a closed-form “ridge”
      solution that trains instantly — same job, less waiting. Press the button and watch the
      confidence bars.</p>`, `<p>Rezervoár sám se nikdy neučí — jen vlní. Malá <b>čtecí vrstva</b> se
      podívá na stav uzlů po posledním pulzu a hlasuje pro číslici.</p>
      <p>V článku se tato vrstva trénuje 200 epoch. Tady používáme řešení „ridge“ v uzavřeném tvaru,
      které se natrénuje okamžitě — stejná práce, méně čekání. Stiskněte tlačítko a sledujte pruhy
      jistoty.</p>`),
      setup(stage) {
        const row = el('div', 'stage-row');
        const cvBars = el('canvas');
        row.append(cvBars);
        const btn = el('button', null, t('train the readout', 'natrénovat čtecí vrstvu'));
        const note = el('span', 'hint small', t('not trained yet', 'ještě nenatrénováno'));
        stage.append(row, btn, note);

        btn.addEventListener('click', async () => {
          btn.disabled = true;
          note.textContent = t('running 600 training digits through the reservoir…',
            'posílám 600 trénovacích číslic rezervoárem…');
          try {
            const result = await api.compute({ counts: { train: 600, test: 300 }, noiseSigma: 0 });
            results.cleanAccuracy = result.testAccuracy;
            note.textContent = t(`test accuracy ${(result.testAccuracy * 100).toFixed(1)}% on 300 unseen digits`,
              `přesnost na testu ${(result.testAccuracy * 100).toFixed(1)} % na 300 neviděných číslicích`);
            const idx = result.demoIndex;
            const scores = result.testScores.subarray(idx * 10, idx * 10 + 10);
            const probs = new Float64Array(10);
            let best = 0;
            for (let c = 1; c < 10; c++) if (scores[c] > scores[best]) best = c;
            const max = Math.max(...scores);
            let sum = 0;
            for (let c = 0; c < 10; c++) { probs[c] = Math.exp(scores[c] - max); sum += probs[c]; }
            for (let c = 0; c < 10; c++) probs[c] /= sum;
            const truth = api.data.labels[60000 + idx];
            plots.drawProbBars(cvBars, 240, 240, probs, best, truth);
          } catch (err) {
            note.textContent = `error: ${err.message}`;
          } finally {
            btn.disabled = false;
          }
        });
      },
    },

    {
      id: 'noise',
      title: t('Fooling the system', 'Jak zmást systém'),
      html: t(`<p>Real experiments are noisy. The paper tests this by adding random noise to the inputs
      (σ from 0.05 up to 0.4) and checks how much the accuracy drops — a test of robustness.</p>
      <p>Add noise below and re-run. Notice the accuracy sagging, and that re-training the readout
      usually repairs it: the reservoir didn't break, only the readout was tuned to cleaner ripples.</p>`,
      `<p>Skutečné experimenty jsou zašuměné. Článek to testuje přidáním náhodného šumu na vstup
      (σ od 0,05 do 0,4) a měří, o kolik klesne přesnost — test robustnosti.</p>
      <p>Přidejte šum a spusťte znovu. Přesnost se propadne a přetrénování čtecí vrstvy ji obvykle
      spraví: rezervoár se nerozbil, jen čtecí vrstva byla sladěná na čistší vlny.</p>`),
      setup(stage) {
        const slider = el('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '0.4';
        slider.step = '0.01';
        slider.value = '0.15';
        const readout = el('span', 'ctl-value', 'σ = 0.15');
        const btn = el('button', null, t('test with this noise', 'otestovat s tímto šumem'));
        const note = el('span', 'hint small',
          results.cleanAccuracy === null ? '' : t(`clean accuracy was ${(results.cleanAccuracy * 100).toFixed(1)}%`,
            `přesnost bez šumu byla ${(results.cleanAccuracy * 100).toFixed(1)} %`));
        stage.append(slider, readout, btn, note);
        slider.addEventListener('input', () => { readout.textContent = `σ = ${Number(slider.value).toFixed(2)}`; });
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          note.textContent = t('re-running with noise…', 'znovu spouštím se šumem…');
          try {
            const sigma = Number(slider.value);
            const result = await api.compute({ counts: { train: 600, test: 300 }, noiseSigma: sigma });
            const delta = results.cleanAccuracy !== null
              ? t(` (${result.testAccuracy >= results.cleanAccuracy ? '+' : ''}${((result.testAccuracy - results.cleanAccuracy) * 100).toFixed(1)} pts vs clean)`,
                  ` (${result.testAccuracy >= results.cleanAccuracy ? '+' : ''}${((result.testAccuracy - results.cleanAccuracy) * 100).toFixed(1)} pb proti čistému)`)
              : '';
            note.textContent = t(`accuracy with σ = ${sigma.toFixed(2)}: ${(result.testAccuracy * 100).toFixed(1)}%${delta}`,
              `přesnost se σ = ${sigma.toFixed(2)}: ${(result.testAccuracy * 100).toFixed(1)} %${delta}`);
          } catch (err) {
            note.textContent = t(`error: ${err.message}`, `chyba: ${err.message}`);
          } finally {
            btn.disabled = false;
          }
        });
      },
    },

    {
      id: 'light',
      title: t('Light patterns and their effect', 'Světelné vzory a jejich vliv'),
      html: t(`
        <p>The sample is <b>light-sensitive</b>: the nanotubes and their interfaces are photovoltaic
        (paper Fig. 2h,i) — light alone generates a current. That gives light two roles in the experiment.</p>
        <p><b>Light as an input.</b> Modulate an LED or laser with a pattern and the photocurrent follows it —
        one optical channel can drive the reservoir on its own, no 8 electrical exciters needed. Blinking slowly
        gives long memory; blinking fast gives short, sharp responses.</p>
        <p><b>Light as a perturbation.</b> In the paper, illuminating a trained reservoir changed its internal
        projections: accuracy dropped by up to 32 % — and <i>retraining the readout repaired it</i>. The reservoir
        didn't break; its “reading” had to be relearned. Try it below: the slider shifts the reservoir's operating
        gain the way photoconductance shifts the real device.</p>`, `
        <p>Vzorek je <b>citlivý na světlo</b>: nanotrubičky a jejich rozhraní jsou fotovoltaické
        (obr. 2h,i v článku) — samotné světlo vytváří proud. Světlo tak má v experimentu dvě role.</p>
        <p><b>Světlo jako vstup.</b> Modulujte LED nebo laser vzorem a fotoproud ho následuje — jediný
        optický kanál dokáže budit rezervoár sám, bez 8 elektrických budičů. Pomalé blikání dává dlouhou
        paměť; rychlé blikání krátké, ostré odezvy.</p>
        <p><b>Světlo jako porucha.</b> V článku osvětlení natrénovaného rezervoáru změnilo jeho vnitřní
        projekce: přesnost klesla až o 32 % — a <i>přetrénování čtecí vrstvy ji opravilo</i>. Rezervoár
        se nerozbil; jeho „čtení“ se muselo naučit znovu. Vyzkoušejte to níže: posuvník mění pracovní
        zesílení rezervoáru podobně, jako fotovodivost mění skutečné zařízení.</p>`),
      setup(stage) {
        const row = el('div', 'stage-row');
        const cvBars = el('canvas');
        row.append(cvBars);

        const slider = el('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.step = '5';
        slider.value = '60';
        const lightLabel = el('span', 'ctl-value');
        const gain = () => 1 + Number(slider.value) / 100; // 1.00 .. 2.00
        const refresh = () => {
          lightLabel.textContent = t(`light = ${slider.value} % (gain ×${gain().toFixed(2)})`,
            `světlo = ${slider.value} % (zesílení ×${gain().toFixed(2)})`);
        };
        slider.addEventListener('input', refresh);
        refresh();

        const btns = el('div', 'stage-row');
        const bTrain = el('button', null, t('train in the dark', 'natrénovat ve tmě'));
        const bLight = el('button', 'secondary', t('apply light & test', 'zapnout světlo a testovat'));
        const bRetrain = el('button', 'secondary', t('retrain under light', 'přenatrénovat pod světlem'));
        btns.append(bTrain, bLight, bRetrain);
        const note = el('span', 'hint small', t('start by training', 'začněte tréninkem'));
        stage.append(row, slider, lightLabel, btns, note);

        let darkAcc = null;

        const drawBars = (result) => {
          const idx = result.demoIndex;
          const scores = result.testScores.subarray(idx * 10, idx * 10 + 10);
          const probs = new Float64Array(10);
          softmaxRow(scores, probs, 0);
          let best = 0;
          for (let c = 1; c < 10; c++) if (scores[c] > scores[best]) best = c;
          const truth = api.data.labels[60000 + idx];
          plots.drawProbBars(cvBars, 240, 240, probs, best, truth);
        };

        const run = async (opts, msg, onDone) => {
          for (const b of [bTrain, bLight, bRetrain]) b.disabled = true;
          note.textContent = msg;
          try {
            const result = await api.compute({ counts: { train: 600, test: 300 }, noiseSigma: 0, ...opts });
            onDone(result);
            drawBars(result);
          } catch (err) {
            note.textContent = `error: ${err.message}`;
          } finally {
            for (const b of [bTrain, bLight, bRetrain]) b.disabled = false;
          }
        };

        bTrain.addEventListener('click', () =>
          run({ light: 1, lightTest: 1 }, t('training a readout in the dark…', 'trénuji čtecí vrstvu ve tmě…'), (r) => {
            darkAcc = r.testAccuracy;
            note.textContent = t(`dark: ${(r.testAccuracy * 100).toFixed(1)} % — now flip on the light`,
              `tma: ${(r.testAccuracy * 100).toFixed(1)} % — teď rozsviťte`);
          }),
        );

        bLight.addEventListener('click', () => {
          if (darkAcc === null) {
            note.textContent = t('train in the dark first', 'nejprve natrénujte ve tmě');
            return;
          }
          const g = gain();
          run(
            { light: 1, lightTest: g },
            t(`testing the dark-trained readout under light (×${g.toFixed(2)})…`,
              `testuji vrstvu natrénovanou ve tmě pod světlem (×${g.toFixed(2)})…`),
            (r) => {
              note.textContent = t(`illuminated: ${(r.testAccuracy * 100).toFixed(1)} % (was ${(darkAcc * 100).toFixed(1)} % in the dark) — projections changed`,
                `osvětleno: ${(r.testAccuracy * 100).toFixed(1)} % (ve tmě bylo ${(darkAcc * 100).toFixed(1)} %) — projekce se změnily`);
            },
          );
        });

        bRetrain.addEventListener('click', () => {
          const g = gain();
          run({ light: g, lightTest: g }, t(`retraining under light (×${g.toFixed(2)})…`, `přenatrénovávám pod světlem (×${g.toFixed(2)})…`), (r) => {
            note.textContent = t(`retrained under light: ${(r.testAccuracy * 100).toFixed(1)} % — recovered`,
              `přenatrénováno pod světlem: ${(r.testAccuracy * 100).toFixed(1)} % — obnoveno`);
          });
        });
      },
    },

    {
      id: 'cta',
      title: t('Now it is your turn', 'Teď jste na řadě'),
      html: t(`<p>Open the <b>Playground</b> to tune the reservoir: number of nodes, connectivity, memory
      time constants, pulse shapes, noise, and more — every change re-runs the whole pipeline live.</p>
      <p>The <b>Hardware</b> tab's ESP32 panel sends these exact pulses to the real board (Chrome/Edge,
      Web Serial) and trains the readout on the states that come back — firmware in <code>tools/esp32/</code>.</p>`,
      `<p>Otevřete <b>Sandbox</b> a laďte rezervoár: počet uzlů, konektivitu, časové konstanty paměti,
      tvary pulzů, šum a další — každá změna znovu spustí celé zpracování naživo.</p>
      <p>Panel ESP32 v záložce <b>Hardware</b> posílá tyto přesné pulzy do skutečné desky (Chrome/Edge,
      Web Serial) a trénuje čtecí vrstvu na vracejících se stavech — firmware je
      v <code>tools/esp32/</code>.</p>`),
      setup(stage) {
        const btn = el('button', null, t('open the playground →', 'otevřít Sandbox →'));
        btn.addEventListener('click', () => api.openTab('playground'));
        stage.append(btn);
      },
    },
  ];

  function renderSidebar() {
    sidebar.innerHTML = '';
    steps.forEach((s, i) => {
      const item = el('button', `tour-item${i === index ? ' active' : ''}`, `${i + 1}. ${s.title}`);
      item.addEventListener('click', () => go(i));
      sidebar.append(item);
    });
  }

  function go(i) {
    if (cleanup) {
      try { cleanup(); } catch { /* ignore */ }
      cleanup = null;
    }
    index = Math.max(0, Math.min(steps.length - 1, i));
    const step = steps[index];
    titleEl.textContent = step.title;
    bodyEl.innerHTML = step.html;
    stageEl.innerHTML = '';
    renderSidebar();
    try {
      step.setup(stageEl);
    } catch (err) {
      stageEl.append(el('p', 'hint', t(`step failed: ${err.message}`, `krok selhal: ${err.message}`)));
    }
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === steps.length - 1;
  }

  prevBtn.addEventListener('click', () => go(index - 1));
  nextBtn.addEventListener('click', () => go(index + 1));
  go(0);
}
