// Avatar cosmetics: hats and frames unlocked with XP (checked again by the kerNEl server).
export const HATS = [
  { id: 'none', emoji: '', xp: 0, name: 'No hat' },
  { id: 'cap', emoji: '🧢', xp: 50, name: 'Rookie cap' },
  { id: 'bow', emoji: '🎀', xp: 100, name: 'Fancy bow' },
  { id: 'tophat', emoji: '🎩', xp: 150, name: 'Top hat' },
  { id: 'grad', emoji: '🎓', xp: 300, name: 'Big brain cap' },
  { id: 'helmet', emoji: '⛑️', xp: 450, name: 'Bug-hunter helmet' },
  { id: 'crown', emoji: '👑', xp: 1000, name: 'Overlord crown' },
  { id: 'ufo', emoji: '🛸', xp: 2000, name: 'Galactic UFO' },
  { id: 'trophy', emoji: '🏆', xp: 0, trophy: true, name: 'Champion cup' },
];

export const FRAMES = [
  { id: 'none', xp: 0, name: 'No frame' },
  { id: 'mint', xp: 100, name: 'Minty fresh' },
  { id: 'neon', xp: 300, name: 'Neon glow' },
  { id: 'butter', xp: 600, name: 'Golden butter' },
  { id: 'rainbow', xp: 1000, name: 'Rainbow' },
  { id: 'galaxy', xp: 2000, name: 'Galaxy' },
  { id: 'champion', xp: 0, trophy: true, name: 'Champion' },
];

/** Is a hat or frame unlocked for someone with this much XP and this many tournament trophies? */
export const unlocked = (item, { xp = 0, trophies = 0 } = {}) => !!item && (item.trophy ? trophies > 0 : xp >= item.xp);
export const hatById = (id) => HATS.find((h) => h.id === id) || HATS[0];
export const frameById = (id) => FRAMES.find((f) => f.id === id) || FRAMES[0];
