// 🧈 The Butter Shop. Every XP someone earns from now on also gives them 1 🧈 butter (see /api/me/data),
// so buying things never lowers their XP or rank. Purchases are checked and paid for in one database step.
import { HttpError, isAdmin } from './util.js';
import { SHOP, BUTTER, LOOK_KINDS, ALL_LOOK_IDS, shopItem, ownsLook } from '../../js/shop-data.js';
import { givePacks } from './cards.js';
import { petOf } from './pet.js';

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
export const shopOf = (row) => {
  const s = parse(row?.shop, {});
  return { owned: Array.isArray(s.owned) ? s.owned.filter((id) => shopItem(id)) : [], freezes: Math.max(0, s.freezes | 0), welcome: !!s.welcome };
};

/** What someone can wear: what they bought, or every look for a 🛡️ moderator (never saved, so it goes away if they stop being one). */
export const ownedFor = (env, user) => (isAdmin(env, user) ? ALL_LOOK_IDS : shopOf(user).owned);

/**
 * SQL for the XP save: adds the butter earned since the highest XP ever paid out.
 * (So taking XP away and adding it back can't print butter.) Goes inside UPDATE users SET …, before xp is set,
 * and needs the new XP bound twice. In SQLite every right-hand side sees the row as it was before the update.
 */
export const BUTTER_SQL = 'butter = butter + MAX(0, ? - COALESCE(butter_mark, xp)), butter_mark = MAX(COALESCE(butter_mark, xp), ?)';

const view = (env, user, s, butter) => ({ butter, owned: isAdmin(env, user) ? ALL_LOOK_IDS : s.owned, freezes: s.freezes, maxFreezes: BUTTER.maxFreezes, ...(isAdmin(env, user) ? { mod: true } : {}) });

export async function getShop(env, user) {
  const s = shopOf(user);
  let butter = user.butter || 0;
  if (!s.welcome) { // a little welcome gift so everyone can try the shop
    s.welcome = true;
    const r = await env.DB.prepare('UPDATE users SET shop = ?, butter = butter + ? WHERE id = ? AND COALESCE(shop, \'\') = ? RETURNING butter')
      .bind(JSON.stringify(s), BUTTER.welcome, user.id, user.shop || '').first();
    if (r) return { ...view(env, user, s, r.butter), welcomeGift: BUTTER.welcome };
    return getShop(env, await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first());
  }
  return view(env, user, s, butter);
}

export async function buy(env, user, body) {
  const item = shopItem(String(body.id || ''));
  if (!item) throw new HttpError(404, 'That isn’t in the shop');
  const s = shopOf(user);
  if (item.kind !== 'use' && (item.price === 0 || s.owned.includes(item.id) || isAdmin(env, user))) throw new HttpError(409, 'You already have that');
  if (item.id === 'freeze' && s.freezes >= BUTTER.maxFreezes) throw new HttpError(400, 'You can hold 2 streak freezes at a time');
  const pet = petOf(user);
  if (item.id === 'treat' && !pet) throw new HttpError(400, 'Adopt a pet first 🥚');
  if ((user.butter || 0) < item.price) throw new HttpError(400, 'Not enough butter yet 🧈');

  if (item.id === 'freeze') s.freezes++;
  else if (item.kind !== 'use') s.owned.push(item.id);
  if (pet && item.id === 'treat') pet.treats = Math.min(99, (pet.treats || 0) + 1);
  // pay and deliver in one step; the shop must still be what we read (so two quick taps can't double-spend)
  const r = await env.DB.prepare(`UPDATE users SET butter = butter - ?, shop = ?${item.id === 'treat' ? ', pet = ?' : ''} WHERE id = ? AND butter >= ? AND COALESCE(shop, '') = ? RETURNING butter`)
    .bind(item.price, JSON.stringify({ ...s, welcome: true }), ...(item.id === 'treat' ? [JSON.stringify(pet)] : []), user.id, item.price, user.shop || '').first();
  if (!r) throw new HttpError(409, 'Something changed — try again');
  if (item.id === 'pack') await givePacks(env, user.id, BUTTER.packs);
  return { ...view(env, user, s, r.butter), bought: item.id };
}

/** Check the bubble, background, name effect and codme personality someone wants against what they own. */
export function cleanShopLook(p, prev, owned) {
  const out = {};
  for (const kind of LOOK_KINDS) {
    const keep = prev[kind] && ownsLook(kind, prev[kind], owned) ? prev[kind] : 'none';
    if (!p || !(kind in p)) { out[kind] = keep; continue; }
    const want = String(p[kind] || 'none');
    out[kind] = want === 'none' || ownsLook(kind, want, owned) ? want : keep;
  }
  return out;
}

/** The daily check-in uses streak freezes for missed days. Returns how many were used (0 = none). */
export function freezesFor(user, missedDays) {
  const s = shopOf(user);
  if (missedDays < 1 || missedDays > s.freezes || !(user.streak > 0)) return { used: 0 };
  s.freezes -= missedDays;
  return { used: missedDays, shop: JSON.stringify({ ...s, welcome: s.welcome }) };
}

export const SHOP_IDS = SHOP.map((i) => i.id);
