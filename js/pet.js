// 🐣 Kernel Pet on the website (Me tab): adopt a buddy, name it, feed it once a day, give treats, tap to say hi.
// It hatches and grows as you keep coming back; a 7-day streak makes it grow twice as fast. Pets never die.
import { $, esc, toast, pick } from './utils.js';
import { auth } from './auth.js';
import { sfx, burstFrom, rain } from './fun.js';
import { t, tServer } from './i18n.js';
import { PET_SPECIES, PET_STAGES } from './pet-data.js';

const SAYS = {
  happy: ['Yum! Thanks! 😋', 'Best day ever! 🎉', 'I love news time with you ❤️', 'Read me a headline? 📰', 'Hehe, that tickles! 🤭'],
  hungry: ['I’m hungry… 🥺', 'Is it snack time? 🍪', 'Feed me and I’ll grow! 🌱'],
  sad: ['I missed you! 😢', 'You’re back! Feed me? 🥺'],
};
const MOOD = { happy: '😊', hungry: '🥺', sad: '😢' };

export function initPet({ openShop }) {
  if (!auth.ready) { $('#petWidget')?.remove(); return null; }
  const box = $('#petWidget');
  const body = $('#petBody');
  let data = null;
  let species = 'chick';
  let renaming = false;
  let sayTimer = 0;

  function adoptHTML() {
    return `<p class="small">${t('Adopt a little buddy! It hatches and grows when you visit and feed it every day.')}</p>
      <div class="pet-kinds" role="radiogroup" aria-label="${esc(t('Pick a pet'))}">${Object.entries(PET_SPECIES).map(([id, s]) => `<button type="button" role="radio" aria-checked="${species === id}" data-pet-kind="${id}">
        <span class="pet-kind-egg" aria-hidden="true">${s.stages[0]}</span><b>${esc(t(s.name))}</b><small>→ ${s.stages[4]}</small></button>`).join('')}</div>
      <form class="pet-adopt" data-pet-adopt><input name="name" maxlength="16" dir="auto" required placeholder="${esc(t('Name your pet'))}" aria-label="${esc(t('Name your pet'))}">
        <button class="btn btn-primary">🥚 ${t('Adopt')}</button></form>`;
  }

  function paint() {
    box.hidden = false;
    if (!auth.user) {
      body.innerHTML = `<div class="pet-stage"><span class="pet-big">🥚</span></div><p class="small">${t('Adopt a little buddy! It hatches and grows when you visit and feed it every day.')}</p>
        <button type="button" class="btn btn-primary btn-block" data-action="signup">${t('Sign up to adopt a pet')}</button>`;
      return;
    }
    if (!data) { body.innerHTML = '<div class="chat-empty"><span class="spin">🥚</span></div>'; return; }
    const p = data.pet;
    if (!p) { body.innerHTML = adoptHTML(); return; }
    const kind = PET_SPECIES[p.species];
    const pct = p.next ? Math.round(((p.growth - p.from) / (p.next - p.from)) * 100) : 100;
    const boosted = data.streak >= data.boost;
    body.innerHTML = `<div class="pet-stage mood-${p.mood}">
        <button type="button" class="pet-big" data-pet-poke aria-label="${esc(t('Say hi to {name}', { name: p.name }))}">${p.emoji}</button>
        <span class="pet-mood" title="${esc(t(p.mood === 'happy' ? 'Happy' : p.mood === 'hungry' ? 'Hungry' : 'Missed you'))}">${MOOD[p.mood]}</span>
        <span class="pet-says" id="petSays" hidden></span></div>
      ${renaming ? `<form class="pet-adopt" data-pet-rename-form><input name="name" maxlength="16" dir="auto" required value="${esc(p.name)}" aria-label="${esc(t('Name your pet'))}"><button class="btn btn-primary btn-sm">${t('Save')}</button></form>`
        : `<p class="pet-name"><b dir="auto">${esc(p.name)}</b> <button type="button" class="linkish" data-pet-rename aria-label="${esc(t('Rename'))}">✏️</button></p>`}
      <p class="muted small pet-sub">${esc(t(PET_STAGES[p.stage].name))} ${esc(t(kind.name))}${p.love ? ` · ❤️ ${p.love}` : ''}</p>
      <div class="pet-grow" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(t('Growth'))}"><i style="width:${pct}%"></i></div>
      <p class="muted small">${p.next ? t('{n} more meals to grow into {emoji}', { n: p.next - p.growth, emoji: kind.stages[p.stage + 1] }) : t('Fully grown — a true legend! 🏆')}</p>
      <div class="pet-actions">
        <button type="button" class="btn btn-primary" data-pet-feed ${p.fedToday ? 'disabled' : ''}>${p.fedToday ? `✓ ${t('Fed today')}` : `🍽️ ${t('Feed')} <small>+${data.feedXp} XP</small>`}</button>
        <button type="button" class="btn btn-ghost" data-pet-treat>🍪 ${t('Treat')} <small>×${p.treats}</small></button>
      </div>
      <p class="muted small">${boosted ? `🔥 ${t('Your {n}-day streak makes {name} grow twice as fast!', { n: data.streak, name: esc(p.name) })}` : t('Keep a 7-day streak and your pet grows twice as fast.')}</p>`;
  }

  async function load() {
    if (!auth.user) { data = null; paint(); return; }
    try { data = await auth.api('/api/pet'); } catch { /* keep */ }
    paint();
  }

  function say(text) {
    const el = $('#petSays');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }
  function dance() {
    const big = body.querySelector('.pet-big');
    big?.classList.remove('dance');
    void big?.offsetWidth; // restart the animation
    big?.classList.add('dance');
  }

  body.addEventListener('click', async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const k = el.closest('[data-pet-kind]');
    if (k) { species = k.dataset.petKind; body.querySelectorAll('[data-pet-kind]').forEach((b) => b.setAttribute('aria-checked', String(b === k))); sfx.blip(); return; }
    if (el.closest('[data-pet-poke]')) { dance(); sfx.pop(); say(t(pick(SAYS[data.pet.mood]))); burstFrom(el.closest('[data-pet-poke]'), { emojis: ['❤️', '✨'], count: 5, spread: 40 }); return; }
    if (el.closest('[data-pet-rename]')) { renaming = true; paint(); body.querySelector('[data-pet-rename-form] input')?.focus(); return; }
    if (el.closest('[data-pet-feed]')) {
      const btn = el.closest('[data-pet-feed]');
      btn.disabled = true;
      try {
        const r = await auth.api('/api/pet/feed', { method: 'POST' });
        data = { ...data, ...r };
        paint();
        dance();
        sfx.ding();
        if (r.grew) {
          rain([r.pet.emoji, '🎉', '✨'], 30);
          toast(t('{name} grew into a {stage}! {emoji}', { name: r.pet.name, stage: t(r.pet.stageName), emoji: r.pet.emoji }), { emoji: '🎉', ms: 5000 });
        } else say(t(pick(['Yum! Thanks! 😋', 'Nom nom nom 🍽️', 'So tasty! 💖'])));
        document.dispatchEvent(new CustomEvent('kernel:rewards')); // feeding gave a little XP
      } catch (err) { toast(tServer(err.message), { emoji: '😵' }); btn.disabled = false; }
      return;
    }
    if (el.closest('[data-pet-treat]')) {
      if (!data.pet.treats) { toast(t('No treats yet — get some in the Butter Shop 🍪'), { emoji: '🍪' }); openShop?.('use'); return; }
      try {
        data = { ...data, ...(await auth.api('/api/pet/treat', { method: 'POST' })) };
        paint();
        dance();
        sfx.ding();
        rain(['🍪', '❤️'], 18);
        say(t('Best. Treat. Ever! 💃'));
      } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
    }
  });
  body.addEventListener('submit', async (e) => {
    const f = e.target;
    e.preventDefault();
    const name = f.elements.name.value.trim();
    if (!name) return;
    try {
      if (f.matches('[data-pet-adopt]')) {
        data = { ...data, ...(await auth.api('/api/pet/adopt', { method: 'POST', body: { species, name } })) };
        rain(['🥚', '✨', PET_SPECIES[species].stages[1]], 26);
        toast(t('Say hello to {name}! Feed it every day to help it hatch. 🥚', { name }), { emoji: '🐣', ms: 5000 });
      } else {
        data = { ...data, ...(await auth.api('/api/pet/name', { method: 'POST', body: { name } })) };
        renaming = false;
      }
      sfx.ding();
      paint();
    } catch (err) { toast(tServer(err.message), { emoji: '😵' }); }
  });
  auth.addEventListener('signin', load);
  auth.addEventListener('signout', load);
  document.addEventListener('kernel:pet', load);
  load();
  return { refresh: load };
}
