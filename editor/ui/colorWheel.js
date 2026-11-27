import {
  PAINT_DEFAULT_PALETTE,
  parseHexColor,
  rgbToHex,
  hexToHsv,
  hsvToRgb,
  hsvToHex,
} from '../../src/modules/paint.js';
import { syncRangeVisual } from './rangeControls.js';

const _baseWheelCache = new Map();

function ensureBaseWheelCanvas(pxSize) {
  if (typeof document === 'undefined') return null;
  if (_baseWheelCache.has(pxSize)) return _baseWheelCache.get(pxSize);

  const cv = document.createElement('canvas');
  cv.width = pxSize;
  cv.height = pxSize;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(pxSize, pxSize);
  const d = img.data;
  const half = pxSize * 0.5;
  const radius = Math.max(1, half - 2);

  for (let y = 0; y < pxSize; y++) {
    const dy = y + 0.5 - half;
    for (let x = 0; x < pxSize; x++) {
      const dx = x + 0.5 - half;
      const dist = Math.hypot(dx, dy);
      const o = (y * pxSize + x) * 4;
      if (dist > radius + 1.2) {
        d[o + 3] = 0;
        continue;
      }
      const sat = Math.min(1, dist / radius);
      const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      const [r, g, b] = hsvToRgb(hue, sat, 1);
      const edgeAlpha =
        dist <= radius
          ? 255
          : Math.max(0, Math.min(255, Math.round((1 - (dist - radius) / 1.2) * 255)));
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = edgeAlpha;
    }
  }

  ctx.putImageData(img, 0, 0);
  _baseWheelCache.set(pxSize, cv);
  return cv;
}

function normalizeHex(hex, fallback = '#ffffff') {
  try {
    const [r, g, b] = parseHexColor(hex);
    return rgbToHex(r, g, b);
  } catch {
    return fallback;
  }
}

export function createColorWheelWidget({
  triggerBtn = null,
  triggerSwatch = null,
  triggerBadge = null,
  panel = null,
  closeBtn = null,
  wheelWrap = null,
  wheelCanvas = null,
  wheelCursor = null,
  headerBadge = null,
  valueRange = null,
  valueNum = null,
  wheelSwatch = null,
  hexInput = null,
  nativeInput = null,
  paletteGrid = null,
  initialColor = '#4f86f7',
  onChange = null,
} = {}) {
  let currentColor = normalizeHex(initialColor);
  const hsv = hexToHsv(currentColor);
  let wheelPointerId = null;

  const renderWheel = () => {
    if (!wheelCanvas || !wheelWrap) return;
    const cssSize = Math.max(120, Math.round(wheelWrap.clientWidth || wheelCanvas.clientWidth || 176));
    const dpr = Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, 2);
    const pxSize = Math.round(cssSize * dpr);
    if (wheelCanvas.width !== pxSize || wheelCanvas.height !== pxSize) {
      wheelCanvas.width = pxSize;
      wheelCanvas.height = pxSize;
    }
    const ctx = wheelCanvas.getContext('2d');
    if (!ctx) return;

    const base = ensureBaseWheelCanvas(pxSize);
    ctx.clearRect(0, 0, pxSize, pxSize);
    ctx.save();
    ctx.beginPath();
    ctx.arc(pxSize * 0.5, pxSize * 0.5, Math.max(1, pxSize * 0.5 - 2 * dpr), 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, pxSize, pxSize);
    if (base) {
      ctx.globalAlpha = Math.max(0, Math.min(1, hsv.v));
      ctx.drawImage(base, 0, 0, pxSize, pxSize);
    }
    ctx.restore();

    const rad = (hsv.h * Math.PI) / 180;
    const maxR = Math.max(4, cssSize * 0.5 - 3);
    const rPx = Math.max(0, Math.min(1, hsv.s)) * maxR;
    const cx = cssSize * 0.5 + Math.cos(rad) * rPx;
    const cy = cssSize * 0.5 + Math.sin(rad) * rPx;
    const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
    if (wheelCursor) {
      wheelCursor.style.left = `${cx.toFixed(1)}px`;
      wheelCursor.style.top = `${cy.toFixed(1)}px`;
      wheelCursor.style.background = hex;
    }
    if (valueRange) {
      valueRange.style.setProperty('--val-full-color', hsvToHex(hsv.h, hsv.s, 1));
    }
  };

  const syncUI = (hex, { syncHsvFromHex = true, emit = false } = {}) => {
    const normalized = normalizeHex(hex, currentColor);
    currentColor = normalized;
    if (syncHsvFromHex) {
      const nextHsv = hexToHsv(normalized);
      if (nextHsv.s > 0.01 && nextHsv.v > 0.01) hsv.h = nextHsv.h;
      if (nextHsv.v > 0.01) hsv.s = nextHsv.s;
      hsv.v = nextHsv.v;
    }

    const upper = normalized.toUpperCase();
    if (nativeInput) nativeInput.value = normalized;
    if (triggerSwatch) triggerSwatch.style.background = normalized;
    if (triggerBadge) triggerBadge.textContent = upper;
    if (headerBadge) headerBadge.textContent = upper;
    if (wheelSwatch) wheelSwatch.style.background = normalized;
    if (hexInput && document.activeElement !== hexInput) {
      hexInput.value = upper;
    }
    if (valueRange) {
      const vPct = Math.round(hsv.v * 100);
      if (document.activeElement !== valueRange) {
        valueRange.value = String(vPct);
      }
      if (valueNum) valueNum.textContent = `${vPct}%`;
      syncRangeVisual(valueRange);
    }
    if (panel && !panel.hidden) {
      renderWheel();
    }
    paletteGrid?.querySelectorAll('[data-wheel-swatch]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.wheelSwatch.toLowerCase() === normalized.toLowerCase());
    });

    if (emit) {
      onChange?.(normalized);
    }
  };

  const setOpen = (open) => {
    if (!panel) return;
    panel.hidden = !open;
    triggerBtn?.classList.toggle('is-active', open);
    triggerBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      if (valueRange) syncRangeVisual(valueRange);
      renderWheel();
      panel.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
  };

  if (paletteGrid) {
    paletteGrid.innerHTML = '';
    for (const hex of PAINT_DEFAULT_PALETTE) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'paint-palette-swatch';
      btn.dataset.wheelSwatch = hex;
      btn.style.background = hex;
      btn.title = hex.toUpperCase();
      btn.setAttribute('aria-label', `Color ${hex.toUpperCase()}`);
      btn.addEventListener('click', () => {
        syncUI(hex, { syncHsvFromHex: true, emit: true });
      });
      paletteGrid.appendChild(btn);
    }
  }

  triggerBtn?.addEventListener('click', () => {
    const nextOpen = panel ? panel.hidden : false;
    setOpen(nextOpen);
  });

  closeBtn?.addEventListener('click', () => setOpen(false));

  if (wheelWrap) {
    const pickFromWheelEvent = (e) => {
      const rect = wheelWrap.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const rawDx = e.clientX - cx;
      const rawDy = e.clientY - cy;
      const rotated =
        typeof document !== 'undefined' &&
        document.documentElement.classList.contains('is-mobile-landscape-90');
      const dx = rotated ? rawDy : rawDx;
      const dy = rotated ? -rawDx : rawDy;
      const cssSize = Math.max(120, Math.round(wheelWrap.clientWidth || rect.width));
      const maxR = Math.max(4, cssSize * 0.5 - 3);
      const dist = Math.hypot(dx, dy);
      hsv.h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      hsv.s = Math.max(0, Math.min(1, dist / maxR));
      if (hsv.v < 0.02) hsv.v = 1;
      const nextHex = hsvToHex(hsv.h, hsv.s, hsv.v);
      syncUI(nextHex, { syncHsvFromHex: false, emit: true });
    };

    wheelWrap.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      wheelPointerId = e.pointerId;
      try {
        wheelWrap.setPointerCapture(e.pointerId);
      } catch {}
      pickFromWheelEvent(e);
    });
    wheelWrap.addEventListener('pointermove', (e) => {
      if (wheelPointerId !== e.pointerId) return;
      pickFromWheelEvent(e);
    });
    const endWheelDrag = (e) => {
      if (wheelPointerId !== e.pointerId) return;
      wheelPointerId = null;
      try {
        if (wheelWrap.hasPointerCapture?.(e.pointerId)) {
          wheelWrap.releasePointerCapture(e.pointerId);
        }
      } catch {}
    };
    wheelWrap.addEventListener('pointerup', endWheelDrag);
    wheelWrap.addEventListener('pointercancel', endWheelDrag);
  }

  valueRange?.addEventListener('input', (e) => {
    const pct = Math.max(0, Math.min(100, Number(e.target.value) || 0));
    hsv.v = pct / 100;
    const nextHex = hsvToHex(hsv.h, hsv.s, hsv.v);
    syncUI(nextHex, { syncHsvFromHex: false, emit: true });
  });

  nativeInput?.addEventListener('input', (e) => {
    syncUI(e.target.value, { syncHsvFromHex: true, emit: true });
  });

  hexInput?.addEventListener('change', (e) => {
    const raw = String(e.target.value || '').trim();
    const cleaned = raw.startsWith('#') ? raw : `#${raw}`;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(cleaned)) {
      const [r, g, b] = parseHexColor(cleaned);
      syncUI(rgbToHex(r, g, b), { syncHsvFromHex: true, emit: true });
    } else {
      e.target.value = currentColor.toUpperCase();
    }
  });

  syncUI(currentColor, { syncHsvFromHex: true, emit: false });

  return {
    setColor(hex) {
      syncUI(hex, { syncHsvFromHex: true, emit: false });
    },
    getColor() {
      return currentColor;
    },
    setOpen,
    render: renderWheel,
  };
}
