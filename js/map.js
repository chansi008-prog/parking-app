// 약도 보기: 손가락 두 개로 확대, 한 손가락으로 이동, 탭으로 위치 찍기.
// 위치는 약도 크기에 대한 비율(0~1)로 다룬다.

const GRID_COLS = 'ABCDEFGH';
const GRID_ROWS = 10;

// 약도 사진이 없을 때 쓰는 칸 그림
function gridSvg() {
  const w = 800, h = 600, cw = w / GRID_COLS.length, rh = h / GRID_ROWS;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#EEF1F5"/>`;
  for (let c = 0; c < GRID_COLS.length; c++) for (let r = 0; r < GRID_ROWS; r++) {
    s += `<rect x="${c * cw + 3}" y="${r * rh + 3}" width="${cw - 6}" height="${rh - 6}" rx="6" fill="#fff" stroke="#D5DAE2"/>`;
    s += `<text x="${c * cw + cw / 2}" y="${r * rh + rh / 2 + 7}" text-anchor="middle" font-size="20" fill="#A3AAB6" font-family="sans-serif">${GRID_COLS[c]}${r + 1}</text>`;
  }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s + '</svg>');
}
export function gridLabel(x, y) {
  const c = Math.min(GRID_COLS.length - 1, Math.max(0, Math.floor(x * GRID_COLS.length)));
  const r = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(y * GRID_ROWS)));
  return GRID_COLS[c] + (r + 1);
}

const PIN = `<svg viewBox="0 0 40 52" width="40" height="52"><path d="M20 50C20 50 37 31 37 18A17 17 0 0 0 3 18C3 31 20 50 20 50Z" fill="var(--pin,#E0362C)" stroke="#fff" stroke-width="3"/><circle cx="20" cy="18" r="6.5" fill="#fff"/></svg>`;

/**
 * mountMap(host, { src, pin:{x,y}|null, editable, tint, onPick(x,y), focus })
 * 돌려주는 값: { setPin(x,y), zoomBy(f), reset(), destroy() }
 */
export function mountMap(host, opts) {
  host.classList.add('map');
  host.innerHTML = `<div class="map-inner"><img alt="주차장 약도" draggable="false"><div class="pin hide">${PIN}</div></div>
    <div class="map-zoom"><button type="button" data-z="in" aria-label="확대">+</button><button type="button" data-z="out" aria-label="축소">−</button><button type="button" data-z="fit" aria-label="전체 보기">⤢</button></div>`;
  const inner = host.querySelector('.map-inner');
  const img = inner.querySelector('img');
  const pinEl = inner.querySelector('.pin');
  if (opts.tint) pinEl.style.setProperty('--pin', opts.tint);

  let s = 1, tx = 0, ty = 0;       // 확대 배율·이동
  let base = 1, iw = 1, ih = 1;    // 화면에 꽉 맞춘 기본 배율, 사진 원래 크기
  let pin = opts.pin || null;
  let alive = true;

  const apply = () => {
    inner.style.transform = `translate(${tx}px, ${ty}px) scale(${s * base})`;
    pinEl.style.transform = `translate(-50%, -100%) scale(${1 / (s * base)})`;
  };
  const clamp = () => {
    const W = host.clientWidth, H = host.clientHeight, w = iw * base * s, h = ih * base * s;
    tx = w <= W ? (W - w) / 2 : Math.min(0, Math.max(W - w, tx));
    ty = h <= H ? (H - h) / 2 : Math.min(0, Math.max(H - h, ty));
  };
  const showPin = () => {
    if (!pin) { pinEl.classList.add('hide'); return; }
    pinEl.classList.remove('hide');
    pinEl.style.left = pin.x * iw + 'px';
    pinEl.style.top = pin.y * ih + 'px';
  };
  const fit = () => {
    const W = host.clientWidth, H = host.clientHeight;
    base = Math.min(W / iw, H / ih);
    s = 1; tx = 0; ty = 0; clamp(); apply();
  };
  // 핀이 화면 가운데 오도록 확대
  const focusPin = (z = 2.2) => {
    if (!pin) return fit();
    const W = host.clientWidth, H = host.clientHeight;
    s = z; tx = W / 2 - pin.x * iw * base * s; ty = H / 2 - pin.y * ih * base * s;
    clamp(); apply();
  };
  // 화면의 점(px,py)을 기준으로 배율 바꾸기
  const zoomAt = (ns, px, py) => {
    ns = Math.min(8, Math.max(1, ns));
    const k = ns / s;
    tx = px - (px - tx) * k; ty = py - (py - ty) * k; s = ns;
    clamp(); apply();
  };

  img.onload = () => {
    if (!alive) return;
    iw = img.naturalWidth || 800; ih = img.naturalHeight || 600;
    inner.style.width = iw + 'px'; inner.style.height = ih + 'px';
    showPin();
    fit();
    if (opts.focus && pin) focusPin();
  };
  img.src = opts.src || gridSvg();

  // ---- 손가락 처리 ----
  const pts = new Map();
  let start = null, moved = false, pinch = null;
  const local = e => { const r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  host.addEventListener('pointerdown', e => {
    if (e.target.closest('.map-zoom')) return;
    host.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) { start = { ...local(e), tx, ty }; moved = false; }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s }; moved = true;
    }
  });
  host.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, local(e));
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(pinch.s * d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (pts.size === 1 && start) {
      const p = local(e);
      if (Math.hypot(p.x - start.x, p.y - start.y) > 8) moved = true;
      if (moved) { tx = start.tx + p.x - start.x; ty = start.ty + p.y - start.y; clamp(); apply(); }
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 1) { const q = [...pts.values()][0]; start = { ...q, tx, ty }; return; }
    if (pts.size === 0 && !moved && opts.editable && e.type === 'pointerup') {
      const x = (p.x - tx) / (iw * base * s), y = (p.y - ty) / (ih * base * s);
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) { pin = { x, y }; showPin(); opts.onPick?.(x, y); }
    }
  };
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', up);
  host.addEventListener('wheel', e => { e.preventDefault(); const p = local(e); zoomAt(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), p.x, p.y); }, { passive: false });
  host.querySelector('.map-zoom').addEventListener('click', e => {
    const z = e.target.closest('button')?.dataset.z;
    const W = host.clientWidth / 2, H = host.clientHeight / 2;
    if (z === 'in') zoomAt(s * 1.5, W, H);
    if (z === 'out') zoomAt(s / 1.5, W, H);
    if (z === 'fit') fit();
  });
  const ro = new ResizeObserver(() => { if (iw > 1) { clamp(); apply(); } });
  ro.observe(host);

  return {
    setPin(x, y) { pin = x == null ? null : { x, y }; showPin(); },
    focusPin, fit,
    destroy() { alive = false; ro.disconnect(); },
  };
}
