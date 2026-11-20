// kerNEl community: chat rooms, codme in chat, daily polls, public profiles.
import { HttpError } from './util.js';
import { searchStories, rowToStory } from './news.js';
import { codmeReply } from './codme.js';
import { look, liveStreak, followCounts, isFollowing } from './social.js';
import { trophiesOf } from './play.js';
import { tr, langOfProfile } from './i18n.js';

export const ROOMS = [
  { id: 'lobby', name: 'Lobby', emoji: '🍿' },
  { id: 'ai', name: 'AI', emoji: '🤖' },
  { id: 'gaming', name: 'Gaming', emoji: '🎮' },
  { id: 'dev', name: 'Dev', emoji: '💻' },
  { id: 'offtopic', name: 'Off-topic', emoji: '🎲' },
];
const ROOM_IDS = new Set(ROOMS.map((r) => r.id));
const CHAT_REACTS = new Set(['🔥', '😂', '🤯', '👍', '❤️']);
const ONLINE_MS = 2 * 60_000;
const RANKS = [[0, '🌽'], [50, '♨️'], [150, '🔥'], [300, '🍿'], [600, '🧈'], [1000, '👑'], [2000, '🌌']];
const rankEmoji = (xp) => [...RANKS].reverse().find(([min]) => xp >= min)[1];
const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };

// ---------- keeping it friendly ----------
const BAD = ['fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'pussy', 'cunt', 'slut', 'whore', 'fag', 'faggot', 'nigger', 'nigga', 'retard', 'motherfucker', 'bullshit', 'wanker', 'twat', 'cock', 'porn', 'sex'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const BAD_WORD = new RegExp(`^(${BAD.join('|')})(s|es|ing|ed|er|ers|y|ty)?$`, 'i'); // whole words only: "cocktail" is fine
export function cleanText(text) {
  const t = String(text ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 500);
  // also catch simple disguises like "sh1t" by checking a de-leeted copy of each word
  return t.replace(/[\p{L}\p{N}@$]+/gu, (w) => {
    const plain = w.toLowerCase().replace(/[013457@$]/g, (c) => LEET[c] || c);
    return BAD_WORD.test(plain) ? '🍿'.repeat(Math.min(3, Math.max(1, Math.ceil(w.length / 3)))) : w;
  });
}

// ---------- messages ----------
function toMessage(r, myReacts = {}) {
  const l = r.u_profile ? look(r.u_profile) : { avatar: r.avatar || '🍿', hat: '', frame: 'none' };
  return {
    id: r.id, room: r.room,
    user: { username: r.username, nickname: r.nickname || r.username, avatar: r.bot ? r.avatar : l.avatar, hat: l.hat, frame: l.frame, rank: r.rank_emoji || '🌽', bot: !!r.bot, streak: r.u_last ? liveStreak({ streak: r.u_streak, last_day: r.u_last }) : 0 },
    text: r.hidden ? '' : r.text, stories: r.hidden ? [] : parse(r.stories, []), reactions: parse(r.reactions, {}), mine: myReacts[r.id] || null,
    hidden: !!r.hidden, created: r.created, updated: r.updated,
  };
}

async function myReactions(env, user, ids) {
  if (!user || !ids.length) return {};
  const { results } = await env.DB.prepare(`SELECT msg_id, emoji FROM chat_reacts WHERE user_id = ? AND msg_id IN (${ids.map(() => '?').join(',')})`).bind(user.id, ...ids).all();
  return Object.fromEntries(results.map((r) => [r.msg_id, r.emoji]));
}

// Each message comes with its author's current look (avatar, hat, frame) and live streak.
const WITH_PEOPLE = 'SELECT m.*, u.profile AS u_profile, u.streak AS u_streak, u.last_day AS u_last FROM chat_messages m LEFT JOIN users u ON u.id = m.user_id';

export async function listMessages(env, user, room, since) {
  if (!ROOM_IDS.has(room)) throw new HttpError(400, 'Unknown room');
  const now = Date.now();
  let rows;
  if (since > 0) {
    ({ results: rows } = await env.DB.prepare(`${WITH_PEOPLE} WHERE m.room = ? AND m.updated > ? ORDER BY m.id ASC LIMIT 200`).bind(room, since).all());
  } else {
    ({ results: rows } = await env.DB.prepare(`${WITH_PEOPLE} WHERE m.room = ? AND m.hidden = 0 ORDER BY m.id DESC LIMIT 60`).bind(room).all());
    rows.reverse();
  }
  if (user) await env.DB.prepare('INSERT OR REPLACE INTO presence (user_id, room, at) VALUES (?, ?, ?)').bind(user.id, room, now).run();
  const { results: online } = await env.DB.prepare('SELECT room, COUNT(*) AS n FROM presence WHERE at > ? GROUP BY room').bind(now - ONLINE_MS).all();
  const counts = Object.fromEntries(online.map((o) => [o.room, o.n]));
  const mine = await myReactions(env, user, rows.map((r) => r.id));
  const mute = user ? await env.DB.prepare('SELECT until FROM mutes WHERE user_id = ? AND until > ?').bind(user.id, now).first() : null;
  return {
    messages: rows.map((r) => toMessage(r, mine)),
    rooms: ROOMS.map((r) => ({ ...r, online: counts[r.id] || 0 })),
    online: Object.values(counts).reduce((a, b) => a + b, 0),
    mutedUntil: mute?.until || null,
    now,
  };
}

export async function assertNotMuted(env, user) {
  const mute = await env.DB.prepare('SELECT until FROM mutes WHERE user_id = ? AND until > ?').bind(user.id, Date.now()).first();
  if (mute) throw new HttpError(403, `You’re muted until ${new Date(mute.until).toUTCString().slice(5, 22)} UTC because several of your messages were reported.`);
}

async function insertMessage(env, m, author = null) {
  const now = Date.now();
  const row = await env.DB.prepare(`INSERT INTO chat_messages (room, user_id, username, nickname, avatar, rank_emoji, text, stories, bot, reactions, reports, hidden, created, updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 0, 0, ?, ?) RETURNING *`)
    .bind(m.room, m.userId, m.username, m.nickname, m.avatar, m.rank, m.text, JSON.stringify(m.stories || []), m.bot ? 1 : 0, now, now).first();
  return toMessage(author ? { ...row, u_profile: author.profile, u_streak: author.streak, u_last: author.last_day } : row);
}

export async function postMessage(env, user, body, ctx) {
  const room = String(body.room || '');
  if (!ROOM_IDS.has(room)) throw new HttpError(400, 'Unknown room');
  await assertNotMuted(env, user);
  const text = cleanText(body.text);
  let stories = [];
  if (typeof body.storyKey === 'string' && body.storyKey) { // only stories kerNEl knows — no random links
    const s = await env.DB.prepare('SELECT * FROM stories WHERE key = ?').bind(body.storyKey.slice(0, 300)).first();
    if (s) stories = [pickStory(rowToStory(s))];
  }
  if (!text && !stories.length) throw new HttpError(400, 'Say something first!');
  const profile = parse(user.profile, {});
  const msg = await insertMessage(env, {
    room, userId: user.id, username: user.username, nickname: (profile.nickname || user.username).slice(0, 24), avatar: profile.avatar || '🍿',
    rank: rankEmoji(user.xp || 0), text, stories,
  }, user);
  const ask = text.match(/^@codme\b[\s,:]*(.*)$/is);
  if (ask) { // codme answers in the room
    const reply = codmeInChat(env, ask[1].trim(), profile.nickname || user.username, room, langOfProfile(user.profile));
    if (ctx?.waitUntil) ctx.waitUntil(reply); else await reply;
  }
  return { message: msg };
}

const pickStory = (s) => ({ key: s.key, title: s.title, url: s.url, source: s.source, cat: s.cat, image: s.image, domain: s.domain, time: s.time });

async function codmeInChat(env, question, nickname, room, lang = 'en') {
  const bot = { room, userId: 'bot:codme', username: 'codme', nickname: 'codme', avatar: '🤖', rank: '🤖', bot: true };
  try {
    if (!question) return insertMessage(env, { ...bot, text: tr(lang, 'botHello', { name: nickname }) });
    if (env.ANTHROPIC_API_KEY) {
      try {
        const r = await codmeReply(env, { messages: [{ role: 'user', content: question }] }, nickname);
        return insertMessage(env, { ...bot, text: cleanText(r.reply.replace(/\s*\[(\d{1,3})\]/g, '')), stories: r.stories.slice(0, 3).map(pickStory) });
      } catch { /* fall through to keyword search */ }
    }
    const words = (question.toLowerCase().match(/[\p{L}\p{N}+#]+/gu) || []).filter((w) => w.length > 1 && !/^(news|about|any|the|and|for|what|whats|is|are|on|me|show|find|latest|new)$/.test(w));
    const found = words.length ? await searchStories(env, words, 3) : [];
    return insertMessage(env, {
      ...bot,
      text: found.length ? tr(lang, 'botFound', { n: found.length, q: words.join(' '), name: nickname }) : tr(lang, 'botNone', { q: question.slice(0, 60) }),
      stories: found.map(pickStory),
    });
  } catch (e) {
    console.error('codme chat', e);
    return null;
  }
}

export async function reactMessage(env, user, body) {
  const id = Number(body.id);
  const emoji = body.emoji == null ? null : String(body.emoji);
  if (emoji && !CHAT_REACTS.has(emoji)) throw new HttpError(400, 'Unknown reaction');
  const msg = await env.DB.prepare('SELECT id FROM chat_messages WHERE id = ? AND hidden = 0').bind(id).first();
  if (!msg) throw new HttpError(404, 'Message not found');
  if (emoji) await env.DB.prepare('INSERT OR REPLACE INTO chat_reacts (msg_id, user_id, emoji) VALUES (?, ?, ?)').bind(id, user.id, emoji).run();
  else await env.DB.prepare('DELETE FROM chat_reacts WHERE msg_id = ? AND user_id = ?').bind(id, user.id).run();
  const { results } = await env.DB.prepare('SELECT emoji, COUNT(*) AS n FROM chat_reacts WHERE msg_id = ? GROUP BY emoji').bind(id).all();
  const reactions = Object.fromEntries(results.map((r) => [r.emoji, r.n]));
  await env.DB.prepare('UPDATE chat_messages SET reactions = ?, updated = ? WHERE id = ?').bind(JSON.stringify(reactions), Date.now(), id).run();
  return { id, reactions, mine: emoji };
}

export async function reportMessage(env, user, body) {
  const id = Number(body.id);
  const msg = await env.DB.prepare('SELECT * FROM chat_messages WHERE id = ?').bind(id).first();
  if (!msg) throw new HttpError(404, 'Message not found');
  if (msg.user_id === user.id) throw new HttpError(400, 'You can delete your own message instead');
  const fresh = await env.DB.prepare('INSERT OR IGNORE INTO chat_reports (msg_id, user_id, at) VALUES (?, ?, ?) RETURNING msg_id').bind(id, user.id, Date.now()).first();
  if (!fresh) return { ok: true, already: true };
  const reports = msg.reports + 1;
  const hide = reports >= 3 ? 1 : msg.hidden;
  await env.DB.prepare('UPDATE chat_messages SET reports = ?, hidden = ?, updated = ? WHERE id = ?').bind(reports, hide, Date.now(), id).run();
  if (hide && !msg.hidden && !msg.bot) { // three hidden messages in a day → 24-hour mute
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ? AND hidden = 1 AND reports >= 3 AND created > ?').bind(msg.user_id, Date.now() - 864e5).first();
    if ((n?.n || 0) >= 3) await env.DB.prepare('INSERT OR REPLACE INTO mutes (user_id, until) VALUES (?, ?)').bind(msg.user_id, Date.now() + 864e5).run();
  }
  return { ok: true, hidden: !!hide };
}

export async function deleteMessage(env, user, id) {
  const msg = await env.DB.prepare('SELECT user_id FROM chat_messages WHERE id = ?').bind(Number(id)).first();
  if (!msg) throw new HttpError(404, 'Message not found');
  if (msg.user_id !== user.id) throw new HttpError(403, 'You can only delete your own messages');
  await env.DB.prepare("UPDATE chat_messages SET hidden = 1, text = '', stories = '[]', updated = ? WHERE id = ?").bind(Date.now(), Number(id)).run();
  return { ok: true };
}

// ---------- public profiles ----------
export async function publicProfile(env, username, viewer = null) {
  const r = await env.DB.prepare('SELECT * FROM users WHERE username_lc = ?').bind(String(username || '').toLowerCase()).first();
  if (!r) throw new HttpError(404, 'No kernel by that name');
  const p = parse(r.profile, {});
  const d = parse(r.data, {});
  const place = r.on_board ? ((await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE on_board = 1 AND xp > ?').bind(r.xp).first())?.n || 0) + 1 : null;
  const msgs = await env.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ? AND hidden = 0').bind(r.id).first();
  return {
    username: r.username, nickname: p.nickname || r.username, ...look(p), topics: p.topics || [],
    xp: r.xp, rank: rankEmoji(r.xp), streak: liveStreak(r), bestStreak: r.best_streak, place,
    ...(await followCounts(env, r.id)), isFollowing: await isFollowing(env, viewer, r.id), me: !!viewer && viewer.id === r.id,
    trophies: await trophiesOf(env, r.id),
    badges: Object.keys(d.badges || {}), kidsStars: Object.values(d.kids?.stars || {}).reduce((a, b) => a + b, 0),
    messages: msgs?.n || 0, joined: r.created,
  };
}

// ---------- Hot Take of the Day ----------
export const POLLS = [
  ['Tabs or spaces?', ['Tabs ⇥', 'Spaces ␣', 'Whatever the formatter says 🤷']],
  ['Dark mode or light mode?', ['Dark 🌙', 'Light ☀️', 'Depends on my mood 🎭']],
  ['Would you ride in a fully self-driving car today?', ['Yes, let’s go! 🚗', 'Only with a steering wheel', 'Nope 🙅']],
  ['Best gaming platform?', ['PC 🖥️', 'PlayStation 🎮', 'Xbox 🟩', 'Nintendo 🍄']],
  ['Would you take a one-way trip to Mars?', ['Pack my bags 🚀', 'Only with a return ticket', 'Earth is fine 🌍']],
  ['Which phone would you pick?', ['iPhone 🍎', 'Android 🤖', 'A flip phone 📞']],
  ['How many browser tabs are open right now?', ['1–5 😇', '6–20', '21–100', 'I lost count 🤯']],
  ['Will AI chatbots replace search engines?', ['Already did', 'Partly', 'Never']],
  ['Best first programming language?', ['Python 🐍', 'JavaScript 🟨', 'Scratch 🐱', 'Rust 🦀']],
  ['Would you wear smart glasses every day?', ['Yes 🥽', 'Only for gaming', 'Never']],
  ['Most overhyped tech right now?', ['AI everything 🤖', 'VR headsets 🥽', 'Crypto 🪙', 'Foldable phones 📱']],
  ['Robots doing your chores in 10 years?', ['Definitely 🤖', 'Some chores', 'Still folding my own socks 🧦']],
  ['Best way to learn coding?', ['YouTube 📺', 'Building projects 🛠️', 'Courses 🎓', 'Asking AI 🤖']],
  ['Do you read the terms & conditions?', ['Always 📜', 'Sometimes', 'Who does?! 😂']],
  ['How do you back up your photos?', ['Cloud ☁️', 'External drive 💾', 'I live dangerously 😬']],
  ['Would you trust a robot doctor?', ['Yes', 'For simple stuff', 'Absolutely not']],
  ['Best snack for a long coding session?', ['Popcorn 🍿 (obviously)', 'Chips 🍟', 'Fruit 🍎', 'Coffee only ☕']],
  ['Should every kid learn to code at school?', ['Yes, from age 6 👧', 'Yes, in high school', 'Make it optional']],
  ['Electric cars: in or out?', ['All in ⚡', 'Hybrid for now', 'Gas forever ⛽']],
  ['Pineapple on pizza? (We just need to know.)', ['Yes 🍍', 'No 🚫', 'Only in space 🛸']],
];
const today = () => new Date().toISOString().slice(0, 10);
const pollIndex = (day) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 864e5) % POLLS.length;

export async function getPoll(env, user) {
  const day = today();
  const [question, options] = POLLS[pollIndex(day)];
  const { results } = await env.DB.prepare('SELECT option, COUNT(*) AS n FROM poll_votes WHERE day = ? GROUP BY option').bind(day).all();
  const counts = options.map((_, i) => results.find((r) => r.option === i)?.n || 0);
  const mine = user ? (await env.DB.prepare('SELECT option FROM poll_votes WHERE day = ? AND user_id = ?').bind(day, user.id).first())?.option ?? null : null;
  return { day, question, options, counts, total: counts.reduce((a, b) => a + b, 0), mine };
}

export async function votePoll(env, user, body) {
  const day = today();
  const option = Number(body.option);
  if (!Number.isInteger(option) || option < 0 || option >= POLLS[pollIndex(day)][1].length) throw new HttpError(400, 'Pick one of the options');
  const fresh = await env.DB.prepare('INSERT OR IGNORE INTO poll_votes (day, user_id, option, at) VALUES (?, ?, ?, ?) RETURNING option').bind(day, user.id, option, Date.now()).first();
  return { ...(await getPoll(env, user)), firstVote: !!fresh };
}
