// Stamp Studio: the main app.

import { BUILTIN_STAMPS, renderBuiltin, STAMP_RES } from './stamps.js';
import { db } from './db.js';
import { $, $$, ask, toast, icon, fillIcons, loadImage, bufferToImage, canvasToBlob, makeCanvas } from './ui.js';
import { initMaker } from './maker.js';

const DPR = Math.min(window.devicePixelRatio || 1, 2);
const PAGE_MARGIN = 10;     // gap between the white page and the edge of the screen
const MAX_UNDO = 60;        // how many stamp "taps or drags" can be undone
const RAINBOW = 'rainbow';
const COLORS = [
  '#FF3B30', '#FF8A00', '#FFD400', '#8BD13A', '#22B04B', '#22C1C3', '#1E88FF',
  '#5B4BDB', '#A24BDB', '#FF5FA2', '#9C5B32', '#222222', '#FFFFFF', RAINBOW,
];

// ---------------------------------------------------------------- settings
const PREFS_KEY = 'stamp-studio-prefs';
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      stampId: state.stampId, color: state.color, size: state.size, muted: state.muted,
    }));
  } catch { /* storage not available; that's fine */ }
}
const prefs = loadPrefs();
const state = {
  stampId: prefs.stampId || 'star',
  color: COLORS.includes(prefs.color) ? prefs.color : '#FF5FA2',
  size: prefs.size || 110,
  rot: 0,
  fx: false,
  fy: false,
  muted: !!prefs.muted,
};

// ---------------------------------------------------------------- stamps
const stamps = new Map(); // id -> { id, name, kind: 'mask' | 'image', src: canvas, custom }
const builtinIds = [];
let customIds = [];

for (const def of BUILTIN_STAMPS) {
  stamps.set(def.id, { id: def.id, name: def.name, kind: 'mask', src: renderBuiltin(def), custom: false });
  builtinIds.push(def.id);
}
const stampOrder = () => [...builtinIds, ...customIds];

async function loadCustomStamps() {
  let records = [];
  try { records = await db.all('stamps'); } catch (e) { console.warn(e); }
  records.sort((a, b) => a.created - b.created);
  for (const rec of records) {
    try {
      const img = await loadImage(rec.data);
      const c = makeCanvas(STAMP_RES);
      c.getContext('2d').drawImage(img, 0, 0, STAMP_RES, STAMP_RES);
      stamps.set(rec.id, { id: rec.id, name: 'My stamp', kind: rec.kind, src: c, custom: true });
      customIds.push(rec.id);
    } catch (e) { console.warn('Skipping broken stamp', e); }
  }
}

// Colored copies of stamps, kept around so stamping stays fast.
const inkCache = new Map();
function inked(st, color) {
  if (st.kind === 'image') return st.src;
  const key = st.id + '|' + color;
  let c = inkCache.get(key);
  if (c) {
    inkCache.delete(key);
    inkCache.set(key, c);
    return c;
  }
  if (inkCache.size >= 40) {
    const oldest = inkCache.keys().next().value;
    c = inkCache.get(oldest); // reuse the canvas instead of making a new one
    inkCache.delete(oldest);
  } else {
    c = makeCanvas(STAMP_RES);
  }
  const x = c.getContext('2d');
  x.globalCompositeOperation = 'copy';
  x.drawImage(st.src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, STAMP_RES, STAMP_RES);
  x.globalCompositeOperation = 'source-over';
  inkCache.set(key, c);
  return c;
}

// Draws a stamp into a small canvas (toolbar buttons, preview, lists).
function drawSmall(c, st, color, { rot = 0, fx = false, fy = false, scale = 0.86 } = {}) {
  const x = c.getContext('2d');
  const W = c.width;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, W, W);
  x.translate(W / 2, W / 2);
  x.rotate((rot * Math.PI) / 180);
  x.scale(fx ? -1 : 1, fy ? -1 : 1);
  const s = W * scale;
  x.imageSmoothingQuality = 'high';
  x.drawImage(st.src, -s / 2, -s / 2, s, s);
  x.setTransform(1, 0, 0, 1, 0, 0);
  if (st.kind === 'mask') {
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, W, W);
    x.globalCompositeOperation = 'source-over';
  }
}

// White doesn't show up on white buttons, so show it as light gray in the toolbar.
const displayColor = (c) => (c === '#FFFFFF' ? '#d5cfe3' : c);
const hueColor = (h) => `hsl(${Math.round(h) % 360}, 90%, 55%)`;

// ---------------------------------------------------------------- the page
const stage = $('#stage');
const canvas = $('#page');
const ctx = canvas.getContext('2d');
const base = makeCanvas(1); // everything that can no longer be undone
const bctx = base.getContext('2d');

let pageW = 0, pageH = 0;
let strokes = [];  // each stroke = list of stamps placed in one tap or drag
let current = null;
let dirty = false; // changed since last save?
let artId = null;  // which gallery picture this is, if any
let rainbowHue = Math.random() * 360;

function stageSize() {
  return {
    w: Math.max(200, Math.floor(stage.clientWidth - PAGE_MARGIN * 2)),
    h: Math.max(200, Math.floor(stage.clientHeight - PAGE_MARGIN * 2)),
  };
}

function setupPage(w, h, image) {
  pageW = w;
  pageH = h;
  canvas.width = base.width = Math.round(w * DPR);
  canvas.height = base.height = Math.round(h * DPR);
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.fillStyle = '#fff';
  bctx.fillRect(0, 0, base.width, base.height);
  if (image) bctx.drawImage(image, 0, 0, base.width, base.height);
  strokes = [];
  current = null;
  fit();
  render();
  updateButtons();
}

// Scales the page to fit the screen (e.g. after turning the iPad).
function fit() {
  if (!pageW) return;
  const avail = { w: stage.clientWidth - PAGE_MARGIN * 2, h: stage.clientHeight - PAGE_MARGIN * 2 };
  const s = Math.min(avail.w / pageW, avail.h / pageH);
  canvas.style.width = `${pageW * s}px`;
  canvas.style.height = `${pageH * s}px`;
}
new ResizeObserver(fit).observe(stage);

function drawOp(c, op) {
  const st = stamps.get(op.stampId);
  if (!st) return;
  c.save();
  c.translate(op.x, op.y);
  c.rotate((op.rot * Math.PI) / 180);
  c.scale(op.fx ? -1 : 1, op.fy ? -1 : 1);
  c.drawImage(inked(st, op.color), -op.size / 2, -op.size / 2, op.size, op.size);
  c.restore();
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(base, 0, 0);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  for (const s of strokes) for (const op of s) drawOp(ctx, op);
}

function bake(stroke) {
  bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  for (const op of stroke) drawOp(bctx, op);
}
function bakeAll() {
  strokes.forEach(bake);
  strokes = [];
  render();
  updateButtons();
}

// ---------------------------------------------------------------- stamping
function nextColor() {
  if (state.color !== RAINBOW) return state.color;
  rainbowHue = (rainbowHue + 29) % 360;
  return hueColor(rainbowHue);
}

function place(x, y) {
  const op = {
    stampId: state.stampId, color: nextColor(), x, y,
    size: state.size, rot: state.rot, fx: state.fx, fy: state.fy,
  };
  current.push(op);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawOp(ctx, op);
  dirty = true;
  playThunk();
}

function toPage(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * pageW) / r.width, y: ((e.clientY - r.top) * pageH) / r.height };
}

let activePointer = null;
let last = null;

canvas.addEventListener('pointerdown', (e) => {
  if (activePointer !== null) return; // ignore extra fingers / palms
  e.preventDefault();
  activePointer = e.pointerId;
  canvas.setPointerCapture?.(e.pointerId);
  unlockAudio();
  current = [];
  strokes.push(current);
  last = toPage(e);
  place(last.x, last.y);
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== activePointer) return;
  const spacing = Math.max(state.size * 0.8, 16);
  const list = e.getCoalescedEvents?.() ?? [];
  for (const ev of list.length ? list : [e]) {
    const p = toPage(ev);
    let dx = p.x - last.x, dy = p.y - last.y, dist = Math.hypot(dx, dy);
    while (dist >= spacing) {
      last = { x: last.x + (dx / dist) * spacing, y: last.y + (dy / dist) * spacing };
      place(last.x, last.y);
      dx = p.x - last.x; dy = p.y - last.y; dist = Math.hypot(dx, dy);
    }
  }
});

function endStroke(e) {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  current = null;
  while (strokes.length > MAX_UNDO) bake(strokes.shift());
  updateButtons();
  scheduleDraft();
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

function undo() {
  if (!strokes.length) return;
  strokes.pop();
  dirty = true;
  render();
  updateButtons();
  scheduleDraft();
}

// ---------------------------------------------------------------- sound
let audio = null, noise = null, lastSound = 0;
function unlockAudio() {
  if (state.muted) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    if (!noise) {
      noise = audio.createBuffer(1, audio.sampleRate * 0.08, audio.sampleRate);
      const ch = noise.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    }
  } catch { audio = null; }
}
function playThunk() {
  if (state.muted || !audio) return;
  const now = performance.now();
  if (now - lastSound < 70) return;
  lastSound = now;
  const t = audio.currentTime;
  const f = 200 + Math.random() * 120;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.45, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  osc.connect(g).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.18);

  const src = audio.createBufferSource();
  src.buffer = noise;
  const lp = audio.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const ng = audio.createGain();
  ng.gain.value = 0.25;
  src.connect(lp).connect(ng).connect(audio.destination);
  src.start(t);
}

// ---------------------------------------------------------------- toolbar
fillIcons();

const tray = $('#tray');
const previewCanvas = $('#preview canvas');

function buildTray() {
  tray.innerHTML = '';
  for (const id of stampOrder()) {
    const st = stamps.get(id);
    const b = document.createElement('button');
    b.className = 'stamp-btn' + (st.custom ? ' custom' : '');
    b.dataset.id = id;
    b.setAttribute('aria-label', st.name);
    b.append(makeCanvas(112));
    b.onclick = () => selectStamp(id);
    tray.append(b);
  }
  const add = document.createElement('button');
  add.className = 'stamp-btn add';
  add.innerHTML = `${icon('plus')}<span>Make</span>`;
  add.onclick = () => maker.open('draw');
  tray.append(add);
  paintTray();
  markSelected();
}

function paintTray() {
  $$('.stamp-btn[data-id]', tray).forEach((b, i) => {
    const color = state.color === RAINBOW ? hueColor(i * 37) : displayColor(state.color);
    drawSmall($('canvas', b), stamps.get(b.dataset.id), color);
  });
}

function markSelected() {
  $$('.stamp-btn[data-id]', tray).forEach((b) => b.classList.toggle('selected', b.dataset.id === state.stampId));
}

function selectStamp(id, scroll = true) {
  if (!stamps.has(id)) id = builtinIds[0];
  state.stampId = id;
  markSelected();
  if (scroll) tray.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  updatePreview();
  savePrefs();
}

function updatePreview() {
  const st = stamps.get(state.stampId);
  if (!st) return;
  const color = state.color === RAINBOW ? hueColor(rainbowHue + 29) : displayColor(state.color);
  const t = (state.size - 24) / (320 - 24);
  drawSmall(previewCanvas, st, color, { rot: state.rot, fx: state.fx, fy: state.fy, scale: 0.3 + 0.4 * t });
}

// colors
const colorsEl = $('#colors');
for (const col of COLORS) {
  const b = document.createElement('button');
  b.className = 'swatch' + (col === RAINBOW ? ' rainbow' : '') + (col === '#FFFFFF' ? ' white' : '');
  if (col !== RAINBOW) b.style.background = col;
  b.dataset.color = col;
  b.setAttribute('aria-label', col === RAINBOW ? 'Rainbow' : `Color ${col}`);
  b.onclick = () => selectColor(col);
  colorsEl.append(b);
}
function selectColor(col) {
  state.color = col;
  $$('.swatch', colorsEl).forEach((b) => b.classList.toggle('selected', b.dataset.color === col));
  paintTray();
  updatePreview();
  savePrefs();
}

// size
const sizeInput = $('#size');
sizeInput.value = state.size;
sizeInput.addEventListener('input', () => {
  state.size = Number(sizeInput.value);
  updatePreview();
});
sizeInput.addEventListener('change', savePrefs);

function updateTransformUI() {
  $('[data-act="flipx"]').classList.toggle('on', state.fx);
  $('[data-act="flipy"]').classList.toggle('on', state.fy);
  updatePreview();
}

function updateButtons() {
  $('[data-act="undo"]').disabled = strokes.length === 0;
}

function updateSoundButton() {
  const b = $('[data-act="sound"]');
  b.querySelector('svg').outerHTML = icon(state.muted ? 'mute' : 'sound');
  b.querySelector('span').textContent = state.muted ? 'Sound off' : 'Sound';
  b.classList.toggle('off', state.muted);
}

$('#toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  switch (b.dataset.act) {
    case 'rotl': state.rot = (state.rot + 345) % 360; break;
    case 'rotr': state.rot = (state.rot + 15) % 360; break;
    case 'flipx': state.fx = !state.fx; break;
    case 'flipy': state.fy = !state.fy; break;
    case 'reset': state.rot = 0; state.fx = state.fy = false; break;
    case 'undo': undo(); return;
    case 'new': newPage(); return;
    case 'save': saveArt(); return;
    case 'gallery': openGallery(); return;
    case 'sound':
      state.muted = !state.muted;
      if (!state.muted) { unlockAudio(); playThunk(); }
      updateSoundButton();
      savePrefs();
      return;
    default: return;
  }
  updateTransformUI();
});

// close buttons in pop-up windows
document.addEventListener('click', (e) => {
  const closer = e.target.closest('[data-close]');
  if (closer) closer.closest('dialog')?.close();
});

// ---------------------------------------------------------------- saving
let draftTimer = null;
function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 1200);
}
// Quietly keeps the current picture so nothing is lost if the app is closed.
async function saveDraft() {
  clearTimeout(draftTimer);
  try {
    const buf = await (await canvasToBlob(canvas)).arrayBuffer();
    await db.put('kv', { buf, w: pageW, h: pageH, artId, dirty }, 'draft');
  } catch (e) { console.warn('Draft not saved', e); }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && draftTimer) saveDraft();
});

function makeThumb() {
  const w = 400, h = Math.round((400 * pageH) / pageW);
  const c = makeCanvas(w, h);
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(canvas, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.82);
}

const isBlank = () => strokes.length === 0 && !artId && !dirty;

async function saveArt() {
  if (isBlank()) { toast('Stamp something first! ⭐'); return; }
  if (!dirty && artId) { toast('Already saved ✓'); return; }
  try {
    const buf = await (await canvasToBlob(canvas)).arrayBuffer();
    const now = Date.now();
    const id = artId ?? `a${now}`;
    const old = artId ? await db.get('art', id) : null;
    await db.put('artImages', { id, buf });
    await db.put('art', { id, w: pageW, h: pageH, thumb: makeThumb(), created: old?.created ?? now, updated: now });
    artId = id;
    dirty = false;
    saveDraft();
    toast('Saved to your gallery! 🎉');
  } catch (e) {
    console.error(e);
    toast('Oops, saving did not work.');
  }
}

// Asks to save first if there are unsaved changes. Returns false if cancelled.
async function okToLeave(title) {
  if (!dirty) return true;
  const choice = await ask({
    title,
    message: "Your picture isn't saved yet.",
    buttons: [
      { label: 'Save it first', value: 'save', primary: true },
      { label: "Don't save", value: 'discard', danger: true },
      { label: 'Cancel', value: null },
    ],
  });
  if (!choice) return false;
  if (choice === 'save') await saveArt();
  return true;
}

async function newPage() {
  if (!(await okToLeave('Start a new picture?'))) return;
  const { w, h } = stageSize();
  artId = null;
  dirty = false;
  setupPage(w, h);
  saveDraft();
}

// ---------------------------------------------------------------- gallery
const galleryDlg = $('#gallery');

async function openGallery() {
  await renderGallery();
  if (!galleryDlg.open) galleryDlg.showModal();
}

async function renderGallery() {
  let items = [];
  try { items = await db.all('art'); } catch (e) { console.warn(e); }
  items.sort((a, b) => b.updated - a.updated);
  const grid = $('#galleryGrid');
  grid.innerHTML = '';
  $('#galleryEmpty').hidden = items.length > 0;
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'art-card' + (item.id === artId ? ' current' : '');
    const when = new Date(item.updated).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    card.innerHTML = `
      <button class="art-thumb" data-a="open" aria-label="Open picture"><img alt=""></button>
      <div class="art-meta">${item.id === artId ? '<b>Open now</b> · ' : ''}${when}</div>
      <div class="art-actions">
        <button class="btn small primary" data-a="open">Open</button>
        <button class="btn small" data-a="share">${icon('share')}Photos</button>
        <button class="btn small danger square" data-a="del" aria-label="Delete">${icon('trash')}</button>
      </div>`;
    card.querySelector('img').src = item.thumb;
    card.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'open') openArt(item);
      if (a === 'share') shareArt(item.id);
      if (a === 'del') deleteArt(item);
    });
    grid.append(card);
  }
}

async function openArt(item) {
  if (item.id !== artId && !(await okToLeave('Open another picture?'))) return;
  try {
    const rec = await db.get('artImages', item.id);
    const img = await bufferToImage(rec.buf);
    artId = item.id;
    dirty = false;
    setupPage(item.w, item.h, img);
    saveDraft();
    galleryDlg.close();
  } catch (e) {
    console.error(e);
    toast("Oops, that picture didn't open.");
  }
}

async function deleteArt(item) {
  const ok = await ask({
    title: 'Delete this picture?',
    message: "It will be gone for good.",
    buttons: [{ label: 'Delete', value: true, danger: true }, { label: 'Keep it', value: null }],
  });
  if (!ok) return;
  await db.del('art', item.id);
  await db.del('artImages', item.id);
  if (artId === item.id) { artId = null; dirty = true; scheduleDraft(); }
  renderGallery();
}

async function shareArt(id) {
  const rec = await db.get('artImages', id);
  const file = new File([rec.buf], 'stamp-art.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      // Some browsers need a fresh tap before sharing; ask for one.
      if (e.name === 'NotAllowedError') {
        const go = await ask({
          title: 'Ready to share!',
          message: 'Choose "Save Image" to put it in your Photos.',
          buttons: [{ label: 'Share picture', value: true, primary: true }, { label: 'Cancel', value: null }],
        });
        if (go) navigator.share({ files: [file] }).catch(() => {});
      }
    }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = 'stamp-art.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}

// ---------------------------------------------------------------- custom stamps
const maker = initMaker({
  async addCustom(kind, stampCanvas) {
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const rec = { id, kind, data: stampCanvas.toDataURL('image/png'), created: Date.now() };
    try { await db.put('stamps', rec); } catch (e) { console.warn(e); toast("This stamp can't be kept after the app closes."); }
    stamps.set(id, { id, name: 'My stamp', kind, src: stampCanvas, custom: true });
    customIds.push(id);
    buildTray();
    selectStamp(id);
  },
  async deleteCustom(id) {
    bakeAll(); // keep it on the current page even though it's leaving the library
    try { await db.del('stamps', id); } catch (e) { console.warn(e); }
    stamps.delete(id);
    customIds = customIds.filter((x) => x !== id);
    for (const key of [...inkCache.keys()]) if (key.startsWith(id + '|')) inkCache.delete(key);
    buildTray();
    if (state.stampId === id) selectStamp(builtinIds[0], false);
  },
  listCustom: () => customIds.map((id) => stamps.get(id)),
  drawThumb: (c, st) => drawSmall(c, st, '#3a2f5c'),
});

// ---------------------------------------------------------------- iPad niceties
// Stop pinch-zoom and page bounce so little hands don't move the whole app.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------------------------------------------------------------- start
async function start() {
  await loadCustomStamps();
  buildTray();
  selectColor(state.color);
  selectStamp(state.stampId);
  updateTransformUI();
  updateSoundButton();

  try {
    const d = await db.get('kv', 'draft');
    if (d?.buf) {
      const img = await bufferToImage(d.buf);
      artId = d.artId ?? null;
      dirty = !!d.dirty;
      setupPage(d.w, d.h, img);
      return;
    }
  } catch (e) { console.warn('No draft restored', e); }
  const { w, h } = stageSize();
  setupPage(w, h);
}
requestAnimationFrame(start);
