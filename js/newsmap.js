// 🗺️ News Map: where today's stories are happening, on a dot-matrix world map. Each glowing spot is a place
// mentioned in the headlines (bigger = more stories); tap one to see them. Space stories get their own row.
import { $, esc, timeAgo } from './utils.js';
import { t, tn, lang } from './i18n.js';
import { sfx } from './fun.js';
import { catById } from './news.js';
import { MAP, LAND } from './map-data.js';
import { placesOf, flag } from './places.js';
import { makeDialog } from './arena.js';

const W = MAP.cols;
const H = MAP.rows;
// all land dots as one path of zero-length strokes with round caps: thousands of dots, one element
const LAND_PATH = LAND.map((row, r) => [...row].map((hex, i) => {
  const v = parseInt(hex, 16);
  let d = '';
  for (let b = 0; b < 4; b++) if (v & (8 >> b)) d += `M${i * 4 + b + 0.5} ${r + 0.5}h0`;
  return d;
}).join('')).join('');
const xy = (lat, lon) => [(lon + 180) / MAP.step, (MAP.top - lat) / MAP.step];

let regionNames = null;
const countryName = (cc) => {
  try { regionNames ||= new Intl.DisplayNames([lang, 'en'], { type: 'region' }); return regionNames.of(cc) || cc; } catch { return cc; }
};
export const placeName = (p) => (p.name ? t(p.name) : countryName(p.cc)); // cities and space spots have names; countries come from the browser, in your language
const placeLabel = (p) => (p.emoji ? `${p.emoji} ${t(p.name)}` : `${flag(p.cc)} ${placeName(p)}`);

/** Group stories by place: [{ place, stories }] biggest first, and the same for space. */
export function mapStories(items) {
  const earth = new Map();
  const space = new Map();
  for (const it of items) {
    const found = placesOf(`${it.title} ${it.summary || ''}`);
    for (const p of found.earth) (earth.get(p.id) || earth.set(p.id, { place: p, stories: [] }).get(p.id)).stories.push(it);
    for (const p of found.space) (space.get(p.id) || space.set(p.id, { place: p, stories: [] }).get(p.id)).stories.push(it);
  }
  const order = (m) => [...m.values()].sort((a, b) => b.stories.length - a.stories.length || a.place.id.localeCompare(b.place.id));
  return { earth: order(earth), space: order(space) };
}

export function initNewsMap({ openStory }) {
  const box = $('#mapWidget');
  const body = $('#mapBody');
  if (!box || !body) return null;
  const D = makeDialog('map-dialog', `🗺️ ${t('News Map')}`);
  let data = { earth: [], space: [] };
  let selected = null;
  let lastSig = '';

  function svg(big) {
    const max = Math.max(1, ...data.earth.map((g) => g.stories.length));
    const spots = data.earth.map((g) => {
      const [x, y] = xy(g.place.lat, g.place.lon);
      const r = 0.9 + Math.sqrt(g.stories.length / max) * (big ? 1.5 : 1.9);
      const on = selected === g.place.id;
      return `<g class="nm-spot${on ? ' on' : ''}" data-place="${g.place.id}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})" role="button" tabindex="0" aria-label="${esc(`${placeName(g.place)}: ${tn(g.stories.length, '{n} story', '{n} stories')}`)}">
        <circle class="nm-pulse" r="${(r * 1.9).toFixed(2)}"/><circle class="nm-core" r="${r.toFixed(2)}"/>${g.stories.length > 1 ? `<text dy=".35em">${g.stories.length}</text>` : ''}</g>`;
    }).join('');
    return `<svg class="nm-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('World map of where today’s stories happen'))}"><path class="nm-land" d="${LAND_PATH}"/>${spots}</svg>`;
  }

  function listHTML() {
    const g = [...data.earth, ...data.space].find((x) => x.place.id === selected);
    if (!g) return `<p class="muted small nm-hint">${data.earth.length || data.space.length ? t('Tap a glowing spot to see its stories.') : t('No places in today’s headlines yet — check back soon! 🌍')}</p>`;
    return `<p class="nm-place"><b>${esc(placeLabel(g.place))}</b> <small class="muted">${tn(g.stories.length, '{n} story', '{n} stories')}</small></p>
      <ul class="nm-stories">${g.stories.slice(0, 6).map((s) => `<li><button type="button" class="nm-story" data-nm-story="${esc(s.key)}"><span aria-hidden="true">${catById(s.cat).emoji}</span><span><b dir="auto">${esc(s.title)}</b><small>${esc(s.source || '')} · ${esc(timeAgo(s.time))}</small></span></button></li>`).join('')}</ul>`;
  }

  function chipsHTML() {
    const top = data.earth.slice(0, 6);
    return `${data.space.length ? `<div class="nm-chips nm-space" aria-label="${esc(t('Off the map'))}"><span class="muted small">🚀 ${t('Off the map:')}</span>${data.space.map((g) => `<button type="button" class="chip${selected === g.place.id ? ' on' : ''}" data-place="${g.place.id}">${esc(placeLabel(g.place))} <b>${g.stories.length}</b></button>`).join('')}</div>` : ''}
      ${top.length ? `<div class="nm-chips">${top.map((g) => `<button type="button" class="chip${selected === g.place.id ? ' on' : ''}" data-place="${g.place.id}">${esc(placeLabel(g.place))} <b>${g.stories.length}</b></button>`).join('')}</div>` : ''}`;
  }

  function paint() {
    box.hidden = false;
    body.innerHTML = `<div class="nm-wrap">${svg(false)}</div>${chipsHTML()}<div class="nm-list">${listHTML()}</div>
      <button type="button" class="btn btn-ghost btn-sm btn-block" data-nm-big>⤢ ${t('Bigger map')}</button>`;
    if (D.dlg.open) paintBig();
  }
  function paintBig() { D.body.innerHTML = `<div class="nm-wrap big">${svg(true)}</div>${chipsHTML()}<div class="nm-list">${listHTML()}</div>`; }

  function pick(id) {
    selected = selected === id ? null : id;
    sfx.blip();
    paint();
  }
  const all = () => [...data.earth, ...data.space].flatMap((g) => g.stories);
  function onClick(e) {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const p = el.closest('[data-place]');
    if (p) { pick(p.dataset.place); return; }
    const s = el.closest('[data-nm-story]');
    if (s) { const it = all().find((x) => x.key === s.dataset.nmStory); if (it) { if (D.dlg.open) D.dlg.close(); openStory(it); } return; }
    if (el.closest('[data-nm-big]')) { paintBig(); D.dlg.showModal(); }
  }
  const onKey = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('.nm-spot')) { e.preventDefault(); pick(e.target.closest('.nm-spot').dataset.place); } };
  for (const el of [body, D.body]) { el.addEventListener('click', onClick); el.addEventListener('keydown', onKey); }

  return {
    update(items) {
      data = mapStories(items);
      if (selected && ![...data.earth, ...data.space].some((g) => g.place.id === selected)) selected = null;
      const sig = [...data.earth, ...data.space].map((g) => `${g.place.id}:${g.stories.map((x) => x.key).join(',')}`).join('|') + lang;
      if (sig === lastSig) return; // nothing new: keep the map (and its animations) as they are
      lastSig = sig;
      paint();
    },
  };
}
