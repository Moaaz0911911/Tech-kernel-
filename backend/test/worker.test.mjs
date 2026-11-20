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
    bindings: { ALLOWED_ORIGINS: 'https://moaaz0911911.github.io', GOOGLE_CLIENT_ID: GOOGLE_ID, APPLE_CLIENT_ID: APPLE_ID, ANTHROPIC_API_KEY: 'sk-ant-test', CODME_PER_IP_HOUR: '3' },
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

  console.log('sign-in');
  const good = { iss: 'https://accounts.google.com', aud: GOOGLE_ID, sub: '1111', email: 'ada@example.com', name: 'Ada Lovelace', given_name: 'Ada', picture: 'https://lh3.googleusercontent.com/a/x', exp: now() + 3600, iat: now() };
  r = await api('/api/auth/google', { method: 'POST', body: { idToken: makeToken({ ...good, aud: 'someone-else' }) } });
  ok('rejects token for another app', r.status === 401, r.data.error);
  const { privateKey: otherKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  r = await api('/api/auth/google', { method: 'POST', body: { idToken: makeToken(good, { key: otherKey }) } });
  ok('rejects forged signature', r.status === 401, r.data.error);
  r = await api('/api/auth/google', { method: 'POST', body: { idToken: makeToken({ ...good, exp: now() - 3600 }) } });
  ok('rejects expired token', r.status === 401, r.data.error);
  r = await api('/api/auth/google', { method: 'POST', body: { idToken: makeToken(good) } });
  ok('valid Google token signs up', r.status === 200 && r.data.isNew && /^[a-f0-9]{64}$/.test(r.data.token), `nickname ${r.data.user.profile.nickname}`);
  const token = r.data.token;
  r = await api('/api/auth/google', { method: 'POST', body: { idToken: makeToken(good) } });
  ok('second sign-in is a returning user', r.status === 200 && !r.data.isNew);
  const stored = await db.prepare('SELECT token_hash FROM sessions LIMIT 1').first();
  ok('only a hash of the session token is stored', stored.token_hash.length === 64 && stored.token_hash !== token);
  r = await api('/api/auth/apple', { method: 'POST', body: { idToken: makeToken({ iss: 'https://appleid.apple.com', aud: APPLE_ID, sub: 'apple-42', email: 'x@privaterelay.appleid.com', exp: now() + 600 }), name: 'Tim Apple', givenName: 'Tim' } });
  ok('valid Apple token signs up (keeps one-time name)', r.status === 200 && r.data.user.name === 'Tim Apple' && r.data.user.profile.nickname === 'Tim');
  const appleToken = r.data.token;

  console.log('account sync');
  r = await api('/api/me', { token });
  ok('/api/me returns the account', r.status === 200 && r.data.user.email === 'ada@example.com');
  ok('/api/me without a token is refused', (await api('/api/me')).status === 401);
  r = await api('/api/me/profile', { method: 'PUT', token, body: { nickname: '<b>Popcorn</b>Pilot', avatar: '🦖', topics: ['ai', 'space', 'nonsense'] } });
  ok('profile saved and cleaned', r.data.profile.nickname === 'bPopcorn/bPilot' && r.data.profile.avatar === '🦖' && r.data.profile.topics.join() === 'ai,space');
  const story = (await api('/api/news')).data.items[0];
  await api('/api/me/data', { method: 'PUT', token, body: { xp: 42, read: [story.key], saved: [story], reactions: { [story.key]: 'fire', x: 'bogus' } } });
  r = await api('/api/me', { token });
  ok('XP, saved and read sync across devices', r.data.user.data.xp === 42 && r.data.user.data.saved[0].key === story.key && r.data.user.data.read.length === 1 && !r.data.user.data.reactions.x);

  console.log('shared reactions');
  ok('guests cannot add shared reactions', (await api('/api/react', { method: 'POST', body: { key: story.key, emoji: 'fire' } })).status === 401);
  await api('/api/react', { method: 'POST', token, body: { key: story.key, emoji: 'fire' } });
  r = await api('/api/react', { method: 'POST', token: appleToken, body: { key: story.key, emoji: 'fire' } });
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
  ok('account deletion works', (await api('/api/me', { method: 'DELETE', token: appleToken })).status === 200 && (await api('/api/me', { token: appleToken })).status === 401);
  console.log('\nALL BACKEND TESTS PASSED');
} finally {
  await mf.dispose();
}
