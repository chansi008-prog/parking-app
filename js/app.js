// 화면 구성: #home(내 차 위치) #park(주차 기록) #places #place/id #cars #car/id
import * as S from './store.js';
import { mountMap } from './map.js';
import { shrink, rotate } from './img.js';

const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => [...el.querySelectorAll(q)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');

const TINTS = ['#E0362C', '#F08C00', '#2F9E44', '#1C7ED6', '#7048E8', '#212529'];

const I = {
  car: '<svg class="i" viewBox="0 0 24 24"><path d="M5 17h14M3 13l2-6h14l2 6v4H3z"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/></svg>',
  pin: '<svg class="i" viewBox="0 0 24 24"><path d="M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  map: '<svg class="i" viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>',
  cam: '<svg class="i" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  rot: '<svg class="i" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>',
  back: '<svg class="i" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  gear: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  plus: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};

let toastTimer;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
}

function ago(t) {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 ${m % 60 ? (m % 60) + '분 ' : ''}전`;
  return `${Math.floor(h / 24)}일 전`;
}
function when(t) {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const D = () => S.db();
const car = id => D().cars.find(c => c.id === id);
const place = id => D().places.find(p => p.id === id);
const floor = (p, id) => p?.floors.find(f => f.id === id);
const carLabel = c => [c.model, c.color, c.plate].filter(Boolean).join(' · ');
function where(r) {
  const p = place(r.placeId), f = floor(p, r.floorId);
  return { p, f, title: `${p?.name || '(지운 장소)'} · ${f?.name || ''}` };
}
const spotText = r => [r.spot, r.memo].filter(Boolean).join(' · ');

let maps = [];
function clearMaps() { maps.forEach(m => m.destroy()); maps = []; }
async function addMap(host, o) {
  const src = o.mapId ? await S.imageUrl(o.mapId) : null;
  const m = mountMap(host, { ...o, src });
  maps.push(m);
  return m;
}

function pickFile(capture) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    if (capture) inp.capture = 'environment';
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}

function viewPhoto(url) {
  const o = document.createElement('div');
  o.className = 'viewer';
  o.innerHTML = `<img src="${url}" alt="사진">`;
  o.onclick = () => o.remove();
  document.body.appendChild(o);
}

// ---------------- 내 차 위치 ----------------
async function renderHome() {
  const d = D();
  if (!d.cars.length) {
    app.innerHTML = `<div class="top"><h1>내 차 어디?</h1></div>
      <div class="card hero">
        <div class="hero-ic">${I.car}</div>
        <b>먼저 내 차를 등록해 주세요</b>
        <p class="muted small">차종만 적어도 돼요. 가족 차도 여러 대 등록할 수 있어요.</p>
        <a class="btn pri block" href="#car/new">내 차 등록</a>
      </div>`;
    return;
  }
  const cid = car(d.settings.carId) ? d.settings.carId : d.cars[0].id;
  const c = car(cid);
  const r = d.parks[cid];
  const chips = d.cars.length > 1 ? `<div class="chips">${d.cars.map(x =>
    `<button class="chip ${x.id === cid ? 'on' : ''}" data-car="${x.id}"><i class="dot" style="background:${x.tint}"></i>${esc(x.model)}</button>`).join('')}</div>` : '';
  const hist = d.history.filter(h => h.carId === cid && place(h.placeId)).slice(0, 5);

  let body;
  if (r) {
    const w = where(r);
    const st = spotText(r);
    const showMap = r.x != null && w.f?.map;
    const time = `<div class="w-time">${ago(r.at)} · ${when(r.at)} ${r.ev ? '충전 시작' : '주차'}</div>`;
    const carLine = `<div class="w-car"><i class="dot" style="background:${c.tint}"></i>${esc(carLabel(c))}</div>`;
    // 약도 사진이 있으면 약도에 핀, 없으면 층·번호를 크게
    body = showMap ? `<div class="card where">${carLine}
        <div class="w-title">${esc(w.p?.name || '(지운 장소)')} <span class="floor">${esc(w.f?.name || '')}</span>${r.ev ? '<span class="ev-badge">⚡ 충전</span>' : ''}</div>
        ${st ? `<div class="w-spot">${esc(st)}</div>` : ''}${time}
      </div>
      <div class="map-wrap"><div id="m-home" class="mapbox tall"></div></div>`
      : `<div class="card where big">${carLine}
        <div class="w-place">${esc(w.p?.name || '(지운 장소)')}</div>
        <div class="w-floor">${esc(w.f?.name || '')}</div>
        ${r.ev ? '<div><span class="ev-badge lg">⚡ 전기차 충전</span></div>' : ''}
        ${r.spot ? `<div class="w-bigspot">${esc(r.spot)}</div>` : ''}
        ${r.memo ? `<div class="w-memo">${esc(r.memo)}</div>` : ''}${time}
      </div>`;
    body += `
      ${r.photo ? `<button class="photo-btn" id="see-photo"><img id="photo-thumb" alt="주차한 자리 사진"><span>주차한 자리 사진</span></button>` : ''}
      <div class="row-btns mt"><a class="btn" href="#park">다시 기록</a><button class="btn" id="unpark">출차했어요</button></div>`;
  } else {
    body = `<div class="card hero">
        <div class="w-car"><i class="dot" style="background:${c.tint}"></i>${esc(carLabel(c))}</div>
        <div class="hero-ic">${I.pin}</div>
        <b>기록된 주차 위치가 없어요</b>
        <p class="muted small">주차하고 바로 기록해 두세요.</p>
        <a class="btn pri block big" href="#park">지금 주차 위치 기록</a>
      </div>`;
  }
  const histHtml = hist.length ? `<div class="sec"><h2>지난 주차 <small>자주 대는 자리는 "여기 또"</small></h2></div>
    <div class="card list">${hist.map((h, i) => {
      const w = where(h), st = spotText(h);
      return `<div class="li"><div class="li-main"><b>${h.ev ? '<span class="ev-badge sm">⚡</span>' : ''}${esc(w.title)}</b><span class="muted small">${esc(st)}${st ? ' · ' : ''}${when(h.at)}</span></div>
        <button class="btn sm" data-again="${i}">여기 또</button></div>`;
    }).join('')}</div>` : '';

  app.innerHTML = `<div class="top"><h1>내 차 어디?</h1></div>${chips}${body}${histHtml}`;

  $$('[data-car]').forEach(b => b.onclick = () => { S.setSetting('carId', b.dataset.car); render(); });
  $('#unpark')?.addEventListener('click', () => {
    if (!confirm('주차 기록을 지울까요? (지난 주차에 남아요)')) return;
    S.unpark(cid); toast('출차 완료'); render();
  });
  $$('[data-again]').forEach(b => b.onclick = () => {
    const h = hist[+b.dataset.again];
    draft = { carId: cid, placeId: h.placeId, floorId: h.floorId, x: h.x, y: h.y, ev: !!h.ev, spot: h.spot || '', memo: h.memo || '', photo: null };
    location.hash = '#park';
  });
  if (r?.photo) {
    const u = await S.imageUrl(r.photo);
    if (u) { $('#photo-thumb').src = u; $('#see-photo').onclick = () => viewPhoto(u); }
  }
  if ($('#m-home')) {
    const w = where(r);
    await addMap($('#m-home'), { mapId: w.f?.map, pin: { x: r.x, y: r.y }, tint: c.tint, ev: r.ev, focus: true });
  }
}

// ---------------- 주차 기록 ----------------
let draft = null;
let parkMap = null;
function freshDraft() {
  const d = D();
  const cid = car(d.settings.carId) ? d.settings.carId : d.cars[0]?.id;
  const cur = d.parks[cid];
  const pid = place(d.settings.placeId) ? d.settings.placeId : d.places[0]?.id;
  // 같은 장소에 마지막으로 댄 층을 먼저 고른다
  const last = [cur, ...d.history].find(h => h && h.placeId === pid);
  const p = place(pid);
  return { carId: cid, placeId: pid, floorId: floor(p, last?.floorId)?.id || p?.floors[0]?.id || null,
    x: null, y: null, ev: false, spot: '', memo: '', photo: null };
}

async function renderPark() {
  const d = D();
  if (!d.cars.length) { location.hash = '#car/new'; return; }
  if (!d.places.length) { location.hash = '#place/new'; return; }
  if (!draft || !car(draft.carId)) draft = freshDraft();
  if (!place(draft.placeId)) { draft.placeId = d.places[0].id; draft.floorId = d.places[0].floors[0]?.id; }
  const p = place(draft.placeId);
  if (!floor(p, draft.floorId)) draft.floorId = p.floors[0]?.id || null;
  const f = floor(p, draft.floorId);
  const c = car(draft.carId);
  // 기둥 번호가 필요 없는 주차장: 층만 고르고 저장
  const simple = p.floorOnly && !draft.more && !draft.spot && !draft.memo && !draft.photo;

  app.innerHTML = `<div class="dtop"><a class="back" href="#home">${I.back}취소</a><b>주차 위치 기록</b><span style="width:56px"></span></div>
    ${d.cars.length > 1 ? `<div class="label">차</div><div class="chips">${d.cars.map(x =>
      `<button class="chip ${x.id === draft.carId ? 'on' : ''}" data-car="${x.id}"><i class="dot" style="background:${x.tint}"></i>${esc(x.model)}</button>`).join('')}</div>` : ''}
    <div class="label">주차장</div>
    <div class="chips">${d.places.map(x => `<button class="chip ${x.id === p.id ? 'on' : ''}" data-place="${x.id}">${esc(x.name)}</button>`).join('')}
      <a class="chip add" href="#place/new">${I.plus}새 주차장</a></div>
    <div class="label">층</div>
    <div class="chips floors">${p.floors.map(x => `<button class="chip ${x.id === draft.floorId ? 'on' : ''}" data-floor="${x.id}">${esc(x.name)}${x.ev ? '<span class="bolt" title="충전기 있음">⚡</span>' : ''}</button>`).join('')}
      ${p.floors.length ? '' : `<a class="chip add" href="#place/${p.id}">층 추가</a>`}</div>
    ${simple ? `<p class="simple-note">층만 기억하면 되는 주차장이에요. 층을 고르고 저장하세요.</p>`
    : f?.map ? `<div class="label">약도에서 내 차 자리를 눌러 주세요 <span class="muted small">(선택)</span></div>
      <div class="map-wrap"><div id="m-park" class="mapbox"></div></div>
      <div class="picked ${draft.x != null ? 'ok' : ''}" id="picked">${draft.x != null ? '위치를 찍었어요 ✓' : '아직 위치를 안 찍었어요'}</div>`
    : f ? `<button class="map-empty" id="add-map">${I.cam}<span><b>${esc(f.name)} 약도 사진 넣기</b><span>엘리베이터 앞 주차장 안내도를 찍으면 약도에 위치를 표시할 수 있어요. 없어도 층·기둥 번호로 기록돼요.</span></span></button>` : ''}
    <button class="ev-toggle ${draft.ev ? 'on' : ''}" id="ev" aria-pressed="${draft.ev}">
      <span class="ev-ic">⚡</span><span><b>전기차 충전 중</b><span>${f?.ev ? '이 층에 충전기가 있어요 · ' : ''}${simple ? '충전만 표시해도 돼요' : '충전기 번호·기둥 번호는 아래에 적어도, 안 적어도 돼요'}</span></span><i class="sw"></i>
    </button>
    ${simple ? `<button class="link mt" id="more">${I.plus}기둥 번호·메모·사진도 남기기</button>` : `
    <div class="label">기둥·구역·충전기 번호 <span class="muted small">(선택)</span></div>
    <input class="inp" id="spot" placeholder="예: C-12, 3번 엘리베이터 앞" value="${esc(draft.spot)}">
    ${d.settings.spots.length ? `<div class="chips mini">${d.settings.spots.map(s => `<button class="chip sm" data-spot="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
    <div class="label">메모 <span class="muted small">(선택)</span></div>
    <input class="inp" id="memo" placeholder="예: 기둥 옆, 출구 쪽" value="${esc(draft.memo)}">
    <div class="label">자리 사진 <span class="muted small">(선택 · 기둥 번호가 보이게)</span></div>
    <div class="row-btns"><button class="btn" id="take">${I.cam}${draft.photo ? '사진 다시 찍기' : '사진 찍기'}</button></div>
    ${draft.photo ? `<img class="draft-photo" id="draft-photo" alt="자리 사진">` : ''}`}
    <button class="btn pri block big mt2" id="save">저장</button>`;

  $$('[data-car]').forEach(b => b.onclick = () => { draft.carId = b.dataset.car; renderPark(); });
  $$('[data-place]').forEach(b => b.onclick = () => {
    const np = place(b.dataset.place);
    const last = [d.parks[draft.carId], ...d.history].find(h => h && h.placeId === np.id);
    Object.assign(draft, { placeId: np.id, floorId: floor(np, last?.floorId)?.id || np.floors[0]?.id || null, x: null, y: null, more: false });
    renderPark();
  });
  $$('[data-floor]').forEach(b => b.onclick = () => { draft.floorId = b.dataset.floor; draft.x = draft.y = null; renderPark(); });
  $$('[data-spot]').forEach(b => b.onclick = () => { draft.spot = b.dataset.spot; $('#spot').value = draft.spot; });
  $('#more')?.addEventListener('click', () => { draft.more = true; renderPark(); });
  if ($('#spot')) $('#spot').oninput = e => { draft.spot = e.target.value; };
  $('#ev').onclick = e => {
    draft.ev = !draft.ev;
    const b = e.currentTarget;
    b.classList.toggle('on', draft.ev); b.setAttribute('aria-pressed', draft.ev);
    parkMap?.setEv(draft.ev);
  };
  if ($('#memo')) $('#memo').oninput = e => { draft.memo = e.target.value; };
  $('#add-map')?.addEventListener('click', async () => { if (await setFloorMap(p, f)) renderPark(); });
  if ($('#take')) $('#take').onclick = async () => {
    const file = await pickFile(true);
    if (!file) return;
    if (draft.photo) S.dropImage(draft.photo);
    draft.photo = await S.putImage(await shrink(file, 1400));
    renderPark();
  };
  if (draft.photo) {
    const u = await S.imageUrl(draft.photo);
    $('#draft-photo').src = u; $('#draft-photo').onclick = () => viewPhoto(u);
  }
  $('#save').onclick = () => {
    if (!f) { toast('층을 먼저 만들어 주세요'); return; }
    S.park(draft.carId, { placeId: p.id, floorId: f.id, x: draft.x, y: draft.y, ev: draft.ev,
      spot: draft.spot.trim(), memo: draft.memo.trim(), photo: draft.photo, at: Date.now() });
    S.setSetting('carId', draft.carId);
    toast(draft.ev ? '충전 위치를 저장했어요' : '주차 위치를 저장했어요');
    draft = null;
    location.hash = '#home';
  };
  parkMap = null;
  if (f?.map) {
    parkMap = await addMap($('#m-park'), {
      mapId: f.map, editable: true, tint: c.tint, ev: draft.ev,
      pin: draft.x != null ? { x: draft.x, y: draft.y } : null,
      onPick: (x, y) => {
        draft.x = x; draft.y = y;
        $('#picked').textContent = '위치를 찍었어요 ✓';
        $('#picked').classList.add('ok');
      },
    });
  }
}

// 층 약도 사진 넣기/바꾸기
async function setFloorMap(p, f) {
  const file = await pickFile(false);
  if (!file) return false;
  toast('사진을 넣는 중…');
  const old = f.map;
  f.map = await S.putImage(await shrink(file, 2200));
  // 약도가 바뀌면 예전에 찍은 위치는 맞지 않으니 지운다
  const d = D();
  const clear = r => { if (r && r.floorId === f.id) r.x = r.y = null; };
  Object.values(d.parks).forEach(clear);
  d.history.forEach(clear);
  if (draft?.floorId === f.id) draft.x = draft.y = null;
  S.savePlace(p);
  if (old) S.sweepImages();
  toast(`${f.name} 약도를 넣었어요`);
  return true;
}
// 약도를 시계 방향으로 돌리면 찍어 둔 위치도 같이 돌린다
async function rotateFloorMap(p, f) {
  const blob = await S.getImage(f.map);
  if (!blob) return;
  const old = f.map;
  f.map = await S.putImage(await rotate(blob));
  const d = D();
  const turn = r => { if (r && r.floorId === f.id && r.x != null) { const x = r.x; r.x = 1 - r.y; r.y = x; } };
  Object.values(d.parks).forEach(turn);
  d.history.forEach(turn);
  S.savePlace(p);
  S.dropImage(old);
}

// ---------------- 주차장 ----------------
function renderPlaces() {
  const d = D();
  app.innerHTML = `<div class="top"><h1>주차장</h1><a class="btn sm pri" href="#place/new">${I.plus}추가</a></div>
    <p class="muted small" style="margin:-6px 2px 12px">층마다 엘리베이터 앞 <b>주차장 안내도</b>를 사진으로 찍어 넣으면, 그 위에 내 차 위치를 표시할 수 있어요.</p>
    ${d.places.length ? `<div class="card list">${d.places.map(p => {
      const n = p.floors.filter(f => f.map).length;
      return `<a class="li" href="#place/${p.id}"><div class="li-main"><b>${esc(p.name)}</b>
        <span class="muted small">${esc(p.note ? p.note + ' · ' : '')}${p.floors.map(f => (f.ev ? '⚡' : '') + esc(f.name)).join(' ') || '층 없음'} · 약도 ${n}/${p.floors.length}</span></div><span class="chev">›</span></a>`;
    }).join('')}</div>` : '<div class="empty">주차장이 없어요</div>'}`;
}

function renderPlaceNew() {
  app.innerHTML = `<div class="dtop"><a class="back" href="#places">${I.back}주차장</a><b>새 주차장</b><span style="width:56px"></span></div>
    <div class="label">이름</div><input class="inp" id="nm" placeholder="예: 롯데백화점 광복점, 회사">
    <div class="label">층</div>
    <div class="chips" id="quick">
      <button class="chip" data-q="지상">지상만</button>
      <button class="chip" data-q="B1,B2">지하 2층</button>
      <button class="chip" data-q="B1,B2,B3">지하 3층</button>
      <button class="chip" data-q="B1,B2,B3,B4,B5">지하 5층</button>
    </div>
    <input class="inp" id="fl" placeholder="쉼표로 구분 (예: 지상, B1, B2)" value="B1,B2">
    <p class="muted small">층 이름은 나중에 바꾸거나 더할 수 있어요.</p>
    <label class="check"><input type="checkbox" id="fo"><span><b>층만 기억하면 돼요</b><span>기둥 번호까지는 필요 없는 주차장 (기록할 때 층만 고르면 끝)</span></span></label>
    <button class="btn pri block big mt2" id="ok">만들기</button>`;
  $$('[data-q]').forEach(b => b.onclick = () => { $('#fl').value = b.dataset.q; });
  $('#ok').onclick = () => {
    const name = $('#nm').value.trim();
    if (!name) { toast('이름을 적어 주세요'); $('#nm').focus(); return; }
    const floors = $('#fl').value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean).map(n => ({ id: S.uid(), name: n, map: null }));
    const p = { id: S.uid(), name, note: '', floors, floorOnly: $('#fo').checked };
    S.savePlace(p);
    if (draft) { draft.placeId = p.id; draft.floorId = floors[0]?.id || null; draft.x = draft.y = null; }
    // 층만 쓰는 곳은 약도 사진이 필요 없으니 바로 기록으로
    location.hash = draft && p.floorOnly ? '#park' : '#place/' + p.id;
  };
  $('#nm').focus();
}

async function renderPlace(id) {
  const p = place(id);
  if (!p) { location.hash = '#places'; return; }
  app.innerHTML = `<div class="dtop"><a class="back" href="${draft ? '#park' : '#places'}">${I.back}${draft ? '기록으로' : '주차장'}</a><b></b><span style="width:56px"></span></div>
    <div class="label">이름</div><input class="inp" id="nm" value="${esc(p.name)}">
    <div class="label">메모 <span class="muted small">(선택)</span></div><input class="inp" id="nt" value="${esc(p.note)}" placeholder="예: 정문 쪽 입구로 들어감">
    <label class="check"><input type="checkbox" id="fo" ${p.floorOnly ? 'checked' : ''}><span><b>층만 기억하면 돼요</b><span>기록할 때 기둥 번호·약도 칸을 숨기고 층만 고르게 해요</span></span></label>
    <div class="sec"><h2>층별 약도</h2></div>
    ${p.floors.map((f, i) => `<div class="card floor-card">
      <div class="fc-head"><input class="inp fl-name" data-i="${i}" value="${esc(f.name)}" aria-label="층 이름">
        <button class="link sm" data-up="${i}" ${i ? '' : 'disabled'} aria-label="위로">▲</button>
        <button class="link sm danger" data-del="${i}">삭제</button></div>
      <label class="fc-ev"><input type="checkbox" data-ev="${i}" ${f.ev ? 'checked' : ''}>⚡ 전기차 충전기 있는 층</label>
      ${f.map ? `<img class="fc-map" data-map="${i}" alt="${esc(f.name)} 약도">` : `<div class="fc-empty">약도 사진 없음 — 층·기둥 번호로 기록돼요</div>`}
      <div class="row-btns"><button class="btn sm" data-photo="${i}">${I.cam}${f.map ? '사진 바꾸기' : '약도 사진 넣기'}</button>
        ${f.map ? `<button class="btn sm" data-rot="${i}">${I.rot}돌리기</button>` : ''}</div>
    </div>`).join('')}
    <div class="row-btns"><input class="inp" id="newf" placeholder="층 추가 (예: B4)"><button class="btn" id="addf" style="flex:0 0 auto">${I.plus}추가</button></div>
    <button class="btn danger block mt2" id="delp">이 주차장 지우기</button>`;

  $('#nm').onchange = e => { p.name = e.target.value.trim() || p.name; S.savePlace(p); };
  $('#nt').onchange = e => { p.note = e.target.value.trim(); S.savePlace(p); };
  $('#fo').onchange = e => { p.floorOnly = e.target.checked; S.savePlace(p); };
  $$('.fl-name').forEach(inp => inp.onchange = () => { const v = inp.value.trim(); if (v) { p.floors[+inp.dataset.i].name = v; S.savePlace(p); } });
  $$('[data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; [p.floors[i - 1], p.floors[i]] = [p.floors[i], p.floors[i - 1]]; S.savePlace(p); renderPlace(id); });
  $$('[data-del]').forEach(b => b.onclick = () => {
    const f = p.floors[+b.dataset.del];
    if (!confirm(`${f.name} 층을 지울까요?`)) return;
    p.floors.splice(+b.dataset.del, 1); S.savePlace(p); S.sweepImages(); renderPlace(id);
  });
  $$('[data-ev]').forEach(b => b.onchange = () => { p.floors[+b.dataset.ev].ev = b.checked; S.savePlace(p); });
  $$('[data-photo]').forEach(b => b.onclick = async () => { if (await setFloorMap(p, p.floors[+b.dataset.photo])) renderPlace(id); });
  $$('[data-rot]').forEach(b => b.onclick = async () => { b.disabled = true; await rotateFloorMap(p, p.floors[+b.dataset.rot]); renderPlace(id); });
  $('#addf').onclick = () => {
    const v = $('#newf').value.trim();
    if (!v) return;
    v.split(/[,\s]+/).filter(Boolean).forEach(n => p.floors.push({ id: S.uid(), name: n, map: null }));
    S.savePlace(p); renderPlace(id);
  };
  $('#delp').onclick = () => {
    if (!confirm(`'${p.name}'을(를) 지울까요? 약도 사진과 이곳 주차 기록도 지워져요.`)) return;
    S.deletePlace(p.id); location.hash = '#places';
  };
  for (const img of $$('[data-map]')) {
    const u = await S.imageUrl(p.floors[+img.dataset.map].map);
    if (u) { img.src = u; img.onclick = () => viewPhoto(u); }
  }
}

// ---------------- 차·설정 ----------------
function renderCars() {
  const d = D();
  app.innerHTML = `<div class="top"><h1>내 차</h1><a class="btn sm pri" href="#car/new">${I.plus}추가</a></div>
    ${d.cars.length ? `<div class="card list">${d.cars.map(c => `<a class="li" href="#car/${c.id}"><i class="dot big" style="background:${c.tint}"></i>
      <div class="li-main"><b>${esc(c.model)}</b><span class="muted small">${esc([c.color, c.plate].filter(Boolean).join(' · ') || '색상·번호 없음')}</span></div><span class="chev">›</span></a>`).join('')}</div>`
      : '<div class="empty">등록된 차가 없어요</div>'}
    <div class="sec"><h2>백업</h2></div>
    <div class="card">
      <p class="small muted" style="margin:0 0 10px">기록은 <b>이 폰에만</b> 저장돼요. 홈 화면 아이콘을 지우면 기록과 약도 사진도 함께 지워지니, 폰을 바꾸기 전엔 백업 파일을 만들어 두세요.</p>
      <div class="row-btns"><button class="btn sm" id="bk">백업 파일 만들기</button><button class="btn sm" id="rs">백업 불러오기</button></div>
      ${d.settings.lastBackupAt ? `<p class="small muted" style="margin:8px 0 0">마지막 백업: ${when(d.settings.lastBackupAt)}</p>` : ''}
    </div>`;
  $('#bk').onclick = async () => {
    const text = await S.exportAll();
    const blob = new Blob([text], { type: 'application/json' });
    const d0 = new Date();
    const name = `주차위치-백업-${d0.getFullYear()}${String(d0.getMonth() + 1).padStart(2, '0')}${String(d0.getDate()).padStart(2, '0')}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    S.setSetting('lastBackupAt', Date.now());
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); } catch { /* 취소 */ }
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    renderCars();
  };
  $('#rs').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      if (!confirm('지금 기록을 백업 파일 내용으로 바꿀까요?')) return;
      try { await S.importAll(await f.text()); toast('백업을 불러왔어요'); location.hash = '#home'; render(); }
      catch (e) { alert(e.message || '불러오지 못했어요'); }
    };
    inp.click();
  };
}

function renderCar(id) {
  const isNew = id === 'new';
  const c = isNew ? { id: S.uid(), model: '', color: '', plate: '', tint: TINTS[D().cars.length % TINTS.length] } : car(id);
  if (!c) { location.hash = '#cars'; return; }
  app.innerHTML = `<div class="dtop"><a class="back" href="${D().cars.length ? '#cars' : '#home'}">${I.back}${isNew ? '취소' : '내 차'}</a><b>${isNew ? '차 등록' : '차 고치기'}</b><span style="width:56px"></span></div>
    <div class="label">차종</div><input class="inp" id="model" value="${esc(c.model)}" placeholder="예: 그랜저, 쏘렌토">
    <div class="label">색상 <span class="muted small">(선택)</span></div><input class="inp" id="color" value="${esc(c.color)}" placeholder="예: 흰색">
    <div class="label">차 번호 <span class="muted small">(선택)</span></div><input class="inp" id="plate" value="${esc(c.plate)}" placeholder="예: 12가 3456">
    <div class="label">약도 핀 색</div>
    <div class="tints">${TINTS.map(t => `<button class="tint ${t === c.tint ? 'on' : ''}" data-t="${t}" style="background:${t}" aria-label="핀 색"></button>`).join('')}</div>
    <button class="btn pri block big mt2" id="ok">저장</button>
    ${isNew ? '' : '<button class="btn danger block mt" id="del">이 차 지우기</button>'}`;
  $$('[data-t]').forEach(b => b.onclick = () => { c.tint = b.dataset.t; $$('.tint').forEach(x => x.classList.toggle('on', x === b)); });
  $('#ok').onclick = () => {
    const model = $('#model').value.trim();
    if (!model) { toast('차종을 적어 주세요'); $('#model').focus(); return; }
    S.saveCar({ ...c, model, color: $('#color').value.trim(), plate: $('#plate').value.trim() });
    toast('저장했어요');
    location.hash = isNew && D().cars.length === 1 ? '#home' : '#cars';
  };
  $('#del')?.addEventListener('click', () => {
    if (!confirm(`${c.model}을(를) 지울까요? 이 차의 주차 기록도 지워져요.`)) return;
    S.deleteCar(c.id); location.hash = '#cars';
  });
  if (isNew) $('#model').focus();
}

// ---------------- 길 안내 ----------------
function render() {
  clearMaps();
  const h = location.hash.slice(1) || 'home';
  const [route, arg] = h.split('/');
  if (route !== 'park' && route !== 'place') draft = null;
  const tab = { home: 'home', park: 'home', places: 'places', place: 'places', cars: 'cars', car: 'cars' }[route] || 'home';
  $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  window.scrollTo(0, 0);
  ({ park: renderPark, places: renderPlaces, place: () => arg === 'new' ? renderPlaceNew() : renderPlace(arg), cars: renderCars, car: () => renderCar(arg) }[route] || renderHome)();
}

addEventListener('hashchange', render);
// 앱으로 돌아오면 "몇 분 전"을 새로 고친다
addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (location.hash || '#home') === '#home') render(); });

$('#nav').innerHTML = `<a href="#home" data-tab="home">${I.pin}<span>내 차 위치</span></a>
  <a href="#places" data-tab="places">${I.map}<span>주차장</span></a>
  <a href="#cars" data-tab="cars">${I.car}<span>내 차·백업</span></a>`;

await S.load();
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
