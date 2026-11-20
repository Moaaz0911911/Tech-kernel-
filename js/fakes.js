// Made-up headlines for the Real or Fake? games (used by the website and the kerNEl server).
// They never name real companies, products or people, so nobody can mistake a fake for real news.
const W = {
  who: ['Researchers', 'Engineers at a university lab', 'A team of high-school students', 'Scientists', 'A tiny startup', 'Volunteers in a hackathon'],
  obj: ['toaster', 'smart fridge', 'robot vacuum', 'microwave', 'doorbell camera', 'calculator', 'pair of headphones', 'electric toothbrush', 'washing machine'],
  act: ['write poetry', 'recognise sarcasm', 'negotiate its own warranty', 'apologise for burnt toast', 'file its own bug reports', 'play chess blindfolded', 'hum lo-fi beats while working'],
  product: ['Wi-Fi for houseplants', 'a blockchain for lost socks', 'an AI that names your pets', 'self-folding laundry drones', 'a smart spoon that counts your cereal', 'an app that rates your dad jokes', 'noise-cancelling earmuffs for cats'],
  gadget: ['phone', 'laptop', 'smartwatch', 'game console', 'e-reader', 'VR headset'],
  feature: ['charges itself by being complimented', 'refuses to open social media after 10 pm', 'only works when you’re smiling', 'sneezes when the battery is low', 'translates your cat’s meows into emojis'],
  place: ['an old floppy disk', 'a forgotten server closet', 'a 1990s screensaver', 'the bottom of a ball pit', 'a library’s vending machine'],
  thing: ['a working computer made of popcorn', 'the world’s smallest keyboard', 'a password from 1987 that still works', 'a robot that only speaks in haiku'],
  bot: ['A delivery robot', 'A warehouse robot', 'An AI assistant', 'A self-driving lawnmower'],
  hobby: ['open a bakery', 'become a stand-up comedian', 'travel the world', 'write a cookbook for robots'],
  behave: ['type', 'debug code', 'answer emails', 'learn new words'],
  cond: ['eating popcorn', 'listening to whale songs', 'wearing two pairs of socks', 'talking to a rubber duck'],
  chorus: ['sing the startup chime', 'demand a software update first', 'speak like a pirate'],
};

const TEMPLATES = [
  (p) => `${p(W.who)} teach a ${p(W.obj)} to ${p(W.act)}`,
  (p) => `${p(W.who)} raise $${p([3, 7, 12, 40, 90])} million to build ${p(W.product)}`,
  (p) => `Study finds people ${p(W.behave)} ${p([12, 23, 37, 48])}% faster while ${p(W.cond)}`,
  (p) => `New ${p(W.gadget)} ${p(W.feature)}`,
  (p) => `${p(W.who)} discover ${p(W.thing)} inside ${p(W.place)}`,
  (p) => `${p(W.bot)} quits its job to ${p(W.hobby)}`,
  (p) => `Update makes every ${p(W.obj)} in the house ${p(W.chorus)}`,
];

/** Headlines that would give the game away (they look nothing like the fakes). */
export const GIVEAWAY = /^(show|ask|tell|launch) hn\b|\[pdf\]|\(\d{4}\)$/i;

/** A small seeded random generator, so the server can make the same set for everyone. */
export function seeded(seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** `n` different fake headlines. */
export function fakeHeadlines(n, rand = Math.random) {
  const p = (list) => list[Math.floor(rand() * list.length)];
  const out = new Set();
  for (let guard = 0; out.size < n && guard < 200; guard++) out.add(p(TEMPLATES)(p));
  return [...out];
}

export const shuffle = (list, rand = Math.random) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
