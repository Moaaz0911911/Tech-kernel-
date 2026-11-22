// The emoji dictionary behind "Emoji TL;DR" and the Emoji Headlines game (shared with the kerNEl server).
export const EMOJI_MAP = {
  ai: '🤖', robot: '🤖', robots: '🤖', apple: '🍎', google: '🔍', search: '🔍', phone: '📱', iphone: '📱', android: '🤖📱',
  game: '🎮', games: '🎮', gaming: '🎮', space: '🚀', rocket: '🚀', launch: '🚀', launches: '🚀', nasa: '🛰️',
  money: '💰', billion: '💰', billions: '💰', million: '💵', funding: '💸', raises: '💸', hack: '🏴‍☠️', hacked: '🏴‍☠️',
  hackers: '🏴‍☠️', security: '🔐', password: '🔑', passwords: '🔑', car: '🚗', cars: '🚗', tesla: '🚗', electric: '⚡',
  battery: '🔋', chip: '🍟', chips: '🍟', fire: '🔥', new: '🆕', free: '🆓', open: '🔓', code: '💻', bug: '🐛', bugs: '🐛',
  cloud: '☁️', data: '📊', dead: '💀', kills: '💀', love: '❤️', world: '🌍', earth: '🌍', moon: '🌙', sun: '☀️', solar: '☀️',
  water: '💧', brain: '🧠', music: '🎵', video: '🎬', movie: '🎬', tv: '📺', camera: '📷', photo: '📸', book: '📚',
  school: '🏫', time: '⏰', fast: '⚡', slow: '🐢', big: '🐘', small: '🐜', windows: '🪟', linux: '🐧', python: '🐍',
  rust: '🦀', java: '☕', email: '📧', mail: '📧', chat: '💬', war: '⚔️', law: '⚖️', court: '⚖️', sues: '⚖️', lawsuit: '⚖️',
  police: '🚓', home: '🏠', food: '🍔', health: '🩺', doctor: '🩺', cat: '🐱', dog: '🐶', key: '🔑', lock: '🔒', star: '⭐',
  win: '🏆', wins: '🏆', bank: '🏦', crypto: '🪙', bitcoin: '🪙', energy: '⚡', nuclear: '☢️', plane: '✈️', train: '🚆',
  microsoft: '🪟', amazon: '📦', netflix: '🍿', nvidia: '🟩', gpu: '🎮', laptop: '💻', computer: '🖥️', internet: '🌐',
  web: '🕸️', browser: '🧭', privacy: '🙈', ban: '🚫', banned: '🚫', leak: '💧', leaks: '💧', quantum: '⚛️', science: '🔬',
  study: '📖', research: '🔬', climate: '🌡️', job: '💼', jobs: '💼', layoffs: '📦👋', ceo: '👔', startup: '🦄', update: '🔄',
  release: '🎁', released: '🎁', ships: '🚢', watch: '⌚', vr: '🥽', headset: '🥽', open_source: '🧑‍🤝‍🧑', app: '📲', apps: '📲',
  social: '🗣️', satellite: '🛰️', mars: '🔴', planet: '🪐', ocean: '🌊', speed: '🏎️', record: '🏅', first: '🥇', why: '🤔', how: '🛠️',
};

export function emojify(title) {
  const words = String(title).toLowerCase().replace(/open[ -]source/g, 'open_source').match(/[a-z0-9_]+/g) || [];
  const out = [];
  for (const w of words) {
    const e = EMOJI_MAP[w];
    if (e && out[out.length - 1] !== e) out.push(e);
  }
  if (out.length < 2) out.push('🤷');
  return out.slice(0, 8).join(' ');
}
