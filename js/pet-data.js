// 🐣 Kernel Pet: the four kinds of pet and how they grow (shared with the kerNEl server).
// A pet grows 1 point each day you feed it, and 2 while your streak is 7 days or longer.
export const PET_SPECIES = {
  chick: { name: 'Chick', stages: ['🥚', '🐣', '🐥', '🐔', '🦚'] },
  dino: { name: 'Dino', stages: ['🥚', '🦎', '🐊', '🦕', '🐉'] },
  kitty: { name: 'Kitty', stages: ['🧶', '🐱', '🐈', '🐆', '🦁'] },
  bot: { name: 'Robot', stages: ['🔋', '📟', '🤖', '👾', '🚀'] },
};
export const PET_STAGES = [
  { min: 0, name: 'Egg' },
  { min: 3, name: 'Baby' },
  { min: 8, name: 'Kid' },
  { min: 18, name: 'Teen' },
  { min: 40, name: 'Legend' },
];
export const PET_FEED_XP = 5;
export const STREAK_BOOST = 7; // days of streak that make feeding count double

/** Which stage a pet with this much growth is at, and how much it needs for the next one. */
export function petStage(growth = 0) {
  let i = 0;
  while (i + 1 < PET_STAGES.length && growth >= PET_STAGES[i + 1].min) i++;
  const next = PET_STAGES[i + 1] || null;
  return { index: i, name: PET_STAGES[i].name, from: PET_STAGES[i].min, next: next ? next.min : null };
}
export const petEmoji = (species, growth) => (PET_SPECIES[species] || PET_SPECIES.chick).stages[petStage(growth).index];
