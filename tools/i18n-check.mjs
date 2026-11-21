// Finds text on kerNEl that still needs translating (Arabic, German, Tagalog).
// Usage: node tools/i18n-check.mjs [main|kids] [--json file]   → prints the English texts with no translation yet.
// It reads t('…') / tn(…) calls in the code, a few lists that are translated with t(variable),
// and (optionally) a JSON list of texts a browser test found missing on the live page.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const which = process.argv[2] || 'main';
const jsonArg = process.argv.indexOf('--json');
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const unq = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');

const MAIN_FILES = ['app', 'codme', 'community', 'notify', 'game', 'play', 'social', 'extras', 'look', 'news', 'fun', 'auth', 'content', 'reader', 'tabs', 'dm', 'photo', 'mod', 'invite', 'cosmetics', 'arena', 'voice', 'groups', 'pops', 'discover', 'stocks', 'bingo', 'guess', 'cards', 'cards-ui', 'cards-data', 'squads', 'parties', 'debates'];
const KIDS_FILES = ['kids'];
const files = (which === 'kids' ? KIDS_FILES : MAIN_FILES).map((f) => `js/${f}.js`);

const keys = new Set();
const add = (s) => { const k = norm(unq(s)); if (/\p{L}/u.test(k) && !k.includes('${')) keys.add(k); };
const LIT = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|\x60((?:[^\x60\\$]|\\.)*)\x60`;
for (const f of files) {
  const src = read(f);
  // t('…'), tr('…'), t(`…`) — first argument only
  for (const m of src.matchAll(new RegExp(String.raw`\b(?:t|tr)\(\s*(?:${LIT})`, 'g'))) add(m[1] ?? m[2] ?? m[3]);
  // tn(n, 'one', 'many') — translations use the "many" form
  for (const m of src.matchAll(new RegExp(String.raw`\btn\([^,]+,\s*(?:${LIT})\s*,\s*(?:${LIT})`, 'g'))) add(m[4] ?? m[5] ?? m[6]);
  // t(pick([...])) and tn(n, pick([...]), pick([...]))
  for (const m of src.matchAll(/pick\(\[([\s\S]*?)\]\)/g)) for (const x of m[1].matchAll(new RegExp(LIT, 'g'))) add(x[1] ?? x[2] ?? x[3]);
  // objects whose fields are shown through t(): name/desc/label/title
  for (const m of src.matchAll(new RegExp(String.raw`\b(?:name|desc|label|title|q|hint|say|text|tip|story)\s*:\s*(?:${LIT})`, 'g'))) add(m[1] ?? m[2] ?? m[3]);
}
if (which === 'main') {
  const app = read('js/app.js');
  for (const m of app.matchAll(/\[\d+, '([^']+)', '[^']+'\]/g)) add(m[1]); // RANKS
  for (const m of app.matchAll(/(signin|signup|recover|code): \['([^']+)', '([^']+)'\]/g)) { add(m[2]); add(m[3]); } // AUTH_TEXT
  const codme = read('js/codme.js');
  for (const m of codme.matchAll(/'(\p{Extended_Pictographic}[^']*)'/gu)) add(m[1]); // chips + sniff lines
  const extras = read('js/extras.js');
  for (const m of extras.matchAll(/^\s+\w+: '([^']{20,})',$/gm)) add(m[1]); // CAT_ELI10 / CAT_WHY
  for (const m of extras.matchAll(/\['.', '([A-Z][^']+)'\]/gu)) add(m[1]); // VIBES
  const content = read('js/content.js');
  const block = (name) => content.slice(content.indexOf(`export const ${name}`), content.indexOf('];', content.indexOf(`export const ${name}`)));
  for (const name of ['FACTS', 'LOADING_LINES']) for (const m of block(name).matchAll(/^\s+'((?:[^'\\]|\\.)*)',$/gm)) add(m[1]);
  const gl = content.slice(content.indexOf('export const GLOSSARY'), content.indexOf('export const GLOSSARY_ALIASES'));
  for (const m of gl.matchAll(/:\s*'((?:[^'\\]|\\.)*)',$/gm)) add(m[1]);
  for (const m of read('js/fun.js').matchAll(/'([a-z][^']{3,})'/g)) if (/ (a|an|the|of|giraffes?|eiffel|football|blue whale|bus)\b/i.test(m[1])) add(m[1]); // doomscroll comparisons
  for (const m of read('js/cosmetics.js').matchAll(/name: '([^']+)'/g)) add(m[1]);
  for (const m of read('js/news.js').matchAll(/label: '([^']+)'/g)) add(m[1]);
  for (const m of read('js/community.js').matchAll(/name: '([^']+)'/g)) add(m[1]);
  // server messages shown to people (errors) and the daily polls
  for (const f of readdirSync(join(root, 'backend/src'))) {
    const src = read(`backend/src/${f}`);
    for (const m of src.matchAll(/HttpError\(\d+, '((?:[^'\\]|\\.)*)'\)/g)) add(m[1]);
  }
  const comm = read('backend/src/community.js');
  const polls = comm.slice(comm.indexOf('export const POLLS'), comm.indexOf('];', comm.indexOf('export const POLLS')));
  for (const m of polls.matchAll(new RegExp(LIT, 'g'))) add(m[1] ?? m[2] ?? m[3]);
}
if (which === 'kids') {
  const k = read('js/kids.js');
  for (const m of k.matchAll(new RegExp(String.raw`\b(?:badge|why)\s*:\s*(?:${LIT})`, 'g'))) add(m[1] ?? m[2] ?? m[3]);
  for (const m of k.matchAll(/options: \[([^\]]+)\]/g)) for (const x of m[1].matchAll(new RegExp(LIT, 'g'))) add(x[1] ?? x[2] ?? x[3]);
  for (const m of k.matchAll(/^\s+\['[^']+', '([^']+)', '([^']+)'\],$/gm)) { add(m[1]); add(m[2]); } // WORDS
  for (const m of k.matchAll(/^\s+\['[^']+', '((?:[^'\\]|\\.)+)'\],$/gm)) add(m[1]); // STAGES
  for (const m of k.matchAll(/^\s+\['\w+', '([^']+)', \(s\)/gm)) add(m[1]); // password rules
  for (const name of ['CHEERS', 'TALK']) {
    const i = k.indexOf(`const ${name} = [`);
    for (const m of k.slice(i, k.indexOf('];', i)).matchAll(new RegExp(LIT, 'g'))) add(m[1] ?? m[2] ?? m[3]);
  }
  for (const m of k.matchAll(/^const KIND = \{([^}]+)\}/gm)) for (const x of m[1].matchAll(/'([^']+)'/g)) add(x[1]);
  for (const w of ['an input', 'inside', 'an output']) add(`{name} is ${w}.`);
  const kb = k.slice(k.indexOf('const KID_BLURB'), k.indexOf('};', k.indexOf('const KID_BLURB')));
  for (const m of kb.matchAll(/:\s*'([^']+)'/g)) add(m[1]);
}
if (jsonArg > 0) for (const k of JSON.parse(readFileSync(process.argv[jsonArg + 1], 'utf8'))) add(k);

// what's already translated
const table = read(which === 'kids' ? 'js/i18n-kids.js' : 'js/i18n-main.js');
const have = new Map();
const rowRe = /^\s*\[\s*('(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*,\s*('(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*,\s*('(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*,\s*('(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*\],?\s*$/gm;
for (const m of table.matchAll(rowRe)) have.set(norm(unq(m[1].slice(1, -1))), [m[2], m[3], m[4]].map((x) => unq(x.slice(1, -1))));
const missing = [...keys].filter((k) => !have.has(k) || have.get(k).some((x) => !x));
const unused = [...have.keys()].filter((k) => !keys.has(k));
console.log(`${which}: ${keys.size} texts, ${have.size} rows, ${missing.length} missing`);
if (process.argv.includes('--unused')) console.log('unused rows:', unused);
const out = process.argv.indexOf('--out');
if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify(missing, null, 1));
else for (const k of missing) console.log(JSON.stringify(k));
// placeholders must survive translation
let bad = 0;
for (const [k, tr] of have) {
  const need = (k.match(/\{\w+\}/g) || []).sort().join();
  tr.forEach((x, i) => { if ((x.match(/\{\w+\}/g) || []).sort().join() !== need) { bad++; console.log(`⚠️ placeholders differ [${['ar', 'de', 'tl'][i]}]: ${k} → ${x}`); } });
}
if (bad) process.exitCode = 1;
