// kerNEl API — Cloudflare Worker entry point.
import { HttpError, json, readJson, corsHeaders, allowedOrigin, clientIp, rateLimit, isAdmin, isOwner } from './util.js';
import { collectNews, findThumbnails, latestStories, sourceStatus, reactionCounts } from './news.js';
import {
  register, login, recover, changePassword, newCodeFor, usernameAvailable, checkin,
  requireUser, currentUser, signOut, publicUser, cleanProfile, mergeDataPatch, REACTS,
} from './auth.js';
import { codmeReply } from './codme.js';
import { assertNotMuted, listMessages, postMessage, reactMessage, reportMessage, deleteMessage, publicProfile, getPoll, votePoll, cleanText } from './community.js';
import { getDB, KernelDB } from './db.js';
import { featureRoute } from './features.js';
import { look, cleanLook, trophyCount, commentCounts, activityFromData, recordActivity, STREAK_MILESTONES } from './social.js';
import { awardTrophies } from './play.js';
import { statsOf, claimXp, myInvites } from './rewards.js';
import { forgetGroupsOf } from './groups.js';
import { sendMorningDrops, notifyTopics } from './discover.js';
import { updatePrices, awardMarket } from './market.js';
import { weekUpdate, forgetSquadOf } from './squads.js';
import { ownedFor, cleanShopLook, BUTTER_SQL } from './shop.js';
import { ownsLook } from '../../js/shop-data.js';
import { remindParties } from './parties.js';
import { makeDailyDebate, settleDebates } from './debates.js';
import { dropPopStatements } from './pops.js';
import { seasonBoard, seasonUpdate, remindLive, makeAutoPredictions, resolveAutoPredictions, awardSeason, seasonMedals } from './arena.js';
import { vapidPublicKey, subscribe, unsubscribe, getPrefs, savePrefs, listNotifications, markRead, testPush, notifyMentions, notifyBigNews, notifyStreaks, MAX_PUSHES_PER_RUN } from './push.js';

export { KernelDB };

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
const NOTIFY_CRON = '2-59/5 * * * *';
const RANKS = [[0, 'Unpopped Kernel', '🌽'], [50, 'Warm Kernel', '♨️'], [150, 'Sizzling Kernel', '🔥'], [300, 'Freshly Popped', '🍿'], [600, 'Butter Baron', '🧈'], [1000, 'Popcorn Overlord', '👑'], [2000, 'Galactic Snack Deity', '🌌']];
const rankOf = (xp) => [...RANKS].reverse().find(([min]) => xp >= min);

/** 🛡️ Someone is no longer a moderator: take off the looks only moderators had and save the profile (as JSON). */
async function dropModLooks(env, user, trophies) {
  const { modPerks, ...prev } = parse(user.profile, {});
  const owned = ownedFor(env, user);
  const profile = { ...prev, ...cleanLook(null, prev, { ...statsOf(user), xp: user.xp || 0, trophies, owned }), ...cleanShopLook(null, prev, owned) };
  const saved = JSON.stringify(profile);
  await env.DB.prepare('UPDATE users SET profile = ? WHERE id = ?').bind(saved, user.id).run();
  return saved;
}

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
    let user = await requireUser(request, env);
    const admin = isAdmin(env, user);
    const trophies = await trophyCount(env, user.id);
    // 🛡️ someone who stopped being a moderator takes off the looks only moderators have (once)
    if (!admin && parse(user.profile, {}).modPerks) user = { ...user, profile: await dropModLooks(env, user, trophies) };
    return json({ user: { ...publicUser(user), trophies, stats: statsOf(user), pendingXp: user.pending_xp || 0, admin, owner: isOwner(env, user) } });
  }
  if (path === '/api/me/claim' && m === 'POST') {
    const user = await requireUser(request, env);
    return json(await claimXp(env, user));
  }
  if (path === '/api/me/invites' && m === 'GET') {
    return json(await myInvites(env, await requireUser(request, env)));
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
    const owned = ownedFor(env, user);
    const admin = isAdmin(env, user);
    const profile = { ...cleanProfile(body, prev), ...cleanLook(body, prev, { ...statsOf(user), xp: user.xp || 0, trophies: await trophyCount(env, user.id), owned, admin }), ...cleanShopLook(body, prev, owned) };
    if (admin) profile.modPerks = true; // so the moderator looks come off if they stop being one
    if (typeof body.bio === 'string') profile.bio = cleanText(body.bio.replace(/\s+/g, ' ')).slice(0, 80);
    if (['everyone', 'following', 'nobody'].includes(body.dms)) profile.dms = body.dms;
    await env.DB.prepare('UPDATE users SET profile = ?, on_board = ?, updated = ? WHERE id = ?').bind(JSON.stringify(profile), profile.leaderboard ? 1 : 0, Date.now(), user.id).run();
    return json({ profile });
  }
  if (path === '/api/me/data' && (m === 'PUT' || m === 'PATCH')) { // partial updates are merged
    const user = await requireUser(request, env);
    await rateLimit(env, `data:${user.id}`, 600, 3600_000);
    const before = parse(user.data, {});
    const data = mergeDataPatch(before, await readJson(request, 400_000));
    await env.DB.prepare(`UPDATE users SET data = ?, ${BUTTER_SQL}, xp = ?, updated = ? WHERE id = ?`).bind(JSON.stringify(data), data.xp || 0, data.xp || 0, data.xp || 0, Date.now(), user.id).run();
    const gained = (data.xp || 0) - (user.xp || 0);
    if (gained > 0) await env.DB.batch([seasonUpdate(env, user, gained), weekUpdate(env, user, gained)]);
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
    // 👑 whoever signed up with this name next would become the owner, so the owner account stays
    if (isOwner(env, user)) throw new HttpError(400, 'The owner account can’t be deleted. Change OWNER in wrangler.toml first.');
    await forgetSquadOf(env, user);
    await forgetGroupsOf(env, user); // leave every group first (hands over the ones they started)
    await env.DB.batch([
      ...dropPopStatements(env, 'user_id = ?', user.id),
      env.DB.prepare('DELETE FROM pop_views WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM pop_reports WHERE reporter_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM typing WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM topic_follows WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM stock_wallets WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM stock_holdings WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM bingo_claims WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM guess_scores WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM user_cards WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM card_packs WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM card_trades WHERE from_id = ? OR to_id = ?').bind(user.id, user.id),
      env.DB.prepare('DELETE FROM party_messages WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM party_rsvps WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM party_viewers WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM party_reports WHERE reporter_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM debate_likes WHERE user_id = ? OR arg_id IN (SELECT id FROM debate_args WHERE user_id = ?)').bind(user.id, user.id),
      env.DB.prepare('DELETE FROM debate_reports WHERE reporter_id = ? OR arg_id IN (SELECT id FROM debate_args WHERE user_id = ?)').bind(user.id, user.id),
      env.DB.prepare('DELETE FROM debate_args WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM debate_votes WHERE user_id = ?').bind(user.id),
      env.DB.prepare('UPDATE debates SET created_by = NULL WHERE created_by = ?').bind(user.id),
      env.DB.prepare('DELETE FROM chat_poll_votes WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM topic_alerts WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM voice_notes WHERE user_id = ? OR scope IN (SELECT \'d:\' || thread_id FROM dm_members WHERE user_id = ?)').bind(user.id, user.id),
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
      env.DB.prepare('DELETE FROM comment_reacts WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM follows WHERE follower_id = ? OR followee_id = ?').bind(user.id, user.id),
      env.DB.prepare('DELETE FROM activity WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM quiz_scores WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM battle_votes WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM tourney_scores WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM trophies WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM dm_messages WHERE thread_id IN (SELECT thread_id FROM dm_members WHERE user_id = ?)').bind(user.id),
      env.DB.prepare('DELETE FROM dm_threads WHERE id IN (SELECT thread_id FROM dm_members WHERE user_id = ?)').bind(user.id),
      env.DB.prepare('DELETE FROM dm_members WHERE user_id = ? OR other_id = ?').bind(user.id, user.id),
      env.DB.prepare('DELETE FROM dm_reports WHERE reporter_id = ? OR user_id = ?').bind(user.id, user.id),
      env.DB.prepare('DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?').bind(user.id, user.id),
      env.DB.prepare('DELETE FROM photos WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM photo_reports WHERE owner_id = ? OR reporter_id = ?').bind(user.id, user.id),
      env.DB.prepare('DELETE FROM invites WHERE invitee_id = ? OR inviter_id = ?').bind(user.id, user.id),
      env.DB.prepare('DELETE FROM duels WHERE a = ? OR b = ?').bind(user.id, user.id),
      env.DB.prepare('DELETE FROM live_players WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM live_answers WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM prediction_votes WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM season_winners WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
    ]);
    return json({ ok: true });
  }

  // ---------- leaderboard ----------
  if (path === '/api/leaderboard' && m === 'GET' && url.searchParams.get('season')) return json(await seasonBoard(env, await currentUser(request, env)));
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
  if (prof && m === 'GET' && prof[1].toLowerCase() !== 'search') {
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
    // the personality: the one saved on the account (checked against purchases), or a free one for guests
    const persona = user ? parse(user.profile, {}).persona : ownsLook('persona', body.persona, []) ? body.persona : 'classic';
    return json(await codmeReply(env, { ...body, persona }, nickname));
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
      // a maintainer can see the real error by sending the DEBUG_KEY set at deploy time (it's never set normally)
      const debug = status === 500 && env.DEBUG_KEY && request.headers.get('X-Debug-Key') === env.DEBUG_KEY;
      res = json({ error: status === 500 ? 'Something went wrong on our side' : err.message, ...(debug ? { debug: String(err?.stack || err).slice(0, 1500) } : {}) }, status);
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
        await remindLive(env, budget).catch((e) => console.error('live reminder', e));
        await sendMorningDrops(env, budget).catch((e) => console.error('morning drop', e));
        await notifyTopics(env, budget).catch((e) => console.error('topic alerts', e));
        await remindParties(env, budget).catch((e) => console.error('party reminders', e));
        await awardTrophies(env).catch((e) => console.error('trophies', e));
        await env.DB.prepare('DELETE FROM notifications WHERE created < ?').bind(Date.now() - 30 * 864e5).run();
        console.log(`notifications: ${news} news pushes, ${streaks} streak pushes`);
      })());
      return;
    }
    ctx.waitUntil((async () => {
      // the quick jobs go first, so a slow news run can never crowd them out
      await makeAutoPredictions(env).catch((e) => console.error('predictions', e));
      await resolveAutoPredictions(env).catch((e) => console.error('predictions', e));
      await awardSeason(env).catch((e) => console.error('season', e));
      await updatePrices(env).catch((e) => console.error('stocks', e));
      await awardMarket(env).catch((e) => console.error('stocks award', e));
      await makeDailyDebate(env).catch((e) => console.error('debate', e));
      await settleDebates(env).catch((e) => console.error('debates', e));
      if (new Date().getUTCMinutes() < 5 || event.cron === 'cleanup') await env.DB.batch([ // the clean-up runs once an hour
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
        env.DB.prepare('DELETE FROM comment_reacts WHERE comment_id NOT IN (SELECT id FROM comments WHERE hidden = 0)'),
        // old games and caches: explanations go with their story; quizzes, battles and picks after a while
        env.DB.prepare("DELETE FROM kv WHERE k LIKE 'x:%' AND substr(k, 3) NOT IN (SELECT key FROM stories)"),
        env.DB.prepare("DELETE FROM kv WHERE (k LIKE 'quiz:%' OR k LIKE 'battle:%') AND substr(k, instr(k, ':') + 1) < ?").bind(new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10)),
        env.DB.prepare("DELETE FROM kv WHERE k LIKE 'kidsnews:%' AND substr(k, -10) < ?").bind(new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)),
        env.DB.prepare("DELETE FROM kv WHERE k LIKE 'tm:%' AND k NOT LIKE ?").bind(`tm:${new Date().getUTCFullYear()}:%`),
        env.DB.prepare('DELETE FROM quiz_scores WHERE day < ?').bind(new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10)),
        env.DB.prepare('DELETE FROM dm_messages WHERE created < ?').bind(Date.now() - 365 * 864e5), // messages keep a year
        env.DB.prepare('DELETE FROM dm_reports WHERE at < ?').bind(Date.now() - 30 * 864e5),
        env.DB.prepare('DELETE FROM live_players WHERE at < ?').bind(Date.now() - 3 * 864e5),
        env.DB.prepare('DELETE FROM live_answers WHERE at < ?').bind(Date.now() - 3 * 864e5),
        env.DB.prepare("DELETE FROM kv WHERE k LIKE 'live:%' AND substr(k, 6, 10) < ?").bind(new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)),
        env.DB.prepare('DELETE FROM duels WHERE created < ?').bind(Date.now() - 60 * 864e5),
        env.DB.prepare('DELETE FROM prediction_votes WHERE pred_id IN (SELECT id FROM predictions WHERE resolved < ?)').bind(Date.now() - 60 * 864e5),
        env.DB.prepare('DELETE FROM predictions WHERE resolved < ?').bind(Date.now() - 60 * 864e5),
        env.DB.prepare('DELETE FROM battle_votes WHERE day < ?').bind(new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10)),
        ...dropPopStatements(env, 'expires < ?', Date.now()), // 🫧 pops last a day
        env.DB.prepare('DELETE FROM typing WHERE at < ?').bind(Date.now() - 60_000),
        env.DB.prepare('DELETE FROM topic_alerts WHERE at < ?').bind(Date.now() - 3 * 864e5),
        env.DB.prepare('DELETE FROM stock_wallets WHERE week < ?').bind(new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10)),
        env.DB.prepare('DELETE FROM stock_holdings WHERE week < ?').bind(new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10)),
        env.DB.prepare('DELETE FROM guess_scores WHERE day < ?').bind(new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10)),
        env.DB.prepare("DELETE FROM kv WHERE (k LIKE 'guess:%' OR k LIKE 'bingo:hits:%') AND substr(k, -10) < ?").bind(new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10)),
        env.DB.prepare("DELETE FROM card_trades WHERE status != 'open' AND created < ?").bind(Date.now() - 90 * 864e5),
        env.DB.prepare('DELETE FROM party_hype WHERE bucket < ?').bind(Math.floor((Date.now() - 864e5) / 2000)),
        env.DB.prepare('DELETE FROM party_viewers WHERE at < ?').bind(Date.now() - 864e5),
        env.DB.prepare('DELETE FROM squad_invites WHERE at < ?').bind(Date.now() - 14 * 864e5),
        // watch parties (with their chat) go 30 days after they end
        env.DB.prepare('DELETE FROM party_reports WHERE msg_id IN (SELECT m.id FROM party_messages m JOIN parties p ON p.id = m.party_id WHERE p.ends < ?)').bind(Date.now() - 30 * 864e5),
        env.DB.prepare('DELETE FROM party_messages WHERE party_id IN (SELECT id FROM parties WHERE ends < ?)').bind(Date.now() - 30 * 864e5),
        env.DB.prepare('DELETE FROM party_rsvps WHERE party_id IN (SELECT id FROM parties WHERE ends < ?)').bind(Date.now() - 30 * 864e5),
        env.DB.prepare('DELETE FROM parties WHERE ends < ?').bind(Date.now() - 30 * 864e5),
        env.DB.prepare('DELETE FROM debate_likes WHERE arg_id IN (SELECT a.id FROM debate_args a JOIN debates d ON d.id = a.debate_id WHERE d.closes < ?)').bind(Date.now() - 60 * 864e5),
        env.DB.prepare('DELETE FROM debate_reports WHERE arg_id IN (SELECT a.id FROM debate_args a JOIN debates d ON d.id = a.debate_id WHERE d.closes < ?)').bind(Date.now() - 60 * 864e5),
        env.DB.prepare('DELETE FROM debate_args WHERE debate_id IN (SELECT id FROM debates WHERE closes < ?)').bind(Date.now() - 60 * 864e5),
        env.DB.prepare('DELETE FROM debate_votes WHERE debate_id IN (SELECT id FROM debates WHERE closes < ?)').bind(Date.now() - 60 * 864e5),
        env.DB.prepare('DELETE FROM debates WHERE closes < ?').bind(Date.now() - 60 * 864e5),
        env.DB.prepare("DELETE FROM kv WHERE k LIKE 'tl:%' AND substr(k, 4) NOT IN (SELECT key FROM stories)"), // timelines go with their story
        env.DB.prepare("DELETE FROM group_messages WHERE created < ? AND kind = 'msg'").bind(Date.now() - 365 * 864e5), // group messages keep a year
        env.DB.prepare('DELETE FROM group_reports WHERE msg_id NOT IN (SELECT id FROM group_messages)'),
        env.DB.prepare('DELETE FROM voice_notes WHERE created < ?').bind(Date.now() - 366 * 864e5),
        env.DB.prepare("DELETE FROM voice_notes WHERE scope LIKE 'd:%' AND CAST(substr(scope, 3) AS INTEGER) NOT IN (SELECT id FROM dm_threads)"),
        env.DB.prepare("DELETE FROM voice_notes WHERE scope LIKE 'g:%' AND CAST(substr(scope, 3) AS INTEGER) NOT IN (SELECT id FROM chat_groups)"),
      ]).catch((e) => console.error('cleanup', e));
      const r = await collectNews(env);
      const t = await findThumbnails(env, 8);
      console.log(`news: ${r.ok}/${r.total} sources ok, ${t} thumbnails checked`);
    })());
  },
};
