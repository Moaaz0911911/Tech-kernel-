// 📷 Pick a profile photo from the gallery (or camera) and crop it to a circle. Everything happens in the browser:
// only a small 320×320 JPEG is sent to the kerNEl server.
import { esc, toast } from './utils.js';
import { t } from './i18n.js';

const VIEW = 560;   // crop canvas size (drawn at 2× for sharp screens)
const OUT = 320;    // uploaded size

function dialogHTML() {
  return `<form method="dialog" class="modal-x-form"><button class="modal-x" value="cancel" aria-label="${esc(t('Close'))}">✕</button></form>
    <div class="modal-body photo-crop">
      <h2>${esc(t('Move and zoom your photo'))}</h2>
      <div class="crop-stage"><canvas width="${VIEW}" height="${VIEW}" aria-label="${esc(t('Drag to move your photo'))}"></canvas><span class="crop-ring" aria-hidden="true"></span></div>
      <label class="crop-zoom"><span aria-hidden="true">➖</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="${esc(t('Zoom'))}"><span aria-hidden="true">➕</span></label>
      <p class="muted small">${esc(t('Your photo is public. Be kind — photos reported by 3 people are removed.'))}</p>
      <div class="crop-actions">
        <button type="button" class="btn btn-ghost" data-crop="cancel">${esc(t('Cancel'))}</button>
        <button type="button" class="btn btn-primary" data-crop="use">${esc(t('Use this photo'))}</button>
      </div>
    </div>`;
}

function chooseFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve(input.files?.[0] || null); input.remove(); }, { once: true });
    input.addEventListener('cancel', () => { resolve(null); input.remove(); }, { once: true });
    document.body.append(input);
    input.click();
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, done: () => URL.revokeObjectURL(url) });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

/** Opens the cropper for an image; resolves to a JPEG data URL, or null if cancelled. */
export function cropImage(img) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal photo-dialog';
    dlg.innerHTML = dialogHTML();
    document.body.append(dlg);
    const canvas = dlg.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const slider = dlg.querySelector('input[type="range"]');
    const cover = Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight);
    let zoom = 1, ox = 0, oy = 0;

    const size = () => ({ w: img.naturalWidth * cover * zoom, h: img.naturalHeight * cover * zoom });
    function clamp() {
      const { w, h } = size();
      const mx = Math.max(0, (w - VIEW) / 2), my = Math.max(0, (h - VIEW) / 2);
      ox = Math.max(-mx, Math.min(mx, ox));
      oy = Math.max(-my, Math.min(my, oy));
    }
    function draw(target = ctx, scale = 1) {
      const { w, h } = size();
      target.fillStyle = '#000';
      target.fillRect(0, 0, VIEW * scale, VIEW * scale);
      target.imageSmoothingQuality = 'high';
      target.drawImage(img, ((VIEW - w) / 2 + ox) * scale, ((VIEW - h) / 2 + oy) * scale, w * scale, h * scale);
    }
    const setZoom = (z) => { zoom = Math.max(1, Math.min(4, z)); slider.value = String(zoom); clamp(); draw(); };

    // drag with a finger or mouse; pinch with two fingers
    const pts = new Map();
    let pinch = null;
    const ratio = () => VIEW / canvas.getBoundingClientRect().width;
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; } });
    canvas.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); return; }
      ox += (e.clientX - prev.x) * ratio();
      oy += (e.clientY - prev.y) * ratio();
      clamp();
      draw();
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
    slider.addEventListener('input', () => setZoom(Number(slider.value)));

    const finish = (value) => { dlg.close(); dlg.remove(); resolve(value); };
    dlg.addEventListener('click', (e) => {
      const b = e.target instanceof Element ? e.target.closest('[data-crop]') : null;
      if (e.target === dlg) return finish(null);
      if (!b) return;
      if (b.dataset.crop === 'cancel') return finish(null);
      const out = document.createElement('canvas');
      out.width = out.height = OUT;
      draw(out.getContext('2d'), OUT / VIEW);
      let data = out.toDataURL('image/jpeg', 0.86);
      if (data.length > 380_000) data = out.toDataURL('image/jpeg', 0.7);
      finish(data);
    });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    dlg.addEventListener('close', () => { if (dlg.isConnected) { dlg.remove(); resolve(null); } });
    draw();
    dlg.showModal();
  });
}

/** Gallery → cropper → data URL (or null). */
export async function pickPhoto() {
  const file = await chooseFile();
  if (!file) return null;
  if (!/^image\//.test(file.type) && file.type) { toast(t('That photo didn’t work — try a JPG or PNG'), { emoji: '📷' }); return null; }
  if (file.size > 25 * 1024 * 1024) { toast(t('That photo is too big'), { emoji: '📷' }); return null; }
  let loaded;
  try { loaded = await loadImage(file); } catch { toast(t('That photo didn’t work — try a JPG or PNG'), { emoji: '📷' }); return null; }
  try { return await cropImage(loaded.img); } finally { loaded.done(); }
}
