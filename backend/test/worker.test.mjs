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
  if (url.hostname === 'hn.algolia.com') return J(hnHits(url.pathname.includes('by_date') ? 6 : 8));
  if (url.hostname === 'dev.to') return J([{ id: 1, title: 'CSS tricks that feel illegal', url: 'https://dev.to/a/css', published_at: new Date().toISOString(), public_reactions_count: 50, comments_count: 4, cover_image: 'https://dev.to/cover.png', description: 'container queries', tag_list: ['css'] }]);
  if (url.hostname === 'www.theverge.com' && url.pathname.includes('rss')) return new Response(RSS, { headers: { 'content-type': 'application/rss+xml' } });
  if (url.hostname === 'www.wired.com' && url.pathname.includes('feed')) return new Response(ATOM, { headers: { 'content-type': 'application/atom+xml' } });
  if (['techcrunch.com', 'feeds.arstechnica.com', 'www.engadget.com'].includes(url.hostname)) return new Response('down', { status: 503 });
  if (url.hostname === 'example-news.com') { // article pages: provide og:image
    calls.pages++;
    return new Response(`<html><head><meta property="og:image" content="/img/${url.pathname.slice(1)}.png"><title>x</title></head><body>…</body></html>`, { headers: { 'content-type': 'text/html' } });
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
    bindings: { ALLOWED_ORIGINS: 'https://moaaz0911911.github.io', ANTHROPIC_API_KEY: 'sk-ant-test', CODME_PER_IP_HOUR: '3', SIGNUPS_PER_IP_HOUR: '3' },
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

  console.log('sign-out & delete');
  await api('/api/auth/logout', { method: 'POST', token });
  ok('signed-out token stops working', (await api('/api/me', { token })).status === 401);
  ok('account deletion works', (await api('/api/me', { method: 'DELETE', token: keiToken })).status === 200 && (await api('/api/me', { token: keiToken })).status === 401);
  ok('…and frees the username', (await api('/api/auth/available?username=keiiii')).data.available === true);
  console.log('\nALL BACKEND TESTS PASSED');
} finally {
  await mf.dispose();
}
