// Routes for kerNEl's games and social features (index.js handles accounts, news, chat and notifications).
import { HttpError, json, readJson, rateLimit } from './util.js';
import { requireUser, currentUser } from './auth.js';
import { assertNotMuted } from './community.js';
import { listComments, postComment, deleteComment, reportComment, reactComment, follow, friends } from './social.js';
import { getQuiz, answerQuiz, quizBoard, getBattle, voteBattle, getTournament, playTournament } from './play.js';
import { explainStory, kidsNews, timeMachine } from './extras.js';
import {
  searchPeople, setBlock, listBlocked, listThreads, dmCounts, getThread, sendDM, acceptThread, hideThread, reactDM, deleteDM, reportDM,
  setPhoto, removePhoto, photoResponse, reportPhoto, dmTyping,
} from './people.js';
import {
  createGroup, listGroups, groupCounts, getGroup, sendGroup, reactGroup, deleteGroupMessage, reportGroupMessage,
  updateGroup, addToGroup, removeFromGroup, muteGroup, groupTyping,
} from './groups.js';
import { createPop, listPops, viewPop, popViewers, deletePop, reportPop, popPhotoResponse } from './pops.js';
import { voiceResponse } from './media.js';
import { listTopics, followTopic, getDrop, storyTimeline } from './discover.js';
import { getMarket, trade } from './market.js';
import { getBingo, claimBingo } from './bingo.js';
import { getGuess, startGuess, answerGuess } from './guess.js';
import { getCards, openPack, offerCard, answerTrade } from './cards.js';
import { getSquad, createSquad, inviteToSquad, answerInvite, leaveSquad } from './squads.js';
import { listParties, getParty, partyChat, partyHype, rsvpParty, reportPartyMessage, createParty, deleteParty } from './parties.js';
import { listDebates, startDebate, getDebate, voteDebate, argue, likeArgument, reportArgument } from './debates.js';
import { voteChatPoll } from './chatpolls.js';
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
    if (path === '/api/mod/parties' && m === 'POST') return json(await createParty(env, admin, body));
    if (path === '/api/mod/parties/delete' && m === 'POST') return json(await deleteParty(env, admin, body.id));
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
    if (url.searchParams.get('count')) {
      const c = await dmCounts(env, user);
      return json({ ...c, unread: c.unread + (await groupCounts(env, user)) });
    }
    const r = await listThreads(env, user);
    const groups = await listGroups(env, user);
    return json({ ...r, groups, unread: r.unread + groups.filter((g) => !g.muted).reduce((a, g) => a + g.unread, 0) });
  }
  if (path === '/api/dm' && m === 'POST') {
    const user = await requireUser(request, env);
    await assertNotMuted(env, user);
    await rateLimit(env, `dm:burst:${user.id}`, 6, 10_000);
    await rateLimit(env, `dm:hour:${user.id}`, 300, 3600_000);
    return json(await sendDM(env, user, await readJson(request, 340_000), ctx));
  }
  if (path === '/api/dm/typing' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `typing:${user.id}`, 1500, 3600_000);
    return json(await dmTyping(env, user, await readJson(request, 500)));
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

  // ---- 👥 group chats ----
  if (path === '/api/groups' && m === 'POST') {
    const user = await requireUser(request, env);
    await assertNotMuted(env, user);
    await rateLimit(env, `groupnew:${user.id}`, 20, 3600_000);
    return json(await createGroup(env, user, await readJson(request, 4_000), ctx));
  }
  const grp = path.match(/^\/api\/groups\/(\d+)(\/messages)?$/);
  if (grp) {
    const user = await requireUser(request, env);
    if (!grp[2] && m === 'GET') {
      await rateLimit(env, `dmpoll:${user.id}`, 2400, 3600_000);
      return json(await getGroup(env, user, grp[1], Number(url.searchParams.get('since')) || 0));
    }
    if (grp[2] && m === 'POST') {
      await assertNotMuted(env, user);
      await rateLimit(env, `dm:burst:${user.id}`, 6, 10_000);
      await rateLimit(env, `dm:hour:${user.id}`, 300, 3600_000);
      return json(await sendGroup(env, user, grp[1], await readJson(request, 340_000), ctx));
    }
  }
  const gAct = path.match(/^\/api\/groups\/(react|report|update|add|remove|mute|typing)$/);
  if (gAct && m === 'POST') {
    const user = await requireUser(request, env);
    const body = await readJson(request, 4_000);
    const what = gAct[1];
    if (what === 'typing') { await rateLimit(env, `typing:${user.id}`, 1500, 3600_000); return json(await groupTyping(env, user, body)); }
    await rateLimit(env, `groupact:${user.id}`, 300, 3600_000);
    if (what === 'react') return json(await reactGroup(env, user, body));
    if (what === 'report') return json(await reportGroupMessage(env, user, body));
    if (what === 'mute') return json(await muteGroup(env, user, body));
    if (what === 'remove') return json(await removeFromGroup(env, user, body));
    await assertNotMuted(env, user);
    if (what === 'update') return json(await updateGroup(env, user, body));
    return json(await addToGroup(env, user, body, ctx));
  }
  const gDel = path.match(/^\/api\/groups\/messages\/(\d+)$/);
  if (gDel && m === 'DELETE') return json(await deleteGroupMessage(env, await requireUser(request, env), gDel[1]));

  // ---- 🎙️ voice notes ----
  const voice = path.match(/^\/api\/voice\/([0-9a-f]{32})$/);
  if (voice && m === 'GET') {
    await rateLimit(env, `voiceget:${ip}`, 3000, 3600_000);
    return voiceResponse(env, voice[1]);
  }

  // ---- 🫧 pops ----
  if (path === '/api/pops' && m === 'GET') {
    const user = await requireUser(request, env);
    await rateLimit(env, `pops:${user.id}`, 1200, 3600_000);
    return json(await listPops(env, user, url.searchParams.get('user')));
  }
  if (path === '/api/pops' && m === 'POST') {
    const user = await requireUser(request, env);
    await assertNotMuted(env, user);
    await rateLimit(env, `popnew:${user.id}`, 30, 3600_000);
    return json(await createPop(env, user, await readJson(request, 650_000)));
  }
  if (path === '/api/pops/view' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `popview:${user.id}`, 3000, 3600_000);
    return json(await viewPop(env, user, await readJson(request, 500), ctx));
  }
  if (path === '/api/pops/report' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `popreport:${user.id}`, 30, 3600_000);
    return json(await reportPop(env, user, await readJson(request, 500)));
  }
  const popPhoto = path.match(/^\/api\/pops\/photo\/([0-9a-f]{32})$/);
  if (popPhoto && m === 'GET') {
    await rateLimit(env, `popphoto:${ip}`, 3000, 3600_000);
    return popPhotoResponse(env, popPhoto[1]);
  }
  const pop = path.match(/^\/api\/pops\/(\d+)(\/viewers)?$/);
  if (pop && pop[2] && m === 'GET') return json(await popViewers(env, await requireUser(request, env), pop[1]));
  if (pop && !pop[2] && m === 'DELETE') return json(await deletePop(env, await requireUser(request, env), pop[1]));

  // ---- 🔔 followed topics · ☀️ Morning Drop · 🕰️ timelines ----
  if (path === '/api/topics' && m === 'GET') return json(await listTopics(env, await requireUser(request, env)));
  if (path === '/api/topics' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `topics:${user.id}`, 120, 3600_000);
    return json(await followTopic(env, user, await readJson(request, 1_000)));
  }
  if (path === '/api/drop' && m === 'GET') {
    await rateLimit(env, `drop:${ip}`, 300, 3600_000);
    return json(await getDrop(env, await currentUser(request, env)));
  }
  if (path === '/api/timeline' && m === 'GET') {
    await rateLimit(env, `timeline:${ip}`, 240, 3600_000);
    return json(await storyTimeline(env, url.searchParams.get('key')));
  }

  // ---- 📈 Story Stocks ----
  if (path === '/api/stocks' && m === 'GET') {
    await rateLimit(env, `stocks:${ip}`, 1200, 3600_000);
    return json(await getMarket(env, await currentUser(request, env)));
  }
  if (path === '/api/stocks/trade' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `stocktrade:${user.id}`, 120, 3600_000);
    return json(await trade(env, user, await readJson(request, 500)));
  }

  // ---- 🎯 Tech Bingo ----
  if (path === '/api/bingo' && m === 'GET') return json(await getBingo(env, await currentUser(request, env)));
  if (path === '/api/bingo/claim' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `bingo:${user.id}`, 60, 3600_000);
    return json(await claimBingo(env, user));
  }

  // ---- 🔤 Emoji Headlines · 🌫️ Blur Reveal ----
  const guess = path.match(/^\/api\/guess\/(emoji|blur)(\/start|\/answer)?$/);
  if (guess) {
    if (!guess[2] && m === 'GET') return json(await getGuess(env, await currentUser(request, env), guess[1]));
    const user = await requireUser(request, env);
    if (guess[2] === '/start' && m === 'POST') return json(await startGuess(env, user, guess[1]));
    if (guess[2] === '/answer' && m === 'POST') return json(await answerGuess(env, user, guess[1], await readJson(request, 2_000)));
  }

  // ---- 🃏 kerNEl Cards ----
  if (path === '/api/cards' && m === 'GET') {
    const who = url.searchParams.get('user');
    return json(await getCards(env, who ? await currentUser(request, env) : await requireUser(request, env), who));
  }
  if (path === '/api/cards/open' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `cardopen:${user.id}`, 60, 3600_000);
    return json(await openPack(env, user));
  }
  if (path === '/api/cards/offer' && m === 'POST') {
    const user = await requireUser(request, env);
    await assertNotMuted(env, user);
    await rateLimit(env, `cardoffer:${user.id}`, 30, 3600_000);
    return json(await offerCard(env, user, await readJson(request, 500), sendDM, ctx));
  }
  if (path === '/api/cards/answer' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `cardanswer:${user.id}`, 120, 3600_000);
    return json(await answerTrade(env, user, await readJson(request, 500)));
  }

  // ---- 👥 squads ----
  if (path === '/api/squad' && m === 'GET') return json(await getSquad(env, await currentUser(request, env)));
  const sq = path.match(/^\/api\/squad\/(create|invite|answer|leave)$/);
  if (sq && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `squad:${user.id}`, 60, 3600_000);
    const body = await readJson(request, 1_000);
    if (sq[1] === 'create') { await assertNotMuted(env, user); return json(await createSquad(env, user, body)); }
    if (sq[1] === 'invite') return json(await inviteToSquad(env, user, body));
    if (sq[1] === 'answer') return json(await answerInvite(env, user, body, ctx));
    return json(await leaveSquad(env, user));
  }

  // ---- 🎉 watch parties ----
  if (path === '/api/parties' && m === 'GET') return json(await listParties(env, await currentUser(request, env)));
  if (path === '/api/parties/report' && m === 'POST') return json(await reportPartyMessage(env, await requireUser(request, env), await readJson(request, 500)));
  const party = path.match(/^\/api\/parties\/(\d+)(\/chat|\/hype|\/rsvp)?$/);
  if (party) {
    if (!party[2] && m === 'GET') {
      await rateLimit(env, `partypoll:${ip}`, 3600, 3600_000);
      return json(await getParty(env, await currentUser(request, env), party[1], url.searchParams.get('since'), url.searchParams.get('hype')));
    }
    const user = await requireUser(request, env);
    const body = await readJson(request, 1_000);
    if (party[2] === '/chat' && m === 'POST') { await rateLimit(env, `partychat:${user.id}`, 6, 10_000); return json(await partyChat(env, user, party[1], body)); }
    if (party[2] === '/hype' && m === 'POST') { await rateLimit(env, `partyhype:${user.id}`, 40, 20_000); return json(await partyHype(env, user, party[1], body)); }
    if (party[2] === '/rsvp' && m === 'POST') return json(await rsvpParty(env, user, party[1], body));
  }

  // ---- ⚖️ debates ----
  if (path === '/api/debates' && m === 'GET') return json(await listDebates(env, await currentUser(request, env), url.searchParams.get('story')));
  if (path === '/api/debates' && m === 'POST') {
    const user = await requireUser(request, env);
    await assertNotMuted(env, user);
    await rateLimit(env, `debatenew:${user.id}`, 10, 3600_000);
    return json(await startDebate(env, user, await readJson(request, 1_000)));
  }
  const deb = path.match(/^\/api\/debates\/(\d+)$/);
  if (deb && m === 'GET') return json(await getDebate(env, await currentUser(request, env), deb[1]));
  const debAct = path.match(/^\/api\/debates\/(vote|argue|like|report)$/);
  if (debAct && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `debate:${user.id}`, 200, 3600_000);
    const body = await readJson(request, 1_000);
    if (debAct[1] === 'vote') return json(await voteDebate(env, user, body));
    if (debAct[1] === 'argue') { await assertNotMuted(env, user); return json(await argue(env, user, body)); }
    if (debAct[1] === 'like') return json(await likeArgument(env, user, body));
    return json(await reportArgument(env, user, body));
  }

  // ---- 📊 polls in chats ----
  if (path === '/api/chatpoll' && m === 'POST') {
    const user = await requireUser(request, env);
    await rateLimit(env, `chatpoll:${user.id}`, 200, 3600_000);
    return json(await voteChatPoll(env, user, await readJson(request, 500)));
  }

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
