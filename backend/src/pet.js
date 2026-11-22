// 🐣 Kernel Pet: a little buddy that hatches and grows when you show up and feed it every day.
// Stored as JSON in users.pet: { species, name, growth, last (day last fed), treats, love, born }.
import { HttpError } from './util.js';
import { cleanText } from './community.js';
import { liveStreak } from './social.js';
import { PET_SPECIES, PET_FEED_XP, STREAK_BOOST, petStage } from '../../js/pet-data.js';

const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch { return fb; } };
const today = () => new Date().toISOString().slice(0, 10);
const daysSince = (day) => (day ? Math.round((Date.parse(today()) - Date.parse(day)) / 864e5) : null);

export const petOf = (row) => {
  const p = parse(row?.pet, null);
  return p && PET_SPECIES[p.species] ? p : null;
};

/** What the browser sees. Mood: fed today → happy, fed yesterday → hungry, longer → sad (pets never die). */
export function petView(p) {
  if (!p) return null;
  const st = petStage(p.growth || 0);
  const since = daysSince(p.last);
  return {
    species: p.species, name: p.name, growth: p.growth || 0, stage: st.index, stageName: st.name, from: st.from, next: st.next,
    emoji: PET_SPECIES[p.species].stages[st.index], fedToday: since === 0,
    mood: since === 0 ? 'happy' : since === 1 || since === null ? 'hungry' : 'sad',
    treats: p.treats || 0, love: p.love || 0, born: p.born,
  };
}

const cleanName = (n) => cleanText(String(n || '').replace(/\s+/g, ' ')).slice(0, 16).trim();
const save = (env, user, pet, extra = '') => env.DB.prepare(`UPDATE users SET pet = ?${extra} WHERE id = ?`).bind(JSON.stringify(pet), user.id).run();

export async function getPet(env, user) {
  return { pet: petView(petOf(user)), streak: liveStreak(user), boost: STREAK_BOOST, feedXp: PET_FEED_XP };
}

export async function adoptPet(env, user, body) {
  if (petOf(user)) throw new HttpError(409, 'You already have a pet 🐣');
  if (!PET_SPECIES[body.species]) throw new HttpError(400, 'Pick a pet');
  const name = cleanName(body.name);
  if (!name) throw new HttpError(400, 'Give your pet a name');
  const pet = { species: body.species, name, growth: 0, last: null, treats: 0, love: 0, born: Date.now() };
  await save(env, user, pet);
  return getPet(env, { ...user, pet: JSON.stringify(pet) });
}

export async function renamePet(env, user, body) {
  const pet = petOf(user);
  if (!pet) throw new HttpError(404, 'Adopt a pet first 🥚');
  const name = cleanName(body.name);
  if (!name) throw new HttpError(400, 'Give your pet a name');
  pet.name = name;
  await save(env, user, pet);
  return getPet(env, { ...user, pet: JSON.stringify(pet) });
}

/** Once a day. Growth +1, or +2 while your streak is 7+ days. Feeding also gives a little XP. */
export async function feedPet(env, user) {
  const pet = petOf(user);
  if (!pet) throw new HttpError(404, 'Adopt a pet first 🥚');
  if (pet.last === today()) throw new HttpError(409, 'Already fed today — come back tomorrow! 🍽️');
  const before = petStage(pet.growth || 0).index;
  const boosted = liveStreak(user) >= STREAK_BOOST;
  pet.growth = (pet.growth || 0) + (boosted ? 2 : 1);
  pet.last = today();
  await save(env, user, pet, `, pending_xp = pending_xp + ${PET_FEED_XP}`);
  const out = await getPet(env, { ...user, pet: JSON.stringify(pet) });
  return { ...out, grew: out.pet.stage > before, boosted, xp: PET_FEED_XP };
}

export async function treatPet(env, user) {
  const pet = petOf(user);
  if (!pet) throw new HttpError(404, 'Adopt a pet first 🥚');
  if (!(pet.treats > 0)) throw new HttpError(400, 'No treats left — get some in the Butter Shop 🍪');
  pet.treats--;
  pet.love = (pet.love || 0) + 1;
  await save(env, user, pet);
  return getPet(env, { ...user, pet: JSON.stringify(pet) });
}

/** The small version shown on profile cards. */
export const petBadge = (row) => {
  const v = petView(petOf(row));
  return v ? { name: v.name, emoji: v.emoji, stageName: v.stageName, mood: v.mood } : null;
};
