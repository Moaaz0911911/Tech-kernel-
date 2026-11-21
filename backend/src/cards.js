// 🃏 kerNEl Cards: a free pack every day, bonus packs from wins, sets that unlock looks,
// and trading or gifting duplicates with friends (offers arrive as cards in Messages).
import { HttpError } from './util.js';
import { CARDS, CARD_SETS, RARITIES, cardById } from '../../js/cards-data.js';
import { reward, statsOf } from './rewards.js';

export const PACK = { size: 3 };
const day = () => new Date().toISOString().slice(0, 10);

/** Bonus packs for wins (bingo lines, duels, correct predictions, daily games). */
export async function givePacks(env, userId, n = 1) {
  if (!n) return;
  await env.DB.prepare('INSERT INTO card_packs (user_id, bonus, opened) VALUES (?, ?, 0) ON CONFLICT(user_id) DO UPDATE SET bonus = bonus + excluded.bonus').bind(userId, n).run();
}

async function owned(env, userId) {
  const { results } = await env.DB.prepare('SELECT card_id, count FROM user_cards WHERE user_id = ? AND count > 0').bind(userId).all();
  return Object.fromEntries(results.map((r) => [r.card_id, r.count]));
}

const setsOf = (mine) => CARD_SETS.map((s) => {
  const cards = CARDS.filter((c) => c.set === s.id);
  const have = cards.filter((c) => mine[c.id]).length;
  return { id: s.id, have, total: cards.length, complete: have === cards.length };
});

/** Completed sets unlock looks; the counter only ever goes up (trading a card away doesn't take a hat back). */
async function syncSetStat(env, userId, mine) {
  const done = setsOf(mine).filter((s) => s.complete).length;
  const u = await env.DB.prepare('SELECT stats FROM users WHERE id = ?').bind(userId).first();
  const had = statsOf(u).cardSets || 0;
  if (done > had) await reward(env, userId, 0, 'cardSets', done - had);
  return done > had;
}

async function packState(env, userId) {
  const r = await env.DB.prepare('SELECT bonus, free_day, opened FROM card_packs WHERE user_id = ?').bind(userId).first();
  return { free: r?.free_day !== day(), bonus: r?.bonus || 0, opened: r?.opened || 0 };
}

export async function getCards(env, user, username = null) {
  if (username) { // someone else's collection (for picking a trade)
    const other = await env.DB.prepare('SELECT id, username FROM users WHERE username_lc = ?').bind(String(username).replace(/^@/, '').toLowerCase()).first();
    if (!other) throw new HttpError(404, 'No kernel by that name');
    const mine = await owned(env, other.id);
    return { username: other.username, cards: mine, sets: setsOf(mine) };
  }
  const mine = await owned(env, user.id);
  const { results: trades } = await env.DB.prepare(`SELECT t.*, a.username AS from_name, b.username AS to_name FROM card_trades t JOIN users a ON a.id = t.from_id JOIN users b ON b.id = t.to_id
    WHERE (t.from_id = ? OR t.to_id = ?) AND t.status = 'open' ORDER BY t.id DESC LIMIT 20`).bind(user.id, user.id).all();
  return {
    cards: mine, total: CARDS.length, sets: setsOf(mine), packs: await packState(env, user.id),
    trades: trades.map((t) => tradeView(t, user)),
  };
}

function draw() {
  const total = RARITIES.reduce((a, r) => a + r.weight, 0);
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  let x = (rnd[0] / 2 ** 32) * total;
  const rarity = RARITIES.find((r) => (x -= r.weight) < 0)?.id || 'common';
  const pool = CARDS.filter((c) => c.rarity === rarity);
  return pool[rnd[1] % pool.length];
}

export async function openPack(env, user) {
  const p = await packState(env, user.id);
  let used;
  if (p.free) {
    const ok = await env.DB.prepare(`INSERT INTO card_packs (user_id, bonus, free_day, opened) VALUES (?, 0, ?, 1)
      ON CONFLICT(user_id) DO UPDATE SET free_day = excluded.free_day, opened = opened + 1 WHERE card_packs.free_day IS NULL OR card_packs.free_day != excluded.free_day RETURNING user_id`).bind(user.id, day()).first();
    used = ok ? 'free' : null;
  }
  if (!used) {
    const ok = await env.DB.prepare('UPDATE card_packs SET bonus = bonus - 1, opened = opened + 1 WHERE user_id = ? AND bonus > 0 RETURNING bonus').bind(user.id).first();
    if (!ok) throw new HttpError(409, 'No packs left — a free one arrives tomorrow!');
    used = 'bonus';
  }
  const before = await owned(env, user.id);
  const cards = Array.from({ length: PACK.size }, draw);
  const now = Date.now();
  await env.DB.batch(cards.map((c) => env.DB.prepare('INSERT INTO user_cards (user_id, card_id, count, first) VALUES (?, ?, 1, ?) ON CONFLICT(user_id, card_id) DO UPDATE SET count = count + 1').bind(user.id, c.id, now)));
  const seen = new Set(Object.keys(before));
  const pulled = cards.map((c) => { const isNew = !seen.has(c.id); seen.add(c.id); return { id: c.id, isNew }; });
  const mine = await owned(env, user.id);
  const newSet = await syncSetStat(env, user.id, mine);
  return { used, pulled, newSet, ...(await getCards(env, user)) };
}

function tradeView(t, me) {
  return { id: t.id, from: t.from_name, to: t.to_name, give: t.give, want: t.want, status: t.status, mine: t.from_id === me.id, created: t.created };
}

/** Offer a card: a gift (no `want`) moves at once; a trade waits for the other person to accept. Only duplicates can be offered. */
export async function offerCard(env, user, body, sendDM, ctx) {
  const give = cardById(String(body.give || ''));
  const want = body.want ? cardById(String(body.want)) : null;
  if (!give || (body.want && !want)) throw new HttpError(400, 'Unknown card');
  const other = await env.DB.prepare('SELECT id, username FROM users WHERE username_lc = ?').bind(String(body.to || '').replace(/^@/, '').toLowerCase()).first();
  if (!other) throw new HttpError(404, 'No kernel by that name');
  if (other.id === user.id) throw new HttpError(400, 'You can’t trade with yourself');
  const mine = await owned(env, user.id);
  if ((mine[give.id] || 0) < 2) throw new HttpError(400, 'You can only offer cards you have doubles of');
  if (want && !(await owned(env, other.id))[want.id]) throw new HttpError(400, 'They don’t have that card');
  const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM card_trades WHERE from_id = ? AND status = 'open'").bind(user.id).first();
  if ((open?.n || 0) >= 10) throw new HttpError(429, 'You have lots of offers waiting — let some get answered first');
  const now = Date.now();
  const t = await env.DB.prepare('INSERT INTO card_trades (from_id, to_id, give, want, status, created) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(user.id, other.id, give.id, want?.id || null, want ? 'open' : 'pending', now).first();
  try {
    await sendDM(env, user, { to: other.username, trade: t.id }, ctx); // the offer arrives in Messages (and respects blocks and message settings)
  } catch (e) {
    await env.DB.prepare('DELETE FROM card_trades WHERE id = ?').bind(t.id).run();
    throw e;
  }
  if (!want) { // a gift: move it now
    await moveCard(env, user.id, other.id, give.id);
    await env.DB.prepare("UPDATE card_trades SET status = 'gift', done = ? WHERE id = ?").bind(now, t.id).run();
    await syncSetStat(env, other.id, await owned(env, other.id));
  }
  return { ok: true, trade: t.id, gift: !want };
}

async function moveCard(env, fromId, toId, cardId) {
  const took = await env.DB.prepare('UPDATE user_cards SET count = count - 1 WHERE user_id = ? AND card_id = ? AND count > 0 RETURNING count').bind(fromId, cardId).first();
  if (!took) return false;
  await env.DB.prepare('INSERT INTO user_cards (user_id, card_id, count, first) VALUES (?, ?, 1, ?) ON CONFLICT(user_id, card_id) DO UPDATE SET count = count + 1').bind(toId, cardId, Date.now()).run();
  return true;
}

/** Accept or decline a trade offered to you (or cancel your own). */
export async function answerTrade(env, user, body) {
  const t = await env.DB.prepare('SELECT * FROM card_trades WHERE id = ?').bind(Number(body.id)).first();
  if (!t || (t.to_id !== user.id && t.from_id !== user.id)) throw new HttpError(404, 'Trade not found');
  if (t.status !== 'open') throw new HttpError(409, 'This trade is already done');
  const now = Date.now();
  if (!body.accept || t.from_id === user.id) {
    await env.DB.prepare("UPDATE card_trades SET status = ?, done = ? WHERE id = ? AND status = 'open'").bind(t.from_id === user.id ? 'cancelled' : 'declined', now, t.id).run();
    return { ok: true, status: t.from_id === user.id ? 'cancelled' : 'declined' };
  }
  const claim = await env.DB.prepare("UPDATE card_trades SET status = 'busy' WHERE id = ? AND status = 'open' RETURNING id").bind(t.id).first();
  if (!claim) throw new HttpError(409, 'This trade is already done');
  const a = await owned(env, t.from_id);
  const b = await owned(env, t.to_id);
  if (!a[t.give] || !b[t.want]) {
    await env.DB.prepare("UPDATE card_trades SET status = 'failed', done = ? WHERE id = ?").bind(now, t.id).run();
    throw new HttpError(409, 'One of the cards isn’t there anymore');
  }
  await moveCard(env, t.from_id, t.to_id, t.give);
  await moveCard(env, t.to_id, t.from_id, t.want);
  await env.DB.prepare("UPDATE card_trades SET status = 'done', done = ? WHERE id = ?").bind(now, t.id).run();
  await syncSetStat(env, t.from_id, await owned(env, t.from_id));
  await syncSetStat(env, t.to_id, await owned(env, t.to_id));
  return { ok: true, status: 'done' };
}

/** For Messages: the trade behind each card message. */
export async function tradesByIds(env, ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return {};
  const { results } = await env.DB.prepare(`SELECT id, give, want, status FROM card_trades WHERE id IN (${list.map(() => '?').join(',')})`).bind(...list).all();
  return Object.fromEntries(results.map((t) => [t.id, { id: t.id, give: t.give, want: t.want, status: t.status === 'pending' ? 'gift' : t.status }]));
}
