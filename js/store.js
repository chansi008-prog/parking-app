// 저장소 모듈: 모든 데이터 읽기·쓰기를 여기에 모아 둔다.
// 이 기기의 브라우저 저장소(IndexedDB)에만 저장. 사진은 'img' 저장소에 따로 둔다.

const DB_NAME = 'parking-app';
const KV = 'kv';
const IMG = 'img';
const KEY = 'data';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const HS_EV = ['B2', 'B3', 'B4'];

function seedPlace() {
  // 부산 송도 힐스테이트 이진베이시티: 지하 1~6층 주차장, 전기차 충전기는 B2~B4
  return {
    id: 'hillstate', name: '송도 힐스테이트', note: '이진베이시티',
    floors: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'].map(n => ({ id: 'hs-' + n, name: n, map: null, ev: HS_EV.includes(n) })),
  };
}

function emptyData() {
  return {
    version: 1,
    cars: [],            // { id, model, color, plate, tint }
    places: [seedPlace()], // { id, name, note, floors: [{ id, name, map(사진 id), ev(충전기 있는 층) }] }
    parks: {},           // carId → { placeId, floorId, x, y, ev(충전 중), spot, memo, photo, at }
    history: [],         // 지난 주차 기록 (최근 순)
    settings: { carId: null, placeId: 'hillstate', spots: [], lastBackupAt: null, evSeeded: true },
  };
}

let data = emptyData();
let idb = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(KV); req.result.createObjectStore(IMG); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function normalize(d) {
  const base = emptyData();
  const out = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
  ['cars', 'places', 'history'].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
  if (!out.parks || typeof out.parks !== 'object') out.parks = {};
  if (!Array.isArray(out.settings.spots)) out.settings.spots = [];
  // 충전 기능 전에 만든 기록: 힐스테이트 충전기 층 표시
  if (!d.settings?.evSeeded) {
    out.places.find(p => p.id === 'hillstate')?.floors.forEach(f => { if (HS_EV.includes(f.name)) f.ev = true; });
    out.settings.evSeeded = true;
  }
  return out;
}

const req2p = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export async function load() {
  try {
    idb = await openDb();
    const saved = await req2p(idb.transaction(KV).objectStore(KV).get(KEY));
    if (saved) data = normalize(saved);
    navigator.storage?.persist?.().catch(() => {});
  } catch (e) {
    console.warn('저장소를 열지 못했습니다', e);
  }
  return data;
}

let timer = null;
function persist() { clearTimeout(timer); timer = setTimeout(flush, 120); }
export function flush() {
  clearTimeout(timer);
  if (!idb) return;
  try { idb.transaction(KV, 'readwrite').objectStore(KV).put(structuredClone(data), KEY); }
  catch (e) { console.warn('저장 실패', e); }
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
addEventListener('pagehide', flush);

export const db = () => data;
export const touch = persist;

// ---- 사진 ----
const urls = new Map();
export async function putImage(blob) {
  const id = 'img-' + uid();
  if (idb) await req2p(idb.transaction(IMG, 'readwrite').objectStore(IMG).put(blob, id));
  urls.set(id, URL.createObjectURL(blob));
  return id;
}
export async function imageUrl(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  if (!idb) return null;
  const blob = await req2p(idb.transaction(IMG).objectStore(IMG).get(id));
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urls.set(id, u);
  return u;
}
export async function getImage(id) {
  return idb && id ? req2p(idb.transaction(IMG).objectStore(IMG).get(id)) : null;
}
export function dropImage(id) {
  if (!id || !idb) return;
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  idb.transaction(IMG, 'readwrite').objectStore(IMG).delete(id);
}
// 아무 데서도 안 쓰는 사진 정리
export async function sweepImages() {
  if (!idb) return;
  const used = new Set();
  data.places.forEach(p => p.floors.forEach(f => f.map && used.add(f.map)));
  Object.values(data.parks).forEach(r => r?.photo && used.add(r.photo));
  data.history.forEach(r => r.photo && used.add(r.photo));
  const keys = await req2p(idb.transaction(IMG).objectStore(IMG).getAllKeys());
  keys.filter(k => !used.has(k)).forEach(dropImage);
}

// ---- 차 ----
export function saveCar(car) {
  const i = data.cars.findIndex(c => c.id === car.id);
  if (i >= 0) data.cars[i] = car; else data.cars.push(car);
  if (!data.settings.carId) data.settings.carId = car.id;
  persist();
}
export function deleteCar(id) {
  data.cars = data.cars.filter(c => c.id !== id);
  delete data.parks[id];
  if (data.settings.carId === id) data.settings.carId = data.cars[0]?.id || null;
  persist(); sweepImages();
}

// ---- 장소 ----
export function savePlace(p) {
  const i = data.places.findIndex(x => x.id === p.id);
  if (i >= 0) data.places[i] = p; else data.places.push(p);
  persist();
}
export function deletePlace(id) {
  data.places = data.places.filter(p => p.id !== id);
  for (const k of Object.keys(data.parks)) if (data.parks[k]?.placeId === id) delete data.parks[k];
  data.history = data.history.filter(r => r.placeId !== id);
  if (data.settings.placeId === id) data.settings.placeId = data.places[0]?.id || null;
  persist(); sweepImages();
}

// ---- 주차 기록 ----
export function park(carId, rec) {
  const prev = data.parks[carId];
  if (prev) data.history.unshift({ ...prev, carId, leftAt: Date.now() });
  data.history = data.history.slice(0, 30);
  data.parks[carId] = rec;
  data.settings.placeId = rec.placeId;
  if (rec.spot) {
    data.settings.spots = [rec.spot, ...data.settings.spots.filter(s => s !== rec.spot)].slice(0, 8);
  }
  persist(); sweepImages();
}
export function unpark(carId) {
  const prev = data.parks[carId];
  if (prev) { data.history.unshift({ ...prev, carId, leftAt: Date.now() }); data.history = data.history.slice(0, 30); }
  delete data.parks[carId];
  persist(); sweepImages();
}

export function setSetting(k, v) { data.settings[k] = v; persist(); }

// ---- 백업 ----
const blobToDataUrl = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });

export async function exportAll() {
  const images = {};
  if (idb) {
    const keys = await req2p(idb.transaction(IMG).objectStore(IMG).getAllKeys());
    for (const k of keys) { const b = await getImage(k); if (b) images[k] = await blobToDataUrl(b); }
  }
  return JSON.stringify({ app: 'parking-app', data, images });
}
export async function importAll(text) {
  const obj = JSON.parse(text);
  if (obj.app !== 'parking-app' || !obj.data) throw new Error('이 앱의 백업 파일이 아니에요');
  data = normalize(obj.data);
  for (const [k, u] of Object.entries(obj.images || {})) {
    const blob = await (await fetch(u)).blob();
    if (idb) await req2p(idb.transaction(IMG, 'readwrite').objectStore(IMG).put(blob, k));
    if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); }
  }
  flush();
}
