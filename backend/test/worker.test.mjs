// End-to-end test of the bundled worker in Miniflare (Cloudflare's local runtime) with a real local D1.
// Every outbound request (news sites, Google/Apple keys, Anthropic) is answered by stand-ins below.
// Run: npm test   (bundles first, then runs this file)
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { generateKeyPairSync, createSign, createECDH, createDecipheriv, hkdfSync, createPublicKey, verify as cryptoVerify, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const here = new URL('..', import.meta.url).pathname;
const GOOGLE_ID = 'test-client.apps.googleusercontent.com';
const APPLE_ID = 'com.example.kernel.web';

// ---- a fake identity provider key pair (stands in for Google's / Apple's signing keys) ----
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'RS256', use: 'sig' };
const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function makeToken(payload, { kid = 'test-kid', key = privateKey } = {}) {
  const head = b64u({ alg: 'RS256', kid, typ: 'JWT' });
  const body = b64u(payload);
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key).toString('base64url');
  return `${head}.${body}.${sig}`;
}
const now = () => Math.floor(Date.now() / 1000);

// ---- stand-in internet ----
const calls = { anthropic: [], pages: 0 };
const hnHits = (n) => ({ hits: Array.from({ length: n }, (_, i) => ({
  objectID: String(9000 + i), title: ['OpenAI ships a new model for coding', 'Rust 2.0 released', 'SpaceX Starship reaches orbit', 'New Linux kernel scheduler'][i % 4] + ` #${i}`,
  url: `https://example-news.com/story-${i}`, points: 100 + i, num_comments: 10 + i, created_at_i: now() - i * 600, author: 'tester',
})) });
const RSS = `<?xml version="1.0"?><rss><channel><title>The Verge</title>
  <item><title><![CDATA[Apple's new iPhone &amp; the battery test]]></title><link>https://www.theverge.com/iphone-battery</link>
  <pubDate>${new Date(Date.now() - 3600e3).toUTCString()}</pubDate><description>&lt;p&gt;We tested it.&lt;/p&gt;</description>
  <media:thumbnail url="https://cdn.example.com/iphone.jpg"/></item></channel></rss>`;
const ATOM = `<feed><entry><title>Wired: robots learn to dance</title><link rel="alternate" href="https://www.wired.com/robots-dance"/>
  <updated>${new Date().toISOString()}</updated><summary>Dancing robots.</summary></entry></feed>`;

const pushes = [];
async function outbound(request) {
  const url = new URL(request.url);
  if (url.hostname === 'fcm.googleapis.com') { // a browser push service
    pushes.push({ endpoint: request.url, headers: Object.fromEntries(request.headers), body: Buffer.from(await request.arrayBuffer()) });
    return new Response('', { status: url.pathname.endsWith('/gone') ? 410 : 201 });
  }
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
  if (url.hostname === 'hn.algolia.com' && /points>=15/.test(url.searchParams.get('numericFilters') || '') && url.searchParams.get('query')) { // 🕰️ a story's timeline
    calls.timeline = url.searchParams.get('query');
    const ago = (d) => now() - d * 86400;
    return J({ hits: [
      { objectID: '7001', title: 'Rust 1.80 brings faster builds', url: 'https://example-news.com/r180', points: 300, created_at_i: ago(40) },
      { objectID: '7002', title: 'Rust 1.79 is out', url: 'https://example-news.com/r179', points: 200, created_at_i: ago(75) },
      { objectID: '7004', title: 'The Rust Foundation turns 5', url: null, points: 90, created_at_i: ago(400) },
      { objectID: '7005', title: 'Rust 2.0 released #1', url: 'https://example-news.com/story-1', points: 90, created_at_i: ago(1) },
    ] });
  }
  if (url.hostname === 'hn.algolia.com') return J(hnHits(url.pathname.includes('by_date') ? 6 : 8));
  if (url.hostname === 'dev.to') return J([{ id: 1, title: 'CSS tricks that feel illegal', url: 'https://dev.to/a/css', published_at: new Date().toISOString(), public_reactions_count: 50, comments_count: 4, cover_image: 'https://dev.to/cover.png', description: 'container queries', tag_list: ['css'] }]);
  if (url.hostname === 'www.theverge.com' && url.pathname.includes('rss')) return new Response(RSS, { headers: { 'content-type': 'application/rss+xml' } });
  if (url.hostname === 'www.wired.com' && url.pathname.includes('feed')) return new Response(ATOM, { headers: { 'content-type': 'application/atom+xml' } });
  if (['techcrunch.com', 'feeds.arstechnica.com', 'www.engadget.com'].includes(url.hostname)) return new Response('down', { status: 503 });
  if (url.hostname === 'example-news.com') { // article pages: provide og:image
    calls.pages++;
    return new Response(`<html><head><meta property="og:image" content="/img/${url.pathname.slice(1)}.png"><meta name="description" content="A story about &lt;b&gt;example&lt;/b&gt; things."><title>x</title></head><body>…</body></html>`, { headers: { 'content-type': 'text/html' } });
  }
  if (url.hostname === 'www.googleapis.com' || url.hostname === 'appleid.apple.com') return J({ keys: [jwk] });
  if (url.hostname === 'api.anthropic.com') {
    const body = await request.json();
    calls.anthropic.push({ body, headers: Object.fromEntries(request.headers) });
    return J({ id: 'msg_test', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: 'Big Rust news! Rust 2.0 just landed [2], and there is more Rust buzz in [6]. 🦀🍿' }],
      usage: { input_tokens: 1000, output_tokens: 40 } });
  }
  return new Response('blocked in test', { status: 599 });
}

// ---- boot the worker ----
const mf = new Miniflare(convertV4MiniflareOptions({
  workers: [{
    name: 'kernel-api',
    modulesRoot: `${here}.build`,
    modules: [
      { type: 'ESModule', path: `${here}.build/index.js` },
      ...readdirSync(`${here}.build`).filter((f) => f.endsWith('.sql')).map((f) => ({ type: 'Text', path: `${here}.build/${f}` })),
    ],
    compatibilityDate: '2026-11-01',
    ...(process.env.STORAGE === 'do'
      ? { durableObjects: { KERNEL_DB: { className: 'KernelDB', useSQLite: true } } }
      : { d1Databases: { DB: 'test-db' } }),
    bindings: { ALLOWED_ORIGINS: 'https://moaaz0911911.github.io', ANTHROPIC_API_KEY: 'sk-ant-test', CODME_PER_IP_HOUR: '3', SIGNUPS_PER_IP_HOUR: '3', ADMINS: 'Azzy', LIVE_TEST_PERIOD_MS: '60000', LIVE_TEST_STEP_MS: '2000' },
    outboundService: outbound,
  }],
}));
let db;
if (process.env.STORAGE === 'do') { // talk to the Durable Object the same way the worker does
  const ns = await mf.getDurableObjectNamespace('KERNEL_DB');
  const stub = ns.get(ns.idFromName('main'));
  const stmt = (sql, params = []) => ({ bind: (...p) => stmt(sql, p), first: async () => (await stub.query([{ sql, params, mode: 'first' }]))[0], run: async () => (await stub.query([{ sql, params, mode: 'run' }]))[0] });
  db = { prepare: (sql) => stmt(sql) };
  console.log('storage: Durable Object (SQLite)');
} else {
  db = await mf.getD1Database('DB');
  for (const stmt of readFileSync(`${here}schema.sql`, 'utf8').split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(stmt).run();
  console.log('storage: D1');
}

const ORIGIN = 'https://moaaz0911911.github.io';
const api = async (path, { method = 'GET', body, token, origin = ORIGIN, ip = '1.2.3.4' } = {}) => {
  const res = await mf.dispatchFetch(`http://kernel.test${path}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { Origin: origin, 'CF-Connecting-IP': ip, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return { status: res.status, cors: res.headers.get('access-control-allow-origin'), data: await res.json().catch(() => null) };
};
const ok = (label, cond, extra = '') => { assert.ok(cond, label); console.log(`  ✅ ${label}${extra ? ` — ${extra}` : ''}`); };

try {
  console.log('news');
  let r = await api('/api/news');
  ok('first /api/news fills the database', r.status === 200 && r.data.items.length === 11, `${r.data.items.length} stories`);
  ok('CORS allows the GitHub Pages site', r.cors === ORIGIN);
  ok('RSS parsed (CDATA + entities)', r.data.items.some((s) => s.title === "Apple's new iPhone & the battery test" && s.image === 'https://cdn.example.com/iphone.jpg'));
  ok('Atom parsed', r.data.items.some((s) => s.title.startsWith('Wired: robots')));
  ok('stories categorised like the website', r.data.items.find((s) => s.title.startsWith('Rust 2.0')).cat === 'dev' && r.data.items.find((s) => s.title.startsWith('SpaceX')).cat === 'space');
  ok('broken sources reported as napping', r.data.sources.filter((s) => !s.ok).length === 3, r.data.sources.map((s) => `${s.emoji}${s.ok ? 'ok' : 'down'}`).join(' '));
  await mf.dispatchFetch('http://kernel.test/__scheduled'); // not routed; run the cron handler directly instead:
  const worker = await mf.getWorker();
  await worker.scheduled({ cron: '*/5 * * * *' });
  r = await api('/api/news');
  const withThumb = r.data.items.filter((s) => s.image && s.image.includes('example-news.com/img/'));
  ok('cron found real og:image thumbnails', withThumb.length > 0, `${withThumb.length} thumbnails, e.g. ${withThumb[0]?.image}`);
  ok('…and the publisher’s description for the reader', r.data.items.some((s) => s.summary === 'A story about example things.'));
  ok('other websites get no CORS', (await api('/api/news', { origin: 'https://evil.example' })).cors === null);

  console.log('accounts');
  r = await api('/api/auth/available?username=Azzy');
  ok('username check: free name', r.data.available === true);
  r = await api('/api/auth/register', { method: 'POST', body: { username: 'ab', password: 'popcorn-rocks-42' }, ip: '1.1.1.1' });
  ok('rejects too-short username', r.status === 400, r.data.error);
  r = await api('/api/auth/register', { method: 'POST', body: { username: 'codme', password: 'popcorn-rocks-42' }, ip: '1.1.1.2' });
  ok('rejects reserved username', r.status === 400, r.data.error);
  r = await api('/api/auth/register', { method: 'POST', body: { username: 'Azzy', password: 'password' }, ip: '1.1.1.3' });
  ok('rejects weak/common password', r.status === 400, r.data.error);
  r = await api('/api/auth/register', { method: 'POST', body: { username: 'Azzy', password: 'my-azzy-pass-1' }, ip: '1.1.1.4' });
  ok('rejects password containing the username', r.status === 400, r.data.error);
  let t0 = Date.now();
  r = await api('/api/auth/register', { method: 'POST', body: { username: 'Azzy', password: 'Popcorn-Rocks-42!' }, ip: '5.5.5.5' });
  ok('sign-up works', r.status === 200 && r.data.isNew && /^[a-f0-9]{64}$/.test(r.data.token), `recovery code ${r.data.recoveryCode} · ${Date.now() - t0} ms`);
  let token = r.data.token;
  const recoveryCode = r.data.recoveryCode;
  ok('recovery code is 20 unambiguous characters', /^([2-9A-HJ-NP-Z]{5}-){3}[2-9A-HJ-NP-Z]{5}$/.test(recoveryCode));
  const row = await db.prepare("SELECT pass_hash, recovery_hash FROM users WHERE username_lc = 'azzy'").first();
  ok('password stored only as a salted PBKDF2 hash', row.pass_hash.startsWith('pbkdf2-sha256$20000$') && !row.pass_hash.includes('Popcorn'));
  ok('recovery code stored only as a hash', row.recovery_hash.length === 64 && !row.recovery_hash.includes(recoveryCode));
  ok('username check: taken (any capitalisation)', (await api('/api/auth/available?username=aZZy')).data.available === false);
  r = await api('/api/auth/register', { method: 'POST', body: { username: 'AZZY', password: 'Another-Pass-77' }, ip: '5.5.5.6' });
  ok('duplicate username refused', r.status === 409, r.data.error);
  r = await api('/api/auth/register', { method: 'POST', body: { username: 'Keiiii', password: 'Kei-Loves-Tech-9', leaderboard: true }, ip: '6.6.6.6' });
  const keiToken = r.data.token;
  ok('second user signs up', r.status === 200);

  r = await api('/api/auth/login', { method: 'POST', body: { username: 'azzy', password: 'wrong-password' } });
  ok('wrong password refused', r.status === 401, r.data.error);
  r = await api('/api/auth/login', { method: 'POST', body: { username: 'nobody_here', password: 'whatever-123' } });
  ok('unknown user gives the same message', r.status === 401 && r.data.error === 'Wrong username or password');
  t0 = Date.now();
  r = await api('/api/auth/login', { method: 'POST', body: { username: 'AZZY', password: 'Popcorn-Rocks-42!' } });
  ok('login works (username not case-sensitive)', r.status === 200 && !r.data.isNew && r.data.user.username === 'Azzy', `${Date.now() - t0} ms`);
  const token2 = r.data.token; // "second device"
  for (let i = 0; i < 10; i++) await api('/api/auth/login', { method: 'POST', body: { username: 'keiiii', password: 'guess-' + i }, ip: `7.7.7.${i}` });
  r = await api('/api/auth/login', { method: 'POST', body: { username: 'keiiii', password: 'Kei-Loves-Tech-9' }, ip: '7.7.8.1' });
  ok('password guessing is rate-limited per username', r.status === 429, r.data.error);

  console.log('account sync');
  r = await api('/api/me', { token });
  ok('/api/me returns the account', r.status === 200 && r.data.user.username === 'Azzy');
  ok('/api/me without a token is refused', (await api('/api/me')).status === 401);
  r = await api('/api/me/profile', { method: 'PUT', token, body: { nickname: '<b>Popcorn</b>Pilot', avatar: '🦖', topics: ['ai', 'space', 'nonsense'], leaderboard: true } });
  ok('profile saved and cleaned', r.data.profile.nickname === 'bPopcorn/bPilot' && r.data.profile.avatar === '🦖' && r.data.profile.topics.join() === 'ai,space');
  const story = (await api('/api/news')).data.items[0];
  await api('/api/me/data', { method: 'PUT', token, body: { xp: 42, read: [story.key], saved: [story], reactions: { [story.key]: 'fire', x: 'bogus' }, badges: { first_pop: 1 }, settings: { theme: 'light', sound: true } } });
  await api('/api/me/data', { method: 'PATCH', token: token2, body: { kids: { stars: { binary: 3, robot: 1, nope: 3 }, robotLevel: 1, name: 'Azzy' } } });
  await api('/api/me/data', { method: 'PATCH', token, body: { kids: { stars: { binary: 1, robot: 2 } }, badges: { bookworm: 2 } } });
  r = await api('/api/me', { token: token2 });
  const d = r.data.user.data;
  ok('XP, saved, read, settings sync across devices', d.xp === 42 && d.saved[0].key === story.key && d.read.length === 1 && d.settings.theme === 'light' && !d.reactions.x);
  ok('kids stars merge (never go down) across devices', d.kids.stars.binary === 3 && d.kids.stars.robot === 2 && !('nope' in d.kids.stars) && d.kids.robotLevel === 1);
  ok('achievements only get added', d.badges.first_pop && d.badges.bookworm);
  await api('/api/me/data', { method: 'PATCH', token, body: { xp: 999999 } });
  ok('XP jumps are capped (+500 per save)', (await api('/api/me', { token })).data.user.data.xp === 542);

  console.log('streaks & leaderboard');
  r = await api('/api/me/checkin', { method: 'POST', token });
  ok('first check-in starts a streak', r.data.streak === 1 && r.data.bonusXp === 5);
  r = await api('/api/me/checkin', { method: 'POST', token });
  ok('same-day check-in gives nothing extra', r.data.already && r.data.bonusXp === 0);
  await db.prepare("UPDATE users SET last_day = ?, streak = 4 WHERE username_lc = 'azzy'").bind(new Date(Date.now() - 864e5).toISOString().slice(0, 10)).run();
  r = await api('/api/me/checkin', { method: 'POST', token });
  ok('next-day check-in grows the streak', r.data.streak === 5 && r.data.bonusXp === 25 && r.data.bestStreak === 5);
  await api('/api/me/data', { method: 'PATCH', token: keiToken, body: { xp: 120 } });
  r = await api('/api/leaderboard', { token: keiToken });
  ok('leaderboard ranks by XP', r.data.top.map((x) => `${x.place}.${x.username}:${x.xp}`).join(' ') === '1.Azzy:542 2.Keiiii:120' && r.data.me.place === 2, r.data.top.map((x) => `${x.avatar}${x.nickname} ${x.rankEmoji}`).join(', '));
  await api('/api/me/profile', { method: 'PUT', token: keiToken, body: { leaderboard: false } });
  r = await api('/api/leaderboard');
  ok('opting out hides you from the leaderboard', r.data.top.length === 1 && r.data.top[0].username === 'Azzy');

  console.log('passwords');
  r = await api('/api/me/password', { method: 'POST', token, body: { currentPassword: 'nope-nope-1', newPassword: 'Brand-New-Pass-5' } });
  ok('change password needs the current one', r.status === 401);
  r = await api('/api/me/password', { method: 'POST', token, body: { currentPassword: 'Popcorn-Rocks-42!', newPassword: 'Brand-New-Pass-5' } });
  ok('change password works', r.status === 200);
  ok('…this device stays signed in', (await api('/api/me', { token })).status === 200);
  ok('…other devices are signed out', (await api('/api/me', { token: token2 })).status === 401);
  ok('old password no longer works', (await api('/api/auth/login', { method: 'POST', body: { username: 'azzy', password: 'Popcorn-Rocks-42!' }, ip: '8.8.8.1' })).status === 401);
  r = await api('/api/auth/recover', { method: 'POST', body: { username: 'azzy', recoveryCode: 'AAAAA-BBBBB-CCCCC-DDDDD', newPassword: 'Forgot-It-Again-3' }, ip: '8.8.8.2' });
  ok('wrong recovery code refused', r.status === 401, r.data.error);
  r = await api('/api/auth/recover', { method: 'POST', body: { username: 'AZZY', recoveryCode: recoveryCode.toLowerCase().replace(/-/g, ' '), newPassword: 'Forgot-It-Again-3' }, ip: '8.8.8.3' });
  ok('forgot password: recovery code resets it', r.status === 200 && r.data.recoveryCode && r.data.recoveryCode !== recoveryCode);
  ok('…and signs out every old session', (await api('/api/me', { token })).status === 401);
  token = r.data.token;
  r = await api('/api/auth/recover', { method: 'POST', body: { username: 'azzy', recoveryCode, newPassword: 'Sneaky-Reuse-44' }, ip: '8.8.8.4' });
  ok('a used recovery code cannot be reused', r.status === 401);
  ok('new password logs in', (await api('/api/auth/login', { method: 'POST', body: { username: 'azzy', password: 'Forgot-It-Again-3' }, ip: '8.8.8.5' })).status === 200);
  ok('progress survived the password reset', (await api('/api/me', { token })).data.user.data.xp === 542);
  r = await api('/api/auth/register', { method: 'POST', body: { username: 'Spammer1', password: 'Spam-Spam-Spam-1' }, ip: '5.5.5.5' });
  await api('/api/auth/register', { method: 'POST', body: { username: 'Spammer2', password: 'Spam-Spam-Spam-1' }, ip: '5.5.5.5' });
  r = await api('/api/auth/register', { method: 'POST', body: { username: 'Spammer3', password: 'Spam-Spam-Spam-1' }, ip: '5.5.5.5' });
  ok('sign-ups are rate-limited per visitor', r.status === 429, r.data.error);

  console.log('shared reactions');
  ok('guests cannot add shared reactions', (await api('/api/react', { method: 'POST', body: { key: story.key, emoji: 'fire' } })).status === 401);
  await api('/api/react', { method: 'POST', token, body: { key: story.key, emoji: 'fire' } });
  r = await api('/api/react', { method: 'POST', token: keiToken, body: { key: story.key, emoji: 'fire' } });
  ok('two people react → shared count', r.data.reactions.fire === 2);
  r = await api('/api/react', { method: 'POST', token, body: { key: story.key, emoji: 'lol' } });
  ok('changing your reaction moves your vote', r.data.reactions.fire === 1 && r.data.reactions.lol === 1);
  ok('counts appear in the news feed', (await api('/api/news')).data.items.find((s) => s.key === story.key).reactions.lol === 1);

  console.log('codme AI');
  r = await api('/api/codme', { method: 'POST', token, body: { messages: [{ role: 'user', content: 'any rust news?' }] } });
  const call = calls.anthropic[0];
  ok('calls Claude with the right model/settings', call.body.model === 'claude-opus-5-5' && call.body.output_config.effort === 'low' && call.body.fallbacks === 'default' && call.headers['anthropic-beta'].includes('server-side-fallback-2026-07-01'));
  ok('API key sent only to Anthropic', call.headers.authorization === 'Bearer sk-ant-test');
  ok('relevant stories put first in the prompt', /\[1\] Rust 2\.0 released/.test(call.body.messages[0].content), 'retrieval works');
  ok('reply returned with cited story cards', r.status === 200 && r.data.stories.length === 2 && r.data.stories[0].title.startsWith('Rust 2.0'), r.data.reply);
  await api('/api/codme', { method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }] }, ip: '9.9.9.9' });
  await api('/api/codme', { method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }] }, ip: '9.9.9.9' });
  await api('/api/codme', { method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }] }, ip: '9.9.9.9' });
  r = await api('/api/codme', { method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }] }, ip: '9.9.9.9' });
  ok('rate limit protects your bill', r.status === 429, r.data.error);

  console.log('community: chat');
  r = await api('/api/chat?room=lobby');
  ok('anyone can read the chat', r.status === 200 && Array.isArray(r.data.messages) && r.data.rooms.length === 5);
  ok('guests cannot post', (await api('/api/chat', { method: 'POST', body: { room: 'lobby', text: 'hi' } })).status === 401);
  r = await api('/api/chat', { method: 'POST', token, body: { room: 'lobby', text: 'Hello kernels! 🍿 this sh1t is great' } });
  ok('signed-in users can post (swear filter on)', r.status === 200 && r.data.message.text === 'Hello kernels! 🍿 this 🍿🍿 is great', r.data.message.text);
  ok('message carries name tag + rank', r.data.message.user.username === 'Azzy' && r.data.message.user.avatar === '🦖');
  const firstId = r.data.message.id;
  r = await api('/api/chat', { method: 'POST', token, body: { room: 'lobby', text: 'cocktail scunthorpe Dickens' } });
  ok('innocent words are left alone', r.data.message.text === 'cocktail scunthorpe Dickens');
  r = await api('/api/chat', { method: 'POST', token, body: { room: 'dev', text: 'look at this', storyKey: story.key } });
  ok('share a kerNEl story into chat', r.data.message.stories[0]?.title === story.title);
  r = await api('/api/chat', { method: 'POST', token, body: { room: 'dev', text: '', storyKey: 'evil.example/phish' } });
  ok('unknown links cannot be shared', r.status === 400);
  for (let i = 0; i < 4; i++) r = await api('/api/chat', { method: 'POST', token, body: { room: 'offtopic', text: `spam ${i}` } });
  ok('chat flooding is rate-limited', r.status === 429, r.data.error);
  r = await api('/api/chat', { method: 'POST', token: keiToken, body: { room: 'dev', text: '@codme rust' } });
  r = await api('/api/chat?room=dev', { token: keiToken });
  const botMsg = r.data.messages.find((m) => m.user.bot);
  ok('@codme answers in the room', !!botMsg && botMsg.stories.length > 0 && /rust/i.test(botMsg.stories[0].title), botMsg?.text);
  ok('online count includes you', r.data.rooms.find((x) => x.id === 'dev').online >= 1);
  const since = r.data.now;
  r = await api('/api/chat/react', { method: 'POST', token: keiToken, body: { id: firstId, emoji: '🔥' } });
  ok('react to a message', r.data.reactions['🔥'] === 1);
  r = await api(`/api/chat?room=lobby&since=${since - 1}`, { token });
  ok('polling returns only what changed', r.data.messages.length === 1 && r.data.messages[0].id === firstId && r.data.messages[0].reactions['🔥'] === 1);
  ok('you can’t delete someone else’s message', (await api(`/api/chat/${firstId}`, { method: 'DELETE', token: keiToken })).status === 403);
  ok('delete your own message', (await api(`/api/chat/${firstId}`, { method: 'DELETE', token })).status === 200);
  r = await api('/api/chat?room=lobby');
  ok('deleted message disappears', !r.data.messages.some((m) => m.id === firstId));

  console.log('community: reports & mutes');
  // three reporters hide a message; three hidden messages in a day mute the author
  const reporters = [];
  for (const [i, n] of ['Rep_one', 'Rep_two', 'Rep_three'].entries()) {
    const rr = await api('/api/auth/register', { method: 'POST', body: { username: n, password: `Report-Pass-${i}9!` }, ip: `9.1.1.${i}` });
    reporters.push(rr.data.token);
  }
  ok('can’t report yourself', (await api('/api/chat/report', { method: 'POST', token: keiToken, body: { id: botMsg.id + 0 } })).status !== 500);
  for (let k = 0; k < 3; k++) {
    const m = await api('/api/chat', { method: 'POST', token: keiToken, body: { room: 'gaming', text: `rude message ${k}` }, ip: `9.2.2.${k}` });
    await new Promise((res) => setTimeout(res, 50));
    for (const t of reporters) await api('/api/chat/report', { method: 'POST', token: t, body: { id: m.data.message.id } });
  }
  r = await api('/api/chat?room=gaming');
  ok('3 reports hide a message', !r.data.messages.some((m) => /rude/.test(m.text)));
  r = await api('/api/chat', { method: 'POST', token: keiToken, body: { room: 'gaming', text: 'am I muted?' } });
  ok('3 hidden messages in a day = 24h mute', r.status === 403, r.data.error);

  console.log('community: poll & profiles');
  r = await api('/api/poll');
  ok('daily poll has a question', r.status === 200 && r.data.question && r.data.options.length >= 3, r.data.question);
  ok('guests cannot vote', (await api('/api/poll', { method: 'POST', body: { option: 0 } })).status === 401);
  r = await api('/api/poll', { method: 'POST', token, body: { option: 1 } });
  ok('vote counts', r.data.counts[1] === 1 && r.data.mine === 1 && r.data.firstVote);
  r = await api('/api/poll', { method: 'POST', token, body: { option: 0 } });
  ok('one vote per person per day', r.data.counts[0] === 0 && r.data.mine === 1 && !r.data.firstVote);
  r = await api('/api/users/azzy');
  ok('public profile card', r.status === 200 && r.data.username === 'Azzy' && r.data.avatar === '🦖' && r.data.xp === 542 && r.data.messages >= 2, JSON.stringify({ rank: r.data.rank, place: r.data.place, badges: r.data.badges.length }));
  ok('profiles never expose private data', !('data' in r.data) && !('pass_hash' in r.data) && !('saved' in r.data));
  ok('unknown profile → 404', (await api('/api/users/nobody_xyz')).status === 404);

  console.log('notifications (Web Push)');
  // play the browser: a P-256 key pair + auth secret, exactly what PushManager.subscribe() makes
  const ua = createECDH('prime256v1'); ua.generateKeys();
  const uaPub = ua.getPublicKey();
  const authSecret = randomBytes(16);
  const decrypt = (body) => { // RFC 8291, as the browser does it
    const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
    const ikm = Buffer.from(hkdfSync('sha256', ua.computeSecret(asPub), authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32));
    const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const d = createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
    const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
    return JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString());
  };
  const vapidKey = (await api('/api/push/key')).data.publicKey;
  const vapidOk = (hdr) => { // RFC 8292: verify the server's signed JWT with its public key
    const [, jwt, k] = hdr.match(/^vapid t=([^,]+), k=(.+)$/);
    const [h, b, sig] = jwt.split('.');
    const raw = Buffer.from(k, 'base64url');
    const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') } });
    const claims = JSON.parse(Buffer.from(b, 'base64url'));
    return k === vapidKey && claims.aud === 'https://fcm.googleapis.com' && claims.exp > Date.now() / 1000 && cryptoVerify('sha256', Buffer.from(`${h}.${b}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
  };
  ok('server has a VAPID public key', Buffer.from(vapidKey, 'base64url').length === 65);
  const sub = (endpoint) => ({ endpoint, keys: { p256dh: uaPub.toString('base64url'), auth: authSecret.toString('base64url') } });
  ok('random URLs can’t be used as push endpoints', (await api('/api/push/subscribe', { method: 'POST', token, body: { subscription: sub('https://evil.example/x') } })).status === 400);
  r = await api('/api/push/subscribe', { method: 'POST', token, body: { subscription: sub('https://fcm.googleapis.com/fcm/send/azzy-phone'), tz: 180 } });
  ok('subscribe a device', r.status === 200);
  r = await api('/api/push/test', { method: 'POST', token });
  let p = pushes.at(-1);
  ok('test push sent', r.data.sent === 1 && p.endpoint.endsWith('azzy-phone') && p.headers['content-encoding'] === 'aes128gcm' && p.headers.ttl);
  ok('push decrypts like a real browser would', decrypt(p.body).title === '🍿 Notifications are on!', JSON.stringify(decrypt(p.body)).slice(0, 80));
  ok('VAPID signature verifies', vapidOk(p.headers.authorization));
  const repTok = reporters[0];
  await api('/api/chat', { method: 'POST', token: repTok, body: { room: 'ai', text: 'hey @Azzy did you see the new model?' }, ip: '9.3.3.1' });
  await new Promise((res) => setTimeout(res, 400));
  p = pushes.at(-1);
  const pm = decrypt(p.body);
  ok('@mention → push', pm.title === '💬 @Rep_one mentioned you in #ai' && pm.url === './#chat=ai', pm.body);
  r = await api('/api/notifications', { token });
  ok('…and it’s in the 🔔 inbox', r.data.unread === 2 && r.data.items[0].title.includes('mentioned you'));
  await api('/api/notify/prefs', { method: 'PUT', token, body: { prefs: { mentions: false } } });
  const before = pushes.length;
  await api('/api/chat', { method: 'POST', token: repTok, body: { room: 'ai', text: '@Azzy ping again' }, ip: '9.3.3.2' });
  await new Promise((res) => setTimeout(res, 400));
  ok('turning a kind off stops its pushes (inbox still gets it)', pushes.length === before && (await api('/api/notifications', { token })).data.unread === 3);
  await api('/api/notify/prefs', { method: 'PUT', token, body: { prefs: { mentions: true } } });
  await api('/api/push/subscribe', { method: 'POST', token, body: { subscription: sub('https://fcm.googleapis.com/fcm/send/gone') } });
  ok('two devices', (await api('/api/notify/prefs', { token })).data.devices === 2);
  await api('/api/push/test', { method: 'POST', token });
  ok('a device the browser dropped (410) is forgotten', (await api('/api/notify/prefs', { token })).data.devices === 1);
  await api('/api/notifications/read', { method: 'POST', token, body: { all: true } });
  ok('mark all read', (await api('/api/notifications', { token })).data.unread === 0);
  // big news: a hot AI story (Azzy follows AI)
  await db.prepare("INSERT INTO stories (key, title, url, source, source_id, source_emoji, time, points, comments, cat, domain, first_seen, image_checked) VALUES ('big.example/agi', 'Huge AI breakthrough announced', 'https://big.example/agi', 'Hacker News', 'hn-front', '🟧', ?, 450, 300, 'ai', 'big.example', ?, 1)").bind(Date.now(), Date.now()).run();
  const worker2 = await mf.getWorker();
  await worker2.scheduled({ cron: '2-59/5 * * * *' });
  await new Promise((res) => setTimeout(res, 300));
  p = pushes.at(-1);
  ok('big news in your topic → push', decrypt(p.body).title === '🔥 Big news in your topics' && decrypt(p.body).url === 'https://big.example/agi', decrypt(p.body).body);
  const n0 = pushes.length;
  await worker2.scheduled({ cron: '2-59/5 * * * *' });
  ok('the same story never alerts twice', pushes.length === n0);
  // streak reminder: make it 19:02 for Azzy, who hasn't popped in today
  const nowD = new Date(); const m = nowD.getUTCHours() * 60 + nowD.getUTCMinutes();
  let tz = (19 * 60 + 2 - m + 1440) % 1440; if (tz > 840) tz -= 1440;
  await api('/api/notify/prefs', { method: 'PUT', token, body: { tz } });
  await db.prepare("UPDATE users SET last_day = '2000-01-01' WHERE username_lc = 'azzy'").run();
  await worker2.scheduled({ cron: '2-59/5 * * * *' });
  await new Promise((res) => setTimeout(res, 300));
  ok('7 pm streak reminder', /Keep your \d+-day streak alive/.test(decrypt(pushes.at(-1).body).title), decrypt(pushes.at(-1).body).body);
  const n1 = pushes.length;
  await worker2.scheduled({ cron: '2-59/5 * * * *' });
  ok('…only once a day', pushes.length === n1);

  console.log('languages');
  r = await api('/api/me/profile', { method: 'PUT', token: keiToken, body: { lang: 'ar' } });
  ok('language is saved on the profile', r.data.profile.lang === 'ar');
  ok('unknown languages are ignored', (await api('/api/me/profile', { method: 'PUT', token: keiToken, body: { lang: 'xx' } })).data.profile.lang === 'ar');
  await api('/api/push/subscribe', { method: 'POST', token: keiToken, body: { subscription: sub('https://fcm.googleapis.com/fcm/send/kei-phone') } });
  const lastPush = async () => { await new Promise((res) => setTimeout(res, 350)); return decrypt(pushes.at(-1).body); };

  console.log('friends');
  r = await api('/api/follow', { method: 'POST', token: keiToken, body: { username: 'azzy' } });
  ok('follow someone', r.status === 200 && r.data.isFollowing && r.data.followers === 1);
  ok('they hear about it', (await lastPush()).title === '👋 @Keiiii started following you');
  ok('can’t follow yourself', (await api('/api/follow', { method: 'POST', token, body: { username: 'Azzy' } })).status === 400);
  ok('can’t follow nobody', (await api('/api/follow', { method: 'POST', token, body: { username: 'ghost_zz' } })).status === 404);
  await api('/api/follow', { method: 'POST', token, body: { username: 'keiiii' } });
  let pp = await lastPush();
  ok('…in Egyptian Arabic for an Arabic speaker', pp.title === '👋 @Azzy عملك فولو', pp.body);
  await db.prepare("UPDATE users SET xp = 590, data = json_set(data, '$.xp', 590) WHERE username_lc = 'azzy'").run();
  r = await api('/api/me/data', { method: 'PATCH', token, body: { xp: 620, badges: { quiz_whiz: Date.now() }, catReads: { ai: 4, nope: 3 }, counts: { quizPlayed: 2, hacks: 9 } } });
  pp = await lastPush();
  ok('rank-up → followers get a push in their language', pp.title === '🧈 @Azzy وصل لرتبة بارون الزبدة!', pp.title);
  const azzyData = JSON.parse((await db.prepare("SELECT data FROM users WHERE username_lc = 'azzy'").first()).data);
  ok('topic + counter stats are cleaned', azzyData.catReads.ai === 4 && !('nope' in azzyData.catReads) && azzyData.counts.quizPlayed === 2 && !('hacks' in azzyData.counts));
  r = await api('/api/me/friends', { token: keiToken });
  ok('friends list', r.data.following.length === 1 && r.data.following[0].username === 'Azzy' && r.data.followers === 1);
  ok('friends’ activity feed (rank-up + achievement)', r.data.activity.some((a) => a.kind === 'rank' && a.data.rank === 4) && r.data.activity.some((a) => a.kind === 'badge' && a.data.id === 'quiz_whiz'), r.data.activity.map((a) => a.kind).join(', '));
  r = await api('/api/users/azzy', { token: keiToken });
  ok('profile card shows follow state + counts', r.data.isFollowing === true && r.data.followers === 1 && r.data.following === 1 && Array.isArray(r.data.trophies));

  console.log('avatar cosmetics');
  r = await api('/api/me/profile', { method: 'PUT', token, body: { hat: 'crown', frame: 'galaxy' } });
  ok('locked hats/frames are refused (620 XP < 1000)', r.data.profile.hat === 'none' && r.data.profile.frame === 'none');
  r = await api('/api/me/profile', { method: 'PUT', token, body: { hat: 'tophat', frame: 'butter' } });
  ok('unlocked ones are saved', r.data.profile.hat === 'tophat' && r.data.profile.frame === 'butter');
  ok('champion frame needs a trophy', (await api('/api/me/profile', { method: 'PUT', token, body: { frame: 'champion' } })).data.profile.frame === 'butter');
  await api('/api/chat', { method: 'POST', token, body: { room: 'lobby', text: 'new hat who dis 🎩' }, ip: '9.4.4.1' });
  r = await api('/api/chat?room=lobby');
  const hatMsg = r.data.messages.at(-1);
  ok('chat shows the hat + frame', hatMsg.user.hat === '🎩' && hatMsg.user.frame === 'butter');
  r = await api('/api/leaderboard');
  ok('leaderboard shows looks too', r.data.top.find((u) => u.username === 'Azzy')?.hat === '🎩');

  console.log('story comments');
  const storyKey = (await api('/api/news')).data.items.find((s) => s.title.startsWith('Rust 2.0')).key;
  r = await api('/api/comments', { method: 'POST', token, body: { key: storyKey, text: 'This is huge @Keiiii, total shit-hot news' }, ip: '9.5.5.1' });
  ok('post a comment (swear filter on)', r.status === 200 && r.data.comment.text.includes('🍿') && !/shit/i.test(r.data.comment.text), r.data.comment.text);
  pp = await lastPush();
  ok('@mention in a comment → push (Arabic)', pp.title === '🗨️ @Azzy عملك منشن في كومنت' && pp.url.startsWith('./#story='));
  ok('comments need a real kerNEl story', (await api('/api/comments', { method: 'POST', token, body: { key: 'nope.example/x', text: 'hi' } })).status === 404);
  ok('guests can’t comment', (await api('/api/comments', { method: 'POST', body: { key: storyKey, text: 'hi' } })).status === 401);
  r = await api(`/api/comments?key=${encodeURIComponent(storyKey)}`);
  ok('anyone can read comments', r.data.items.length === 1 && r.data.items[0].user.hat === '🎩' && r.data.items[0].mine === false);
  ok('news shows comment counts', (await api('/api/news')).data.items.find((s) => s.key === storyKey).commentCount === 1);
  const cid = r.data.items[0].id;
  r = await api('/api/comments/react', { method: 'POST', token: reporters[0], body: { id: cid, emoji: '🔥' } });
  ok('react to a comment', r.status === 200 && r.data.reactions['🔥'] === 1 && r.data.myReaction === '🔥');
  await api('/api/comments/react', { method: 'POST', token: reporters[1], body: { id: cid, emoji: '❤️' } });
  r = await api(`/api/comments?key=${encodeURIComponent(storyKey)}`, { token: reporters[0] });
  ok('comment reactions show up for everyone (and yours is marked)', r.data.items[0].reactions['🔥'] === 1 && r.data.items[0].reactions['❤️'] === 1 && r.data.items[0].myReaction === '🔥');
  ok('only real reactions', (await api('/api/comments/react', { method: 'POST', token: reporters[0], body: { id: cid, emoji: '💩' } })).status === 400);
  r = await api('/api/comments/react', { method: 'POST', token: reporters[0], body: { id: cid, emoji: null } });
  ok('take a reaction back', r.data.reactions['🔥'] === undefined && r.data.myReaction === null);
  ok('only the author can delete', (await api(`/api/comments/${cid}`, { method: 'DELETE', token: keiToken })).status === 403);
  ok('muted people can’t comment', (await api('/api/comments', { method: 'POST', token: keiToken, body: { key: storyKey, text: 'hello' }, ip: '9.5.5.3' })).status === 403);
  const c2 = (await api('/api/comments', { method: 'POST', token, body: { key: storyKey, text: 'spam spam spam' }, ip: '9.5.5.2' })).data.comment.id;
  for (const t of reporters.slice(0, 3)) await api('/api/comments/report', { method: 'POST', token: t, body: { id: c2 } });
  ok('3 reports hide a comment', (await api(`/api/comments?key=${encodeURIComponent(storyKey)}`)).data.items.length === 1);
  ok('delete your own comment', (await api(`/api/comments/${cid}`, { method: 'DELETE', token })).status === 200 && (await api(`/api/comments?key=${encodeURIComponent(storyKey)}`)).data.items.length === 0);

  console.log('Daily Kernel Quiz');
  r = await api('/api/quiz');
  const quiz = r.data;
  ok('today’s quiz is made from the headlines', quiz.questions.length >= 4 && quiz.questions.every((q) => q.type && q.options.length >= 2), quiz.questions.map((q) => q.type).join(', '));
  ok('answers are never sent before you play', !JSON.stringify(quiz).includes('"answer"') && !JSON.stringify(quiz).includes('"correct"'));
  ok('everyone gets the same quiz', JSON.stringify((await api('/api/quiz')).data.questions) === JSON.stringify(quiz.questions));
  await api('/api/quiz', { token });
  r = await api('/api/quiz', { method: 'POST', token, body: { answers: quiz.questions.map(() => 0) } });
  ok('answer once → score + the right answers', r.data.saved && r.data.correct.length === quiz.questions.length && r.data.score === r.data.correct.filter((c) => c === 0).length, `score ${r.data.score}/${r.data.total}`);
  const perfect = r.data.correct;
  ok('…and you’re on today’s quiz board', r.data.board.some((b) => b.username === 'Azzy'));
  r = await api('/api/quiz', { method: 'POST', token, body: { answers: perfect } });
  ok('one go per day (no re-tries)', r.data.already === true && r.data.score !== perfect.length || r.data.already === true);
  await api('/api/quiz', { token: keiToken });
  r = await api('/api/quiz', { method: 'POST', token: keiToken, body: { answers: perfect } });
  ok('a perfect score tops the board', r.data.score === perfect.length && r.data.board[0].username === 'Keiiii');
  ok('guests can play but aren’t saved', (await api('/api/quiz', { method: 'POST', body: { answers: perfect }, ip: '9.6.6.1' })).data.saved === false);

  console.log('Popcorn Battle');
  r = await api('/api/battle');
  ok('today’s battle: two different stories', r.status === 200 && r.data.a.key !== r.data.b.key && r.data.votes.a === 0, `${r.data.a.title.slice(0, 30)} vs ${r.data.b.title.slice(0, 30)}`);
  ok('voting needs an account', (await api('/api/battle', { method: 'POST', body: { pick: 'a' } })).status === 401);
  r = await api('/api/battle', { method: 'POST', token: keiToken, body: { pick: 'a' } });
  ok('vote', r.data.votes.a === 1 && r.data.mine === 'a' && r.data.firstVote);
  r = await api('/api/battle', { method: 'POST', token: keiToken, body: { pick: 'b' } });
  ok('one vote per day', r.data.votes.a === 1 && r.data.votes.b === 0 && !r.data.firstVote);
  const yday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  await db.prepare('INSERT INTO kv (k, v) VALUES (?, ?)').bind(`battle:${yday}`, JSON.stringify({ day: yday, a: { key: 'x1', title: 'Yesterday A' }, b: { key: 'x2', title: 'Yesterday B' } })).run();
  await db.prepare("INSERT INTO battle_votes (day, user_id, pick, at) VALUES (?, 'u_test1', 'b', 1), (?, 'u_test2', 'b', 1), (?, 'u_test3', 'a', 1)").bind(yday, yday, yday).run();
  r = await api('/api/battle');
  ok('yesterday’s winner is Story of the Day', r.data.champion?.story.title === 'Yesterday B' && r.data.champion.votes === 2 && r.data.champion.total === 3);

  console.log('weekly Real or Fake? tournament');
  r = await api('/api/tournament', { token });
  const tour = r.data;
  ok('8 headlines, same for everyone, no answers', tour.items.length === 8 && !JSON.stringify(tour.items).includes('real') && JSON.stringify((await api('/api/tournament')).data.items) === JSON.stringify(tour.items));
  r = await api('/api/tournament', { method: 'POST', token, body: { answers: Object.fromEntries(tour.items.map((i) => [i.id, 'real'])) } });
  ok('Azzy says "all real" → 5/8', r.data.score === 5 && r.data.reveal.filter((x) => !x.real).length === 3, `score ${r.data.score}`);
  const truth = Object.fromEntries(r.data.reveal.map((x) => [x.id, x.real ? 'real' : 'fake']));
  r = await api('/api/tournament', { method: 'POST', token: keiToken, body: { answers: truth } });
  ok('Keiiii aces it and leads', r.data.score === 8 && r.data.board[0].username === 'Keiiii');
  ok('one go per week', (await api('/api/tournament', { method: 'POST', token, body: { answers: truth } })).data.already === true);
  // fast-forward: pretend this was last week's tournament
  const mon = (t) => { const d = new Date(t); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10); };
  const lastWeek = mon(Date.parse(`${mon(Date.now())}T00:00:00Z`) - 1);
  await db.prepare('UPDATE tourney_scores SET week = ?').bind(lastWeek).run();
  await db.prepare('DELETE FROM kv WHERE k = ?').bind(`trophies:${lastWeek}`).run();
  await worker2.scheduled({ cron: '2-59/5 * * * *' });
  pp = await lastPush();
  ok('week over → trophies + a push for the winners', pp.title.startsWith('🏆') && (await api('/api/users/keiiii')).data.trophies[0]?.place === 1, pp.title);
  ok('…and last week’s podium is shown', (await api('/api/tournament')).data.lastWinners.map((w) => w.username).join(',') === 'Keiiii,Azzy');
  ok('a trophy unlocks the Champion frame', (await api('/api/me/profile', { method: 'PUT', token: keiToken, body: { frame: 'champion', hat: 'trophy' } })).data.profile.frame === 'champion');

  console.log('Explain like I’m 10 / TL;DR');
  const before2 = calls.anthropic.length;
  r = await api('/api/explain', { method: 'POST', body: { key: storyKey, mode: 'eli10', lang: 'ar' }, ip: '9.7.7.1' });
  ok('explain a story with Claude', r.status === 200 && r.data.ai && r.data.text.length > 10 && calls.anthropic.length === before2 + 1);
  const xb = calls.anthropic.at(-1).body;
  ok('…in the reader’s language, from the headline only', xb.messages[0].content.includes('Egyptian Arabic') && xb.messages[0].content.includes('Rust 2.0') && xb.model === 'claude-opus-5-5');
  r = await api('/api/explain', { method: 'POST', body: { key: storyKey, mode: 'eli10', lang: 'ar' }, ip: '9.7.7.2' });
  ok('explanations are cached (no second AI call)', r.data.cached && calls.anthropic.length === before2 + 1);
  r = await api('/api/explain', { method: 'POST', body: { key: storyKey, mode: 'tldr', lang: 'de' }, ip: '9.7.7.3' });
  ok('TL;DR mode', r.status === 200 && calls.anthropic.at(-1).body.messages[0].content.includes('TL;DR'));
  ok('unknown story → 404', (await api('/api/explain', { method: 'POST', body: { key: 'nope.example/z' }, ip: '9.7.7.4' })).status === 404);

  console.log('kid news + time machine');
  const nowMs = Date.now();
  await db.prepare("INSERT INTO stories (key, title, url, source, source_id, source_emoji, time, points, comments, cat, domain, first_seen, image_checked) VALUES ('k.example/moon', 'New rocket launches tiny robot rover to the Moon', 'https://k.example/moon', 'Wired', 'rss-wired', '⬜', ?, 200, 10, 'space', 'k.example', ?, 1), ('k.example/hack', 'Hackers breach space agency in huge attack', 'https://k.example/hack', 'Wired', 'rss-wired', '⬜', ?, 900, 10, 'space', 'k.example', ?, 1)").bind(nowMs, nowMs, nowMs, nowMs).run();
  r = await api('/api/kids/news');
  ok('kid news picks upbeat stories', r.data.items.length >= 1 && r.data.items.length <= 3 && r.data.items.some((s) => s.key === 'k.example/moon'), r.data.items.map((s) => s.title.slice(0, 30)).join(' | '));
  ok('…and skips scary ones', !r.data.items.some((s) => /hack|breach|attack/i.test(s.title)));
  r = await api('/api/timemachine?date=11-20');
  ok('time machine: top story on this day, every year', r.status === 200 && r.data.years.length >= 15 && r.data.years[0].year === new Date().getUTCFullYear() - 1 && r.data.years[0].title, `${r.data.years.length} years, ${r.data.years.at(-1).year}: ${r.data.years.at(-1).title}`);
  ok('bad dates are refused', (await api('/api/timemachine?date=13-45')).status === 400);

  console.log('people: search, messages, photos, blocks');
  r = await api('/api/auth/register', { method: 'POST', body: { username: 'Nour', password: 'Space-Fox-2026!' }, ip: '7.7.7.7' });
  const nourToken = r.data.token;
  r = await api('/api/me/profile', { method: 'PUT', token: nourToken, body: { nickname: 'Nour', avatar: '🦊', bio: 'I love   space and\nshit rockets 🚀', dms: 'everyone' } });
  ok('bio saved on one line, swear-filtered', r.data.profile.bio.startsWith('I love space and') && !/shit/.test(r.data.profile.bio) && r.data.profile.dms === 'everyone', r.data.profile.bio);
  r = await api('/api/users/search?q=no', { token });
  ok('search finds people by name', r.data.people.some((p) => p.username === 'Nour' && p.bio && p.avatar === '🦊'));
  ok('…with an @ too', (await api('/api/users/search?q=%40nou', { token })).data.people.some((p) => p.username === 'Nour'));
  ok('…and finds nothing for nonsense', (await api('/api/users/search?q=zzqq', { token })).data.people.length === 0);
  ok('wildcards are treated as text', (await api('/api/users/search?q=%25', { token })).data.people.length === 0);
  r = await api('/api/users/search', { token: nourToken });
  ok('empty search suggests people', Array.isArray(r.data.people) && !r.data.people.some((p) => p.username === 'Nour'), r.data.people.map((p) => p.username).join(', '));

  r = await api('/api/dm', { method: 'POST', token, body: { to: 'Nour', text: 'hey nour! 👋' } });
  ok('first message to someone who doesn’t follow you is a request', r.status === 200 && r.data.pending === true);
  const th = r.data.thread;
  r = await api('/api/dm', { token: nourToken });
  ok('…it lands in their requests', r.data.requests === 1 && r.data.threads[0].request && r.data.threads[0].other.username === 'Azzy' && r.data.threads[0].last.text === 'hey nour! 👋');
  ok('…and their notification inbox', (await api('/api/notifications', { token: nourToken })).data.items.some((n) => n.title.includes('message request from @Azzy')));
  ok('requests don’t count as unread messages', (await api('/api/dm?count=1', { token: nourToken })).data.unread === 0);
  await api('/api/dm', { method: 'POST', token, body: { thread: th, text: 'are you into space?' } });
  await api('/api/dm', { method: 'POST', token, body: { thread: th, text: '🚀' } });
  r = await api('/api/dm', { method: 'POST', token, body: { thread: th, text: 'hello???' } });
  ok('only 3 messages until the request is accepted', r.status === 429, r.data.error);
  r = await api('/api/dm', { method: 'POST', token: nourToken, body: { thread: th, text: 'hiii azzy, yes!! 🌌' } });
  ok('replying accepts the request', r.status === 200 && r.data.pending === false);
  ok('…and starts a 🔥 streak (both messaged today)', r.data.streak === 1);
  r = await api('/api/dm', { token: nourToken });
  ok('…and moves it to the inbox', r.data.requests === 0 && r.data.threads[0].request === false);
  ok('unread count for the Chat tab', (await api('/api/dm?count=1', { token })).data.unread === 1);
  r = await api(`/api/dm/${th}`, { token });
  ok('opening the chat shows the messages in order', r.data.messages.map((x) => x.text).join(' | ') === 'hey nour! 👋 | are you into space? | 🚀 | hiii azzy, yes!! 🌌' && r.data.messages[0].mine && !r.data.messages[3].mine);
  ok('…with who you’re talking to and whether they’re around', r.data.thread.other.username === 'Nour' && r.data.thread.other.active === true);
  const lastId = r.data.messages[3].id;
  const sinceAzzy = r.data.now;
  ok('…and marks it read', (await api('/api/dm?count=1', { token })).data.unread === 0);
  r = await api(`/api/dm/${th}`, { token: nourToken });
  ok('“Seen”: Nour can see Azzy read her message', r.data.theirRead >= lastId);
  r = await api('/api/dm', { method: 'POST', token, body: { thread: th, storyKey } });
  ok('share a kerNEl story in a message', r.status === 200 && r.data.message.story?.title.startsWith('Rust 2.0'));
  const storyMsg = r.data.message.id;
  r = await api('/api/dm/react', { method: 'POST', token: nourToken, body: { id: storyMsg, emoji: '🔥' } });
  ok('react to a message', r.data.message.myReact === '🔥');
  r = await api(`/api/dm/${th}?since=${sinceAzzy}`, { token });
  ok('…the other person gets the reaction on their next poll', r.data.messages.some((x) => x.id === storyMsg && x.theirReact === '🔥'));
  ok('unknown reactions are refused', (await api('/api/dm/react', { method: 'POST', token, body: { id: storyMsg, emoji: '💩' } })).status === 400);
  ok('you can’t delete someone else’s message', (await api(`/api/dm/messages/${storyMsg}`, { method: 'DELETE', token: nourToken })).status === 403);
  ok('…but you can delete your own', (await api(`/api/dm/messages/${storyMsg}`, { method: 'DELETE', token })).status === 200 && (await api(`/api/dm/${th}`, { token })).data.messages.find((x) => x.id === storyMsg).deleted);
  const dmYday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  await db.prepare('UPDATE dm_threads SET streak = 4, streak_day = ? WHERE id = ?').bind(dmYday, th).run();
  await db.prepare("UPDATE dm_members SET sent_day = ? WHERE thread_id = ? AND user_id = (SELECT id FROM users WHERE username_lc = 'azzy')").bind(new Date().toISOString().slice(0, 10), th).run();
  r = await api('/api/dm', { method: 'POST', token: nourToken, body: { thread: th, text: 'streak!' } });
  ok('🔥 streak grows on consecutive days', r.data.streak === 5);
  ok('strangers can’t open someone else’s chat', (await api(`/api/dm/${th}`, { token: keiToken })).status === 404);
  ok('you can’t message yourself', (await api('/api/dm', { method: 'POST', token, body: { to: 'azzy', text: 'me' } })).status === 400);

  await api('/api/me/profile', { method: 'PUT', token: keiToken, body: { dms: 'nobody' } });
  ok('“Nobody” means no new conversations', (await api('/api/dm', { method: 'POST', token: nourToken, body: { to: 'Keiiii', text: 'hi' } })).status === 403);
  await api('/api/me/profile', { method: 'PUT', token: keiToken, body: { dms: 'following' } });
  ok('“People I follow”: strangers are refused…', (await api('/api/dm', { method: 'POST', token: nourToken, body: { to: 'Keiiii', text: 'hi' } })).status === 403);
  await api('/api/follow', { method: 'POST', token: keiToken, body: { username: 'Nour' } });
  r = await api('/api/dm', { method: 'POST', token: nourToken, body: { to: 'Keiiii', text: 'hi kei' } });
  ok('…people they follow go straight to the inbox', r.status === 200 && r.data.pending === false);

  r = await api('/api/users/Nour', { token });
  ok('profile card: bio, active now, can message', r.data.bio && r.data.active === true && r.data.canMessage === true && r.data.followsYou === false);
  const freshBurst = () => db.prepare("DELETE FROM rate_limits WHERE bucket LIKE 'dm:burst:%'").run(); // the 6-per-10-seconds limit
  await freshBurst();
  r = await api('/api/block', { method: 'POST', token: nourToken, body: { username: 'Azzy' } });
  ok('block someone', r.data.blocked === true);
  ok('…they can’t message you', (await api('/api/dm', { method: 'POST', token, body: { thread: th, text: 'hello?' } })).status === 403);
  ok('…or find you in search', !(await api('/api/users/search?q=nour', { token })).data.people.some((p) => p.username === 'Nour'));
  ok('…and your card says you can’t be messaged', (await api('/api/users/Nour', { token })).data.canMessage === false);
  ok('your blocked list', (await api('/api/me/blocked', { token: nourToken })).data.people.some((p) => p.username === 'Azzy'));
  await api('/api/block', { method: 'POST', token: nourToken, body: { username: 'Azzy', block: false } });
  ok('unblock', (await api('/api/dm', { method: 'POST', token, body: { thread: th, text: 'yay' } })).status === 200);
  r = await api('/api/dm/report', { method: 'POST', token: nourToken, body: { thread: th } });
  ok('reporting someone from a chat also blocks them', r.data.blocked && (await api('/api/dm', { method: 'POST', token, body: { thread: th, text: '?' } })).status === 403);
  await api('/api/block', { method: 'POST', token: nourToken, body: { username: 'Azzy', block: false } });
  await freshBurst();
  r = await api('/api/dm/hide', { method: 'POST', token: nourToken, body: { thread: th } });
  ok('“delete chat” hides it…', !(await api('/api/dm', { token: nourToken })).data.threads.some((x) => x.id === th));
  await api('/api/dm', { method: 'POST', token, body: { thread: th, text: 'back!' } });
  ok('…until a new message arrives', (await api('/api/dm', { token: nourToken })).data.threads.some((x) => x.id === th));

  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]);
  r = await api('/api/me/photo', { method: 'PUT', token: nourToken, body: { data: `data:image/jpeg;base64,${jpeg.toString('base64')}` } });
  ok('upload a profile photo', r.status === 200 && r.data.photo && r.data.profile.photo === r.data.photo);
  const photoV = r.data.photo;
  const pres = await mf.dispatchFetch('http://kernel.test/api/photo/nour', { headers: { Origin: ORIGIN } });
  const pbytes = Buffer.from(await pres.arrayBuffer());
  ok('photo is served as an image with long caching', pres.status === 200 && pres.headers.get('content-type') === 'image/jpeg' && /immutable/.test(pres.headers.get('cache-control')) && pbytes.equals(jpeg));
  ok('…that can’t run scripts', pres.headers.get('x-content-type-options') === 'nosniff' && /default-src 'none'/.test(pres.headers.get('content-security-policy')));
  ok('SVGs are refused', (await api('/api/me/photo', { method: 'PUT', token: nourToken, body: { data: `data:image/svg+xml;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}` } })).status === 400);
  ok('files pretending to be pictures are refused', (await api('/api/me/photo', { method: 'PUT', token: nourToken, body: { data: `data:image/png;base64,${Buffer.alloc(300, 65).toString('base64')}` } })).status === 400);
  ok('huge photos are refused', (await api('/api/me/photo', { method: 'PUT', token: nourToken, body: { data: `data:image/jpeg;base64,${Buffer.concat([jpeg, Buffer.alloc(310_000)]).toString('base64')}` } })).status === 413);
  ok('the photo shows wherever their avatar does', (await api('/api/users/search?q=nour', { token })).data.people[0].photo === photoV && (await api('/api/users/Nour')).data.photo === photoV);
  await api('/api/chat', { method: 'POST', token: nourToken, body: { room: 'lobby', text: 'new pfp who dis' } });
  ok('…including chat', (await api('/api/chat?room=lobby')).data.messages.at(-1).user.photo === photoV);
  r = await api('/api/auth/register', { method: 'POST', body: { username: 'Zed', password: 'Watching-Pop-42!' }, ip: '8.8.8.8' });
  const zedToken = r.data.token;
  await api('/api/photo/report', { method: 'POST', token, body: { username: 'Nour' } });
  await api('/api/photo/report', { method: 'POST', token: keiToken, body: { username: 'Nour' } });
  ok('2 photo reports: still up', (await api('/api/users/Nour')).data.photo === photoV);
  r = await api('/api/photo/report', { method: 'POST', token: zedToken, body: { username: 'Nour' } });
  ok('3 different people reporting a photo takes it down', r.data.removed && !(await api('/api/users/Nour')).data.photo && (await mf.dispatchFetch('http://kernel.test/api/photo/nour')).status === 404);
  ok('remove your own photo', (await api('/api/me/photo', { method: 'DELETE', token: nourToken })).data.photo === null);
  await api('/api/me', { method: 'DELETE', token: nourToken });
  await api('/api/me', { method: 'DELETE', token: zedToken });
  ok('deleting an account removes its conversations', (await db.prepare('SELECT (SELECT COUNT(*) FROM dm_members WHERE thread_id = ?) + (SELECT COUNT(*) FROM dm_messages WHERE thread_id = ?) AS n').bind(th, th).first()).n === 0);

  console.log('invites, rewards, moderators');
  r = await api('/api/auth/register', { method: 'POST', body: { username: 'Rania', password: 'Joins-Kernel-2026!', invite: 'Azzy' }, ip: '9.9.9.9' });
  ok('sign up with an invite link', r.status === 200 && r.data.invitedBy === 'Azzy');
  const raniaToken = r.data.token;
  r = await api('/api/me', { token: raniaToken });
  ok('…the new kernel gets bonus XP to collect', r.data.user.pendingXp === 50 && r.data.user.stats.invited === 1);
  r = await api('/api/me', { token });
  ok('…and so does the friend who invited them', r.data.user.pendingXp >= 50 && r.data.user.stats.invites === 1);
  ok('…who gets a notification', (await api('/api/notifications', { token })).data.items.some((n) => n.title.includes('@Rania joined kerNEl with your invite')));
  const pendingBefore = r.data.user.pendingXp;
  ok('collecting the XP hands it over once…', (await api('/api/me/claim', { method: 'POST', token })).data.claimed === pendingBefore);
  ok('…and never twice', (await api('/api/me/claim', { method: 'POST', token })).data.claimed === 0 && (await api('/api/me', { token })).data.user.pendingXp === 0);
  ok('your invites list', (await api('/api/me/invites', { token })).data.people.some((p) => p.username === 'Rania'));
  ok('the 🎟️ VIP hat unlocks with an invite', (await api('/api/me/profile', { method: 'PUT', token, body: { hat: 'ticket' } })).data.profile.hat === 'ticket');
  ok('…but not without one', (await api('/api/me/profile', { method: 'PUT', token: keiToken, body: { hat: 'ticket' } })).data.profile.hat !== 'ticket');
  r = await api('/api/auth/register', { method: 'POST', body: { username: 'Lonely', password: 'Nobody-Asked-77!', invite: 'nobody_real' }, ip: '9.9.9.8' });
  ok('unknown inviters are ignored', r.status === 200 && r.data.invitedBy === null);
  const lonelyToken = r.data.token;

  ok('moderators are told so', (await api('/api/me', { token })).data.user.admin === true && (await api('/api/me', { token: keiToken })).data.user.admin === false);
  ok('the moderator tools are for moderators only', (await api('/api/mod/overview', { token: keiToken })).status === 403 && (await api('/api/mod/overview')).status === 401);
  r = await api('/api/mod/overview', { token });
  ok('overview numbers', r.status === 200 && r.data.users >= 4, `users ${r.data.users}, chat today ${r.data.chat}`);
  r = await api('/api/chat', { method: 'POST', token: lonelyToken, body: { room: 'lobby', text: 'this is a rude test message' } });
  const rudeId = r.data.message.id;
  await api('/api/chat/report', { method: 'POST', token: raniaToken, body: { id: rudeId } });
  r = await api('/api/mod/reports', { token });
  ok('reported chat messages show up for moderators', r.data.chat.some((m) => m.id === rudeId && m.reports === 1 && m.user.username === 'Lonely'));
  await api('/api/mod/content', { method: 'POST', token, body: { kind: 'chat', id: rudeId, action: 'hide' } });
  ok('a moderator can hide a message', !(await api('/api/chat?room=lobby')).data.messages.some((m) => m.id === rudeId));
  await api('/api/mod/content', { method: 'POST', token, body: { kind: 'chat', id: rudeId, action: 'restore' } });
  ok('…or bring it back (and clear its reports)', (await api('/api/chat?room=lobby')).data.messages.some((m) => m.id === rudeId) && !(await api('/api/mod/reports', { token })).data.chat.some((m) => m.id === rudeId));
  r = await api('/api/dm', { method: 'POST', token: lonelyToken, body: { to: 'Rania', text: 'spammy spam spam' } });
  await api('/api/dm/report', { method: 'POST', token: raniaToken, body: { thread: r.data.thread } });
  r = await api('/api/mod/reports', { token });
  const dmRep = r.data.dms.find((d) => d.user.username === 'Lonely');
  ok('reported conversations include what was said', dmRep && dmRep.reporter === 'Rania' && dmRep.evidence.some((e) => e.text === 'spammy spam spam'));
  await api('/api/mod/dm', { method: 'POST', token, body: { reporterId: dmRep.reporterId, userId: dmRep.userId } });
  ok('…and can be dismissed', !(await api('/api/mod/reports', { token })).data.dms.some((d) => d.user.username === 'Lonely'));
  await api('/api/mod/user', { method: 'POST', token, body: { username: 'Lonely', action: 'mute', hours: 2 } });
  ok('mute someone', (await api('/api/chat', { method: 'POST', token: lonelyToken, body: { room: 'lobby', text: 'hello?' } })).status === 403);
  r = await api('/api/mod/user', { method: 'POST', token, body: { username: 'Lonely', action: 'unmute' } });
  ok('…and unmute', !r.data.user.mutedUntil && (await api('/api/chat', { method: 'POST', token: lonelyToken, body: { room: 'lobby', text: 'I’m back' } })).status === 200);
  r = await api('/api/mod/user', { method: 'POST', token, body: { username: 'Lonely', action: 'ban', hours: 48 } });
  ok('ban someone: they’re signed out…', !!r.data.user.bannedUntil && (await api('/api/me', { token: lonelyToken })).status === 401);
  r = await api('/api/auth/login', { method: 'POST', body: { username: 'Lonely', password: 'Nobody-Asked-77!' }, ip: '9.9.9.7' });
  ok('…and can’t sign back in', r.status === 403, r.data.error);
  await api('/api/mod/user', { method: 'POST', token, body: { username: 'Lonely', action: 'unban' } });
  r = await api('/api/auth/login', { method: 'POST', body: { username: 'Lonely', password: 'Nobody-Asked-77!' }, ip: '9.9.9.6' });
  ok('unban', r.status === 200);
  ok('moderators can’t ban themselves', (await api('/api/mod/user', { method: 'POST', token, body: { username: 'Azzy', action: 'ban' } })).status === 400);
  r = await api('/api/mod/user?username=Lonely', { token });
  ok('look someone up', r.data.user.username === 'Lonely' && r.data.counts.chat >= 2 && r.data.counts.dmReports === 0 && r.data.recentChat.length >= 2);
  ok('every action is logged', (await api('/api/mod/log', { token })).data.items.map((x) => x.action).includes('user:ban'));
  await api('/api/me', { method: 'DELETE', token: raniaToken });
  await api('/api/me', { method: 'DELETE', token: r.status === 200 ? (await api('/api/auth/login', { method: 'POST', body: { username: 'Lonely', password: 'Nobody-Asked-77!' }, ip: '9.9.9.5' })).data.token : lonelyToken });

  console.log('⚔️ duels, 📺 live, 🔮 predictions, 🏅 seasons');
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const kenjiToken = (await api('/api/auth/register', { method: 'POST', body: { username: 'Kenji', password: 'Quiz-Master-2026!' }, ip: '3.3.3.1' })).data.token;
  const laraToken = (await api('/api/auth/register', { method: 'POST', body: { username: 'Lara', password: 'Trivia-Queen-2026!' }, ip: '3.3.3.2' })).data.token;
  const claimAll = async (tk) => (await api('/api/me/claim', { method: 'POST', token: tk })).data.claimed;
  ok('you can’t duel yourself', (await api('/api/duels', { method: 'POST', token: kenjiToken, body: { to: 'Kenji' } })).status === 400);
  ok('duels respect “who can message me”', (await api('/api/duels', { method: 'POST', token: kenjiToken, body: { to: 'Keiiii' } })).status === 403);
  r = await api('/api/duels', { method: 'POST', token: kenjiToken, body: { to: 'Lara' } });
  ok('challenge a friend to a duel', r.status === 200 && r.data.duel.status === 'open' && r.data.duel.total === 5 && r.data.duel.opponent.username === 'Lara');
  const duelId = r.data.duel.id;
  ok('…a second challenge reuses the open one', (await api('/api/duels', { method: 'POST', token: kenjiToken, body: { to: 'Lara' } })).data.existing === true);
  r = await api('/api/dm', { token: laraToken });
  ok('…it arrives as a card in their messages', r.data.threads.some((th) => th.other.username === 'Kenji' && th.last.duel));
  ok('…and as a notification', (await api('/api/notifications', { token: laraToken })).data.items.some((n) => n.title.includes('challenged you to a Quiz Duel')));
  r = await api(`/api/duels/${duelId}`, { token: laraToken });
  ok('questions stay hidden until you press start', r.data.duel.questions === null && r.data.duel.started === false);
  r = await api(`/api/duels/${duelId}/start`, { method: 'POST', token: laraToken });
  ok('start shows the questions (without answers)', r.data.duel.questions.length === 5 && r.data.duel.questions.every((q) => q.answer === undefined));
  const duelAnswers = JSON.parse((await db.prepare('SELECT quiz FROM duels WHERE id = ?').bind(duelId).first()).quiz).map((q) => q.answer);
  r = await api(`/api/duels/${duelId}/answer`, { method: 'POST', token: laraToken, body: { answers: duelAnswers } });
  ok('play your turn', r.data.duel.my.score === 5 && r.data.duel.their === null && r.data.duel.correct.length === 5);
  r = await api(`/api/duels/${duelId}`, { token: kenjiToken });
  ok('your opponent sees you played, but not your score', r.data.duel.their.done === true && r.data.duel.their.score === undefined);
  ok('…and gets a “your turn” notification', (await api('/api/notifications', { token: kenjiToken })).data.items.some((n) => n.title.includes('played your duel')));
  ok('answering before starting is refused', (await api(`/api/duels/${duelId}/answer`, { method: 'POST', token: kenjiToken, body: { answers: [0, 0, 0, 0, 0] } })).status === 409);
  await api(`/api/duels/${duelId}/start`, { method: 'POST', token: kenjiToken });
  r = await api(`/api/duels/${duelId}/answer`, { method: 'POST', token: kenjiToken, body: { answers: duelAnswers.map((x, i) => (i < 2 ? x : (x + 1) % 2)) } });
  ok('when both have played, the best score wins', r.data.duel.status === 'done' && r.data.duel.winner === 'them' && r.data.duel.my.score <= 4);
  ok('…the winner gets XP and a duel win', (await api('/api/me', { token: laraToken })).data.user.stats.duelsWon === 1 && (await api('/api/me', { token: laraToken })).data.user.pendingXp === 30);
  ok('…the other player gets a little XP too', (await api('/api/me', { token: kenjiToken })).data.user.pendingXp === 10);
  ok('strangers can’t see a duel', (await api(`/api/duels/${duelId}`, { token: keiToken })).status === 404);
  r = await api('/api/duels', { token: laraToken });
  ok('your duel record', r.data.record.won === 1 && r.data.duels[0].id === duelId);
  await db.prepare("INSERT INTO duels (a, b, quiz, a_started, a_answers, a_score, a_ms, status, created) VALUES ((SELECT id FROM users WHERE username_lc = 'kenji'), (SELECT id FROM users WHERE username_lc = 'lara'), ?, 1, '[]', 3, 9000, 'open', ?)").bind(JSON.stringify([{ answer: 0, options: ['a', 'b'] }]), Date.now() - 49 * 3600_000).run();
  await claimAll(kenjiToken);
  r = await api('/api/duels', { token: kenjiToken });
  ok('an unfinished duel ends after 48 hours (the one who played wins)', r.data.duels.some((d) => d.status === 'expired' && d.winner === 'me') && (await api('/api/me', { token: kenjiToken })).data.user.pendingXp === 20);
  await claimAll(kenjiToken);
  await claimAll(laraToken);

  // 📺 a quick test show every minute (lobby 24 s, then 10 questions × 2 s)
  const liveUntil = async (cond, tk, max = 95_000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < max) { const x = (await api('/api/live', { token: tk })).data; if (cond(x)) return x; await sleep(200); }
    throw new Error('live show timed out');
  };
  let L = await liveUntil((x) => x.phase === 'lobby' && x.startsAt - x.now > 4000, kenjiToken);
  ok('kerNEl Live: the lobby opens before the show', L.phase === 'lobby' && L.total >= 5 && !L.question, `${L.total} questions`);
  for (const tk of [kenjiToken, laraToken, token]) await api('/api/live/join', { method: 'POST', token: tk });
  ok('…people join the lobby', (await api('/api/live', { token: kenjiToken })).data.players === 3);
  const liveAnswers = JSON.parse((await db.prepare('SELECT v FROM kv WHERE k = ?').bind(`live:${L.slot}`).first()).v).questions.map((q) => q.answer);
  const seen = new Set();
  const checks = {};
  let done = null;
  while (!done) {
    const x = (await api('/api/live', { token: kenjiToken })).data;
    if (x.phase === 'question' && !seen.has(x.q)) {
      seen.add(x.q);
      const right = liveAnswers[x.q];
      const wrong = (right + 1) % x.question.options.length;
      checks.noAnswer ??= x.question.answer === undefined;
      await api('/api/live/answer', { method: 'POST', token: kenjiToken, body: { q: x.q, choice: right } });
      if (x.q === 0) await api('/api/live/answer', { method: 'POST', token: laraToken, body: { q: 0, choice: right } });
      if (x.q === 1) {
        await api('/api/live/answer', { method: 'POST', token: laraToken, body: { q: 1, choice: wrong } });
        checks.lateJoin = (await api('/api/live/join', { method: 'POST', token: keiToken })).status;
        checks.azzyOut = (await api('/api/live/answer', { method: 'POST', token, body: { q: 1, choice: right } })).status;
      }
      if (x.q === 2) checks.laraOut = (await api('/api/live/answer', { method: 'POST', token: laraToken, body: { q: 2, choice: right } })).status;
    }
    if (x.phase === 'reveal' && checks.late === undefined) {
      checks.late = (await api('/api/live/answer', { method: 'POST', token: kenjiToken, body: { q: x.q, choice: 0 } })).status;
      checks.reveal = x.reveal && x.reveal.answer === liveAnswers[x.q] && x.reveal.counts.reduce((a2, b2) => a2 + b2, 0) >= 1;
    }
    if (x.phase === 'done') done = x;
    else await sleep(150);
  }
  ok('questions arrive without their answers', checks.noAnswer === true);
  ok('the reveal shows the right answer and how people voted', checks.reveal === true);
  ok('answers after the timer are refused', checks.late === 409);
  ok('you can’t join once the show has started', checks.lateJoin === 409);
  ok('one wrong (or missing) answer and you’re out', checks.azzyOut === 403 && checks.laraOut === 403);
  ok('the last kernel standing wins', done.winnerCount === 1 && done.winners[0].username === 'Kenji', `${seen.size} questions played`);
  r = await api('/api/me', { token: kenjiToken });
  ok('…and gets XP and a live win (the mic hat)', r.data.user.pendingXp === 60 && r.data.user.stats.liveWins === 1);
  ok('…everyone else who played gets a little XP', (await api('/api/me', { token: laraToken })).data.user.pendingXp === 15);
  await claimAll(kenjiToken);
  await claimAll(laraToken);

  r = await api('/api/predictions', { token: laraToken });
  const auto = r.data.open.find((p) => p.kind === 'upvotes');
  ok('🔮 automatic predictions from today’s news', !!auto && auto.data.threshold >= 100 && auto.options.length === 2, auto && `“${auto.question}” → ${auto.data.threshold} upvotes?`);
  await api('/api/predictions/vote', { method: 'POST', token: laraToken, body: { id: auto.id, choice: 1 } });
  await api('/api/predictions/vote', { method: 'POST', token: laraToken, body: { id: auto.id, choice: 0 } });
  await api('/api/predictions/vote', { method: 'POST', token: kenjiToken, body: { id: auto.id, choice: 1 } });
  r = await api('/api/predictions', { token: laraToken });
  const pv = r.data.open.find((p) => p.id === auto.id);
  ok('vote (and change your mind before it closes)', pv.mine === 0 && pv.counts[0] === 1 && pv.counts[1] === 1);
  await db.prepare('UPDATE predictions SET closes = ?, resolves = ? WHERE id = ?').bind(Date.now() - 1000, Date.now() - 1000, auto.id).run();
  ok('voting closes on time', (await api('/api/predictions/vote', { method: 'POST', token: kenjiToken, body: { id: auto.id, choice: 0 } })).status === 409);
  await db.prepare('UPDATE stories SET points = ? WHERE key = ?').bind(auto.data.threshold + 10, (await db.prepare('SELECT story_key FROM predictions WHERE id = ?').bind(auto.id).first()).story_key).run();
  await worker.scheduled({ cron: '*/5 * * * *' });
  r = await api('/api/predictions', { token: laraToken });
  ok('predictions settle themselves when they’re due', r.data.resolved.some((p) => p.id === auto.id && p.answer === 0) && r.data.record.right === 1);
  r = await api('/api/me', { token: laraToken });
  ok('…people who called it get XP (toward the 🔮 hat)', r.data.user.pendingXp === 15 && r.data.user.stats.prophet === 1 && (await api('/api/me', { token: kenjiToken })).data.user.pendingXp === 0);
  ok('only moderators write their own predictions', (await api('/api/mod/predictions', { method: 'POST', token: laraToken, body: { question: 'Will it rain?', options: ['Yes', 'No'] } })).status === 403);
  r = await api('/api/mod/predictions', { method: 'POST', token, body: { question: 'Which phone sells best this month?', options: ['iPhone', 'Pixel', 'Galaxy'], hours: 24 } });
  const modPred = r.data.prediction.id;
  ok('a moderator writes a prediction', (await api('/api/predictions')).data.open.some((p) => p.id === modPred && p.kind === 'mod' && p.options.length === 3));
  await api('/api/predictions/vote', { method: 'POST', token: kenjiToken, body: { id: modPred, choice: 2 } });
  r = await api('/api/mod/predictions/resolve', { method: 'POST', token, body: { id: modPred, answer: 2 } });
  ok('…and settles it', r.data.winners === 1 && (await api('/api/me', { token: kenjiToken })).data.user.pendingXp === 15);
  await claimAll(kenjiToken);
  await claimAll(laraToken);

  await api('/api/me/data', { method: 'PUT', token: kenjiToken, body: { xp: 120 } });
  r = await api('/api/leaderboard?season=1', { token: kenjiToken });
  ok('🏅 this month’s season board', r.data.season === new Date().toISOString().slice(0, 7) && r.data.top.some((u) => u.username === 'Kenji' && u.xp === 120) && r.data.me.xp === 120 && r.data.endsAt > Date.now());
  const lastSeason = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  await db.prepare("UPDATE users SET season = ?, season_xp = 999 WHERE username_lc = 'lara'").bind(lastSeason).run();
  await worker.scheduled({ cron: '*/5 * * * *' });
  r = await api('/api/me', { token: laraToken });
  ok('last month’s top kernels get prizes', r.data.user.pendingXp === 200 && r.data.user.stats.seasonWins === 1);
  ok('…a medal on their profile card', (await api('/api/users/Lara')).data.seasons.some((x) => x.season === lastSeason && x.place === 1));
  ok('…and the Season legend frame', (await api('/api/me/profile', { method: 'PUT', token: laraToken, body: { frame: 'legend' } })).data.profile.frame === 'legend');
  await api('/api/me', { method: 'DELETE', token: kenjiToken });
  await api('/api/me', { method: 'DELETE', token: laraToken });
  ok('deleting accounts removes their duels and votes', (await db.prepare("SELECT (SELECT COUNT(*) FROM duels) + (SELECT COUNT(*) FROM prediction_votes) AS n").first()).n === 0);

  console.log('🫧 pops, 👥 groups, 🎙️ voice notes, ✍️ typing');
  const reg = async (username, password, ip) => (await api('/api/auth/register', { method: 'POST', body: { username, password }, ip })).data.token;
  const moToken = await reg('Momo', 'Pop-Corn-Lover-77', '4.4.4.1');
  const saraToken = await reg('Sara', 'Group-Chat-Fan-88', '4.4.4.2');
  const yukiToken = await reg('Yuki', 'Voice-Note-Pro-99', '4.4.4.3');
  const pad = (head, n) => Buffer.concat([Buffer.from(head), Buffer.alloc(n)]).toString('base64');
  const webm = `data:audio/webm;codecs=opus;base64,${pad([0x1a, 0x45, 0xdf, 0xa3], 800)}`;
  const popJpeg = `data:image/jpeg;base64,${pad([0xff, 0xd8, 0xff, 0xe0], 2000)}`;
  const raw = (path) => mf.dispatchFetch(`http://kernel.test${path}`, { headers: { Origin: ORIGIN } });

  r = await api('/api/pops', { method: 'POST', token: moToken, body: { kind: 'text', text: 'Hello pops! 🍿', bg: 3 } });
  ok('post a text pop', r.status === 200 && r.data.pop.kind === 'text' && r.data.pop.bg === 3);
  const textPop = r.data.pop.id;
  r = await api('/api/pops', { method: 'POST', token: moToken, body: { kind: 'photo', photo: popJpeg, text: 'my desk' } });
  ok('post a photo pop', r.status === 200 && /^[0-9a-f]{32}$/.test(r.data.pop.photo));
  const photoPop = r.data.pop.id;
  const photoKey = r.data.pop.photo;
  r = await api('/api/pops', { method: 'POST', token: moToken, body: { kind: 'story', storyKey: story.key, text: 'wow' } });
  ok('pop a kerNEl story', r.data.pop.story?.key === story.key);
  ok('fake photos are refused', (await api('/api/pops', { method: 'POST', token: moToken, body: { kind: 'photo', photo: `data:image/jpeg;base64,${pad([0x3c, 0x73, 0x76, 0x67], 500)}` } })).status === 400);
  ok('empty text pops are refused', (await api('/api/pops', { method: 'POST', token: moToken, body: { kind: 'text', text: '  ' } })).status === 400);
  ok('pops are only for followers', (await api('/api/pops', { token: saraToken })).data.rings.length === 0
    && (await api('/api/pops/view', { method: 'POST', token: saraToken, body: { id: textPop } })).status === 404);
  await api('/api/follow', { method: 'POST', token: saraToken, body: { username: 'Momo' } });
  await api('/api/follow', { method: 'POST', token: yukiToken, body: { username: 'Momo' } });
  r = await api('/api/pops', { token: saraToken });
  ok('followers see a ring of new pops', r.data.rings.length === 1 && r.data.rings[0].user.username === 'Momo' && r.data.rings[0].unseen === 3);
  ok('…and a ring on the profile card', (await api('/api/users/Momo', { token: saraToken })).data.popsUnseen === 3);
  ok('photo pops load by their key', (await raw(`/api/pops/photo/${photoKey}`)).status === 200);
  await api('/api/pops/view', { method: 'POST', token: saraToken, body: { id: textPop } });
  r = await api('/api/pops/view', { method: 'POST', token: saraToken, body: { id: photoPop, react: '🔥' } });
  ok('view and react', r.data.react === '🔥');
  ok('…the author hears about the reaction', (await api('/api/notifications', { token: moToken })).data.items.some((n) => n.title.includes('reacted to your pop')));
  r = await api('/api/pops', { token: saraToken });
  ok('seen pops stop counting as new', r.data.rings[0].unseen === 1 && r.data.rings[0].pops.find((x) => x.id === photoPop).myReact === '🔥');
  r = await api(`/api/pops/${photoPop}/viewers`, { token: moToken });
  ok('the author sees who looked', r.data.total === 1 && r.data.viewers[0].username === 'Sara' && r.data.viewers[0].react === '🔥');
  ok('…nobody else can', (await api(`/api/pops/${photoPop}/viewers`, { token: saraToken })).status === 404);
  r = await api('/api/pops', { token: moToken });
  ok('your own ring comes first, with view counts', r.data.rings[0].me && r.data.rings[0].pops.find((x) => x.id === photoPop).views === 1);
  r = await api('/api/dm', { method: 'POST', token: saraToken, body: { to: 'Momo', text: 'nice desk!', pop: photoPop } });
  ok('reply to a pop in Messages', r.status === 200 && r.data.message.pop?.id === photoPop && r.data.message.pop.photo === photoKey);
  ok('…only to the person who posted it', (await api('/api/dm', { method: 'POST', token: saraToken, body: { to: 'Yuki', text: 'hi', pop: photoPop } })).status === 404);
  for (const tk of [saraToken, yukiToken]) await api('/api/pops/report', { method: 'POST', token: tk, body: { id: textPop } });
  ok('reported pops reach the moderators', (await api('/api/mod/reports', { token })).data.pops.some((x) => x.id === textPop && x.reports === 2));
  await api('/api/follow', { method: 'POST', token, body: { username: 'Momo' } });
  await api('/api/pops/report', { method: 'POST', token, body: { id: textPop } });
  ok('three reports hide a pop', !(await api('/api/pops', { token: yukiToken })).data.rings[0].pops.some((x) => x.id === textPop));
  r = await api('/api/mod/content', { method: 'POST', token, body: { kind: 'pop', id: textPop, action: 'restore' } });
  ok('…a moderator can bring it back', r.status === 200 && (await api('/api/pops', { token: yukiToken })).data.rings[0].pops.some((x) => x.id === textPop));
  ok('delete your own pop (and its photo)', (await api(`/api/pops/${photoPop}`, { method: 'DELETE', token: moToken })).status === 200 && (await raw(`/api/pops/photo/${photoKey}`)).status === 404);
  await db.prepare("UPDATE pops SET expires = ? WHERE user_id = (SELECT id FROM users WHERE username_lc = 'momo')").bind(Date.now() - 1000).run();
  ok('pops disappear after a day', (await api('/api/pops', { token: saraToken })).data.rings.length === 0);
  await worker.scheduled({ cron: '*/5 * * * *' });
  ok('…and the cleanup removes them', (await db.prepare('SELECT (SELECT COUNT(*) FROM pops) + (SELECT COUNT(*) FROM pop_views) + (SELECT COUNT(*) FROM pop_photos) AS n').first()).n === 0);

  r = await api('/api/groups', { method: 'POST', token: moToken, body: { name: 'Pop Squad', emoji: '🍿', members: ['Sara', 'Yuki', 'Keiiii', 'nobody_here'] } });
  ok('start a group', r.status === 200 && r.data.group > 0 && r.data.skipped.includes('Keiiii') && r.data.skipped.includes('nobody_here'), JSON.stringify(r.data));
  const gid = r.data.group;
  ok('groups need someone who takes your messages', (await api('/api/groups', { method: 'POST', token: moToken, body: { name: 'Solo', members: ['Keiiii'] } })).status === 400);
  ok('…members get a notification', (await api('/api/notifications', { token: saraToken })).data.items.some((n) => n.title.includes('added you to')));
  r = await api('/api/dm', { token: saraToken });
  ok('groups show up in the inbox', r.data.groups.some((g) => g.id === gid && g.name === 'Pop Squad' && g.members === 3 && g.last.kind === 'system'));
  r = await api(`/api/groups/${gid}/messages`, { method: 'POST', token: saraToken, body: { text: 'hey squad!' } });
  ok('send a group message', r.status === 200 && r.data.message.text === 'hey squad!' && r.data.message.from === 'Sara');
  const heyId = r.data.message.id;
  ok('…it counts as unread for the others', (await api('/api/dm?count=1', { token: yukiToken })).data.unread === 1);
  await api(`/api/groups/${gid}/messages`, { method: 'POST', token: saraToken, body: { text: 'anyone here?' } });
  ok('…with one push (not one per message)', (await api('/api/notifications', { token: yukiToken })).data.items.filter((n) => n.title.includes('in “Pop Squad”')).length === 1);
  await api('/api/groups/typing', { method: 'POST', token: yukiToken, body: { group: gid } });
  r = await api(`/api/groups/${gid}`, { token: moToken });
  ok('see who’s typing', r.data.typing.some((x) => x.username === 'Yuki'));
  ok('…members, the creator and what each has read', r.data.members.length === 3 && r.data.members.find((x) => x.username === 'Momo').owner === true && r.data.members.every((x) => typeof x.readId === 'number'));
  r = await api(`/api/groups/${gid}/messages`, { method: 'POST', token: yukiToken, body: { voice: webm, voiceMs: 4200, voicePeaks: [10, 50, 90, 200, -5] } });
  ok('send a voice note', r.status === 200 && r.data.message.voice.ms === 4200 && r.data.message.voice.peaks.join() === '10,50,90,100,0');
  const vres = await raw(`/api/voice/${r.data.message.voice.key}`);
  ok('…it plays back as audio', vres.status === 200 && vres.headers.get('content-type') === 'audio/webm');
  ok('sending stops “typing…”', !(await api(`/api/groups/${gid}`, { token: moToken })).data.typing.length);
  ok('fake audio is refused', (await api(`/api/groups/${gid}/messages`, { method: 'POST', token: yukiToken, body: { voice: `data:audio/webm;base64,${pad([0x3c, 0x68], 800)}` } })).status === 400);
  ok('too-long voice notes are refused', (await api(`/api/groups/${gid}/messages`, { method: 'POST', token: yukiToken, body: { voice: `data:audio/webm;base64,${pad([0x1a, 0x45, 0xdf, 0xa3], 250_000)}` } })).status === 413);
  r = await api('/api/groups/react', { method: 'POST', token: moToken, body: { id: heyId, emoji: '🔥' } });
  ok('react in a group', r.data.message.reacts['🔥'] === 1 && r.data.message.myReact === '🔥');
  await api('/api/groups/update', { method: 'POST', token: saraToken, body: { group: gid, name: 'Popcorn Crew', emoji: '🚀' } });
  r = await api('/api/groups/add', { method: 'POST', token: saraToken, body: { group: gid, usernames: ['Azzy'] } });
  ok('any member can add people', r.data.added.includes('Azzy'));
  r = await api(`/api/groups/${gid}`, { token });
  ok('new members don’t see older messages', !r.data.messages.some((x) => x.text === 'hey squad!') && r.data.messages.some((x) => x.system?.t === 'added'));
  ok('…and see the new name', r.data.group.name === 'Popcorn Crew' && r.data.group.emoji === '🚀');
  ok('…but can’t react to old messages', (await api('/api/groups/react', { method: 'POST', token, body: { id: heyId, emoji: '😂' } })).status === 404);
  r = await api(`/api/groups/${gid}/messages`, { method: 'POST', token: yukiToken, body: { text: 'buy my mixtape' } });
  const spam = r.data.message.id;
  for (const tk of [moToken, saraToken]) await api('/api/groups/report', { method: 'POST', token: tk, body: { id: spam } });
  ok('reported group messages reach the moderators', (await api('/api/mod/reports', { token })).data.groups.some((x) => x.id === spam && x.reports === 2));
  await api('/api/groups/report', { method: 'POST', token, body: { id: spam } });
  r = await api(`/api/groups/${gid}`, { token: moToken });
  ok('three reports hide a group message', r.data.messages.find((x) => x.id === spam).hidden === true && r.data.messages.find((x) => x.id === spam).text === '');
  ok('only the creator can remove people', (await api('/api/groups/remove', { method: 'POST', token: saraToken, body: { group: gid, username: 'Yuki' } })).status === 403);
  r = await api('/api/groups/remove', { method: 'POST', token: moToken, body: { group: gid, username: 'Yuki' } });
  ok('the creator can remove someone', r.status === 200 && (await api(`/api/groups/${gid}`, { token: yukiToken })).status === 404);
  await api('/api/groups/mute', { method: 'POST', token: saraToken, body: { group: gid, muted: true } });
  await api(`/api/groups/${gid}/messages`, { method: 'POST', token: moToken, body: { text: 'is this thing on?' } });
  ok('muted groups stay off the badge', (await api('/api/dm?count=1', { token: saraToken })).data.unread === 0);
  await api('/api/groups/remove', { method: 'POST', token: moToken, body: { group: gid } });
  r = await api(`/api/groups/${gid}`, { token: saraToken });
  ok('when the creator leaves, the oldest member takes over', r.data.group.owner === true && !r.data.members.some((x) => x.username === 'Momo'));

  r = await api('/api/dm', { method: 'POST', token: moToken, body: { to: 'Sara', voice: webm, voiceMs: 2500 } });
  ok('voice notes in private messages too', r.status === 200 && r.data.message.voice.ms === 2500);
  const dmThread = r.data.thread;
  const dmVoice = r.data.message;
  await api('/api/dm/typing', { method: 'POST', token: saraToken, body: { thread: dmThread } });
  ok('“typing…” in private messages', (await api(`/api/dm/${dmThread}`, { token: moToken })).data.typing === true);
  await api('/api/dm/typing', { method: 'POST', token: saraToken, body: { thread: dmThread, stop: true } });
  ok('…and it stops', (await api(`/api/dm/${dmThread}`, { token: moToken })).data.typing === false);
  ok('strangers can’t type in your chats', (await api('/api/dm/typing', { method: 'POST', token: yukiToken, body: { thread: dmThread } })).status === 404);
  await api(`/api/dm/messages/${dmVoice.id}`, { method: 'DELETE', token: moToken });
  ok('deleting a voice note removes the audio', (await raw(`/api/voice/${dmVoice.voice.key}`)).status === 404);
  for (const tk of [moToken, saraToken, yukiToken]) await api('/api/me', { method: 'DELETE', token: tk });
  ok('deleting accounts removes their pops, group messages and voice notes', (await db.prepare(`SELECT (SELECT COUNT(*) FROM pops) + (SELECT COUNT(*) FROM pop_views) + (SELECT COUNT(*) FROM voice_notes)
    + (SELECT COUNT(*) FROM group_messages WHERE kind = 'msg' AND user_id NOT IN (SELECT id FROM users)) + (SELECT COUNT(*) FROM group_members WHERE user_id NOT IN (SELECT id FROM users)) AS n`).first()).n === 0);
  ok('…and the group lives on with who’s left', (await api(`/api/groups/${gid}`, { token })).data.group.owner === true);

  console.log('🔔 topics, ☀️ Morning Drop, 🕰️ timelines');
  const taraToken = (await api('/api/auth/register', { method: 'POST', body: { username: 'Taraaa', password: 'Morning-Coffee-42' }, ip: '5.5.5.1' })).data.token;
  r = await api('/api/topics', { token: taraToken });
  ok('topic suggestions (popular + trending)', r.status === 200 && r.data.suggested.includes('Nintendo') && r.data.trending.includes('OpenAI') && r.data.topics.length === 0, `trending: ${r.data.trending.join(', ')}`);
  r = await api('/api/topics', { method: 'POST', token: taraToken, body: { topic: 'Rust' } });
  ok('follow a topic', r.data.topics.some((x) => x.topic === 'Rust'));
  ok('…with how many of today’s stories mention it', r.data.topics.find((x) => x.topic === 'Rust').today >= 1);
  ok('one-letter topics are refused', (await api('/api/topics', { method: 'POST', token: taraToken, body: { topic: 'x' } })).status === 400);
  r = await api('/api/topics', { method: 'POST', token: taraToken, body: { topic: 'Pine' } });
  ok('follow another, then unfollow it', (await api('/api/topics', { method: 'POST', token: taraToken, body: { topic: 'pine', follow: false } })).data.topics.length === 1);
  await db.prepare("UPDATE stories SET first_seen = ?, time = ? WHERE title LIKE 'Rust 2.0%'").bind(Date.now(), Date.now()).run();
  await worker.scheduled({ cron: '2-59/5 * * * *' });
  r = await api('/api/notifications', { token: taraToken });
  ok('a followed topic in a fresh story sends an alert', r.data.items.some((n) => n.title === '🔔 Rust is in the news' && n.url.startsWith('./#story=')));
  await worker.scheduled({ cron: '2-59/5 * * * *' });
  ok('…only once per story', (await api('/api/notifications', { token: taraToken })).data.items.filter((n) => n.title.includes('Rust is in the news')).length
    === (await db.prepare("SELECT COUNT(*) AS n FROM topic_alerts WHERE user_id = (SELECT id FROM users WHERE username_lc = 'taraaa')").first()).n);
  ok('…and at most 3 a day', (await db.prepare("SELECT COUNT(*) AS n FROM topic_alerts WHERE user_id = (SELECT id FROM users WHERE username_lc = 'taraaa')").first()).n <= 3);
  r = await api('/api/drop', { token: taraToken });
  ok('☀️ Morning Drop: the day’s top 5', r.status === 200 && r.data.stories.length === 5 && r.data.hour === null);
  ok('…stories about your topics come first', r.data.stories[0].topic === 'Rust' && r.data.stories.filter((x) => x.topic).length <= 2);
  ok('…then the day’s biggest stories', r.data.stories.some((x) => x.points >= 900));
  ok('…at most 2 from one section', Object.values(r.data.stories.reduce((a, s) => ({ ...a, [s.cat]: (a[s.cat] || 0) + 1 }), {})).every((n) => n <= 2));
  ok('guests get a Morning Drop too', (await api('/api/drop')).data.stories.length === 5);
  const mins = new Date().getUTCMinutes();
  const dropHour = new Date(Date.now() - mins * 60_000).getUTCHours();
  r = await api('/api/notify/prefs', { method: 'PUT', token: taraToken, body: { dropHour, tz: -mins } });
  ok('pick the hour for your Morning Drop', r.data.dropHour === dropHour);
  await worker.scheduled({ cron: '2-59/5 * * * *' });
  ok('…it arrives at that hour, in your time', (await api('/api/notifications', { token: taraToken })).data.items.some((n) => n.title === '☀️ Your Morning Drop is here' && n.url === './#drop'));
  await worker.scheduled({ cron: '2-59/5 * * * *' });
  ok('…once a day', (await api('/api/notifications', { token: taraToken })).data.items.filter((n) => n.title.includes('Morning Drop')).length === 1);
  ok('…and can be turned off', (await api('/api/notify/prefs', { method: 'PUT', token: taraToken, body: { dropHour: null } })).data.dropHour === null);
  const rustKey = (await db.prepare("SELECT key FROM stories WHERE title LIKE 'Rust 2.0%' LIMIT 1").first()).key;
  r = await api(`/api/timeline?key=${encodeURIComponent(rustKey)}`);
  ok('🕰️ a story’s timeline searches for what it’s about', r.status === 200 && /Rust/.test(calls.timeline) && r.data.query.includes('Rust'));
  ok('…older stories, newest first, without the story itself', r.data.items.length === 3 && r.data.items[0].title.startsWith('Rust 1.80') && r.data.items.every((x, i, a) => !i || a[i - 1].time >= x.time) && !r.data.items.some((x) => x.url === 'https://example-news.com/story-1'));
  ok('…with a Hacker News link when there’s no article link', r.data.items.some((x) => x.url.startsWith('https://news.ycombinator.com/item?id=7004')));
  calls.timeline = null;
  await api(`/api/timeline?key=${encodeURIComponent(rustKey)}`);
  ok('…and it’s cached', calls.timeline === null);
  ok('unknown stories have no timeline', (await api('/api/timeline?key=nope')).status === 404);
  await api('/api/me', { method: 'DELETE', token: taraToken });
  ok('deleting an account removes its topics', (await db.prepare('SELECT (SELECT COUNT(*) FROM topic_follows) + (SELECT COUNT(*) FROM topic_alerts) AS n').first()).n === 0);

  console.log('sign-out & delete');
  await api('/api/auth/logout', { method: 'POST', token });
  ok('signed-out token stops working', (await api('/api/me', { token })).status === 401);
  ok('account deletion works', (await api('/api/me', { method: 'DELETE', token: keiToken })).status === 200 && (await api('/api/me', { token: keiToken })).status === 401);
  ok('…and frees the username', (await api('/api/auth/available?username=keiiii')).data.available === true);
  ok('…and removes their follows, comments and scores', (await db.prepare("SELECT (SELECT COUNT(*) FROM follows) + (SELECT COUNT(*) FROM tourney_scores WHERE user_id NOT IN (SELECT id FROM users)) + (SELECT COUNT(*) FROM trophies WHERE user_id NOT IN (SELECT id FROM users)) AS n").first()).n === 0);
  console.log('\nALL BACKEND TESTS PASSED');
} finally {
  await mf.dispose();
}
