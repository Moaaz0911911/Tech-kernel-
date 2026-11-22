// 🛍️ The Butter Shop: what you can buy with 🧈 butter (shared with the kerNEl server, which checks every purchase).
// You earn 1 🧈 for every XP you earn from now on, and spending it never lowers your XP or rank.
export const BUTTER = { welcome: 200, maxFreezes: 2, packs: 1 };

// kind: 'use' = used up (bought again and again); the others are kept and can be switched on and off.
export const SHOP = [
  { id: 'freeze', kind: 'use', emoji: '🧊', price: 150, name: 'Streak freeze', desc: 'Miss a day without losing your streak. Hold up to 2.' },
  { id: 'pack', kind: 'use', emoji: '🃏', price: 120, name: 'Card pack', desc: 'Three more kerNEl Cards.' },
  { id: 'treat', kind: 'use', emoji: '🍪', price: 20, name: 'Pet treat', desc: 'Your pet does a happy dance.' },

  { id: 'b-mint', kind: 'bubble', value: 'mint', emoji: '🟢', price: 250, name: 'Mint bubbles' },
  { id: 'b-sky', kind: 'bubble', value: 'sky', emoji: '🔵', price: 250, name: 'Sky bubbles' },
  { id: 'b-peach', kind: 'bubble', value: 'peach', emoji: '🍑', price: 250, name: 'Peach bubbles' },
  { id: 'b-grape', kind: 'bubble', value: 'grape', emoji: '🍇', price: 250, name: 'Grape bubbles' },
  { id: 'b-gold', kind: 'bubble', value: 'gold', emoji: '🧈', price: 500, name: 'Golden butter bubbles' },

  { id: 'bg-sunset', kind: 'bg', value: 'sunset', emoji: '🌅', price: 300, name: 'Sunset' },
  { id: 'bg-ocean', kind: 'bg', value: 'ocean', emoji: '🌊', price: 300, name: 'Deep ocean' },
  { id: 'bg-popcorn', kind: 'bg', value: 'popcorn', emoji: '🍿', price: 400, name: 'Popcorn party' },
  { id: 'bg-circuit', kind: 'bg', value: 'circuit', emoji: '🔌', price: 450, name: 'Circuit board' },
  { id: 'bg-galaxy', kind: 'bg', value: 'galaxy', emoji: '🌌', price: 600, name: 'Galaxy' },

  { id: 'fx-shimmer', kind: 'fx', value: 'shimmer', emoji: '✨', price: 400, name: 'Shimmer name' },
  { id: 'fx-neon', kind: 'fx', value: 'neon', emoji: '💡', price: 450, name: 'Neon name' },
  { id: 'fx-rainbow', kind: 'fx', value: 'rainbow', emoji: '🌈', price: 600, name: 'Rainbow name' },
  { id: 'fx-glitch', kind: 'fx', value: 'glitch', emoji: '📺', price: 700, name: 'Glitch name' },

  { id: 'hat-blossom', kind: 'hat', value: 'blossom', emoji: '🌸', price: 300, name: 'Blossom' },
  { id: 'hat-mushroom', kind: 'hat', value: 'mushroom', emoji: '🍄', price: 350, name: 'Mushroom cap' },
  { id: 'hat-octopus', kind: 'hat', value: 'octopus', emoji: '🐙', price: 450, name: 'Octopus pal' },
  { id: 'hat-disco', kind: 'hat', value: 'disco', emoji: '🪩', price: 550, name: 'Disco ball' },
  { id: 'hat-diamond', kind: 'hat', value: 'diamond', emoji: '💎', price: 900, name: 'Diamond' },

  { id: 'p-prof', kind: 'persona', value: 'prof', emoji: '🧑‍🏫', price: 0, name: 'Professor Kern' },
  { id: 'p-pirate', kind: 'persona', value: 'pirate', emoji: '🏴‍☠️', price: 200, name: 'Captain Byte' },
  { id: 'p-wizard', kind: 'persona', value: 'wizard', emoji: '🧙', price: 200, name: 'Wizard Kernelius' },
  { id: 'p-hype', kind: 'persona', value: 'hype', emoji: '📣', price: 200, name: 'Coach Hype' },
  { id: 'p-cat', kind: 'persona', value: 'cat', emoji: '🐱', price: 200, name: 'Purrcy the cat' },
  { id: 'p-teta', kind: 'persona', value: 'teta', emoji: '👵', price: 200, name: 'Teta Kernel' },
];

export const SHOP_KINDS = [
  ['use', '⚡ Power-ups'],
  ['persona', '🎭 codme personalities'],
  ['hat', '🎩 Shop-only hats'],
  ['fx', '✨ Name effects'],
  ['bubble', '💬 Chat bubbles'],
  ['bg', '🖼️ Profile backgrounds'],
];

/** Things you switch on in your profile (checked again by the kerNEl server). */
export const LOOK_KINDS = ['bubble', 'bg', 'fx', 'persona'];

export const shopItem = (id) => SHOP.find((i) => i.id === id) || null;
/** 🛡️ Moderators own every look in the shop (everything except the power-ups, which get used up). */
export const ALL_LOOK_IDS = SHOP.filter((i) => i.kind !== 'use').map((i) => i.id);
export const itemFor = (kind, value) => SHOP.find((i) => i.kind === kind && i.value === value) || null;
/** Can someone with these owned item ids use this look? Free items (price 0) are for everyone. */
export const ownsLook = (kind, value, owned = []) => {
  const item = itemFor(kind, value);
  return !!item && (item.price === 0 || owned.includes(item.id));
};
