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
  { id: 'ticket', emoji: '🎟️', xp: 0, stat: 'invites', min: 1, need: 'invite a friend', name: 'VIP ticket' },
  { id: 'party', emoji: '🥳', xp: 0, stat: 'invited', min: 1, need: 'join with an invite', name: 'Party hat' },
  { id: 'mic', emoji: '🎤', xp: 0, stat: 'liveWins', min: 1, need: 'win a live show', name: 'Live champ mic' },
  { id: 'crystal', emoji: '🔮', xp: 0, stat: 'prophet', min: 5, need: '5 correct predictions', name: 'Crystal ball' },
  { id: 'sword', emoji: '⚔️', xp: 0, stat: 'duelsWon', min: 3, need: 'win 3 duels', name: 'Duel blade' },
  { id: 'chart', emoji: '📈', xp: 0, stat: 'stockWins', min: 1, need: 'finish a Story Stocks week in the top 3', name: 'Market mogul' },
  { id: 'target', emoji: '🎯', xp: 0, stat: 'bingos', min: 3, need: 'get Tech Bingo 3 times', name: 'Bingo pro' },
  { id: 'joker', emoji: '🃏', xp: 0, stat: 'cardSets', min: 1, need: 'complete a card set', name: 'Card shark' },
  { id: 'team', emoji: '🤝', xp: 0, stat: 'squadGoals', min: 3, need: 'reach your squad’s weekly goal 3 times', name: 'Team player' },
  { id: 'gavel', emoji: '⚖️', xp: 0, stat: 'debateWins', min: 3, need: 'write the winning argument in 3 debates', name: 'Debate champ' },
  // only in the 🧈 Butter Shop
  { id: 'blossom', emoji: '🌸', xp: 0, shop: true, need: 'buy it in the Butter Shop', name: 'Blossom' },
  { id: 'mushroom', emoji: '🍄', xp: 0, shop: true, need: 'buy it in the Butter Shop', name: 'Mushroom cap' },
  { id: 'octopus', emoji: '🐙', xp: 0, shop: true, need: 'buy it in the Butter Shop', name: 'Octopus pal' },
  { id: 'disco', emoji: '🪩', xp: 0, shop: true, need: 'buy it in the Butter Shop', name: 'Disco ball' },
  { id: 'diamond', emoji: '💎', xp: 0, shop: true, need: 'buy it in the Butter Shop', name: 'Diamond' },
];

export const FRAMES = [
  { id: 'none', xp: 0, name: 'No frame' },
  { id: 'mint', xp: 100, name: 'Minty fresh' },
  { id: 'neon', xp: 300, name: 'Neon glow' },
  { id: 'butter', xp: 600, name: 'Golden butter' },
  { id: 'rainbow', xp: 1000, name: 'Rainbow' },
  { id: 'galaxy', xp: 2000, name: 'Galaxy' },
  { id: 'champion', xp: 0, trophy: true, name: 'Champion' },
  { id: 'ambassador', xp: 0, stat: 'invites', min: 5, need: 'invite 5 friends', name: 'Ambassador' },
  { id: 'legend', xp: 0, stat: 'seasonWins', min: 1, need: 'finish a season in the top 3', name: 'Season legend' },
  { id: 'collector', xp: 0, stat: 'cardSets', min: 4, need: 'complete all 4 card sets', name: 'Master collector' },
];

/** Is a hat or frame unlocked? Most need XP; some need tournament trophies, a special counter (invites, live wins…) or a Butter Shop purchase. */
export const unlocked = (item, stats = {}) => !!item && (item.shop ? (stats.owned || []).includes(`hat-${item.id}`) : item.trophy ? (stats.trophies || 0) > 0 : item.stat ? (stats[item.stat] || 0) >= (item.min || 1) : (stats.xp || 0) >= item.xp);
export const hatById = (id) => HATS.find((h) => h.id === id) || HATS[0];
export const frameById = (id) => FRAMES.find((f) => f.id === id) || FRAMES[0];
