// The "Make a Stamp" window: draw a stamp, turn a picture into a stamp,
// or remove stamps you've made.

import { $, $$, ask, toast, icon, loadImage, makeCanvas } from './ui.js';
import { STAMP_RES } from './stamps.js';

// Crops away empty space around a drawing and centers it in a 512 x 512 stamp.
// Returns null if there's nothing there.
export function normalizeStamp(src) {
  const { width: w, height: h } = src;
  const data = src.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const inner = STAMP_RES * 0.92;
  const s = Math.min(inner / bw, inner / bh);
  const dw = bw * s, dh = bh * s;
  const out = makeCanvas(STAMP_RES);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x0, y0, bw, bh, (STAMP_RES - dw) / 2, (STAMP_RES - dh) / 2, dw, dh);
  return out;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

// mode 'shape': dark parts of the picture become ink (prints in the chosen color)
// mode 'color': keeps the picture's colors, optionally removing a white background
function convertPicture(img, mode, removeBg) {
  const max = 700;
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(img.naturalHeight * s));
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;

  if (mode === 'shape') {
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) { sum += lum(d, i); n++; }
    }
    const avg = n ? sum / n : 128;
    const lo = avg * 0.5, hi = avg * 0.82;
    for (let i = 0; i < d.length; i += 4) {
      const ink = clamp01((hi - lum(d, i)) / (hi - lo));
      d[i + 3] = Math.round(ink * d[i + 3]);
      d[i] = d[i + 1] = d[i + 2] = 0;
    }
  } else if (removeBg) {
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]);
      const mn = Math.min(d[i], d[i + 1], d[i + 2]);
      if (mx - mn < 45) d[i + 3] = Math.round(d[i + 3] * clamp01((242 - lum(d, i)) / 40));
    }
  }
  ctx.putImageData(id, 0, 0);
  return normalizeStamp(c);
}

// api: { addCustom(kind, canvas), deleteCustom(id), listCustom(), drawThumb(canvas, stamp) }
export function initMaker(api) {
  const dlg = $('#maker');

  // ---------- tabs ----------
  const tabs = $$('.tab', dlg);
  function showTab(name) {
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $$('[data-panel]', dlg).forEach((p) => { p.hidden = p.dataset.panel !== name; });
    if (name === 'mine') renderMine();
  }
  tabs.forEach((t) => { t.onclick = () => showTab(t.dataset.tab); });

  // ---------- draw ----------
  const pad = $('#pad');
  const pctx = pad.getContext('2d', { willReadFrequently: true });
  const padWrap = $('.pad-wrap', dlg);
  let pen = 20, erasing = false, mirror = false, drawing = null;
  let history = [];

  const penButtons = $$('[data-pen]', dlg);
  penButtons.forEach((b) => {
    b.onclick = () => {
      pen = Number(b.dataset.pen);
      erasing = false;
      refreshPadTools();
    };
  });
  $('#padErase').onclick = () => { erasing = !erasing; refreshPadTools(); };
  $('#padMirror').onclick = () => { mirror = !mirror; refreshPadTools(); };
  $('#padUndo').onclick = () => {
    const prev = history.pop();
    if (prev) pctx.putImageData(prev, 0, 0);
    refreshPadTools();
  };
  $('#padClear').onclick = () => {
    remember();
    pctx.clearRect(0, 0, pad.width, pad.height);
    refreshPadTools();
  };

  function refreshPadTools() {
    penButtons.forEach((b) => b.classList.toggle('on', !erasing && Number(b.dataset.pen) === pen));
    $('#padErase').classList.toggle('on', erasing);
    $('#padMirror').classList.toggle('on', mirror);
    padWrap.classList.toggle('mirror', mirror);
    $('#padUndo').disabled = history.length === 0;
  }

  function remember() {
    history.push(pctx.getImageData(0, 0, pad.width, pad.height));
    if (history.length > 25) history.shift();
  }

  function padPoint(e) {
    const r = pad.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * pad.width) / r.width, y: ((e.clientY - r.top) * pad.height) / r.height };
  }

  function segment(a, b) {
    pctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
    pctx.strokeStyle = '#000';
    pctx.lineWidth = erasing ? pen * 1.6 : pen;
    pctx.lineCap = pctx.lineJoin = 'round';
    pctx.beginPath();
    pctx.moveTo(a.x, a.y);
    pctx.lineTo(b.x, b.y);
    if (mirror) {
      pctx.moveTo(pad.width - a.x, a.y);
      pctx.lineTo(pad.width - b.x, b.y);
    }
    pctx.stroke();
    pctx.globalCompositeOperation = 'source-over';
  }

  pad.addEventListener('pointerdown', (e) => {
    if (drawing) return;
    e.preventDefault();
    pad.setPointerCapture?.(e.pointerId);
    remember();
    const p = padPoint(e);
    drawing = { id: e.pointerId, last: p };
    segment(p, p);
    refreshPadTools();
  });
  pad.addEventListener('pointermove', (e) => {
    if (!drawing || e.pointerId !== drawing.id) return;
    const list = e.getCoalescedEvents?.() ?? [];
    for (const ev of list.length ? list : [e]) {
      const p = padPoint(ev);
      segment(drawing.last, p);
      drawing.last = p;
    }
  });
  const endDraw = (e) => { if (drawing && e.pointerId === drawing.id) drawing = null; };
  pad.addEventListener('pointerup', endDraw);
  pad.addEventListener('pointercancel', endDraw);

  $('#saveDrawn').onclick = async () => {
    const stamp = normalizeStamp(pad);
    if (!stamp) { toast('Draw something first! ✏️'); return; }
    await api.addCustom('mask', stamp);
    pctx.clearRect(0, 0, pad.width, pad.height);
    history = [];
    refreshPadTools();
    dlg.close();
    toast('New stamp added! 🎉');
  };

  // ---------- picture ----------
  const input = $('#photoInput');
  const preview = $('#photoPreview');
  const prevCtx = preview.getContext('2d');
  const removeBg = $('#removeBg');
  const savePhoto = $('#savePhoto');
  let photo = null, mode = 'shape', result = null;

  $('#pickPhoto').onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      photo = await loadImage(url);
    } catch {
      toast("Hmm, that picture didn't open. Try another one.");
      return;
    } finally {
      URL.revokeObjectURL(url);
    }
    processPhoto();
  };
  $$('[data-mode]', dlg).forEach((b) => {
    b.onclick = () => {
      mode = b.dataset.mode;
      $$('[data-mode]', dlg).forEach((x) => x.classList.toggle('active', x === b));
      processPhoto();
    };
  });
  removeBg.onchange = processPhoto;

  function processPhoto() {
    $('#removeBgRow').classList.toggle('disabled', mode !== 'color');
    removeBg.disabled = mode !== 'color';
    prevCtx.clearRect(0, 0, preview.width, preview.height);
    $('#photoEmpty').hidden = !!photo;
    if (!photo) { savePhoto.disabled = true; return; }
    result = convertPicture(photo, mode, removeBg.checked);
    if (result) prevCtx.drawImage(result, 0, 0, preview.width, preview.height);
    savePhoto.disabled = !result;
    if (!result) toast("Couldn't find a shape in that picture. Try one with darker lines.");
  }

  savePhoto.onclick = async () => {
    if (!result) return;
    await api.addCustom(mode === 'shape' ? 'mask' : 'image', result);
    photo = result = null;
    processPhoto();
    dlg.close();
    toast('New stamp added! 🎉');
  };

  // ---------- my stamps ----------
  function renderMine() {
    const grid = $('#mine');
    grid.innerHTML = '';
    const list = api.listCustom();
    $('#mineEmpty').hidden = list.length > 0;
    for (const st of list) {
      const card = document.createElement('div');
      card.className = 'mine-card';
      const c = makeCanvas(160);
      api.drawThumb(c, st);
      const del = document.createElement('button');
      del.className = 'icon-btn danger';
      del.setAttribute('aria-label', 'Delete stamp');
      del.innerHTML = icon('trash');
      del.onclick = async () => {
        const ok = await ask({
          title: 'Delete this stamp?',
          message: 'Pictures you already made with it will stay the same.',
          buttons: [{ label: 'Delete', value: true, danger: true }, { label: 'Keep it', value: null }],
        });
        if (!ok) return;
        await api.deleteCustom(st.id);
        renderMine();
      };
      card.append(c, del);
      grid.append(card);
    }
  }

  refreshPadTools();
  processPhoto();

  return {
    open(tab = 'draw') {
      showTab(tab);
      dlg.showModal();
    },
  };
}
