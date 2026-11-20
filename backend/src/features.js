// Routes for kerNEl's games and social features (index.js handles accounts, news, chat and notifications).
import { HttpError, json, readJson, rateLimit } from './util.js';
import { requireUser, currentUser } from './auth.js';
import { assertNotMuted } from './community.js';
import { listComments, postComment, deleteComment, reportComment, follow, friends } from './social.js';
import { getQuiz, answerQuiz, quizBoard, getBattle, voteBattle, getTournament, playTournament } from './play.js';
import { explainStory, kidsNews, timeMachine } from './extras.js';

/** Returns a Response, or null when the path isn't one of these. */
export async function featureRoute(request, env, ctx, { path, m, url, ip }) {
  // ---- 🗨️ story comments ----
  if (path === '/api/comments' && m === 'GET') {
    await rateLimit(env, `comments:ip:${ip}`, 1200, 3600_000);
    return json(await listComments(env, await currentUser(request, env), url.searchParams.get('key')));
  }
  if (path === '/api/comments' && m === 'POST') {
    const user = await requireUser(request, env);
    await assertNotMuted(env, user);
    await rateLimit(env, `comment:burst:${user.id}`, 5, 60_000);
    await rateLimit(env, `comment:hour:${user.id}`, 60, 3600_000);
    return json(await postComment(env, user, await readJson(request, 3_000), ctx));
  }
  if (path === '/api/comments/report' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `commentreport:${user.id}`, 30, 3600_000);
    return json(await reportComment(env, user, await readJson(request, 1_000)));
  }
  const delC = path.match(/^\/api\/comments\/(\d+)$/);
  if (delC && m === 'DELETE') return json(await deleteComment(env, await requireUser(request, env), delC[1]));

  // ---- 👯 friends ----
  if (path === '/api/follow' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `follow:${user.id}`, 100, 3600_000);
    return json(await follow(env, user, await readJson(request, 1_000)));
  }
  if (path === '/api/me/friends' && m === 'GET') return json(await friends(env, await requireUser(request, env)));

  // ---- 🧠 Daily Kernel Quiz ----
  if (path === '/api/quiz' && m === 'GET') return json(await getQuiz(env, await currentUser(request, env)));
  if (path === '/api/quiz' && m === 'POST') {
    const user = await currentUser(request, env);
    await rateLimit(env, `quiz:${user ? user.id : ip}`, 20, 3600_000);
    return json(await answerQuiz(env, user, await readJson(request, 2_000)));
  }
  if (path === '/api/quiz/board' && m === 'GET') return json({ board: await quizBoard(env) }, 200, { 'Cache-Control': 'public, max-age=30' });

  // ---- 🍿 Popcorn Battle ----
  if (path === '/api/battle' && m === 'GET') return json(await getBattle(env, await currentUser(request, env)));
  if (path === '/api/battle' && m === 'POST') return json(await voteBattle(env, await requireUser(request, env), await readJson(request, 1_000)));

  // ---- 🏆 weekly tournament ----
  if (path === '/api/tournament' && m === 'GET') return json(await getTournament(env, await currentUser(request, env)));
  if (path === '/api/tournament' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `tourney:${user.id}`, 20, 3600_000);
    return json(await playTournament(env, user, await readJson(request, 2_000)));
  }

  // ---- 🧠 explain / TL;DR ----
  if (path === '/api/explain' && m === 'POST') {
    const body = await readJson(request, 2_000);
    const user = await currentUser(request, env);
    await rateLimit(env, `explain:ip:${ip}`, Number(env.EXPLAIN_PER_IP_HOUR) || 40, 3600_000);
    if (user) await rateLimit(env, `explain:user:${user.id}`, 150, 864e5);
    try {
      return json(await explainStory(env, body));
    } catch (e) {
      if (e instanceof HttpError && e.status === 503) return json({ error: e.message, offline: true }, 503);
      throw e;
    }
  }

  // ---- 🧸 kid news + 📼 time machine ----
  if (path === '/api/kids/news' && m === 'GET') return json(await kidsNews(env), 200, { 'Cache-Control': 'public, max-age=600' });
  if (path === '/api/timemachine' && m === 'GET') {
    await rateLimit(env, `tm:${ip}`, 60, 3600_000);
    return json(await timeMachine(env, url.searchParams.get('date')), 200, { 'Cache-Control': 'public, max-age=3600' });
  }
  return null;
}
