/**
 * Web Serial bridge for the ESP32.
 *
 * Protocol v0.1 (line based over USB CDC, 921600 baud nominal):
 *   host -> device : "S <sampleId> <64 hex chars>"  one nibble per pixel,
 *                    row-major 8x8: channel c, slot t -> index c*8+t;
 *                    level 0..15 (0 = off, F = full; input u = level/15)
 *                    "C <key> <value>\n"              (runtime config)
 *                    "C status\n" / "C ping\n"        (query / liveness)
 *   device -> host : "R <sampleId> <n> <f0> <f1> ...\n"  (reservoir state floats)
 *                    "K <text>\n"                     (log / ack)
 *
 * v1 will switch to a compact binary frame (id | payload | checksum); the UI
 * only depends on the callbacks below, so the wire format can change freely.
 */
import { t } from './i18n.js';

export class SerialBridge extends EventTarget {
  constructor() {
    super();
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.reading = false;
    this.textBuffer = '';
    this.baudRate = 921600;
    this.recovering = false;
    this.recoveryStreak = 0;
    this.linkState = 'disconnected';
  }

  static supported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async connect() {
    if (!SerialBridge.supported()) throw new Error(t('Web Serial not available (use Chrome/Edge on localhost)',
      'Web Serial není dostupný (použijte Chrome/Edge na localhostu)'));
    this.port = await navigator.serial.requestPort();
    this.recoveryStreak = 0;
    await this.#openPort();
    return true;
  }

  async disconnect() {
    this.reading = false;
    try {
      if (this.reader) await this.reader.cancel();
    } catch { /* ignore */ }
    try {
      if (this.writer) this.writer.releaseLock();
      if (this.port) await this.port.close();
    } catch { /* ignore */ }
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.#setState('disconnected');
  }

  async #openPort() {
    await this.port.open({ baudRate: this.baudRate, bufferSize: 65536 });
    this.writer = this.port.writable.getWriter();
    this.#setState('connected');
    this.#readLoop();
  }

  /**
   * The port can drop at any time (chip reset, unplug, or a host tool leaving
   * the tty in a state Chromium reads as "device lost"). Tear the streams down
   * and try to reopen the same granted port; give up after repeated instant
   * failures (`recoveryStreak` resets as soon as data arrives again).
   */
  async #recover() {
    if (!this.reading || this.recovering) return;
    this.recovering = true;
    try {
      this.recoveryStreak++;
      if (this.recoveryStreak > 6) {
        this.#setState('lost');
        return;
      }
      this.#setState('reconnecting');
      try { if (this.reader) await this.reader.cancel(); } catch { /* ignore */ }
      try { if (this.writer) this.writer.releaseLock(); } catch { /* ignore */ }
      this.writer = null;
      try { if (this.port) await this.port.close(); } catch { /* ignore */ }
      for (let attempt = 0; attempt < 5 && this.reading; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        try {
          await this.#openPort();
          return;
        } catch { /* retry */ }
      }
      if (this.reading) this.#setState('lost');
    } finally {
      this.recovering = false;
    }
  }

  #setState(state) {
    this.linkState = state;
    this.#emit('status', { state });
  }

  async #readLoop() {
    this.reading = true;
    const decoder = new TextDecoder();
    while (this.reading && this.port && this.port.readable) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value && value.length) this.recoveryStreak = 0;
          this.textBuffer += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = this.textBuffer.indexOf('\n')) >= 0) {
            const line = this.textBuffer.slice(0, nl).trim();
            this.textBuffer = this.textBuffer.slice(nl + 1);
            if (line) this.#handleLine(line);
          }
        }
      } catch (err) {
        this.#emit('error', { message: String(err) });
      } finally {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
    if (this.reading) this.#recover();
  }

  #handleLine(line) {
    const parts = line.split(/\s+/);
    if (parts[0] === 'R' && parts.length >= 3) {
      const sampleId = Number(parts[1]);
      const n = Number(parts[2]);
      const values = new Float32Array(n);
      for (let i = 0; i < n && 3 + i < parts.length; i++) values[i] = Number(parts[3 + i]);
      this.#emit('states', { sampleId, values });
    } else if (parts[0] === 'K') {
      this.#emit('log', { text: parts.slice(1).join(' ') });
    } else {
      this.#emit('line', { line });
    }
  }

  async sendSample(sampleId, values64) {
    await this.#write(`S ${sampleId} ${valuesToHex(values64)}\n`);
  }

  async sendConfig(key, value) {
    await this.#write(`C ${key} ${value}\n`);
  }

  async requestStatus() {
    await this.#write('C status\n');
  }

  async ping() {
    await this.#write('C ping\n');
  }

  async #write(text) {
    if (!this.writer) throw new Error(t('serial: not connected', 'sériový port: nepřipojeno'));
    const data = new TextEncoder().encode(text);
    await this.writer.write(data);
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

export function valuesToHex(values64) {
  let hex = '';
  for (let i = 0; i < 64; i++) {
    const v = Math.max(0, Math.min(15, Math.round(values64[i])));
    hex += v.toString(16);
  }
  return hex;
}
