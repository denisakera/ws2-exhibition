/**
 * A voice for a few cards of the finale. A recording is always preferred:
 *   audio/<id>_<lang>.mp3 | .ogg | .wav     (for example audio/lovelace_cs.mp3)
 * If there is no recording the browser's own speech synthesis is used, but only when it has a voice
 * for the language (an exhibition PC often has no Czech voice, then there is simply no button).
 * Nothing plays by itself: the visitor presses the button.
 */
const EXT = ['mp3', 'ogg', 'wav'];
const found = new Map();      // `${id}_${lang}` -> url | null
let audio = null;
let playing = false;

async function recordingFor(id, lang) {
  const key = `${id}_${lang}`;
  if (found.has(key)) return found.get(key);
  let url = null;
  for (const ext of EXT) {
    const candidate = `audio/${key}.${ext}`;
    try {
      const r = await fetch(candidate, { method: 'HEAD', cache: 'no-store' });
      if (r.ok) { url = candidate; break; }
    } catch { /* offline file missing: try the next extension */ }
  }
  found.set(key, url);
  return url;
}

function synthesisVoice(lang) {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  // only voices installed on the machine: an online voice would fail in an offline exhibition
  return voices.find((v) => v.localService && v.lang.toLowerCase().startsWith(lang)) || null;
}

/** What can read this card in this language: { kind: 'file', url } | { kind: 'speech' } | null. */
export async function sourceFor(id, lang) {
  const url = await recordingFor(id, lang);
  if (url) return { kind: 'file', url };
  if (synthesisVoice(lang)) return { kind: 'speech' };
  return null;
}

/**
 * Speech synthesis reads names as spelled, so a few are respelled the way they are said.
 * (Recordings do not need this.) "Lovelace" is said "Lavlejs" in Czech and "Luvlace" in English.
 */
const SAY = {
  cs: [[/Lovelace/g, 'Lavlejs']],
  en: [[/Lovelace/g, 'Luvlace']],
};
export function speakable(text, lang) {
  return (SAY[lang] || []).reduce((s, [re, to]) => s.replace(re, to), text);
}

export const isPlaying = () => playing;

export function stop() {
  playing = false;
  if (audio) { audio.pause(); audio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

export function speak(src, text, lang, onEnd) {
  stop();
  playing = true;
  const done = () => { if (playing) { playing = false; onEnd?.(); } };
  if (src.kind === 'file') {
    audio = new Audio(src.url);
    audio.addEventListener('ended', done);
    audio.addEventListener('error', done);
    audio.play().catch(done);
  } else {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.voice = synthesisVoice(lang);
    u.rate = 0.92;
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  }
}
