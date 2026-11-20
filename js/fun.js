// Sound effects, emoji confetti, popcorn rain, cheat codes and the doomscroll meter.
import { store, pick, prefersReducedMotion } from './utils.js';

// ---------- tiny synth: no audio files needed ----------
let audioCtx = null;
export const sfx = {
  enabled: store.get('sound', false),
  toggle() {
    this.enabled = !this.enabled;
    store.set('sound', this.enabled);
    if (this.enabled) this.ding();
    return this.enabled;
  },
  ctx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  },
  tone(freq, dur, type = 'sine', vol = 0.12, slideTo = 0, delay = 0) {
    if (!this.enabled) return;
    const ctx = this.ctx();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  },
  pop() { this.tone(520, 0.08, 'square', 0.08, 140); this.tone(900, 0.05, 'sine', 0.06, 300, 0.03); },
  blip() { this.tone(880, 0.06, 'sine', 0.06, 1320); },
  ding() { this.tone(1046, 0.22, 'triangle', 0.1); this.tone(1568, 0.3, 'triangle', 0.08, 0, 0.11); },
  boing() { this.tone(180, 0.35, 'sine', 0.14, 620); },
  buzz() { this.tone(150, 0.25, 'sawtooth', 0.06, 90); },
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.09, 0, i * 0.09)); },
};

// ---------- emoji burst ----------
export function burst(x, y, { emojis = ['🍿', '✨', '🎉', '💥'], count = 16, spread = 150 } = {}) {
  if (prefersReducedMotion()) count = Math.min(count, 3);
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'particle';
    s.textContent = pick(emojis);
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    document.body.append(s);
    const ang = Math.random() * Math.PI * 2;
    const dist = spread * (0.35 + Math.random() * 0.65);
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist - 50;
    const spin = (Math.random() - 0.5) * 540;
    const anim = s.animate(
      [
        { transform: 'translate(-50%, -50%) scale(.3)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1) rotate(${spin}deg)`, opacity: 1, offset: 0.65 },
        { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 90}px)) scale(.7) rotate(${spin * 1.3}deg)`, opacity: 0 },
      ],
      { duration: 850 + Math.random() * 500, easing: 'cubic-bezier(.2,.8,.3,1)' },
    );
    anim.onfinish = () => s.remove();
  }
}

export function burstFrom(el, opts) {
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, opts);
}

// ---------- popcorn rain ----------
export function rain(emojis = ['🍿'], count = 50) {
  if (prefersReducedMotion()) count = 8;
  const H = window.innerHeight;
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'particle';
    s.textContent = pick(emojis);
    s.style.left = `${Math.random() * 100}vw`;
    s.style.top = '-40px';
    s.style.fontSize = `${18 + Math.random() * 26}px`;
    document.body.append(s);
    const drift = (Math.random() - 0.5) * 160;
    const anim = s.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: `translate(${drift}px, ${H + 80}px) rotate(${(Math.random() - 0.5) * 720}deg)` },
      ],
      { duration: 1800 + Math.random() * 2200, delay: Math.random() * 1400, easing: 'cubic-bezier(.4,.1,.7,1)', fill: 'backwards' },
    );
    anim.onfinish = () => s.remove();
  }
}

// ---------- Konami code ----------
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
export function onKonami(cb) {
  let i = 0;
  window.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    i = k === KONAMI[i] ? i + 1 : k === KONAMI[0] ? 1 : 0;
    if (i === KONAMI.length) { i = 0; cb(); }
  });
}

// ---------- doomscroll meter ----------
const THINGS = [
  [8849, 'Mount Everests', '🏔️'],
  [330, 'Eiffel Towers', '🗼'],
  [93, 'Statues of Liberty', '🗽'],
  [30, 'blue whales', '🐋'],
  [12, 'school buses', '🚌'],
  [5.5, 'giraffes', '🦒'],
  [1.7, 'humans', '🧍'],
  [0.46, 'cats', '🐈'],
  [0.18, 'bananas', '🍌'],
  [0.005, 'ants', '🐜'],
];
const PX_TO_M = 0.0254 / 96; // one CSS pixel = 1/96 inch

export function initDoomscroll(onChange) {
  const today = new Date().toDateString();
  const saved = store.get('doomscroll', null);
  let total = saved && saved.day === today ? saved.px : 0;
  let lastY = window.scrollY;
  let pending = false;
  let lastSave = 0;
  const report = () => {
    pending = false;
    onChange(describeScroll(total));
    if (Date.now() - lastSave > 3000) { store.set('doomscroll', { day: today, px: total }); lastSave = Date.now(); }
  };
  window.addEventListener('scroll', () => {
    total += Math.abs(window.scrollY - lastY);
    lastY = window.scrollY;
    if (!pending) { pending = true; setTimeout(report, 400); }
  }, { passive: true });
  onChange(describeScroll(total));
}

export function describeScroll(px) {
  const m = px * PX_TO_M;
  const [size, name, emoji] = THINGS.find(([s]) => m >= s) || THINGS[THINGS.length - 1];
  const n = m / size;
  const meters = m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(1)} m`;
  const count = n < 10 ? n.toFixed(1) : String(Math.round(n));
  return { meters, emoji, count, name, text: `${count} ${name}` };
}
