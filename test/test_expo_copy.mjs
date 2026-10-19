/**
 * Every visitor text of the exhibition exists in Czech and English, every data-copy key in
 * expo.html is defined, and the reservoir-computing term always carries its English name.
 * Run: node test/test_expo_copy.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { tx, setLang, FUT_CHAPTER_SIZES } from '../js/expo/copy.js';

const html = fs.readFileSync('expo.html', 'utf8');
const src = fs.readFileSync('js/expo/copy.js', 'utf8');
const keys = [...src.matchAll(/^  (\w+): (?:\{|\()/gm)].map((m) => m[1]);
assert.ok(keys.length >= 35, 'copy keys not found');

for (const k of keys) {
  const cs = tx(k, 30000, 10000);
  setLang('en');
  const en = tx(k, 30000, 10000);
  setLang('cs');
  assert.ok(cs && en && cs !== k, `missing text for ${k}`);
  assert.notEqual(cs, en, `${k}: Czech and English are identical`);
  // every Czech mention of the term carries its English in parentheses (texts may be arrays)
  assert.doesNotMatch(JSON.stringify(cs), /rezervoárov(é počítání|ý počítač)(?! \((reservoir computing|reservoir computer)\))/i, `${k}: term without English in parentheses`);
}
for (const lang of ['cs', 'en']) {
  setLang(lang);
  assert.equal(tx('futCards').length, FUT_CHAPTER_SIZES.reduce((a, b) => a + b, 0), `${lang}: finale chapters do not add up to the cards`);
}
setLang('cs');
for (const m of html.matchAll(/data-copy="(\w+)"/g)) assert.ok(keys.includes(m[1]), `expo.html uses unknown key ${m[1]}`);
// every key the code asks for exists (tx('key'), setStep('key'), the NEXT_KEYS and narrN lists)
const used = new Set();
for (const f of fs.readdirSync('js/expo').filter((n) => n.endsWith('.js') && n !== 'copy.js')) {
  const code = fs.readFileSync(`js/expo/${f}`, 'utf8');
  for (const m of code.matchAll(/(?<![\w.])(?:tx|setStep)\('(\w+)'/g)) used.add(m[1]);
  for (const m of code.matchAll(/'(next\w+|step\w*|voice\w+|meas\w+|nav\w+|door\w+)'/g)) used.add(m[1]);
}
for (let i = 0; i < 4; i++) used.add(`narr${i}`);
for (const k of used) assert.ok(keys.includes(k), `code uses unknown copy key ${k}`);
console.log(`ok  ${keys.length} texts in Czech and English; every key used by the page and the code is defined; term rule holds`);
