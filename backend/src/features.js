// Routes for kerNEl's games and social features (index.js handles accounts, news, chat and notifications).
import { HttpError, json, readJson, rateLimit } from './util.js';
import { requireUser, currentUser } from './auth.js';
import { assertNotMuted } from './community.js';
import { listComments, postComment, deleteComment, reportComment, reactComment, follow, friends } from './social.js';
import { getQuiz, answerQuiz, quizBoard, getBattle, voteBattle, getTournament, playTournament } from './play.js';
import { explainStory, kidsNews, timeMachine } from './extras.js';
import {
  searchPeople, setBlock, listBlocked, listThreads, dmCounts, getThread, sendDM, acceptThread, hideThread, reactDM, deleteDM, reportDM,
  setPhoto, removePhoto, photoResponse, reportPhoto,
} from './people.js';
import {
  createDuel, getDuel, listDuels, startDuel, answerDuel, getLive, joinLive, answerLive, listPredictions, votePrediction,
  modCreatePrediction, modResolvePrediction,
} from './arena.js';
import { requireAdmin, overview, reports, moderateContent, moderateDmReport, moderatePhoto, moderateUser, lookupUser, modLog } from './admin.js';

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
  if (path === '/api/comments/react' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `commentreact:${user.id}`, 300, 3600_000);
    return json(await reactComment(env, user, await readJson(request, 1_000)));
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

  // ---- 🛡️ moderators ----
  if (path.startsWith('/api/mod/')) {
    const admin = await requireAdmin(request, env);
    if (path === '/api/mod/overview' && m === 'GET') return json(await overview(env));
    if (path === '/api/mod/reports' && m === 'GET') return json(await reports(env));
    if (path === '/api/mod/log' && m === 'GET') return json(await modLog(env));
    if (path === '/api/mod/user' && m === 'GET') return json(await lookupUser(env, url.searchParams.get('username')));
    const body = m === 'POST' ? await readJson(request, 2_000) : {};
    if (path === '/api/mod/content' && m === 'POST') return json(await moderateContent(env, admin, body));
    if (path === '/api/mod/dm' && m === 'POST') return json(await moderateDmReport(env, admin, body));
    if (path === '/api/mod/photo' && m === 'POST') return json(await moderatePhoto(env, admin, body));
    if (path === '/api/mod/user' && m === 'POST') return json(await moderateUser(env, admin, body));
    if (path === '/api/mod/predictions' && m === 'POST') return json(await modCreatePrediction(env, admin, body));
    if (path === '/api/mod/predictions/resolve' && m === 'POST') return json(await modResolvePrediction(env, admin, body));
    throw new HttpError(404, 'Not found');
  }

  // ---- ⚔️ duels ----
  if (path === '/api/duels' && m === 'GET') return json(await listDuels(env, await requireUser(request, env)));
  if (path === '/api/duels' && m === 'POST') {
    const user = await requireUser(request, env);
    await assertNotMuted(env, user);
    await rateLimit(env, `duel:${user.id}`, 30, 3600_000);
    return json(await createDuel(env, user, await readJson(request, 1_000), ctx));
  }
  const duel = path.match(/^\/api\/duels\/(\d+)(\/start|\/answer)?$/);
  if (duel) {
    const user = await requireUser(request, env);
    if (!duel[2] && m === 'GET') return json(await getDuel(env, user, duel[1]));
    if (duel[2] === '/start' && m === 'POST') return json(await startDuel(env, user, duel[1]));
    if (duel[2] === '/answer' && m === 'POST') return json(await answerDuel(env, user, duel[1], await readJson(request, 2_000)));
  }

  // ---- 📺 kerNEl Live ----
  if (path === '/api/live' && m === 'GET') {
    await rateLimit(env, `live:${ip}`, 6000, 3600_000);
    return json(await getLive(env, await currentUser(request, env)));
  }
  if (path === '/api/live/join' && m === 'POST') return json(await joinLive(env, await requireUser(request, env)));
  if (path === '/api/live/answer' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `liveans:${user.id}`, 200, 3600_000);
    return json(await answerLive(env, user, await readJson(request, 500)));
  }

  // ---- 🔮 predictions ----
  if (path === '/api/predictions' && m === 'GET') return json(await listPredictions(env, await currentUser(request, env)));
  if (path === '/api/predictions/vote' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `predvote:${user.id}`, 120, 3600_000);
    return json(await votePrediction(env, user, await readJson(request, 500)));
  }

  // ---- 🔍 people ----
  if (path === '/api/users/search' && m === 'GET') {
    await rateLimit(env, `search:${ip}`, 300, 3600_000);
    return json(await searchPeople(env, await currentUser(request, env), url.searchParams.get('q')));
  }
  if (path === '/api/block' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `block:${user.id}`, 60, 3600_000);
    return json(await setBlock(env, user, await readJson(request, 1_000)));
  }
  if (path === '/api/me/blocked' && m === 'GET') return json(await listBlocked(env, await requireUser(request, env)));

  // ---- ✉️ direct messages ----
  if (path === '/api/dm' && m === 'GET') {
    const user = await requireUser(request, env);
    await rateLimit(env, `dmpoll:${user.id}`, 2400, 3600_000);
    return json(url.searchParams.get('count') ? await dmCounts(env, user) : await listThreads(env, user));
  }
  if (path === '/api/dm' && m === 'POST') {
    const user = await requireUser(request, env);
    await assertNotMuted(env, user);
    await rateLimit(env, `dm:burst:${user.id}`, 6, 10_000);
    await rateLimit(env, `dm:hour:${user.id}`, 300, 3600_000);
    return json(await sendDM(env, user, await readJson(request, 6_000), ctx));
  }
  const thread = path.match(/^\/api\/dm\/(\d+)$/);
  if (thread && m === 'GET') {
    const user = await requireUser(request, env);
    await rateLimit(env, `dmpoll:${user.id}`, 2400, 3600_000);
    return json(await getThread(env, user, thread[1], Number(url.searchParams.get('since')) || 0));
  }
  if (path === '/api/dm/accept' && m === 'POST') return json(await acceptThread(env, await requireUser(request, env), await readJson(request, 1_000)));
  if (path === '/api/dm/hide' && m === 'POST') return json(await hideThread(env, await requireUser(request, env), await readJson(request, 1_000)));
  if (path === '/api/dm/react' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `dmreact:${user.id}`, 300, 3600_000);
    return json(await reactDM(env, user, await readJson(request, 1_000)));
  }
  if (path === '/api/dm/report' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `dmreport:${user.id}`, 20, 3600_000);
    return json(await reportDM(env, user, await readJson(request, 1_000)));
  }
  const dmDel = path.match(/^\/api\/dm\/messages\/(\d+)$/);
  if (dmDel && m === 'DELETE') return json(await deleteDM(env, await requireUser(request, env), dmDel[1]));

  // ---- 📷 profile photos ----
  if (path === '/api/me/photo' && m === 'PUT') {
    const user = await requireUser(request, env);
    await rateLimit(env, `photo:${user.id}`, 20, 3600_000);
    return json(await setPhoto(env, user, await readJson(request, 450_000)));
  }
  if (path === '/api/me/photo' && m === 'DELETE') return json(await removePhoto(env, await requireUser(request, env)));
  const photo = path.match(/^\/api\/photo\/([A-Za-z0-9_]{1,20})$/);
  if (photo && m === 'GET') {
    await rateLimit(env, `photoget:${ip}`, 6000, 3600_000);
    return photoResponse(env, photo[1]);
  }
  if (path === '/api/photo/report' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `photoreport:${user.id}`, 30, 3600_000);
    return json(await reportPhoto(env, user, await readJson(request, 1_000)));
  }

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
