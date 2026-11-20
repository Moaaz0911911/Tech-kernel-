// kerNEl API — Cloudflare Worker entry point.
import { HttpError, json, readJson, corsHeaders, allowedOrigin, clientIp, rateLimit } from './util.js';
import { collectNews, findThumbnails, latestStories, sourceStatus, reactionCounts } from './news.js';
import { verifyIdToken, signIn, requireUser, currentUser, signOut, publicUser, cleanProfile, cleanData, REACTS } from './auth.js';
import { codmeReply } from './codme.js';

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const m = request.method;

  if (path === '/' || path === '/api/health') {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(first_seen) AS last FROM stories').first();
    return json({
      ok: true, name: 'kerNEl API', stories: row?.n || 0, lastNews: row?.last || null,
      features: { google: !!env.GOOGLE_CLIENT_ID, apple: !!env.APPLE_CLIENT_ID, codmeAI: !!env.ANTHROPIC_API_KEY },
    });
  }

  // ---------- news ----------
  if (path === '/api/news' && m === 'GET') {
    const limit = Math.min(300, Math.max(1, Number(url.searchParams.get('limit')) || 200));
    let stories = await latestStories(env, limit);
    if (!stories.length) { // first ever request: fill the database now
      await collectNews(env);
      ctx.waitUntil(findThumbnails(env));
      stories = await latestStories(env, limit);
    }
    return json({ items: stories, sources: await sourceStatus(env), at: Date.now() }, 200, { 'Cache-Control': 'public, max-age=20' });
  }

  // ---------- auth ----------
  if ((path === '/api/auth/google' || path === '/api/auth/apple') && m === 'POST') {
    await rateLimit(env, `auth:${clientIp(request)}`, 30, 3600_000);
    const provider = path.endsWith('google') ? 'google' : 'apple';
    const body = await readJson(request, 20_000);
    const payload = await verifyIdToken(provider, body.idToken, env, { nonce: body.nonce });
    const name = typeof body.name === 'string' ? body.name.slice(0, 80) : null;
    const givenName = typeof body.givenName === 'string' ? body.givenName.slice(0, 40) : null;
    return json(await signIn(env, provider, payload, { name, givenName }));
  }
  if (path === '/api/auth/logout' && m === 'POST') {
    await signOut(request, env);
    return json({ ok: true });
  }

  // ---------- account ----------
  if (path === '/api/me' && m === 'GET') {
    return json({ user: publicUser(await requireUser(request, env)) });
  }
  if (path === '/api/me/profile' && m === 'PUT') {
    const user = await requireUser(request, env);
    const profile = cleanProfile(await readJson(request, 10_000), parse(user.profile, {}));
    await env.DB.prepare('UPDATE users SET profile = ?, updated = ? WHERE id = ?').bind(JSON.stringify(profile), Date.now(), user.id).run();
    return json({ profile });
  }
  if (path === '/api/me/data' && m === 'PUT') {
    const user = await requireUser(request, env);
    const data = cleanData(await readJson(request, 400_000));
    await env.DB.prepare('UPDATE users SET data = ?, updated = ? WHERE id = ?').bind(JSON.stringify(data), Date.now(), user.id).run();
    return json({ ok: true });
  }
  if (path === '/api/me' && m === 'DELETE') { // let people delete their account
    const user = await requireUser(request, env);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM reactions WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
    ]);
    return json({ ok: true });
  }

  // ---------- shared reactions ----------
  if (path === '/api/react' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `react:${user.id}`, 300, 3600_000);
    const body = await readJson(request, 2_000);
    const key = typeof body.key === 'string' ? body.key.slice(0, 300) : '';
    if (!key) throw new HttpError(400, 'Missing story');
    if (body.emoji == null) await env.DB.prepare('DELETE FROM reactions WHERE story_key = ? AND user_id = ?').bind(key, user.id).run();
    else if (REACTS.has(body.emoji)) {
      await env.DB.prepare('INSERT OR REPLACE INTO reactions (story_key, user_id, emoji, at) VALUES (?, ?, ?, ?)').bind(key, user.id, body.emoji, Date.now()).run();
    } else throw new HttpError(400, 'Unknown reaction');
    const counts = await reactionCounts(env, [key]);
    return json({ key, reactions: counts[key] || {} });
  }

  // ---------- codme AI ----------
  if (path === '/api/codme' && m === 'POST') {
    const user = await currentUser(request, env);
    // Generous enough for real use, tight enough that nobody can run up the bill.
    await rateLimit(env, `codme:ip:${clientIp(request)}`, Number(env.CODME_PER_IP_HOUR) || 20, 3600_000);
    if (user) await rateLimit(env, `codme:user:${user.id}`, Number(env.CODME_PER_USER_DAY) || 100, 864e5);
    await rateLimit(env, 'codme:global', Number(env.CODME_GLOBAL_DAY) || 2000, 864e5);
    const body = await readJson(request, 30_000);
    const nickname = user ? parse(user.profile, {}).nickname : null;
    return json(await codmeReply(env, body, nickname));
  }

  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: allowedOrigin(request, env) ? 204 : 403, headers: cors });
    let res;
    try {
      res = await route(request, env, ctx);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      res = json({ error: status === 500 ? 'Something went wrong on our side' : err.message }, status);
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },

  // Cron trigger (see wrangler.toml): refresh the news, then look for thumbnails.
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const r = await collectNews(env);
      const t = await findThumbnails(env, 15);
      await env.DB.prepare('DELETE FROM rate_limits WHERE reset < ?').bind(Date.now()).run();
      console.log(`news: ${r.ok}/${r.total} sources ok, ${t} thumbnails checked`);
    })());
  },
};
