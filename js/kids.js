// kerNEl Kids — nine mini-adventures that teach how tech works.
import { $, $$, esc, pick, store, toast, sleep } from './utils.js';
import { sfx, burst, burstFrom, rain } from './fun.js';

const LESSONS = [
  { id: 'computer', emoji: '🖥️', title: 'Inside a computer', badge: 'Hardware Hero', color: '#ff9f43' },
  { id: 'binary', emoji: '💡', title: 'Binary light code', badge: 'Binary Buddy', color: '#ffd23f' },
  { id: 'robot', emoji: '🤖', title: 'Program the robot', badge: 'Robot Boss', color: '#2ee6a6' },
  { id: 'pixels', emoji: '🎨', title: 'Pixel painter', badge: 'Pixel Picasso', color: '#ff7ab6' },
  { id: 'internet', emoji: '📨', title: 'Internet messages', badge: 'Packet Pilot', color: '#38bdf8' },
  { id: 'passwords', emoji: '🔐', title: 'Password power-up', badge: 'Password Pro', color: '#8b5cf6' },
  { id: 'safety', emoji: '🦸', title: 'Internet superhero', badge: 'Safety Hero', color: '#ff4d5e' },
  { id: 'words', emoji: '📖', title: 'Tech word cards', badge: 'Word Wizard', color: '#00c2a8' },
  { id: 'quiz', emoji: '🏆', title: 'Big tech quiz', badge: 'Quiz Champion', color: '#ff9f1c' },
];
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const CHEERS = ['Awesome!', 'You did it!', 'Super smart!', 'Brilliant!', 'High five! ✋', 'Amazing!', 'Wow, genius!'];

// ====================================================================================
// Stars, badges, read-aloud
// ====================================================================================
let stars = store.get('kids:stars', {});
let readAloud = store.get('kids:read', false);

function getStars(id) { return stars[id] || 0; }
function award(id, n, where) {
  n = Math.max(0, Math.min(3, n));
  if (n <= getStars(id)) return false;
  const gotBadge = getStars(id) === 0;
  stars = { ...stars, [id]: n };
  store.set('kids:stars', stars);
  paintStars();
  const lesson = LESSONS.find((l) => l.id === id);
  if (where) burstFrom(where, { emojis: ['⭐', '🌟', '✨'], count: 18 });
  sfx.win();
  toast(gotBadge ? `New badge: ${lesson.badge}! ${'⭐'.repeat(n)}` : `${lesson.title}: now ${'⭐'.repeat(n)}`, { emoji: gotBadge ? '🏅' : '⭐' });
  if (LESSONS.every((l) => getStars(l.id) > 0) && !store.get('kids:allDone', false)) {
    store.set('kids:allDone', true);
    setTimeout(() => { rain(['⭐', '🍿', '🎉', '🏅'], 90); toast('You finished EVERY adventure! Grab your certificate at the bottom! 🎓', { emoji: '🎓', ms: 7000 }); }, 600);
  }
  return true;
}
const starStr = (n) => '⭐'.repeat(n) + '☆'.repeat(3 - n);

function paintStars() {
  const total = LESSONS.reduce((s, l) => s + getStars(l.id), 0);
  $('#starCount').textContent = `⭐ ${total}/${LESSONS.length * 3}`;
  $$('[data-stars]').forEach((el) => { el.textContent = starStr(getStars(el.dataset.stars)); el.setAttribute('aria-label', `${getStars(el.dataset.stars)} of 3 stars`); });
  $('#mapGrid').innerHTML = LESSONS.map((l, i) => `
    <a class="map-tile${getStars(l.id) ? ' done' : ''}" href="#${l.id}" style="--c:${l.color}">
      <span class="mt-num">${i + 1}</span><span class="mt-emoji" aria-hidden="true">${l.emoji}</span>
      <span class="mt-title">${esc(l.title)}</span><span class="mt-stars" aria-label="${getStars(l.id)} of 3 stars">${starStr(getStars(l.id))}</span>
    </a>`).join('');
  $('#badgeShelf').innerHTML = LESSONS.map((l) => {
    const got = getStars(l.id) > 0;
    return `<div class="badge${got ? ' got' : ''}" style="--c:${l.color}"><span class="b-emoji" aria-hidden="true">${got ? l.emoji : '🔒'}</span><b>${esc(l.badge)}</b><small>${got ? starStr(getStars(l.id)) : 'Not yet!'}</small></div>`;
  }).join('');
  $('#certCta').hidden = !LESSONS.every((l) => getStars(l.id) > 0);
}

function speak(text, force = false) {
  if (!force && !readAloud) return;
  if (!('speechSynthesis' in window)) { if (force) toast('Sorry, this browser can’t read out loud.', { emoji: '🙊' }); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text).replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ''));
  u.rate = 0.95;
  u.pitch = 1.15;
  speechSynthesis.speak(u);
}

// ====================================================================================
// 1. Inside a computer
// ====================================================================================
const PARTS = [
  { id: 'cpu', emoji: '🧠', name: 'CPU (processor)', kind: 'inside', text: 'The CPU is the computer’s brain. It follows instructions super fast — billions of them every second!' },
  { id: 'ram', emoji: '📝', name: 'Memory (RAM)', kind: 'inside', text: 'RAM is like a desk. The computer keeps what it’s working on right now there. When you switch off, the desk is cleared!' },
  { id: 'storage', emoji: '🎒', name: 'Storage', kind: 'inside', text: 'Storage is like a backpack. It keeps your games, photos and files safe, even when the computer is turned off.' },
  { id: 'gpu', emoji: '🎨', name: 'Graphics chip (GPU)', kind: 'inside', text: 'The GPU is the artist. It draws all the pictures, colours and game worlds on your screen.' },
  { id: 'keyboard', emoji: '⌨️', name: 'Keyboard', kind: 'input', text: 'The keyboard is an INPUT. You use it to tell the computer letters and numbers.' },
  { id: 'mouse', emoji: '🖱️', name: 'Mouse', kind: 'input', text: 'The mouse is an INPUT. It tells the computer where you’re pointing and clicking.' },
  { id: 'mic', emoji: '🎤', name: 'Microphone', kind: 'input', text: 'A microphone is an INPUT. It lets the computer hear your voice.' },
  { id: 'camera', emoji: '📷', name: 'Webcam', kind: 'input', text: 'A webcam is an INPUT. It lets the computer see pictures and video.' },
  { id: 'screen', emoji: '🖥️', name: 'Screen', kind: 'output', text: 'The screen is an OUTPUT. It shows you what the computer is doing.' },
  { id: 'speaker', emoji: '🔊', name: 'Speakers', kind: 'output', text: 'Speakers are an OUTPUT. They let the computer play sounds and music.' },
  { id: 'printer', emoji: '🖨️', name: 'Printer', kind: 'output', text: 'A printer is an OUTPUT. It puts the computer’s work onto paper.' },
];
const KIND = { input: '👂 INPUT', inside: '🧠 INSIDE', output: '📢 OUTPUT' };

function initComputer() {
  $('#partsGrid').innerHTML = PARTS.map((p) => `<button type="button" class="part" data-part="${p.id}"><span aria-hidden="true">${p.emoji}</span>${esc(p.name)}</button>`).join('');
  $('#partsGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-part]');
    if (!b) return;
    const p = PARTS.find((x) => x.id === b.dataset.part);
    $$('.part').forEach((x) => x.classList.toggle('on', x === b));
    $('#partInfo').innerHTML = `<span class="pi-emoji">${p.emoji}</span><div><span class="kind kind-${p.kind}">${KIND[p.kind]}</span><h4>${esc(p.name)}</h4><p>${esc(p.text)}</p></div>`;
    sfx.blip();
    speak(`${p.name}. ${p.text}`);
  });

  let deck = [];
  let mistakes = 0;
  const next = () => {
    if (!deck.length) {
      const n = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
      $('#sortCard').innerHTML = `<span class="sc-emoji">🎉</span><b>All sorted!</b><button type="button" class="k-btn k-btn-soft k-btn-sm" id="sortAgain">Play again</button>`;
      $('#sortMsg').textContent = mistakes ? `Done with ${mistakes} oops${mistakes === 1 ? '' : 'es'}. ${pick(CHEERS)}` : `Perfect score! ${pick(CHEERS)}`;
      award('computer', n, $('#sortCard'));
      return;
    }
    const p = deck[0];
    $('#sortCard').innerHTML = `<span class="sc-emoji">${p.emoji}</span><b>${esc(p.name)}</b><small>${deck.length} left</small>`;
  };
  const start = () => { deck = shuffle(PARTS).slice(0, 7); mistakes = 0; $('#sortMsg').textContent = 'Where does this part belong?'; next(); };
  $('.sort-bins').addEventListener('click', (e) => {
    const bin = e.target.closest('[data-bin]');
    if (!bin || !deck.length) return;
    const p = deck[0];
    if (bin.dataset.bin === p.kind) {
      deck.shift();
      sfx.ding();
      burstFrom(bin, { emojis: ['✅', '⭐'], count: 6, spread: 60 });
      $('#sortMsg').textContent = `${pick(CHEERS)} ${p.name} is ${KIND[p.kind].split(' ')[1].toLowerCase()}.`;
      next();
    } else {
      mistakes++;
      sfx.buzz();
      bin.classList.add('nope');
      setTimeout(() => bin.classList.remove('nope'), 400);
      $('#sortMsg').textContent = `Hmm, not quite! Think: does the ${p.name.toLowerCase()} listen, think, or show?`;
    }
  });
  $('#sortCard').addEventListener('click', (e) => { if (e.target.closest('#sortAgain')) start(); });
  start();
}

// ====================================================================================
// 2. Binary
// ====================================================================================
const VALUES = [16, 8, 4, 2, 1];
function initBinary() {
  const on = VALUES.map(() => false);
  let target = 0;
  let solved = 0;
  $('#bulbs').innerHTML = VALUES.map((v, i) => `<button type="button" class="bulb" data-i="${i}" aria-pressed="false" aria-label="Bulb worth ${v}"><span class="glass">💡</span><b>${v}</b><small class="bit">0</small></button>`).join('');
  const newTarget = () => {
    let t;
    do { t = 1 + Math.floor(Math.random() * 31); } while (t === target);
    target = t;
    $('#binTarget').textContent = target;
  };
  const paint = () => {
    const sum = VALUES.reduce((s, v, i) => s + (on[i] ? v : 0), 0);
    $$('.bulb').forEach((b, i) => {
      b.classList.toggle('lit', on[i]);
      b.setAttribute('aria-pressed', String(on[i]));
      b.querySelector('.bit').textContent = on[i] ? '1' : '0';
    });
    $('#binDigits').textContent = on.map((x) => (x ? '1' : '0')).join('');
    $('#binSum').textContent = sum;
    const parts = VALUES.filter((v, i) => on[i]);
    $('#binMath').textContent = parts.length ? `${parts.join(' + ')} = ${sum}` : 'All the lights are off. That’s zero!';
    return sum;
  };
  $('#bulbs').addEventListener('click', (e) => {
    const b = e.target.closest('.bulb');
    if (!b) return;
    const i = Number(b.dataset.i);
    on[i] = !on[i];
    on[i] ? sfx.pop() : sfx.blip();
    const sum = paint();
    if (sum === target) {
      solved++;
      $('#binMsg').textContent = `🎉 YES! ${target} in binary is ${on.map((x) => (x ? '1' : '0')).join('')}. ${pick(CHEERS)} Here’s a new number…`;
      speak(`Yes! You made ${target}!`);
      award('binary', Math.min(3, solved), $('#binTarget'));
      burstFrom($('#binSum'), { emojis: ['💡', '✨', '🎉'], count: 14 });
      setTimeout(() => { on.fill(false); paint(); newTarget(); }, 1600);
    } else if (sum > target) {
      $('#binMsg').textContent = `Too big! ${sum} is more than ${target}. Turn a bulb off.`;
    } else {
      $('#binMsg').textContent = sum ? `${sum} so far — you need ${target - sum} more.` : 'Turn on the right bulbs. Hint: start with the biggest bulb that fits!';
    }
  });
  $('#binSkip').addEventListener('click', () => { on.fill(false); paint(); newTarget(); $('#binMsg').textContent = 'New number! You can do it 💪'; });
  newTarget();
  paint();

  const out = $('#nameCodeOut');
  $('#nameCode').addEventListener('input', (e) => {
    const letters = [...e.target.value.toUpperCase()].filter((c) => /[A-Z0-9 ]/.test(c)).slice(0, 10);
    out.innerHTML = letters.map((c) => {
      const code = c.charCodeAt(0);
      const bits = code.toString(2).padStart(8, '0');
      return `<div class="nc-row"><b>${c === ' ' ? '␣' : esc(c)}</b><span class="nc-bits">${[...bits].map((x) => `<i class="${x === '1' ? 'on' : ''}"></i>`).join('')}</span><code>${bits}</code><small>= ${code}</small></div>`;
    }).join('');
  });
}

// ====================================================================================
// 3. Robot coder
// ====================================================================================
const LEVELS = [
  { start: [4, 0], goal: [4, 3], rocks: [] },
  { start: [4, 0], goal: [1, 3], rocks: [[3, 0], [3, 1], [2, 3], [4, 3]] },
  { start: [0, 0], goal: [4, 4], rocks: [[0, 2], [1, 1], [1, 3], [2, 3], [3, 1], [3, 3]] },
];
const MOVES = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const ARROWS = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' };

function initRobot() {
  let level = Math.min(store.get('kids:robotLevel', 0), LEVELS.length - 1);
  let program = [];
  let running = false;
  let pos;
  const grid = $('#robotGrid');
  const isRock = (r, c) => LEVELS[level].rocks.some(([a, b]) => a === r && b === c);

  const draw = (trail = []) => {
    const L = LEVELS[level];
    let html = '';
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        let content = '';
        if (pos[0] === r && pos[1] === c) content = '<span class="bot">🤖</span>';
        else if (L.goal[0] === r && L.goal[1] === c) content = '🔋';
        else if (isRock(r, c)) content = '🪨';
        const t = trail.some(([a, b]) => a === r && b === c) ? ' trail' : '';
        html += `<div class="cell${t}">${content}</div>`;
      }
    }
    grid.innerHTML = html;
    $('#robotLevel').textContent = `Level ${level + 1} of ${LEVELS.length}`;
  };
  const drawProgram = () => {
    const el = $('#program');
    el.innerHTML = program.length
      ? program.map((c, i) => `<span class="step" data-step="${i}">${ARROWS[c]}</span>`).join('')
      : '<span class="program-empty">Your program is empty. Add some steps! 👇</span>';
  };
  const reset = () => { pos = [...LEVELS[level].start]; draw(); };

  $('.arrow-pad').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd]');
    if (!b || running) return;
    if (program.length >= 14) { $('#robotMsg').textContent = 'That’s a long program! Try running it first.'; return; }
    program.push(b.dataset.cmd);
    sfx.blip();
    drawProgram();
  });
  $('#robotUndo').addEventListener('click', () => { if (!running) { program.pop(); drawProgram(); } });
  $('#robotClear').addEventListener('click', () => { if (!running) { program = []; drawProgram(); reset(); $('#robotMsg').textContent = ''; } });
  $('#robotNext').addEventListener('click', () => {
    level = Math.min(level + 1, LEVELS.length - 1);
    store.set('kids:robotLevel', level);
    program = [];
    drawProgram();
    reset();
    $('#robotNext').hidden = true;
    $('#robotMsg').textContent = 'New maze! Plan your steps carefully. 🧠';
  });
  $('#robotRun').addEventListener('click', async () => {
    if (running) return;
    if (!program.length) { $('#robotMsg').textContent = 'Add some arrow steps first! 👇'; sfx.buzz(); return; }
    running = true;
    reset();
    const trail = [[...pos]];
    $('#robotMsg').textContent = 'Running your program… 🏃';
    const steps = $$('.step');
    for (let i = 0; i < program.length; i++) {
      steps.forEach((s, j) => s.classList.toggle('now', j === i));
      await sleep(420);
      const [dr, dc] = MOVES[program[i]];
      const nr = pos[0] + dr;
      const nc = pos[1] + dc;
      if (nr < 0 || nr > 4 || nc < 0 || nc > 4 || isRock(nr, nc)) {
        sfx.buzz();
        grid.classList.add('bonk');
        setTimeout(() => grid.classList.remove('bonk'), 500);
        steps[i]?.classList.add('bug');
        $('#robotMsg').innerHTML = `💥 Bonk! Step ${i + 1} ran into ${nr < 0 || nr > 4 || nc < 0 || nc > 4 ? 'a wall' : 'a rock'}. That’s a <b>bug</b> 🐛 — fix your program and try again!`;
        speak('Bonk! That is a bug. Fix your program and try again!');
        running = false;
        return;
      }
      pos = [nr, nc];
      trail.push([...pos]);
      sfx.pop();
      draw(trail);
      const g = LEVELS[level].goal;
      if (pos[0] === g[0] && pos[1] === g[1]) {
        $('#robotMsg').textContent = `⚡ Bolt is charged! ${pick(CHEERS)} You wrote a program with ${i + 1} steps.`;
        speak('Bolt is charged! You are a great programmer!');
        award('robot', level + 1, grid);
        if (level < LEVELS.length - 1) $('#robotNext').hidden = false;
        else { $('#robotMsg').textContent += ' You beat every level — Robot Boss! 👑'; rain(['🤖', '🔋', '⚡'], 40); }
        running = false;
        return;
      }
    }
    $('#robotMsg').textContent = 'Bolt ran out of steps before reaching the battery. Add more steps! 🔋';
    sfx.buzz();
    running = false;
  });
  reset();
  drawProgram();
}

// ====================================================================================
// 4. Pixel painter
// ====================================================================================
const COLORS = { r: '#ff4d5e', o: '#ff9f43', y: '#ffd23f', g: '#2ee6a6', b: '#38bdf8', p: '#ff7ab6', v: '#8b5cf6', k: '#2b2340', w: '#ffffff' };
const TEMPLATES = {
  heart: ['............', '..rr....rr..', '.rrrr..rrrr.', 'rrrrrrrrrrrr', 'rrrrrrrrrrrr', 'rrrrrrrrrrrr', '.rrrrrrrrrr.', '..rrrrrrrr..', '...rrrrrr...', '....rrrr....', '.....rr.....', '............'],
  smile: ['....yyyy....', '..yyyyyyyy..', '.yyyyyyyyyy.', '.yykyyyykyy.', 'yyykyyyykyyy', 'yyyyyyyyyyyy', 'yyyyyyyyyyyy', 'yykyyyyyykyy', '.yykkkkkkyy.', '.yyyyyyyyyy.', '..yyyyyyyy..', '....yyyy....'],
  rocket: ['.....rr.....', '....rwwr....', '....wwww....', '....wbbw....', '....wbbw....', '....wwww....', '...rwwwwr...', '..rrwwwwrr..', '..r.wwww.r..', '....oyyo....', '.....oo.....', '.....y......'],
};
function initPixels() {
  const N = 12;
  const cells = Array(N * N).fill('');
  let color = 'r';
  let painting = false;
  const grid = $('#pixelGrid');
  grid.innerHTML = cells.map((_, i) => `<div class="px" data-i="${i}"></div>`).join('');
  const pxEls = $$('.px', grid);
  $('#palette').innerHTML = Object.entries(COLORS).map(([k, c]) => `<button type="button" class="swatch${k === color ? ' on' : ''}" data-color="${k}" style="--sw:${c}" role="radio" aria-checked="${k === color}" aria-label="Colour ${k}"></button>`).join('')
    + '<button type="button" class="swatch eraser" data-color="" role="radio" aria-checked="false" aria-label="Eraser">🧽</button>';
  const ctx = $('#pixelPreview').getContext('2d');
  const update = () => {
    const filled = cells.filter(Boolean).length;
    const used = new Set(cells.filter(Boolean)).size;
    $('#pixelCount').textContent = `${filled} of ${N * N} pixels coloured · ${used} colour${used === 1 ? '' : 's'}`;
    ctx.clearRect(0, 0, N, N);
    cells.forEach((c, i) => { if (c) { ctx.fillStyle = COLORS[c]; ctx.fillRect(i % N, Math.floor(i / N), 1, 1); } });
    if (filled >= 60 && used >= 3) award('pixels', 3, grid);
    else if (filled >= 30 && used >= 2) award('pixels', 2, grid);
    else if (filled >= 10) award('pixels', 1, grid);
  };
  const paintCell = (i) => {
    if (i == null || Number.isNaN(i) || cells[i] === color) return;
    cells[i] = color;
    pxEls[i].style.background = color ? COLORS[color] : '';
    pxEls[i].classList.toggle('filled', !!color);
  };
  const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); return el?.classList?.contains('px') ? Number(el.dataset.i) : null; };
  grid.addEventListener('pointerdown', (e) => { painting = true; grid.setPointerCapture?.(e.pointerId); paintCell(cellAt(e.clientX, e.clientY)); sfx.blip(); e.preventDefault(); });
  grid.addEventListener('pointermove', (e) => { if (painting) paintCell(cellAt(e.clientX, e.clientY)); });
  const stop = () => { if (painting) { painting = false; update(); } };
  grid.addEventListener('pointerup', stop);
  grid.addEventListener('pointercancel', stop);
  $('#palette').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    color = b.dataset.color;
    $$('.swatch').forEach((s) => { s.classList.toggle('on', s === b); s.setAttribute('aria-checked', String(s === b)); });
    sfx.blip();
  });
  $$('[data-template]').forEach((b) => b.addEventListener('click', () => {
    TEMPLATES[b.dataset.template].join('').split('').forEach((ch, i) => {
      cells[i] = ch === '.' ? '' : ch;
      pxEls[i].style.background = cells[i] ? COLORS[cells[i]] : '';
      pxEls[i].classList.toggle('filled', !!cells[i]);
    });
    sfx.pop();
    update();
  }));
  $('#pixelClear').addEventListener('click', () => {
    cells.fill('');
    pxEls.forEach((p) => { p.style.background = ''; p.classList.remove('filled'); });
    update();
  });
  update();
}

// ====================================================================================
// 5. Internet packets
// ====================================================================================
function initInternet() {
  const stage = $('#netStage');
  const ROUTERS = [[50, 18], [50, 50], [50, 82]];
  let sends = 0;
  let busy = false;
  $('#sendForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const msg = $('#sendText').value.trim().toUpperCase() || 'HI!';
    const chunks = msg.match(/.{1,4}/g);
    busy = true;
    $('#arrived').textContent = '…';
    $('#assembled').innerHTML = `✂️ Chopped “${esc(msg)}” into <b>${chunks.length}</b> packets. Off they go!`;
    sfx.pop();
    const arrived = [];
    await Promise.all(chunks.map((text, i) => new Promise((resolve) => {
      const p = document.createElement('div');
      p.className = 'packet';
      p.innerHTML = `<b>#${i + 1}</b><span>${esc(text.replace(/ /g, '·'))}</span>`;
      stage.append(p);
      const [rx, ry] = pick(ROUTERS);
      const dur = 1400 + Math.random() * 1800;
      const anim = p.animate([
        { left: '9%', top: '50%', transform: 'translate(-50%,-50%) scale(.6)' },
        { left: `${rx}%`, top: `${ry}%`, transform: 'translate(-50%,-50%) scale(1)', offset: 0.5 },
        { left: '91%', top: '50%', transform: 'translate(-50%,-50%) scale(.7)' },
      ], { duration: dur, delay: i * 180, easing: 'ease-in-out', fill: 'forwards' });
      anim.onfinish = () => {
        p.remove();
        arrived.push({ i, text });
        $('#arrived').innerHTML = arrived.map((a) => `<span class="chip">#${a.i + 1}</span>`).join(' ');
        sfx.blip();
        resolve();
      };
    })));
    const ordered = [...arrived].sort((a, b) => a.i - b.i).map((a) => a.text).join('');
    const outOfOrder = arrived.some((a, k) => a.i !== k);
    sends++;
    const more = sends < 3 ? `<p class="tiny-note">Send ${3 - sends} more message${sends === 2 ? '' : 's'} to earn all 3 stars ⭐</p>` : '';
    $('#assembled').innerHTML = `${outOfOrder ? '🔀 The packets arrived mixed up, so the computer sorted them by number…' : '📦 All packets arrived in order!'}<div class="final-msg">💌 ${esc(ordered)}</div>${more}`;
    award('internet', Math.min(3, sends), stage);
    speak(`Message delivered! ${outOfOrder ? 'The packets arrived mixed up, but the computer put them back in order.' : ''}`);
    busy = false;
  });
}

// ====================================================================================
// 6. Passwords
// ====================================================================================
const COMMON = ['password', '123456', '12345678', 'qwerty', 'abc123', 'iloveyou', 'letmein', 'admin', 'welcome', 'monkey', 'dragon', 'football', '111111', 'password1', 'sunshine', 'princess'];
const STAGES = [
  ['🥚', 'I’m just an egg… so easy to crack!'],
  ['🥚', 'Still an egg. Try making it longer!'],
  ['🐣', 'Hatching! Keep adding stuff!'],
  ['🐥', 'Cheep! Getting there!'],
  ['🦎', 'Getting stronger! Try symbols like ! or #'],
  ['🐊', 'Snap! That’s a strong password!'],
  ['🐉', 'Whoa, a dragon! Super strong!'],
  ['🦖', 'MEGA MONSTER! Hackers run away screaming!'],
];
const SILLY = { a: ['Purple', 'Sneaky', 'Giant', 'Bouncy', 'Sleepy', 'Fuzzy', 'Cosmic', 'Wobbly'], n: ['Tiger', 'Penguin', 'Robot', 'Llama', 'Dragon', 'Pickle', 'Octopus', 'Waffle'], v: ['Eats', 'Juggles', 'Hugs', 'Paints', 'Chases', 'Tickles'], f: ['Tacos', 'Noodles', 'Pancakes', 'Donuts', 'Cookies', 'Popcorn'] };
function initPasswords() {
  const input = $('#pwInput');
  const rules = [
    ['len8', 'At least 8 characters', (s) => s.length >= 8],
    ['len12', '12 or more characters (super!)', (s) => s.length >= 12],
    ['upper', 'Has CAPITAL letters', (s) => /[A-Z]/.test(s)],
    ['lower', 'Has small letters', (s) => /[a-z]/.test(s)],
    ['num', 'Has numbers', (s) => /\d/.test(s)],
    ['sym', 'Has symbols like ! ? # -', (s) => /[^A-Za-z0-9]/.test(s)],
    ['common', 'Not a super-common password', (s) => s.length > 0 && !COMMON.includes(s.toLowerCase())],
  ];
  const check = () => {
    const s = input.value;
    const results = rules.map(([id, label, fn]) => [id, label, fn(s)]);
    const isCommon = s && COMMON.includes(s.toLowerCase());
    const score = isCommon ? 0 : results.filter((r) => r[2]).length;
    $('#pwChecks').innerHTML = results.map(([, label, ok]) => `<li class="${ok ? 'ok' : ''}">${ok ? '✅' : '⬜'} ${esc(label)}</li>`).join('');
    const [emoji, say] = isCommon ? ['😱', 'Oh no! Hackers try that one FIRST. Pick something else!'] : STAGES[score];
    const m = $('#monster');
    if (m.textContent !== emoji) { m.textContent = emoji; m.classList.remove('grow'); void m.offsetWidth; m.classList.add('grow'); if (s) sfx.pop(); }
    m.style.setProperty('--size', `${1 + score * 0.18}`);
    $('#monsterSay').textContent = s ? say : 'I’m just an egg… feed me a password!';
    $('#pwBar').style.width = `${(score / 7) * 100}%`;
    $('#pwBar').style.background = score >= 6 ? '#2ee6a6' : score >= 4 ? '#ffd23f' : '#ff4d5e';
    if (score >= 7) award('passwords', 3, m);
    else if (score >= 6) award('passwords', 2, m);
    else if (score >= 4) award('passwords', 1, m);
  };
  input.addEventListener('input', check);
  $('#pwSilly').addEventListener('click', () => {
    input.value = `${pick(SILLY.a)}-${pick(SILLY.n)}-${pick(SILLY.v)}-${10 + Math.floor(Math.random() * 90)}-${pick(SILLY.f)}${pick(['!', '?', '#', '*'])}`;
    check();
    speak('Here is a silly but super strong password idea!');
  });
  check();
}

// ====================================================================================
// Quiz engine (used by Safety + Big Quiz)
// ====================================================================================
function runQuiz(box, questions, { lessonId, onScore, finishText }) {
  let i = 0;
  let correct = 0;
  let firstTry = true;
  const show = () => {
    if (i >= questions.length) {
      const n = onScore(correct, questions.length);
      box.innerHTML = `<div class="quiz-end"><span class="qe-emoji">${n === 3 ? '🏆' : n === 2 ? '🥈' : '🌟'}</span><h3>${esc(finishText(correct, questions.length))}</h3><p>${'⭐'.repeat(n)}</p><button type="button" class="k-btn k-btn-go" data-restart>Play again 🔄</button></div>`;
      award(lessonId, n, box);
      if (n === 3) rain(['⭐', '🎉', '🍿'], 40);
      return;
    }
    const q = questions[i];
    const opts = shuffle(q.options.map((text, idx) => ({ text, right: idx === q.answer })));
    firstTry = true;
    box.innerHTML = `<div class="q-progress"><span>Question ${i + 1} of ${questions.length}</span><span>✅ ${correct}</span></div>
      <div class="q-bar"><i style="width:${(i / questions.length) * 100}%"></i></div>
      <h3 class="q-text">${q.emoji ? `<span aria-hidden="true">${q.emoji}</span> ` : ''}${esc(q.q)}</h3>
      <div class="q-opts">${opts.map((o, k) => `<button type="button" class="q-opt" data-right="${o.right}" data-k="${k}">${esc(o.text)}</button>`).join('')}</div>
      <p class="q-feedback" aria-live="polite"></p>`;
    speak(`${q.q} ${opts.map((o) => o.text).join('. Or, ')}`);
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-restart]')) { i = 0; correct = 0; show(); return; }
    if (e.target.closest('[data-next]')) { i++; show(); return; }
    const b = e.target.closest('.q-opt');
    if (!b || b.disabled) return;
    const q = questions[i];
    if (b.dataset.right === 'true') {
      if (firstTry) correct++;
      $$('.q-opt', box).forEach((x) => { x.disabled = true; });
      b.classList.add('right');
      sfx.ding();
      burstFrom(b, { emojis: ['✅', '⭐', '🎉'], count: 10, spread: 80 });
      $('.q-feedback', box).innerHTML = `${firstTry ? pick(CHEERS) : 'You got there!'} ${q.why ? esc(q.why) : ''} <button type="button" class="k-btn k-btn-go k-btn-sm" data-next>Next ➡️</button>`;
      speak(`${firstTry ? 'Correct!' : 'You got there!'} ${q.why || ''}`);
      $('[data-next]', box).focus();
    } else {
      firstTry = false;
      b.classList.add('wrong');
      b.disabled = true;
      sfx.buzz();
      $('.q-feedback', box).textContent = 'Not that one — try again! 💪';
    }
  });
  return show;
}

const SAFETY = [
  { emoji: '💬', q: 'Someone you don’t know messages you: “Hi! What school do you go to?” What do you do?', options: ['Don’t answer, and tell a grown-up you trust', 'Tell them — they seem nice', 'Send them a photo of your school'], answer: 0, why: 'Never share where you live or go to school with people you don’t know in real life.' },
  { emoji: '🎁', q: 'A pop-up says: “You WON a free tablet! Type your parent’s card number!”', options: ['Close it — it’s a trick called a scam', 'Click it super fast!', 'Ask a friend to type the number'], answer: 0, why: 'If something online sounds too good to be true, it’s probably a scam.' },
  { emoji: '🔑', q: 'Your friend asks for your password so they can play on your account.', options: ['Keep it secret — only your parent or guardian can know it', 'Share it, they’re your friend', 'Post it online so you don’t forget it'], answer: 0, why: 'Passwords are like toothbrushes: don’t share them!' },
  { emoji: '😠', q: 'Someone is being mean to you in a game chat.', options: ['Block them and tell a grown-up', 'Be mean back', 'Keep it a secret'], answer: 0, why: 'You never have to deal with meanies alone. Block, report and tell.' },
  { emoji: '🎮', q: 'You want to download a cool new game you found online.', options: ['Ask a grown-up first', 'Download it from any website', 'Turn off the virus protection'], answer: 0, why: 'Some downloads hide bad software. A grown-up can help check it’s safe.' },
  { emoji: '😟', q: 'You see something online that makes you feel scared or yucky.', options: ['Close it and tell a grown-up you trust', 'Keep watching', 'Show it to younger kids'], answer: 0, why: 'You will never get in trouble for telling a trusted grown-up.' },
];

const QUIZ = [
  { emoji: '🧠', q: 'What is the “brain” of a computer?', options: ['The CPU', 'The mouse', 'The speakers'], answer: 0, why: 'The CPU follows instructions super fast.' },
  { emoji: '⌨️', q: 'Which one is an INPUT?', options: ['Keyboard', 'Screen', 'Printer'], answer: 0, why: 'Inputs send information INTO the computer.' },
  { emoji: '💡', q: 'Binary uses only two digits. Which ones?', options: ['0 and 1', '1 and 2', 'A and B'], answer: 0, why: '0 means OFF and 1 means ON.' },
  { emoji: '🐛', q: 'What is a “bug” in a program?', options: ['A mistake in the code', 'A really fast computer', 'A robot pet'], answer: 0, why: 'Long ago, a real moth got stuck in a computer — the first “bug”!' },
  { emoji: '🎨', q: 'What are the tiny coloured squares on a screen called?', options: ['Pixels', 'Pebbles', 'Pickles'], answer: 0, why: 'Millions of pixels make every picture you see.' },
  { emoji: '🔐', q: 'Which password is the strongest?', options: ['Sneaky-Llama-Juggles-77!', 'password', '123456'], answer: 0, why: 'Long and silly with numbers and symbols = super strong!' },
  { emoji: '📨', q: 'Messages travel the internet in little pieces called…', options: ['Packets', 'Pockets', 'Puddles'], answer: 0, why: 'Each packet has a number so it can be put back in order.' },
  { emoji: '🍳', q: 'What is an algorithm?', options: ['A step-by-step recipe', 'A kind of dinosaur', 'A type of Wi-Fi'], answer: 0, why: 'Computers follow algorithms, just like you follow a recipe.' },
  { emoji: '📶', q: 'What does Wi-Fi use to send information?', options: ['Invisible radio waves', 'Water pipes', 'Magic beans'], answer: 0, why: 'Radio waves fly through the air from the router to your device.' },
  { emoji: '🔊', q: 'Which one is an OUTPUT?', options: ['Speakers', 'Microphone', 'Mouse'], answer: 0, why: 'Outputs show or play things for you.' },
  { emoji: '📝', q: 'What does RAM do?', options: ['Remembers what the computer is working on right now', 'Keeps the computer cool', 'Prints pages'], answer: 0, why: 'RAM is the computer’s desk.' },
  { emoji: '🔢', q: 'What is 1 + 1 in binary?', options: ['10', '2', '11'], answer: 0, why: '“10” in binary means one 2 and zero 1s — that’s 2!' },
  { emoji: '🦸', q: 'Who should you tell if something online upsets you?', options: ['A grown-up you trust', 'Nobody', 'A stranger online'], answer: 0, why: 'Trusted grown-ups are your sidekicks!' },
  { emoji: '🤖', q: 'Robots do things by following…', options: ['Instructions (code)', 'Their dreams', 'The weather'], answer: 0, why: 'Robots only do exactly what their code tells them.' },
  { emoji: '☁️', q: 'When people say “the cloud”, they mean…', options: ['Computers far away that store your stuff', 'Fluffy rain clouds', 'A pillow fort'], answer: 0, why: 'The cloud is just big computers in data centres.' },
];

function initSafety() {
  const start = runQuiz($('#safetyBox'), SAFETY, {
    lessonId: 'safety',
    onScore: (c, n) => (c === n ? 3 : c >= n - 2 ? 2 : 1),
    finishText: (c, n) => `You’re an Internet Superhero! ${c}/${n} on the first try.`,
  });
  start();
}
function initQuiz() {
  const box = $('#quizBox');
  let questions = shuffle(QUIZ).slice(0, 8);
  const start = runQuiz(box, questions, {
    lessonId: 'quiz',
    onScore: (c) => (c >= 7 ? 3 : c >= 5 ? 2 : 1),
    finishText: (c, n) => `You scored ${c} out of ${n}!`,
  });
  // new random questions every replay
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-restart]')) { questions.splice(0, questions.length, ...shuffle(QUIZ).slice(0, 8)); }
  }, true);
  start();
}

// ====================================================================================
// 8. Flip cards
// ====================================================================================
const WORDS = [
  ['🐛', 'Bug', 'A mistake in code that makes a program act silly.'],
  ['☁️', 'Cloud', 'Big computers far away that keep your stuff and send it over the internet.'],
  ['📱', 'App', 'A program that does a job — like a game, a camera or a calculator.'],
  ['📶', 'Wi-Fi', 'Invisible radio waves that connect your device to the internet.'],
  ['🍳', 'Algorithm', 'A step-by-step recipe that tells a computer what to do.'],
  ['🤖', 'AI', 'Computer programs that learn from LOTS of examples, so they can recognise things or chat.'],
  ['🍪', 'Cookie', 'A tiny note a website saves to remember you. Not the tasty kind!'],
  ['⬇️', 'Download', 'Copying something from the internet onto your device.'],
  ['🧭', 'Browser', 'The app you use to visit websites, like Chrome or Safari.'],
  ['🔒', 'Password', 'A secret key that keeps your accounts safe.'],
  ['🧑‍💻', 'Code', 'Instructions written in a special language that computers understand.'],
  ['🌐', 'Internet', 'Millions of computers around the world, all connected and sharing messages.'],
];
function initWords() {
  const flipped = new Set();
  $('#flipGrid').innerHTML = WORDS.map(([e, w, d], i) => `
    <button type="button" class="flip" data-i="${i}" aria-pressed="false" aria-label="${esc(w)} — tap to flip">
      <span class="flip-inner"><span class="flip-front"><span class="ff-emoji">${e}</span><b>${esc(w)}</b><small>tap me!</small></span>
      <span class="flip-back"><b>${esc(w)}</b>${esc(d)}</span></span>
    </button>`).join('');
  $('#flipGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.flip');
    if (!card) return;
    const i = Number(card.dataset.i);
    const on = card.classList.toggle('flipped');
    card.setAttribute('aria-pressed', String(on));
    sfx.boing();
    if (on) {
      speak(`${WORDS[i][1]}. ${WORDS[i][2]}`);
      flipped.add(i);
      $('#flipMsg').textContent = `${flipped.size} of ${WORDS.length} words discovered!`;
      if (flipped.size === WORDS.length) award('words', 3, card);
      else if (flipped.size >= 8) award('words', 2, card);
      else if (flipped.size >= 4) award('words', 1, card);
    }
  });
}

// ====================================================================================
// Certificate
// ====================================================================================
function initCertificate() {
  const dlg = $('#certDialog');
  $('#certBtn').addEventListener('click', () => {
    const total = LESSONS.reduce((s, l) => s + getStars(l.id), 0);
    $('#certStars').textContent = `⭐ ${total} stars earned ⭐`;
    $('#certDate').textContent = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    $('#certName').value = store.get('kids:name', '');
    dlg.showModal();
    rain(['🎓', '⭐', '🍿'], 40);
  });
  $('#certName').addEventListener('input', (e) => store.set('kids:name', e.target.value));
  $('#certPrint').addEventListener('click', () => window.print());
  $('#certClose').addEventListener('click', () => dlg.close());
}

// ====================================================================================
// Boot
// ====================================================================================
function paintToggles() {
  const r = $('#readToggle');
  r.setAttribute('aria-pressed', String(readAloud));
  r.classList.toggle('on', readAloud);
  const s = $('#soundToggle');
  s.textContent = sfx.enabled ? '🔊' : '🔇';
  s.setAttribute('aria-pressed', String(sfx.enabled));
}

function boot() {
  paintStars();
  paintToggles();
  initComputer();
  initBinary();
  initRobot();
  initPixels();
  initInternet();
  initPasswords();
  initSafety();
  initWords();
  initQuiz();
  initCertificate();

  $('#readToggle').addEventListener('click', () => {
    readAloud = !readAloud;
    store.set('kids:read', readAloud);
    paintToggles();
    if (readAloud) speak('Okay! I will read things out loud for you.', true);
    else if ('speechSynthesis' in window) speechSynthesis.cancel();
  });
  $('#soundToggle').addEventListener('click', () => { sfx.toggle(); paintToggles(); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-read]');
    if (b) { const t = $(b.dataset.read); if (t) speak(t.textContent, true); }
  });
  $('.poppy').addEventListener('click', () => { burstFrom($('.poppy'), { count: 20 }); sfx.pop(); });
  $('.poppy').style.cursor = 'pointer';
}

boot();
