// 📈 Story Stocks: a weekly pretend market. Prices follow how much the news is buzzing about each company,
// everyone starts the week with 1,000 🪙 of play money, and the top 3 portfolios win XP.
import { HttpError } from './util.js';
import { weekOf, people, kvGet } from './play.js';
import { reward } from './rewards.js';
import { notify } from './push.js';
import { tr, langOfProfile } from './i18n.js';

export const MARKET = { start: 1000, maxShares: 1000, tradesPerDay: 40, prizes: [150, 80, 40], historyHours: 48 };
// Names are matched with their capitals (so "Rust" the language, not "rust" on a bike).
export const TICKERS = [
  { sym: 'OAI', name: 'OpenAI', emoji: '🤖', match: 'OpenAI|ChatGPT|GPT-\\d' },
  { sym: 'APL', name: 'Apple', emoji: '🍎', match: 'Apple|iPhone|iPad|MacBook|iOS|macOS|Vision Pro' },
  { sym: 'GGL', name: 'Google', emoji: '🔍', match: 'Google|Gemini|Android|YouTube|Chrome|Pixel' },
  { sym: 'MSF', name: 'Microsoft', emoji: '🪟', match: 'Microsoft|Windows|Azure|GitHub|Copilot' },
  { sym: 'NVD', name: 'Nvidia', emoji: '🟩', match: 'Nvidia|NVIDIA|GeForce|CUDA' },
  { sym: 'TSL', name: 'Tesla', emoji: '🚗', match: 'Tesla|Cybertruck' },
  { sym: 'SPX', name: 'SpaceX', emoji: '🚀', match: 'SpaceX|Starship|Starlink|Falcon 9' },
  { sym: 'NTD', name: 'Nintendo', emoji: '🍄', match: 'Nintendo|Switch 2|Mario|Zelda|Pokémon|Pokemon' },
  { sym: 'SNY', name: 'Sony', emoji: '🎮', match: 'Sony|PlayStation|PS5' },
  { sym: 'MTA', name: 'Meta', emoji: '🥽', match: 'Meta|Facebook|Instagram|WhatsApp|Threads' },
  { sym: 'AMZ', name: 'Amazon', emoji: '📦', match: 'Amazon|AWS|Alexa|Kindle' },
  { sym: 'XBX', name: 'Xbox', emoji: '🟢', match: 'Xbox|Game Pass' },
  { sym: 'LNX', name: 'Linux', emoji: '🐧', match: 'Linux|Ubuntu|Debian|Fedora|Arch Linux' },
  { sym: 'RST', name: 'Rust', emoji: '🦀', match: 'Rust' },
  { sym: 'PYT', name: 'Python', emoji: '🐍', match: 'Python|PyPI' },
  { sym: 'BTC', name: 'Bitcoin', emoji: '🪙', match: 'Bitcoin|BTC|Ethereum|crypto|Crypto' },
];
const RE = Object.fromEntries(TICKERS.map((t) => [t.sym, new RegExp(`(^|[^\\p{L}\\p{N}])(?:${t.match})(?=$|[^\\p{L}\\p{N}])`, 'u')]));
const HOUR = 3600_000;
const round2 = (n) => Math.round(n * 100) / 100;

/** How loud the news is about each company right now (last 24 hours, bigger stories count more). */
async function buzzNow(env) {
  const { results } = await env.DB.prepare('SELECT title, points, comments FROM stories WHERE time > ?').bind(Date.now() - 24 * HOUR).all();
  const buzz = Object.fromEntries(TICKERS.map((t) => [t.sym, 0]));
  for (const s of results) {
    const weight = 1 + Math.log2(1 + (s.points || 0)) / 2 + Math.min(3, (s.comments || 0) / 100);
    for (const t of TICKERS) if (RE[t.sym].test(s.title)) buzz[t.sym] += weight;
  }
  return buzz;
}

/** Cron (and first visit): move prices once an hour, smoothly towards the buzz. */
export async function updatePrices(env, force = false) {
  const hour = Math.floor(Date.now() / HOUR) * HOUR;
  const done = await env.DB.prepare('SELECT 1 AS y FROM stock_prices WHERE hour = ? LIMIT 1').bind(hour).first();
  if (done && !force) return 0;
  const buzz = await buzzNow(env);
  const { results: last } = await env.DB.prepare('SELECT sym, price FROM stock_prices WHERE hour = (SELECT MAX(hour) FROM stock_prices WHERE hour < ?)').bind(hour).all();
  const prev = Object.fromEntries(last.map((r) => [r.sym, r.price]));
  const stmts = TICKERS.map((t) => {
    const target = 20 + 12 * buzz[t.sym];
    const price = Math.max(1, round2(prev[t.sym] ? prev[t.sym] * 0.65 + target * 0.35 : target));
    return env.DB.prepare('INSERT OR IGNORE INTO stock_prices (sym, hour, price, buzz) VALUES (?, ?, ?, ?)').bind(t.sym, hour, price, round2(buzz[t.sym]));
  });
  stmts.push(env.DB.prepare('DELETE FROM stock_prices WHERE hour < ?').bind(hour - 9 * 24 * HOUR));
  await env.DB.batch(stmts);
  return TICKERS.length;
}

async function prices(env) {
  let { results } = await env.DB.prepare('SELECT sym, hour, price FROM stock_prices WHERE hour > ? ORDER BY hour ASC').bind(Date.now() - (MARKET.historyHours + 1) * HOUR).all();
  if (!results.length) {
    await updatePrices(env);
    ({ results } = await env.DB.prepare('SELECT sym, hour, price FROM stock_prices WHERE hour > ? ORDER BY hour ASC').bind(Date.now() - (MARKET.historyHours + 1) * HOUR).all());
  }
  const by = {};
  for (const r of results) (by[r.sym] ||= []).push(r.price);
  return Object.fromEntries(TICKERS.map((t) => {
    const hist = by[t.sym] || [20];
    const price = hist[hist.length - 1];
    const dayAgo = hist[Math.max(0, hist.length - 25)];
    return [t.sym, { price, change: dayAgo ? round2(((price - dayAgo) / dayAgo) * 100) : 0, spark: hist.slice(-24) }];
  }));
}

async function wallet(env, user, week) {
  await env.DB.prepare('INSERT OR IGNORE INTO stock_wallets (week, user_id, cash, trades) VALUES (?, ?, ?, 0)').bind(week, user.id, MARKET.start).run();
  const w = await env.DB.prepare('SELECT cash, trades FROM stock_wallets WHERE week = ? AND user_id = ?').bind(week, user.id).first();
  const { results } = await env.DB.prepare('SELECT sym, shares, cost FROM stock_holdings WHERE week = ? AND user_id = ? AND shares > 0').bind(week, user.id).all();
  return { cash: round2(w.cash), trades: w.trades, holdings: results };
}

const valueOf = (cash, holdings, px) => round2(cash + holdings.reduce((a, h) => a + h.shares * (px[h.sym]?.price || 0), 0));

async function board(env, week, px, limit = 10) {
  const { results: wallets } = await env.DB.prepare('SELECT user_id, cash FROM stock_wallets WHERE week = ? AND trades > 0 LIMIT 1000').bind(week).all();
  if (!wallets.length) return [];
  const { results: hold } = await env.DB.prepare('SELECT user_id, sym, shares FROM stock_holdings WHERE week = ? AND shares > 0').bind(week).all();
  const ranked = wallets.map((w) => ({ id: w.user_id, value: valueOf(w.cash, hold.filter((h) => h.user_id === w.user_id), px) })).sort((a, b) => b.value - a.value);
  const top = ranked.slice(0, limit);
  const who = await people(env, top.map((r) => r.id));
  return { top: top.filter((r) => who[r.id]).map((r, i) => ({ place: i + 1, ...who[r.id], value: r.value, id: r.id })), all: ranked };
}

export async function getMarket(env, user) {
  const w = weekOf();
  const px = await prices(env);
  const tickers = TICKERS.map((t) => ({ sym: t.sym, name: t.name, emoji: t.emoji, ...px[t.sym] }));
  const b = await board(env, w.week, px);
  let me = null;
  if (user) {
    const my = await wallet(env, user, w.week);
    const place = b.all ? b.all.findIndex((r) => r.id === user.id) + 1 : 0;
    me = { cash: my.cash, trades: my.trades, holdings: my.holdings.map((h) => ({ ...h, value: round2(h.shares * px[h.sym].price) })), value: valueOf(my.cash, my.holdings, px), place: place || null };
  }
  const last = await kvGet(env, `stocks:award:${weekOf(w.starts - 1).week}`);
  return { week: w.week, endsAt: w.ends, start: MARKET.start, tickers, me, board: (b.top || []).map(({ id, ...r }) => r), lastWinners: last?.winners || [] };
}

/** Buy (shares > 0) or sell (shares < 0) at the current price. */
export async function trade(env, user, body) {
  const t = TICKERS.find((x) => x.sym === String(body.sym || ''));
  if (!t) throw new HttpError(400, 'Unknown company');
  const n = Math.trunc(Number(body.shares) || 0);
  if (!n || Math.abs(n) > MARKET.maxShares) throw new HttpError(400, 'Pick how many shares');
  const w = weekOf();
  await wallet(env, user, w.week);
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare('SELECT day, day_trades FROM stock_wallets WHERE week = ? AND user_id = ?').bind(w.week, user.id).first();
  if (row?.day === day && row.day_trades >= MARKET.tradesPerDay) throw new HttpError(429, 'That’s a lot of trading for one day — the market opens again tomorrow!');
  const count = 'trades = trades + 1, day_trades = CASE WHEN day = ? THEN day_trades + 1 ELSE 1 END, day = ?';
  const px = (await prices(env))[t.sym].price;
  if (n > 0) {
    const cost = round2(n * px);
    const ok = await env.DB.prepare(`UPDATE stock_wallets SET cash = cash - ?, ${count} WHERE week = ? AND user_id = ? AND cash >= ? RETURNING cash`).bind(cost, day, day, w.week, user.id, cost - 0.001).first();
    if (!ok) throw new HttpError(400, 'Not enough 🪙 for that many shares');
    await env.DB.prepare(`INSERT INTO stock_holdings (week, user_id, sym, shares, cost) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(week, user_id, sym) DO UPDATE SET shares = shares + excluded.shares, cost = cost + excluded.cost`).bind(w.week, user.id, t.sym, n, cost).run();
  } else {
    const sell = -n;
    const h = await env.DB.prepare('UPDATE stock_holdings SET cost = CASE WHEN shares > 0 THEN cost * (shares - ?) / shares ELSE 0 END, shares = shares - ? WHERE week = ? AND user_id = ? AND sym = ? AND shares >= ? RETURNING shares')
      .bind(sell, sell, w.week, user.id, t.sym, sell).first();
    if (!h) throw new HttpError(400, 'You don’t have that many shares');
    await env.DB.prepare(`UPDATE stock_wallets SET cash = cash + ?, ${count} WHERE week = ? AND user_id = ?`).bind(round2(sell * px), day, day, w.week, user.id).run();
  }
  return getMarket(env, user);
}

/** Cron: when a week is over, its top 3 portfolios win XP and the 📈 hat counter. */
export async function awardMarket(env) {
  const last = weekOf(weekOf().starts - 1);
  const key = `stocks:award:${last.week}`;
  if (await kvGet(env, key)) return 0;
  const { results: hist } = await env.DB.prepare('SELECT sym, price FROM stock_prices WHERE hour = (SELECT MAX(hour) FROM stock_prices WHERE hour < ?)').bind(last.ends).all();
  const px = Object.fromEntries(hist.map((r) => [r.sym, { price: r.price }]));
  const b = await board(env, last.week, px, 3);
  const winners = (b.top || []).filter((r) => r.value > MARKET.start);
  if (!(await env.DB.prepare('INSERT OR IGNORE INTO kv (k, v) VALUES (?, ?) RETURNING k').bind(key, JSON.stringify({ week: last.week, winners: winners.map(({ id, ...r }) => r) })).first())) return 0;
  for (const [i, w] of winners.entries()) {
    await reward(env, w.id, MARKET.prizes[i], 'stockWins');
    const u = await env.DB.prepare('SELECT profile FROM users WHERE id = ?').bind(w.id).first();
    const lang = langOfProfile(u?.profile);
    await notify(env, w.id, { kind: 'games', title: tr(lang, 'stocksWin', { place: i + 1 }), body: tr(lang, 'stocksWinBody', { xp: MARKET.prizes[i] }), url: './#stocks', tag: 'stocks', icon: '📈' }, { left: 3 });
  }
  return winners.length;
}
