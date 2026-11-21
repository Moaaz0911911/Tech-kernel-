// Builds dist/index.html: the whole kerNEl site (news + codme + sign-in + kids corner)
// as ONE self-contained HTML file with every stylesheet and script inlined.
// Usage:  node tools/build-single-file.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** Tiny bundler for our own ES modules (single-line named imports, declaration exports). */
function bundle(order) {
  const out = ['const __m = {};'];
  for (const name of order) {
    let code = read(`js/${name}.js`);
    code = code.replace(/^import \{([^}]+)\} from '\.\/([\w-]+)\.js';$/gm, (_, names, mod) => {
      if (!order.includes(mod)) throw new Error(`${name}.js imports ${mod}.js which is not bundled`);
      if (order.indexOf(mod) > order.indexOf(name)) throw new Error(`${name}.js imports ${mod}.js, so ${mod} must come before ${name} in the bundle order`);
      return `const {${names.replace(/\s+as\s+/g, ': ')}} = __m[${JSON.stringify(mod)}];`;
    });
    if (/^\s*import\s/m.test(code)) throw new Error(`Unsupported import in ${name}.js`);
    const exported = [];
    code = code.replace(/^export (async function|function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, id) => {
      exported.push(id);
      return `${kind} ${id}`;
    });
    if (/^export\s/m.test(code)) throw new Error(`Unsupported export in ${name}.js`);
    out.push(`// ===== ${name}.js =====\n__m[${JSON.stringify(name)}] = (() => {\n${code}\nreturn { ${exported.join(', ')} };\n})();`);
  }
  return out.join('\n\n');
}

const svgDataUri = (svg) => `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
const favicon = svgDataUri(read('assets/favicon.svg'));
// Keep inline <script> content from ever closing early.
const safeScript = (js) => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

// ---------------- Kids page (shown inside a full-screen frame at #kids) ----------------
const kidsNav = `
// single-file extras: in-page links + "back to the news"
document.addEventListener('click', (e) => {
  const close = e.target.closest('[data-close-kids]');
  if (close) { e.preventDefault(); parent.postMessage({ kernel: 'close-kids' }, '*'); return; }
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  e.preventDefault();
  const id = a.getAttribute('href').slice(1);
  const target = id ? document.getElementById(id) : null;
  (target || document.body).scrollIntoView({ behavior: 'smooth', block: 'start' });
});`;
let kids = read('kids.html')
  .replace('<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">', `<link rel="icon" href="${favicon}" type="image/svg+xml">`)
  .replace(/\s*<link rel="(?:manifest|apple-touch-icon)"[^>]*>/g, '') // the one-file version can't ship the app manifest / service worker
  .replace('<link rel="stylesheet" href="css/kids.css">', `<style>\n${read('css/kids.css')}\n</style>`)
  .replace(/href="kids\.html"/g, 'href="#top"')
  .replace(/href="index\.html"/g, 'href="#" data-close-kids')
  .replace('<script type="module" src="js/kids.js"></script>', () => `<script type="module">\n${safeScript(bundle(['config', 'i18n', 'utils', 'fun', 'auth', 'i18n-kids', 'kids']).replace(/href="index\.html"/g, 'href="#" data-close-kids') + kidsNav)}\n</script>`);
if (/src="js\/|href="css\//.test(kids)) throw new Error('kids.html still references external files');

// ---------------- Main page ----------------
const kidsLoader = `
// ===== single-file: kerNEl Kids lives at #kids in a full-screen frame =====
(() => {
  const KIDS_HTML = ${JSON.stringify(kids).replace(/</g, '\\u003c')};
  const baseTitle = document.title;
  let frame = null;
  function syncKids() {
    const on = location.hash === '#kids';
    if (on && !frame) {
      frame = document.createElement('iframe');
      frame.id = 'kidsFrame';
      frame.title = 'kerNEl Kids';
      frame.srcdoc = KIDS_HTML;
      document.body.append(frame);
    }
    if (frame) frame.hidden = !on;
    document.documentElement.classList.toggle('kids-open', on);
    document.title = on ? 'kerNEl Kids — Learn how tech works!' : baseTitle;
    if (on) frame.focus();
  }
  window.addEventListener('hashchange', syncKids);
  window.addEventListener('message', (e) => {
    if (frame && e.source === frame.contentWindow && e.data && e.data.kernel === 'close-kids') {
      history.pushState('', document.title, location.pathname + location.search);
      syncKids();
    }
  });
  syncKids();
})();`;

const mainJs = bundle(['config', 'i18n', 'utils', 'i18n-main', 'emoji', 'content', 'fun', 'news', 'auth', 'fakes', 'cosmetics', 'icons', 'look', 'codme', 'voice', 'groups', 'cards-data', 'cards-ui', 'dm', 'pops', 'play', 'arena', 'stocks', 'bingo', 'guess', 'cards', 'discover', 'community', 'notify', 'game', 'social', 'extras', 'photo', 'mod', 'invite', 'tabs', 'reader', 'app'])
  .replace(/href="kids\.html"/g, 'href="#kids"')
  .replace(/js\/config\.js/g, 'the CONFIG section of index.html');
if (/kids\.html/.test(mainJs)) throw new Error('main bundle still links kids.html');

const kidsCss = `
/* single-file: kids corner overlay */
#kidsFrame { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; z-index: 1000; background: #8fd3ff; }
html.kids-open, html.kids-open body { overflow: hidden; }`;

let html = read('index.html')
  .replace('<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">', `<link rel="icon" href="${favicon}" type="image/svg+xml">`)
  .replace(/\s*<link rel="(?:manifest|apple-touch-icon)"[^>]*>/g, '') // the one-file version can't ship the app manifest / service worker
  .replace('<link rel="stylesheet" href="css/main.css">', `<style>\n${read('css/main.css')}\n${kidsCss}\n</style>`)
  .replace(/href="kids\.html"/g, 'href="#kids"')
  .replace(/href="privacy\.html"/g, 'href="https://moaaz0911911.github.io/Tech-kernel-/privacy.html"')
  .replace(/<code>js\/config\.js<\/code>/g, 'the <code>CONFIG</code> section near the top of the script in <code>index.html</code>')
  .replace('<script type="module" src="js/app.js"></script>', () => `<script type="module">\n/* kerNEl — single-file build. To switch on Google/Apple sign-in, edit CONFIG just below. */\n${safeScript(mainJs + kidsLoader)}\n</script>`);
if (/src="js\/|href="css\/|href="assets\//.test(html)) throw new Error('index.html still references external files');

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
console.log(`dist/index.html written (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
