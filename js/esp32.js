/**
 * ESP32 hardware panel — live link, pulse settings, MNIST streaming and real
 * readout training on the device's own replies (protocol v0.1, see serial.js).
 *
 * The device plays the 8-channel pulse trains for each digit and answers with
 * `R <id> <n> <floats…>`; "Train readout" fits the same ridge readout the
 * Playground uses — but on the hardware's actual serial replies, not the
 * browser-side software reservoir.
 *
 * Pure helpers (sampleValues64, labelOf, splitIndex) are exported for
 * test/test_esp32.mjs and must stay DOM-free.
 */
import { SerialBridge } from './serial.js';
import { fitRidge, evaluate } from './readout.js';
import { drawConfusion } from './plots.js';
import { t } from './i18n.js';

/** One MNIST sample as 64 pulse levels 0..15 (row-major, protocol v0.1). */
export function sampleValues64(data, source, id, encoding, threshold, testOffset) {
  const base = (source === 'train' ? 0 : testOffset) * 64 + id * 64;
  const out = new Float64Array(64);
  for (let j = 0; j < 64; j++) {
    const px = data.x8[base + j] / 255;
    if (encoding === 'binary') out[j] = px >= threshold ? 15 : 0;
    else out[j] = Math.round(px * 15);
  }
  return out;
}

/** Ground-truth digit for a sample of the given source. */
export function labelOf(data, source, id, testOffset) {
  return data.labels[(source === 'train' ? 0 : testOffset) + id];
}

/** First `percent`% of `total` rows go to train (>= 1 row each when possible). */
export function splitIndex(total, percent) {
  if (total < 2) return 0;
  return Math.max(1, Math.min(total - 1, Math.round((total * percent) / 100)));
}

/** Firmware default 8-pin map (ESP32-C3): change on the device with `C chans`. */
export const DEFAULT_CHANNELS = '4,5,6,7,10,20,21,3';

/** The `C chans` value for a UI mode: '1' (serial) uses the one pin, '8' the default map. */
export function channelsFor(mode, pin) {
  if (mode === '8') return DEFAULT_CHANNELS;
  const p = Math.max(0, Math.min(21, Math.round(Number(pin) || 0)));
  return String(p);
}

export function initEsp32(ctx) {
  const $ = (sel) => document.querySelector(sel);
  const logEl = $('#hw-log');
  const els = {
    connect: $('#hw-connect'), disconnect: $('#hw-disconnect'), link: $('#hw-link'),
    slot: $('#hw-slot'), duty: $('#hw-duty'), applyPulse: $('#hw-apply-pulse'),
    chans: $('#hw-chans'), pin: $('#hw-pin'), pace: $('#hw-pace'),
    frOn: $('#hw-fr-on'), frOff: $('#hw-fr-off'), frCount: $('#hw-fr-count'),
    frPause: $('#hw-fr-pause'), frEnable: $('#hw-fr-enable'), applyFr: $('#hw-apply-fr'),
    src: $('#hw-src'), count: $('#hw-count'), start: $('#hw-start'),
    stop: $('#hw-stop'), progress: $('#hw-progress'),
    split: $('#hw-split'), train: $('#hw-train'), resetData: $('#hw-reset-data'),
    lambda: $('#hw-lambda'),
    accTrain: $('#hw-acc-train'), accTest: $('#hw-acc-test'), dim: $('#hw-dim'),
    nStates: $('#hw-n'), confusion: $('#hw-confusion'), dataInfo: $('#hw-data-info'),
  };

  const log = (text) => {
    logEl.textContent += `${text}\n`;
    if (logEl.textContent.length > 60000) logEl.textContent = logEl.textContent.slice(-30000);
    logEl.scrollTop = logEl.scrollHeight;
  };

  const bridge = new SerialBridge();
  const serialSupported = SerialBridge.supported();
  let linkState = 'disconnected';
  let batchRunning = false;
  let cancelRequested = false;
  const pending = new Map(); // sampleId -> { promise, resolve, reject, cancel }
  const dataset = new Map(); // "source:id" -> { id, source, label, state }

  const stateLabel = (state) => ({
    disconnected: t('disconnected', 'odpojeno'),
    connected: t('connected', 'připojeno'),
    reconnecting: t('reconnecting', 'znovu se připojuji'),
    lost: t('lost', 'spojení ztraceno'),
  }[state] || state);

  const num = (input, min, max, fallback) => {
    const v = Number(input.value);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
  };

  function syncUi() {
    const active = linkState === 'connected' || linkState === 'reconnecting';
    els.connect.disabled = active || !serialSupported;
    els.disconnect.disabled = !active;
    els.applyPulse.disabled = linkState !== 'connected';
    els.applyFr.disabled = linkState !== 'connected';
    els.start.disabled = linkState !== 'connected' || batchRunning;
    els.stop.disabled = !batchRunning;
    els.train.disabled = linkState !== 'connected' || batchRunning || dataset.size < 4;
    els.resetData.disabled = dataset.size === 0;
    els.link.textContent = stateLabel(linkState);
    els.link.classList.toggle('on', linkState === 'connected');
  }

  function renderData() {
    const n = dataset.size;
    els.nStates.textContent = String(n);
    if (!n) {
      els.dataInfo.textContent = t('No device states yet — send a batch first.',
        'Zatím žádné stavy ze zařízení — nejprve odešlete dávku.');
      syncUi();
      return;
    }
    const dim = dataset.values().next().value.state.length;
    const tr = splitIndex(n, Math.round(num(els.split, 10, 90, 70)));
    els.dataInfo.textContent = t(`${n} device states collected · ${dim} dims each · split ${tr} train / ${n - tr} test`,
      `${n} stavů ze zařízení · ${dim} rozměrů každý · rozdělení ${tr} trénink / ${n - tr} test`);
    syncUi();
  }

  function awaitState(id, timeoutMs) {
    let resolveFn = null;
    let rejectFn = null;
    const promise = new Promise((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });
    promise.catch(() => {}); // the caller may stop waiting (cancel paths)
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectFn(new Error(t(`no reply for #${id} within ${Math.round(timeoutMs / 1000)} s`,
        `žádná odpověď pro #${id} do ${Math.round(timeoutMs / 1000)} s`)));
    }, timeoutMs);
    const entry = {
      promise,
      resolve: (v) => { clearTimeout(timer); resolveFn(v); },
      cancel: (err) => {
        clearTimeout(timer);
        pending.delete(id);
        rejectFn(err instanceof Error ? err : new Error(String(err || 'cancelled')));
      },
    };
    pending.set(id, entry);
    return entry;
  }

  function updatePace() {
    const pinMode = els.chans.value === '1';
    els.pin.disabled = !pinMode;
    const slots = pinMode ? 64 : 8;
    const slotMs = num(els.slot, 2, 50, 10);
    const seconds = ((slots * slotMs) / 1000).toFixed(2);
    els.pace.textContent = pinMode
      ? t(`1 pin: one digit = ${slots} slots × ${slotMs} ms ≈ ${seconds} s of serial pulses (reply keeps 8 readouts).`,
          `1 pin: jedna číslice = ${slots} slotů × ${slotMs} ms ≈ ${seconds} s sériových pulzů (odpověď zachová 8 čtecích vektorů).`)
      : t(`8 pins: one digit = ${slots} slots × ${slotMs} ms ≈ ${seconds} s, columns in parallel.`,
          `8 pinů: jedna číslice = ${slots} slotů × ${slotMs} ms ≈ ${seconds} s, sloupce paralelně.`);
  }

  async function pushPulseSettings() {
    await bridge.sendConfig('chans', channelsFor(els.chans.value, num(els.pin, 0, 21, 4)));
    await bridge.sendConfig('slot_ms', Math.round(num(els.slot, 2, 50, 10)));
    await bridge.sendConfig('duty', (num(els.duty, 5, 100, 100) / 100).toFixed(2));
  }

  async function pushFreeSettings() {
    await bridge.sendConfig('free', els.frEnable.checked ? 1 : 0);
    await bridge.sendConfig('fr_on', Math.round(num(els.frOn, 1, 100000, 10)));
    await bridge.sendConfig('fr_off', Math.round(num(els.frOff, 1, 100000, 10)));
    await bridge.sendConfig('fr_count', Math.round(num(els.frCount, 1, 1000000, 200)));
    await bridge.sendConfig('fr_pause', Math.round(num(els.frPause, 0, 3600, 5) * 1000));
  }

  async function startBatch() {
    const data = ctx.data();
    if (!data) { log(t('[batch] MNIST assets are still loading', '[batch] data MNIST se ještě načítají')); return; }
    if (batchRunning || linkState !== 'connected') return;
    const source = els.src.value;
    const sourceName = source === 'train' ? t('train', 'trénovací') : t('test', 'testovací');
    const count = Math.round(num(els.count, 1, 500, 100));
    const timeoutMs = 20000;
    batchRunning = true;
    cancelRequested = false;
    syncUi();
    log(t(`[batch] sending ${count} ${source}-set samples…`, `[batch] odesílám ${count} vzorků z ${sourceName} sady…`));
    let sent = 0;
    let got = 0;
    let failed = 0;
    for (let k = 0; k < count && !cancelRequested; k++) {
      const id = k;
      const values = sampleValues64(data, source, id, ctx.encoding(), ctx.threshold(), ctx.testOffset);
      const wait = awaitState(id, timeoutMs);
      try {
        await bridge.sendSample(id, values);
        const state = await wait.promise;
        dataset.set(`${source}:${id}`, {
          id, source, label: labelOf(data, source, id, ctx.testOffset), state,
        });
        got++;
      } catch (err) {
        wait.cancel(err);
        failed++;
        log(`[batch] #${id}: ${err.message}`);
        if (failed >= 3 && got === 0) {
          log(t('[batch] aborting — three failures with no replies; is the firmware running?',
            '[batch] ukončuji — tři selhání bez odpovědí; běží vůbec firmware?'));
          break;
        }
      }
      sent++;
      els.progress.textContent = t(`${sent}/${count} sent · ${got} states · ${failed} failed`,
        `${sent}/${count} odesláno · ${got} stavů · ${failed} selhalo`);
    }
    batchRunning = false;
    renderData();
    log(`[batch] ${t(cancelRequested ? 'stopped' : 'done', cancelRequested ? 'zastaveno' : 'hotovo')} — ` +
      t(`sent ${sent}, got ${got}`, `odesláno ${sent}, přijato ${got}`) +
      (failed ? t(`, failed ${failed}`, `, selhalo ${failed}`) : ''));
  }

  function trainReadout() {
    const records = [...dataset.values()];
    if (records.length < 4) {
      log(t('[train] collect at least 4 states — 40–100 gives a meaningful accuracy',
        '[train] nasbírejte alespoň 4 stavy — 40–100 dává smysluplnou přesnost'));
      return;
    }
    const dim = records[0].state.length;
    if (!dim) { log(t('[train] device states are empty', '[train] stavy ze zařízení jsou prázdné')); return; }
    const usable = records.filter((r) => r.state.length === dim);
    if (usable.length < records.length) {
      log(t(`[train] dropped ${records.length - usable.length} states with a different length`,
        `[train] zahozeno ${records.length - usable.length} stavů s jinou délkou`));
    }
    const n = usable.length;
    const X = new Float32Array(n * dim);
    const y = new Uint8Array(n);
    usable.forEach((r, m) => { X.set(r.state, m * dim); y[m] = r.label; });
    const tr = splitIndex(n, Math.round(num(els.split, 10, 90, 70)));
    if (tr < 2 || n - tr < 1) { log(t('[train] too few states for this split', '[train] pro toto rozdělení je stavů málo')); return; }
    const lambda = Number(els.lambda.value) || 0.1;
    let trainEval;
    let testEval;
    try {
      const model = fitRidge(X, y, dim, tr, lambda);
      trainEval = evaluate(model, X, y, dim, tr);
      testEval = evaluate(model, X.subarray(tr * dim), y.subarray(tr), dim, n - tr);
    } catch (err) {
      log(`[train] ${err.message}`);
      return;
    }
    els.accTrain.textContent = `${(trainEval.accuracy * 100).toFixed(1)}%`;
    els.accTest.textContent = `${(testEval.accuracy * 100).toFixed(1)}%`;
    els.dim.textContent = String(dim);
    drawConfusion(els.confusion, 240, 240, testEval.confusion);
    log(t(`[train] ridge on ${tr} train / ${n - tr} test device states (dim ${dim}, λ ${lambda}) — ` +
      `train ${(trainEval.accuracy * 100).toFixed(1)}%, test ${(testEval.accuracy * 100).toFixed(1)}%`,
      `[train] ridge na ${tr} trénovacích / ${n - tr} testovacích stavech ze zařízení (rozměr ${dim}, λ ${lambda}) — ` +
      `trénink ${(trainEval.accuracy * 100).toFixed(1)} %, test ${(testEval.accuracy * 100).toFixed(1)} %`));
    if (n - tr < 5) log(t('[train] note: a test split of < 5 makes the test accuracy very noisy',
      '[train] poznámka: testovací část < 5 dělá přesnost na testu velmi zašuměnou'));
  }

  // ------------------------------------------------------------ panel wiring

  bridge.addEventListener('status', (e) => {
    linkState = e.detail.state;
    log(`[serial] ${stateLabel(linkState)}`);
    if (linkState === 'reconnecting') log(t('[serial] device lost — trying to reopen the port…',
      '[serial] zařízení ztraceno — zkouším znovu otevřít port…'));
    if (linkState === 'connected') {
      // small delay: opening the port can reboot the chip on some hosts
      setTimeout(() => {
        Promise.resolve()
          .then(pushPulseSettings)
          .then(pushFreeSettings)
          .then(() => bridge.requestStatus())
          .catch((err) => log(`[serial] ${err.message}`));
      }, 300);
    } else {
      cancelRequested = true;
      for (const entry of [...pending.values()]) entry.cancel(new Error(t('disconnected', 'odpojeno')));
      pending.clear();
    }
    syncUi();
  });
  bridge.addEventListener('log', (e) => log(`[device] ${e.detail.text}`));
  bridge.addEventListener('line', (e) => log(`[device] ${e.detail.line}`));
  bridge.addEventListener('states', (e) => {
    const entry = pending.get(e.detail.sampleId);
    if (entry) {
      pending.delete(e.detail.sampleId);
      entry.resolve(e.detail.values);
    } else {
      log(`[states] id ${e.detail.sampleId} (${e.detail.values.length} floats)`);
    }
  });
  bridge.addEventListener('error', (e) => {
    log(`[error] ${e.detail.message}`);
    if (/device has been lost|disconnected|NetworkError/i.test(String(e.detail.message))) {
      log(t('[serial] hint: if a host-side script (pyserial) used this port, run '
        + '`stty -F /dev/ttyACM0 min 1 time 0` on this machine — or unplug/replug the board — '
        + 'then press Connect.',
        '[serial] tip: pokud tento port používal hostitelský skript (pyserial), spusťte na tomto stroji '
        + '`stty -F /dev/ttyACM0 min 1 time 0` — nebo desku odpojte a znovu připojte — '
        + 'a pak stiskněte Připojit.'));
    }
  });

  els.connect.addEventListener('click', async () => {
    try {
      await bridge.connect();
    } catch (err) {
      log(`[error] ${err.message}`);
    }
  });
  els.disconnect.addEventListener('click', () => bridge.disconnect());
  els.applyPulse.addEventListener('click', () => {
    pushPulseSettings()
      .then(() => log(t('[host] pulse settings sent', '[host] nastavení pulzů odesláno')))
      .catch((err) => log(`[error] ${err.message}`));
  });
  els.applyFr.addEventListener('click', () => {
    pushFreeSettings()
      .then(() => log(t('[host] free-run settings sent', '[host] nastavení volného běhu odesláno')))
      .catch((err) => log(`[error] ${err.message}`));
  });
  els.chans.addEventListener('change', updatePace);
  els.slot.addEventListener('input', updatePace);
  els.pin.addEventListener('input', updatePace);
  els.start.addEventListener('click', () => { startBatch(); });
  els.stop.addEventListener('click', () => { cancelRequested = true; });
  els.train.addEventListener('click', () => trainReadout());
  els.resetData.addEventListener('click', () => {
    dataset.clear();
    els.accTrain.textContent = '–';
    els.accTest.textContent = '–';
    els.dim.textContent = '–';
    els.progress.textContent = t('nothing sent yet.', 'zatím nic odesláno.');
    renderData();
    log(t('[host] device states cleared', '[host] stavy ze zařízení vymazány'));
  });
  els.split.addEventListener('input', () => renderData());

  if (serialSupported) {
    log(t('[serial] ready — connect the ESP32 (firmware: tools/esp32/) and press Connect.',
      '[serial] připraveno — připojte ESP32 (firmware: tools/esp32/) a stiskněte Připojit.'));
  } else {
    log(t('[serial] Web Serial not available in this browser (use Chrome/Edge).',
      '[serial] Web Serial v tomto prohlížeči není dostupný (použijte Chrome/Edge).'));
  }
  updatePace();
  renderData();
}
