// Small shared helpers: icons, pop-up questions, toast messages, images.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ICONS = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  newpage: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M12 12v6M9 15h6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  gallery: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  sound: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  rotl: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  rotr: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  flipx: '<path d="M12 3v18" stroke-dasharray="2 3"/><path d="M9 7 3 17h6z"/><path d="m15 7 6 10h-6z"/>',
  flipy: '<path d="M3 12h18" stroke-dasharray="2 3"/><path d="M7 9 17 3v6z"/><path d="m7 15 10 6v-6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/>',
  share: '<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  eraser: '<path d="M7 21h13"/><path d="m4.5 15.5 9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8z"/><path d="m9 11 5 5"/>',
  mirror: '<path d="M12 3v18" stroke-dasharray="2 3"/><path d="M8 7c-4 2-4 8 0 10"/><path d="M16 7c4 2 4 8 0 10"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
}

export function fillIcons(root = document) {
  for (const el of $$('[data-icon]', root)) {
    if (!el.querySelector(':scope > svg')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
  }
}

let toastTimer;
export function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// Shows a friendly pop-up with buttons and resolves with the chosen button's value
// (or null if closed).
export function ask({ title, message = '', buttons }) {
  return new Promise((resolve) => {
    const d = $('#ask');
    $('h2', d).textContent = title;
    const msg = $('p', d);
    msg.textContent = message;
    msg.hidden = !message;
    const box = $('.ask-buttons', d);
    box.innerHTML = '';
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      d.close();
      resolve(value);
    };
    for (const b of buttons) {
      const el = document.createElement('button');
      el.className = 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
      el.textContent = b.label;
      el.onclick = () => finish(b.value ?? null);
      box.append(el);
    }
    d.oncancel = (e) => { e.preventDefault(); finish(null); };
    d.showModal();
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

export async function bufferToImage(buf, type = 'image/png') {
  const url = URL.createObjectURL(new Blob([buf], { type }));
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save picture'))), type, quality);
  });
}

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
