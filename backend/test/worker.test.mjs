// End-to-end test of the bundled worker in Miniflare (Cloudflare's local runtime) with a real local D1.
// Every outbound request (news sites, Google/Apple keys, Anthropic) is answered by stand-ins below.
// Run: npm test   (bundles first, then runs this file)
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, createSign } from 'node:crypto';
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

async function outbound(request) {
  const url = new URL(request.url);
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
    modules: true,
    scriptPath: `${here}.build/index.js`,
    compatibilityDate: '2026-11-01',
    d1Databases: { DB: 'test-db' },
    bindings: { ALLOWED_ORIGINS: 'https://moaaz0911911.github.io', ANTHROPIC_API_KEY: 'sk-ant-test', CODME_PER_IP_HOUR: '3', SIGNUPS_PER_IP_HOUR: '3' },
    outboundService: outbound,
  }],
}));
const db = await mf.getD1Database('DB');
for (const stmt of readFileSync(`${here}schema.sql`, 'utf8').split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(stmt).run();

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

  console.log('sign-out & delete');
  await api('/api/auth/logout', { method: 'POST', token });
  ok('signed-out token stops working', (await api('/api/me', { token })).status === 401);
  ok('account deletion works', (await api('/api/me', { method: 'DELETE', token: keiToken })).status === 200 && (await api('/api/me', { token: keiToken })).status === 401);
  ok('…and frees the username', (await api('/api/auth/available?username=keiiii')).data.available === true);
  console.log('\nALL BACKEND TESTS PASSED');
} finally {
  await mf.dispose();
}
