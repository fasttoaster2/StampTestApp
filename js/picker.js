// The "Pick any color" window: a hue/saturation wheel plus a brightness slider.

import { $ } from './ui.js';

function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return [(h + 360) % 360, max ? d / max : 0, max];
}

const toHex = (rgb) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase();
const fromHex = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// onChange(hex) is called every time the color changes.
// drawPreview(canvas, hex) draws the current stamp in that color.
export function initPicker({ onChange, drawPreview }) {
  const dlg = $('#picker');
  const wheel = $('#wheel');
  const wctx = wheel.getContext('2d');
  const knob = $('#wheelKnob');
  const bright = $('#bright');
  const swatch = $('#pickPreview');
  const W = wheel.width, R = W / 2 - 2;
  let h = 0, s = 1, v = 1;

  function drawWheel() {
    const img = wctx.createImageData(W, W);
    const d = img.data;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - W / 2 + 0.5, dy = y - W / 2 + 0.5;
        const dist = Math.hypot(dx, dy);
        if (dist > R + 1) continue;
        const [r, g, b] = hsvToRgb(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, Math.min(1, dist / R), v);
        const i = (y * W + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
        d[i + 3] = 255 * Math.max(0, Math.min(1, R + 1 - dist)); // soft edge
      }
    }
    wctx.putImageData(img, 0, 0);
  }

  function update(notify = true) {
    const hex = toHex(hsvToRgb(h, s, v));
    const a = (h * Math.PI) / 180;
    knob.style.left = `${50 + 50 * (R / (W / 2)) * s * Math.cos(a)}%`;
    knob.style.top = `${50 + 50 * (R / (W / 2)) * s * Math.sin(a)}%`;
    knob.style.background = hex;
    bright.style.setProperty('--full', toHex(hsvToRgb(h, s, 1)));
    drawPreview(swatch, hex);
    if (notify) onChange(hex);
  }

  function pick(e) {
    const r = wheel.getBoundingClientRect();
    const dx = ((e.clientX - r.left) / r.width) * W - W / 2;
    const dy = ((e.clientY - r.top) / r.height) * W - W / 2;
    h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    s = Math.min(1, Math.hypot(dx, dy) / R);
    if (v < 0.15) { v = 1; bright.value = 100; drawWheel(); } // picking on a black wheel would be confusing
    update();
  }

  let dragging = null;
  wheel.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = e.pointerId;
    wheel.setPointerCapture?.(e.pointerId);
    pick(e);
  });
  wheel.addEventListener('pointermove', (e) => { if (e.pointerId === dragging) pick(e); });
  const stop = (e) => { if (e.pointerId === dragging) dragging = null; };
  wheel.addEventListener('pointerup', stop);
  wheel.addEventListener('pointercancel', stop);

  bright.addEventListener('input', () => {
    v = Number(bright.value) / 100;
    drawWheel();
    update();
  });

  return {
    open(hex) {
      [h, s, v] = rgbToHsv(...fromHex(hex));
      bright.value = Math.round(v * 100);
      drawWheel();
      update(false);
      dlg.showModal();
    },
  };
}
