// kerNEl API — Cloudflare Worker entry point.
import { HttpError, json, readJson, corsHeaders, allowedOrigin, clientIp, rateLimit } from './util.js';
import { collectNews, findThumbnails, latestStories, sourceStatus, reactionCounts } from './news.js';
import {
  register, login, recover, changePassword, newCodeFor, usernameAvailable, checkin,
  requireUser, currentUser, signOut, publicUser, cleanProfile, mergeDataPatch, REACTS,
} from './auth.js';
import { codmeReply } from './codme.js';
import { assertNotMuted, listMessages, postMessage, reactMessage, reportMessage, deleteMessage, publicProfile, getPoll, votePoll } from './community.js';
import { getDB, KernelDB } from './db.js';
import { featureRoute } from './features.js';
import { look, cleanLook, trophyCount, commentCounts, activityFromData, recordActivity, STREAK_MILESTONES } from './social.js';
import { awardTrophies } from './play.js';
import { vapidPublicKey, subscribe, unsubscribe, getPrefs, savePrefs, listNotifications, markRead, testPush, notifyMentions, notifyBigNews, notifyStreaks, MAX_PUSHES_PER_RUN } from './push.js';

export { KernelDB };

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
const NOTIFY_CRON = '2-59/5 * * * *';
const RANKS = [[0, 'Unpopped Kernel', '🌽'], [50, 'Warm Kernel', '♨️'], [150, 'Sizzling Kernel', '🔥'], [300, 'Freshly Popped', '🍿'], [600, 'Butter Baron', '🧈'], [1000, 'Popcorn Overlord', '👑'], [2000, 'Galactic Snack Deity', '🌌']];
const rankOf = (xp) => [...RANKS].reverse().find(([min]) => xp >= min);

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const m = request.method;
  const ip = clientIp(request);

  if (path === '/' || path === '/api/health') {
    const row = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM stories) AS n, (SELECT MAX(first_seen) FROM stories) AS last, (SELECT COUNT(*) FROM users) AS users').first();
    return json({ ok: true, name: 'kerNEl API', stories: row?.n || 0, lastNews: row?.last || null, users: row?.users || 0, features: { accounts: true, codmeAI: !!env.ANTHROPIC_API_KEY, explainAI: !!env.ANTHROPIC_API_KEY } });
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
    const comments = await commentCounts(env, stories.map((s) => s.key));
    for (const s of stories) if (comments[s.key]) s.commentCount = comments[s.key];
    return json({ items: stories, sources: await sourceStatus(env), at: Date.now() }, 200, { 'Cache-Control': 'public, max-age=20' });
  }

  // ---------- accounts ----------
  if (path === '/api/auth/available' && m === 'GET') {
    await rateLimit(env, `avail:${ip}`, 120, 3600_000);
    return json(await usernameAvailable(env, url.searchParams.get('username')));
  }
  if (path === '/api/auth/register' && m === 'POST') {
    await rateLimit(env, `register:${ip}`, Number(env.SIGNUPS_PER_IP_HOUR) || 5, 3600_000);
    return json(await register(env, await readJson(request, 5_000)));
  }
  if (path === '/api/auth/login' && m === 'POST') {
    const body = await readJson(request, 5_000);
    await rateLimit(env, `login:ip:${ip}`, 30, 15 * 60_000);
    await rateLimit(env, `login:user:${String(body.username || '').toLowerCase().slice(0, 30)}`, 10, 15 * 60_000);
    return json(await login(env, body));
  }
  if (path === '/api/auth/recover' && m === 'POST') {
    const body = await readJson(request, 5_000);
    await rateLimit(env, `recover:ip:${ip}`, 10, 3600_000);
    await rateLimit(env, `recover:user:${String(body.username || '').toLowerCase().slice(0, 30)}`, 5, 3600_000);
    return json(await recover(env, body));
  }
  if (path === '/api/auth/logout' && m === 'POST') {
    await signOut(request, env);
    return json({ ok: true });
  }

  if (path === '/api/me' && m === 'GET') {
    const user = await requireUser(request, env);
    return json({ user: { ...publicUser(user), trophies: await trophyCount(env, user.id) } });
  }
  if (path === '/api/me/password' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `pw:${user.id}`, 10, 3600_000);
    return json(await changePassword(env, request, user, await readJson(request, 5_000)));
  }
  if (path === '/api/me/recovery-code' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `pw:${user.id}`, 10, 3600_000);
    return json(await newCodeFor(env, user, await readJson(request, 5_000)));
  }
  if (path === '/api/me/profile' && m === 'PUT') {
    const user = await requireUser(request, env);
    const body = await readJson(request, 10_000);
    const prev = parse(user.profile, {});
    const profile = { ...cleanProfile(body, prev), ...cleanLook(body, prev, { xp: user.xp || 0, trophies: await trophyCount(env, user.id) }) };
    await env.DB.prepare('UPDATE users SET profile = ?, on_board = ?, updated = ? WHERE id = ?').bind(JSON.stringify(profile), profile.leaderboard ? 1 : 0, Date.now(), user.id).run();
    return json({ profile });
  }
  if (path === '/api/me/data' && (m === 'PUT' || m === 'PATCH')) { // partial updates are merged
    const user = await requireUser(request, env);
    await rateLimit(env, `data:${user.id}`, 600, 3600_000);
    const before = parse(user.data, {});
    const data = mergeDataPatch(before, await readJson(request, 400_000));
    await env.DB.prepare('UPDATE users SET data = ?, xp = ?, updated = ? WHERE id = ?').bind(JSON.stringify(data), data.xp || 0, Date.now(), user.id).run();
    const events = activityFromData({ ...before, xp: user.xp || 0 }, data); // rank-ups and new badges → friends' feed
    if (events.length) ctx.waitUntil(recordActivity(env, user, events).catch((e) => console.error('activity', e)));
    return json({ ok: true, xp: data.xp || 0 });
  }
  if (path === '/api/me/checkin' && m === 'POST') {
    const user = await requireUser(request, env);
    const r = await checkin(env, user);
    if (!r.already && STREAK_MILESTONES.has(r.streak)) ctx.waitUntil(recordActivity(env, user, [{ kind: 'streak', data: { n: r.streak }, push: r.streak >= 7 }]).catch((e) => console.error('activity', e)));
    return json(r);
  }
  if (path === '/api/me' && m === 'DELETE') { // delete the account and everything in it
    const user = await requireUser(request, env);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM reactions WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM chat_messages WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM chat_reacts WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM presence WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM poll_votes WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM push_subs WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM notify_prefs WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM notifications WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM comments WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM comment_reports WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM follows WHERE follower_id = ? OR followee_id = ?').bind(user.id, user.id),
      env.DB.prepare('DELETE FROM activity WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM quiz_scores WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM battle_votes WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM tourney_scores WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM trophies WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
    ]);
    return json({ ok: true });
  }

  // ---------- leaderboard ----------
  if (path === '/api/leaderboard' && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, username, profile, xp, streak, last_day FROM users WHERE on_board = 1 AND xp > 0 ORDER BY xp DESC, created ASC LIMIT 20').all();
    const top = results.map((r, i) => {
      const p = parse(r.profile, {});
      const [, title, emoji] = rankOf(r.xp);
      const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      return { place: i + 1, username: r.username, nickname: p.nickname || r.username, ...look(p), xp: r.xp, streak: r.last_day >= yesterday ? r.streak : 0, rank: title, rankEmoji: emoji };
    });
    let me = null;
    const user = await currentUser(request, env);
    if (user) {
      const ahead = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE on_board = 1 AND xp > ?').bind(user.xp).first();
      me = { place: user.on_board ? (ahead?.n || 0) + 1 : null, xp: user.xp, onBoard: !!user.on_board };
    }
    return json({ top, me }, 200, user ? {} : { 'Cache-Control': 'public, max-age=60' });
  }

  // ---------- community: chat, profiles, daily poll ----------
  if (path === '/api/chat' && m === 'GET') {
    await rateLimit(env, `chatpoll:${ip}`, 2400, 3600_000);
    const user = await currentUser(request, env);
    return json(await listMessages(env, user, url.searchParams.get('room') || 'lobby', Number(url.searchParams.get('since')) || 0));
  }
  if (path === '/api/chat' && m === 'POST') {
    const user = await requireUser(request, env);
    await assertNotMuted(env, user);
    await rateLimit(env, `chat:burst:${user.id}`, 4, 10_000);
    await rateLimit(env, `chat:hour:${user.id}`, 120, 3600_000);
    const posted = await postMessage(env, user, await readJson(request, 5_000), ctx);
    ctx.waitUntil(notifyMentions(env, user, posted.message).catch((e) => console.error('mentions', e)));
    return json(posted);
  }
  if (path === '/api/chat/react' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `chatreact:${user.id}`, 300, 3600_000);
    return json(await reactMessage(env, user, await readJson(request, 1_000)));
  }
  if (path === '/api/chat/report' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `chatreport:${user.id}`, 30, 3600_000);
    return json(await reportMessage(env, user, await readJson(request, 1_000)));
  }
  const del = path.match(/^\/api\/chat\/(\d+)$/);
  if (del && m === 'DELETE') return json(await deleteMessage(env, await requireUser(request, env), del[1]));
  const prof = path.match(/^\/api\/users\/([A-Za-z0-9_]{1,20})$/);
  if (prof && m === 'GET') {
    const viewer = await currentUser(request, env);
    return json(await publicProfile(env, prof[1], viewer), 200, { 'Cache-Control': viewer ? 'private, no-store' : 'public, max-age=30' });
  }
  if (path === '/api/poll' && m === 'GET') return json(await getPoll(env, await currentUser(request, env)));
  if (path === '/api/poll' && m === 'POST') {
    const user = await requireUser(request, env);
    return json(await votePoll(env, user, await readJson(request, 1_000)));
  }

  // ---------- notifications ----------
  if (path === '/api/push/key' && m === 'GET') return json({ publicKey: await vapidPublicKey(env) }, 200, { 'Cache-Control': 'public, max-age=3600' });
  if (path === '/api/push/subscribe' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `pushsub:${user.id}`, 30, 3600_000);
    return json(await subscribe(env, user, await readJson(request, 5_000)));
  }
  if (path === '/api/push/unsubscribe' && m === 'POST') return json(await unsubscribe(env, await requireUser(request, env), await readJson(request, 5_000)));
  if (path === '/api/push/test' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `pushtest:${user.id}`, 5, 3600_000);
    return json(await testPush(env, user));
  }
  if (path === '/api/notify/prefs' && m === 'GET') return json(await getPrefs(env, await requireUser(request, env)));
  if (path === '/api/notify/prefs' && m === 'PUT') return json(await savePrefs(env, await requireUser(request, env), await readJson(request, 2_000)));
  if (path === '/api/notifications' && m === 'GET') return json(await listNotifications(env, await requireUser(request, env)));
  if (path === '/api/notifications/read' && m === 'POST') return json(await markRead(env, await requireUser(request, env), await readJson(request, 1_000)));

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
    await rateLimit(env, `codme:ip:${ip}`, Number(env.CODME_PER_IP_HOUR) || 20, 3600_000);
    if (user) await rateLimit(env, `codme:user:${user.id}`, Number(env.CODME_PER_USER_DAY) || 100, 864e5);
    await rateLimit(env, 'codme:global', Number(env.CODME_GLOBAL_DAY) || 2000, 864e5);
    const body = await readJson(request, 30_000);
    const nickname = user ? parse(user.profile, {}).nickname : null;
    return json(await codmeReply(env, body, nickname));
  }

  const extra = await featureRoute(request, env, ctx, { path, m, url, ip });
  if (extra) return extra;

  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(request, rawEnv, ctx) {
    const env = { ...rawEnv, DB: getDB(rawEnv) };
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

  // Cron triggers (see wrangler.toml). Each run has its own subrequest budget, so the work is split:
  //   "*/5 * * * *"    → refresh the news, find thumbnails, tidy up
  //   "2-59/5 * * * *" → big-news alerts and streak reminders (push notifications)
  async scheduled(event, rawEnv, ctx) {
    const env = { ...rawEnv, DB: getDB(rawEnv) };
    if (event.cron === NOTIFY_CRON) {
      ctx.waitUntil((async () => {
        const budget = { left: MAX_PUSHES_PER_RUN };
        const news = await notifyBigNews(env, budget);
        const streaks = await notifyStreaks(env, budget);
        await awardTrophies(env).catch((e) => console.error('trophies', e));
        await env.DB.prepare('DELETE FROM notifications WHERE created < ?').bind(Date.now() - 30 * 864e5).run();
        console.log(`notifications: ${news} news pushes, ${streaks} streak pushes`);
      })());
      return;
    }
    ctx.waitUntil((async () => {
      const r = await collectNews(env);
      const t = await findThumbnails(env, 15);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM rate_limits WHERE reset < ?').bind(Date.now()),
        env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(Date.now()),
        env.DB.prepare('DELETE FROM presence WHERE at < ?').bind(Date.now() - 864e5),
        env.DB.prepare('DELETE FROM mutes WHERE until < ?').bind(Date.now()),
        env.DB.prepare('DELETE FROM chat_messages WHERE created < ?').bind(Date.now() - 30 * 864e5), // chat keeps 30 days
        env.DB.prepare('DELETE FROM chat_reacts WHERE msg_id NOT IN (SELECT id FROM chat_messages)'),
        env.DB.prepare('DELETE FROM chat_reports WHERE msg_id NOT IN (SELECT id FROM chat_messages)'),
        env.DB.prepare('DELETE FROM alerted_stories WHERE at < ?').bind(Date.now() - 3 * 864e5),
        env.DB.prepare('DELETE FROM activity WHERE created < ?').bind(Date.now() - 30 * 864e5),
        env.DB.prepare('DELETE FROM comment_reports WHERE comment_id NOT IN (SELECT id FROM comments)'),
        // old games and caches: explanations go with their story; quizzes, battles and picks after a while
        env.DB.prepare("DELETE FROM kv WHERE k LIKE 'x:%' AND substr(k, 3) NOT IN (SELECT key FROM stories)"),
        env.DB.prepare("DELETE FROM kv WHERE (k LIKE 'quiz:%' OR k LIKE 'battle:%') AND substr(k, instr(k, ':') + 1) < ?").bind(new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10)),
        env.DB.prepare("DELETE FROM kv WHERE k LIKE 'kidsnews:%' AND substr(k, -10) < ?").bind(new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)),
        env.DB.prepare("DELETE FROM kv WHERE k LIKE 'tm:%' AND k NOT LIKE ?").bind(`tm:${new Date().getUTCFullYear()}:%`),
        env.DB.prepare('DELETE FROM quiz_scores WHERE day < ?').bind(new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10)),
        env.DB.prepare('DELETE FROM battle_votes WHERE day < ?').bind(new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10)),
      ]);
      console.log(`news: ${r.ok}/${r.total} sources ok, ${t} thumbnails checked`);
    })());
  },
};
