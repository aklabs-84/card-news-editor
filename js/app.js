// 카드뉴스 편집기 — 화면 동작 전부
import { loadAssets, buildCardHtml, setImageResolver, EL, slotsOf, imgUrl, TYPES, TYPE_LABEL } from './render.js';

const $ = (s, r = document) => r.querySelector(s);
const KEY = 'card-news-editor:deck:v1';
const H2I = 'https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js';

let deck = { style: 'b', brand: 'AKLABS', cards: [] };
let sel = 0;

/* ---------- 저장 / 알림 ---------- */
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), ms);
}
const serialize = () => JSON.stringify({ deck, sel });
function persist() {
  try { localStorage.setItem(KEY, serialize()); } catch { toast('브라우저 저장 공간이 가득 찼어요. deck.json 저장을 눌러 백업하세요.'); }
  snap();
}
const card = () => deck.cards[sel];

/* ---------- 되돌리기 / 다시 실행 ---------- */
// 변경이 있을 때마다 전체 상태를 사진처럼 찍어 두고(최대 30개), 앞뒤로 오간다.
// 글자를 칠 때 한 글자마다 쌓이지 않도록 0.4초 멈추면 한 번만 찍는다.
const hist = [];
let hi = -1;
let snapTimer;
function snap(now = false) {
  clearTimeout(snapTimer);
  const run = () => {
    const d = JSON.stringify(deck);
    if (hist[hi] && d === hist[hi].d) { hist[hi].sel = sel; return; } // 선택만 바뀐 건 기록하지 않는다
    hist.length = hi + 1;
    hist.push({ d, sel });
    if (hist.length > 30) hist.shift();
    hi = hist.length - 1;
    syncUndo();
  };
  if (now) run(); else snapTimer = setTimeout(run, 400);
}
function syncUndo() {
  $('#btn-undo').disabled = hi <= 0;
  $('#btn-redo').disabled = hi >= hist.length - 1;
}
function goHist(d) {
  snap(true); // 아직 안 찍힌 변경이 있으면 먼저 찍는다
  const n = hi + d;
  if (n < 0 || n >= hist.length) return;
  hi = n;
  deck = JSON.parse(hist[hi].d);
  sel = Math.min(hist[hi].sel, deck.cards.length - 1);
  try { localStorage.setItem(KEY, serialize()); } catch { /* 용량 부족이면 저장만 건너뜀 */ }
  syncSeg();
  renderList();
  select(sel, false);
  syncUndo();
}
$('#btn-undo').onclick = () => goHist(-1);
$('#btn-redo').onclick = () => goHist(1);
document.addEventListener('keydown', (ev) => {
  if (!(ev.metaKey || ev.ctrlKey) || ev.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) && ev.target.type !== 'range') return; // 글상자 안에서는 브라우저 기본 되돌리기
  const k = ev.key.toLowerCase();
  if (k === 'z') { ev.preventDefault(); goHist(ev.shiftKey ? 1 : -1); }
  else if (k === 'y') { ev.preventDefault(); goHist(1); }
});

/* ---------- 렌더 ---------- */
const html = (i) => buildCardHtml(deck, deck.cards[i], i, deck.cards.length);

function renderList() {
  const list = $('#list');
  list.innerHTML = '';
  deck.cards.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'thumb';
    b.setAttribute('aria-label', `${i + 1}번 카드`);
    b.setAttribute('aria-current', String(i === sel));
    b.innerHTML = `<iframe tabindex="-1" title=""></iframe><b>${i + 1}</b>`;
    $('iframe', b).srcdoc = html(i);
    b.onclick = () => select(i);
    list.append(b);
  });
}
function refreshThumb(i) {
  const f = $('#list .thumb:nth-child(' + (i + 1) + ') iframe');
  if (f) f.srcdoc = html(i);
}

function fit() {
  const st = $('.stage');
  const s = Math.max(0.2, Math.min((st.clientWidth - 24) / 1080, (st.clientHeight - 60) / 1350));
  const v = $('#viewport');
  v.style.width = 1080 * s + 'px';
  v.style.height = 1350 * s + 'px';
  $('#preview').style.transform = `scale(${s})`;
  fit.s = s;
  if (typeof updateBox === 'function') updateBox();
}
fit.s = 0.5;

let timer;
function rerender() {
  persist();
  clearTimeout(timer);
  timer = setTimeout(() => {
    $('#preview').srcdoc = html(sel);
    refreshThumb(sel);
  }, 120);
}

function select(i, save = true) {
  if (i !== sel) selKey = null;
  sel = i;
  if (save) persist();
  [...$('#list').children].forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
  $('#preview').srcdoc = html(i);
  renderPanel();
}

/* ---------- 카드 위에서 직접 편집: 선택 · 이동 · 크기 · 회전 ---------- */
// 위치는 CSS `translate`로 옮긴다. char/bubble/chips/image는 각자의 style 문자열에, 나머지는 card.ov에 적는다.
// 크기는 card.sz(글 덩어리는 zoom, 나머지는 scale), 회전은 card.ov[키].r. 모두 1080×1350 카드 밖으로 못 나가게 맞춘다.
const getTr = (s = '') => {
  const m = s.match(/translate:\s*(-?[\d.]+)px\s+(-?[\d.]+)px/);
  return m ? [+m[1], +m[2]] : [0, 0];
};
const setTr = (s = '', x, y) => `${s.replace(/translate:[^;]*;?/g, '').replace(/;?\s*$/, '')};translate:${Math.round(x)}px ${Math.round(y)}px;`.replace(/^;/, '');

const STYLE_FIELD = { char: 'charStyle', bubble: 'bubbleStyle', chips: 'chipsStyle', image: 'imgStyle' };
const ZOOM_KEYS = new Set(['title', 'sub', 'kicker', 'items']);
let selKey = null;
const box = $('#selbox');
const pdoc = () => $('#preview').contentDocument;
const elOf = (k) => (k && pdoc() ? pdoc().querySelector(`[data-el="${k}"]`) : null);

const stOf = (k) => {
  const c = card(), o = c.ov?.[k] || {};
  const [x, y] = STYLE_FIELD[k] ? getTr(c[STYLE_FIELD[k]]) : [o.x || 0, o.y || 0];
  return { x, y, s: c.sz?.[k] || 1, r: o.r || 0 };
};
function saveSt(k, st) {
  const c = card();
  if (STYLE_FIELD[k]) c[STYLE_FIELD[k]] = setTr(c[STYLE_FIELD[k]], st.x, st.y);
  c.ov = { ...(c.ov || {}) };
  c.ov[k] = { ...(c.ov[k] || {}), r: Math.round(st.r * 10) / 10 };
  if (!STYLE_FIELD[k]) { c.ov[k].x = Math.round(st.x); c.ov[k].y = Math.round(st.y); }
  c.sz = { ...(c.sz || {}), [k]: Math.round(st.s * 100) / 100 };
}
// 화면(미리보기)에 바로 반영. 글 덩어리는 zoom 때문에 translate도 같이 커져서 나눠 준다.
function applyLive(k, el, st) {
  const z = ZOOM_KEYS.has(k) ? st.s : 1;
  el.style.translate = `${st.x / z}px ${st.y / z}px`;
  el.style.rotate = st.r + 'deg';
  if (ZOOM_KEYS.has(k)) el.style.zoom = st.s; else el.style.scale = st.s;
  if (k === 'foot') el.style.transformOrigin = 'left bottom';
}
// 카드 밖으로 나간 만큼 안으로 밀어 넣는다
function clampIn(k, el, st) {
  for (let i = 0; i < 2; i++) {
    const r = el.getBoundingClientRect();
    const dx = r.left < 0 ? -r.left : r.right > 1080 ? 1080 - r.right : 0;
    const dy = r.top < 0 ? -r.top : r.bottom > 1350 ? 1350 - r.bottom : 0;
    if (!dx && !dy) return;
    st.x += dx; st.y += dy;
    applyLive(k, el, st);
  }
}
function updateBox() {
  const el = elOf(selKey);
  if (!el) { box.hidden = true; return; }
  const r = el.getBoundingClientRect(), s = fit.s, vp = $('#viewport');
  box.hidden = false;
  Object.assign(box.style, { left: vp.offsetLeft + r.left * s + 'px', top: vp.offsetTop + r.top * s + 'px', width: r.width * s + 'px', height: r.height * s + 'px' });
}
function commit() {
  saveSt(selKey, stOf.live);
  persist();
  refreshThumb(sel);
  renderPanel();
  updateBox();
}

$('#preview').addEventListener('load', () => {
  const doc = pdoc();
  if (!doc) return;
  const stl = doc.createElement('style');
  stl.textContent = '[data-el]{cursor:move}[data-el]:hover{outline:3px dashed rgba(49,130,246,.7);outline-offset:4px}img{-webkit-user-drag:none}body{user-select:none}';
  doc.head.append(stl);
  for (const [k, sl] of Object.entries(EL)) doc.querySelector(sl)?.setAttribute('data-el', k);
  doc.addEventListener('pointerdown', onDown);
  doc.addEventListener('dblclick', (e) => { const el = e.target.closest('[data-el]'); if (el) startEdit(el, el.dataset.el); });
  doc.addEventListener('keydown', (e) => onKey(e, true));
  if (!elOf(selKey)) selKey = null;
  updateBox();
});

function onDown(e) {
  const ae = pdoc().activeElement;
  if (ae?.isContentEditable && !e.target.closest('[contenteditable=true]')) ae.blur(); // 다른 곳을 누르면 글자 편집 끝내기
  const el = e.target.closest('[data-el]');
  if (el?.isContentEditable) return; // 글자 편집 중에는 커서만 옮긴다
  if (!el) { selKey = null; updateBox(); return; }
  e.preventDefault();
  const k = el.dataset.el;
  selKey = k;
  updateBox();
  try { el.setPointerCapture(e.pointerId); } catch {}
  const st = stOf(k), st0 = { ...st }, sx = e.screenX, sy = e.screenY;
  stOf.live = st;
  let moved = false;
  const move = (ev) => {
    const dx = (ev.screenX - sx) / fit.s, dy = (ev.screenY - sy) / fit.s;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    st.x = st0.x + dx; st.y = st0.y + dy;
    applyLive(k, el, st);
    clampIn(k, el, st);
    updateBox();
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    if (moved) commit();
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
}

// 모서리 손잡이 = 크기, 위쪽 동그라미 = 회전 (카드 가운데 기준)
box.addEventListener('pointerdown', (ev) => {
  const h = ev.target.closest('[data-h]');
  const el = elOf(selKey);
  if (!h || !el) return;
  ev.preventDefault();
  try { h.setPointerCapture(ev.pointerId); } catch {}
  const k = selKey, st = stOf(k), st0 = { ...st };
  stOf.live = st;
  const vp = $('#viewport').getBoundingClientRect(), r = el.getBoundingClientRect(), s = fit.s;
  const cx = vp.left + (r.left + r.width / 2) * s, cy = vp.top + (r.top + r.height / 2) * s;
  const d0 = Math.hypot(ev.clientX - cx, ev.clientY - cy) || 1, a0 = Math.atan2(ev.clientY - cy, ev.clientX - cx);
  const rot = h.dataset.h === 'rot';
  const move = (e) => {
    if (rot) {
      let a = st0.r + ((Math.atan2(e.clientY - cy, e.clientX - cx) - a0) * 180) / Math.PI;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      st.r = a;
    } else {
      const prev = st.s;
      st.s = Math.max(0.2, Math.min(4, (st0.s * Math.hypot(e.clientX - cx, e.clientY - cy)) / d0));
      applyLive(k, el, st);
      const b = el.getBoundingClientRect();
      if (b.width > 1080 || b.height > 1350) st.s = prev; // 카드보다 커지지 않게
    }
    applyLive(k, el, st);
    clampIn(k, el, st);
    updateBox();
  };
  const up = () => {
    h.removeEventListener('pointermove', move);
    h.removeEventListener('pointerup', up);
    commit();
  };
  h.addEventListener('pointermove', move);
  h.addEventListener('pointerup', up);
});

/* ---------- 더블클릭으로 글자 바로 고치기 ---------- */
const TEXT_FIELD = { title: 'title', sub: 'sub', kicker: 'kicker', foot: 'foot', bubble: 'bubble', button: 'button', url: 'url' };
// 화면의 글(강조 칠 포함)을 다시 *노랑* ~포인트~ 표기로 되돌린다
function toMarkup(n) {
  let out = '';
  n.childNodes.forEach((c) => {
    if (c.nodeType === 3) out += c.nodeValue;
    else if (c.nodeName === 'BR') out += '\n';
    else if (/^(DIV|P)$/.test(c.nodeName)) out += (out && !out.endsWith('\n') ? '\n' : '') + toMarkup(c);
    else {
      const t = toMarkup(c);
      out += c.classList?.contains('hl') ? `*${t}*` : c.classList?.contains('kw') ? `~${t}~` : t;
    }
  });
  return out;
}
function startEdit(el, k) {
  const f = TEXT_FIELD[k];
  if (!f || el.isContentEditable) return;
  const doc = pdoc(), win = doc.defaultView;
  el.contentEditable = 'true';
  el.style.cssText += ';outline:3px solid #3182f6;outline-offset:4px;cursor:text;';
  el.focus();
  const range = doc.createRange();
  range.selectNodeContents(el);
  const gs = win.getSelection();
  gs.removeAllRanges();
  gs.addRange(range);
  let done = false;
  const finish = (cancel) => {
    if (done) return;
    done = true;
    el.contentEditable = 'false';
    if (!cancel) card()[f] = toMarkup(el).replace(/\n+$/, '');
    rerender();
    renderPanel();
  };
  el.addEventListener('blur', () => finish(false), { once: true });
  el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { finish(true); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) finish(false); else doc.execCommand('insertLineBreak');
    }
  });
  el.addEventListener('paste', (e) => { e.preventDefault(); doc.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
}

/* ---------- 키보드: 방향키 이동 · Delete 지우기 · Esc 선택 해제 ---------- */
function removeEl(k) {
  const c = card();
  if (TEXT_FIELD[k]) c[TEXT_FIELD[k]] = '';
  else if (k === 'char') delete c.char;
  else if (k === 'bubble') delete c.bubble;
  else if (k === 'image') { delete c.image; delete c.imgPos; delete c.images; }
  else if (k === 'chips') c.chips = [];
  else if (k === 'items') { for (const f of ['items', 'steps', 'rows']) if (c[f]) c[f] = []; }
  else if (k === 'brandbox') delete c.brandbox;
  selKey = null;
  rerender();
  renderPanel();
  box.hidden = true;
}
function onKey(e, inFrame) {
  if (!inFrame && (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable)) return;
  if (e.metaKey || e.ctrlKey || e.altKey || !selKey) return;
  const el = elOf(selKey);
  if (!el) return;
  if (e.key === 'Escape') { selKey = null; updateBox(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeEl(selKey); return; }
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!d) return;
  e.preventDefault();
  const n = e.shiftKey ? 10 : 1, st = stOf(selKey);
  stOf.live = st;
  st.x += d[0] * n; st.y += d[1] * n;
  applyLive(selKey, el, st);
  clampIn(selKey, el, st);
  commit();
}
document.addEventListener('keydown', (e) => onKey(e, false));

/* ---------- 편집 패널 ---------- */
const e = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function field(label, key, { area = false, rows } = {}) {
  const v = card()[key] ?? '';
  const tag = area
    ? `<textarea data-k="${key}" ${rows ? `rows="${rows}"` : ''}>${e(v)}</textarea>`
    : `<input data-k="${key}" value="${e(v)}">`;
  return `<label>${label}</label>${tag}`;
}

function listEditor(title, key, cols) {
  const arr = card()[key] || [];
  const items = arr
    .map((it, i) => `<div class="item">
      <button class="x" data-del="${key}:${i}" aria-label="삭제">✕</button>
      ${cols.map((c) => c.check
        ? `<label><input type="checkbox" data-l="${key}:${i}:${c.k}" ${it[c.k] ? 'checked' : ''} style="width:auto"> ${c.ph}</label>`
        : `<input data-l="${key}:${i}:${c.k}" placeholder="${c.ph}" value="${e(it[c.k])}">`).join('')}
    </div>`)
    .join('');
  return `<h3>${title}</h3>${items}<button data-add="${key}">+ 추가</button>`;
}

function imageBox(slots) {
  const c = card();
  const p = c.imgPos || { x: 50, y: 50, zoom: 1 };
  const rng = (name, min, max, step, val) =>
    `<div class="range"><span>${name}</span><input type="range" data-pos="${name}" min="${min}" max="${max}" step="${step}" value="${val}"><span>${val}</span></div>`;
  return `<h3>이미지</h3>
    <div class="imgbox">
      ${c.image ? `<img src="${e(imgUrl(c.image))}" alt="">` : '<img alt="" style="visibility:hidden">'}
      <div><button data-act="img">${c.image ? '이미지 바꾸기' : '이미지 넣기'}</button>
      ${c.image ? '<button data-act="img-del">지우기</button>' : ''}</div>
    </div>
    ${c.image ? rng('x', 0, 100, 1, p.x) + rng('y', 0, 100, 1, p.y) + rng('zoom', 1, 3, 0.05, p.zoom) : ''}
    ${slots.has('media') ? `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-frame ${c.frame === 'phone' ? 'checked' : ''} style="width:auto"> 스마트폰 틀 안에 넣기</label>` : ''}`;
}

const SIZE_ROWS = [
  ['title', '제목', (c) => true, 'title'], ['sub', '설명', (c) => c.sub, 'sub'], ['kicker', '윗줄', (c) => c.kicker, 'kicker'],
  ['foot', '아랫줄', (c) => c.foot, 'foot'], ['bubble', '말풍선', (c) => c.bubble, 'bubble'], ['char', '캐릭터', (c) => c.char, 'char'],
  ['image', '이미지', (c) => c.image, null], ['chips', '칩', (c) => (c.chips || []).length, 'chips'],
  ['items', '목록', (c) => (c.items || c.steps || c.rows || []).length, null],
];
function sizeEditor(c, slots) {
  const rows = SIZE_ROWS.filter(([k, , has, slot]) => has(c) && (slot ? slots.has(slot) : true))
    .map(([k, label]) => {
      const v = Math.round(((c.sz || {})[k] || 1) * 100);
      return `<div class="szrow"><span>${label}</span><input type="number" data-sz="${k}" min="20" max="400" step="5" value="${v}" aria-label="${label} 크기(%)"><span>%</span></div>`;
    }).join('');
  return `<h3>크기 (100% = 원래 크기)</h3>${rows}`;
}
const POS = [['char', 'charStyle', '캐릭터', (c) => c.char], ['bubble', 'bubbleStyle', '말풍선', (c) => c.bubble],
  ['chips', 'chipsStyle', '칩', (c) => (c.chips || []).length], ['image', 'imgStyle', '이미지', (c) => c.image]];
function posEditor(c) {
  const rows = POS.filter(([, , , has]) => has(c)).map(([, f, label]) => {
    const [x, y] = getTr(c[f]);
    return `<div class="pos"><span>${label}</span><input type="number" data-px="${f}:0" value="${x}" aria-label="${label} 가로 이동(px)"><input type="number" data-px="${f}:1" value="${y}" aria-label="${label} 세로 이동(px)"></div>`;
  }).join('');
  return rows ? `<h3>위치 이동 (px · 가로 / 세로)</h3>${rows}` : '';
}

function renderPanel() {
  const c = card();
  const p = $('#panel');
  if (!c) { p.innerHTML = ''; return; }
  const s = slotsOf(deck.style, c.type);
  let h = `<h3>카드 ${sel + 1} / ${deck.cards.length}</h3>
    <div class="toolrow">
      <button data-act="up" ${sel === 0 ? 'disabled' : ''} aria-label="앞으로 옮기기">▲ 앞으로</button>
      <button data-act="down" ${sel === deck.cards.length - 1 ? 'disabled' : ''} aria-label="뒤로 옮기기">▼ 뒤로</button>
      <button data-act="dup">복제</button>
      <button data-act="del" ${deck.cards.length < 2 ? 'disabled' : ''}>삭제</button>
    </div>
    <div class="toolrow"><select id="newtype" aria-label="새 카드 종류">${TYPES[deck.style].map((t) => `<option value="${t}">${TYPE_LABEL[t] || t}</option>`).join('')}</select><button data-act="add">+ 새 카드 추가</button></div>
    <label>종류</label><select data-type>${TYPES[deck.style].map((t) => `<option value="${t}" ${t === c.type ? 'selected' : ''}>${TYPE_LABEL[t] || t}</option>`).join('')}</select>`;
  if (s.has('kicker')) h += field('윗줄(kicker)', 'kicker');
  if (s.has('title')) h += field('제목  (*노랑 강조* ~포인트색~)', 'title', { area: true, rows: 3 });
  if (s.has('sub')) h += field('설명', 'sub', { area: true, rows: 3 });
  if (s.has('num')) h += `<div class="row2"><div>${field('숫자', 'num')}</div><div>${field('단위', 'unit')}</div></div>`;
  if (s.has('foot')) h += field('아랫줄', 'foot', { area: true, rows: 2 });
  if (s.has('button')) h += field('버튼 글자', 'button');
  if (s.has('url')) h += field('주소 글자', 'url');
  if (s.has('char')) {
    h += `<h3>캐릭터</h3><div class="chars">
      <button data-char="" aria-pressed="${!c.char}" title="없음">✕</button>
      ${Array.from({ length: 12 }, (_, i) => `<button data-char="st${i + 1}" aria-pressed="${c.char === 'st' + (i + 1)}"><img src="assets/characters/st${i + 1}.png" alt="캐릭터 ${i + 1}"></button>`).join('')}
    </div>`;
  }
  if (s.has('bubble')) h += field('말풍선', 'bubble', { area: true, rows: 2 });
  if (s.has('shot') || s.has('media')) h += imageBox(s);
  if (s.has('chips')) h += listEditor('칩', 'chips', [{ k: 't', ph: '글자' }, { k: 'y', ph: '노랑색', check: true }]);
  if (s.has('rows')) h += listEditor('비교 줄', 'rows', [{ k: 'no', ph: '❌ 이전' }, { k: 'ok', ph: '✅ 이후' }]);
  if (s.has('items')) h += listEditor('목록', 'items', [{ k: 't', ph: '제목' }, { k: 'd', ph: '설명' }]);
  if (s.has('steps')) h += listEditor('단계', 'steps', [{ k: 't', ph: '제목' }, { k: 'd', ph: '설명' }]);
  if (s.has('brandbox')) {
    const b = c.brandbox || {};
    h += `<h3>브랜드 박스</h3>
      <input data-bb="name" placeholder="이름" value="${e(b.name)}">
      <input data-bb="ko" placeholder="한글 이름" value="${e(b.ko)}" style="margin-top:4px">
      <input data-bb="sub" placeholder="설명" value="${e(b.sub)}" style="margin-top:4px">`;
  }
  h += sizeEditor(c, s) + posEditor(c);
  h += `<h3>초기화</h3><button data-act="reset-pos">위치·크기 초기화</button>`;
  p.innerHTML = h;
}

// 패널 이벤트 (위임) — 글자 입력은 패널을 다시 그리지 않아 커서가 안 튄다
const panel = $('#panel');
panel.addEventListener('input', (ev) => {
  const t = ev.target, c = card();
  if (t.dataset.k) c[t.dataset.k] = t.value;
  else if (t.dataset.l) {
    const [key, i, k] = t.dataset.l.split(':');
    c[key][+i][k] = t.type === 'checkbox' ? t.checked : t.value;
  } else if (t.dataset.bb) {
    c.brandbox = { ...(c.brandbox || {}), [t.dataset.bb]: t.value };
  } else if (t.dataset.pos) {
    c.imgPos = { x: 50, y: 50, zoom: 1, ...(c.imgPos || {}), [t.dataset.pos]: +t.value };
    t.nextElementSibling.textContent = t.value;
  } else if (t.dataset.sz) {
    if (!(+t.value >= 20)) return; // 입력 도중(빈칸·너무 작은 값)에는 반영하지 않는다
    c.sz = { ...(c.sz || {}), [t.dataset.sz]: Math.min(4, +t.value / 100) };
  } else if (t.dataset.px) {
    const [f, k] = t.dataset.px.split(':');
    const [x, y] = getTr(c[f]);
    const v = +t.value || 0;
    c[f] = setTr(c[f], k === '0' ? v : x, k === '1' ? v : y);
  } else if (t.hasAttribute('data-frame')) {
    if (t.checked) c.frame = 'phone'; else delete c.frame;
  } else return;
  rerender();
});
panel.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.dataset.type !== undefined && t.tagName === 'SELECT') {
    card().type = t.value;
    rerender();
    select(sel);
  }
});
let imgTarget = null;
panel.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  const c = card();
  if (b.dataset.char !== undefined) {
    if (b.dataset.char) c.char = b.dataset.char; else delete c.char;
    rerender(); renderPanel();
  } else if (b.dataset.add) {
    const key = b.dataset.add;
    c[key] = c[key] || [];
    c[key].push(key === 'chips' ? { t: '' } : key === 'rows' ? { no: '', ok: '' } : { t: '', d: '' });
    rerender(); renderPanel();
  } else if (b.dataset.del) {
    const [key, i] = b.dataset.del.split(':');
    c[key].splice(+i, 1);
    rerender(); renderPanel();
  } else if (b.dataset.act === 'img') {
    imgTarget = sel;
    $('#file-img').click();
  } else if (b.dataset.act === 'img-del') {
    delete c.image; delete c.imgPos;
    rerender(); renderPanel();
  } else if (b.dataset.act === 'reset-pos') {
    for (const f of ['charStyle', 'bubbleStyle', 'chipsStyle', 'imgStyle']) {
      if (c[f]) c[f] = c[f].replace(/translate:[^;]*;?/g, '');
    }
    delete c.sz; delete c.ov;
    rerender(); select(sel);
  } else if (b.dataset.act === 'up' || b.dataset.act === 'down') {
    const j = sel + (b.dataset.act === 'up' ? -1 : 1);
    [deck.cards[sel], deck.cards[j]] = [deck.cards[j], deck.cards[sel]];
    sel = j;
    renderList(); select(sel);
  } else if (b.dataset.act === 'dup') {
    deck.cards.splice(sel + 1, 0, JSON.parse(JSON.stringify(c)));
    renderList(); select(sel + 1);
  } else if (b.dataset.act === 'del') {
    if (!confirm(`${sel + 1}번 카드를 삭제할까요? (되돌리기로 살릴 수 있어요)`)) return;
    deck.cards.splice(sel, 1);
    renderList(); select(Math.min(sel, deck.cards.length - 1));
  } else if (b.dataset.act === 'add') {
    deck.cards.splice(sel + 1, 0, newCard($('#newtype').value));
    renderList(); select(sel + 1);
  }
});

/* ---------- 이미지 불러오기 (크면 줄여서 저장) ---------- */
function readImage(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      if (file.size < 600 * 1024) return res(fr.result);
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1600 / Math.max(im.width, im.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.width * k);
        cv.height = Math.round(im.height * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        res(cv.toDataURL('image/jpeg', 0.9));
      };
      im.onerror = rej;
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
$('#file-img').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f || imgTarget == null) return;
  try {
    const c = deck.cards[imgTarget];
    c.image = await readImage(f);
    c.imgPos = { x: 50, y: 50, zoom: 1 };
    rerender(); renderPanel();
    toast('이미지를 바꿨어요');
  } catch { toast('이미지를 읽지 못했어요'); }
});

/* ---------- 스타일 A/B 전환 ---------- */
const MAP = {
  ab: { cover: 'hook', shot: 'shot', list: 'list', step: 'list', stat: 'intro', cta: 'cta' },
  ba: { hook: 'cover', intro: 'cover', shot: 'shot', compare: 'list', list: 'list', cta: 'cta' },
};
function setStyle(s) {
  if (s === deck.style) return;
  const m = s === 'b' ? MAP.ab : MAP.ba;
  deck.cards.forEach((c) => {
    if (s === 'b' && c.steps && !c.items) c.items = c.steps;
    if (s === 'a' && c.rows && !c.items) c.items = c.rows.map((r) => ({ t: r.ok, d: r.no }));
    c.type = m[c.type] || TYPES[s][0];
  });
  deck.style = s;
  syncSeg();
  renderList();
  select(Math.min(sel, deck.cards.length - 1));
}
function syncSeg() {
  document.querySelectorAll('.seg button[data-style]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === deck.style)));
}
document.querySelectorAll('.seg button[data-style]').forEach((b) => (b.onclick = () => setStyle(b.dataset.style)));

/* ---------- 불러오기 / 저장 (deck.json) ---------- */
function setDeck(d, note) {
  deck = d;
  sel = 0;
  syncSeg();
  renderList();
  select(0);
  if (note) toast(note);
}
$('#btn-sample').onclick = async () => {
  if (deck.cards.length && !confirm('지금 작업 중인 내용이 샘플로 바뀌어요. 계속할까요?')) return;
  setDeck(await (await fetch('samples/deck.json')).json(), '샘플을 불러왔어요');
};
$('#btn-import').onclick = () => $('#file-deck').click();
$('#file-deck').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.cards)) throw 0;
    d.style = d.style === 'a' ? 'a' : 'b';
    const srcs = d.cards.flatMap((c) => [c?.image, ...(c?.images || []).map((im) => im?.src)]).filter(Boolean);
    const missing = srcs.filter((s) => !/^(data:|blob:|https?:)/.test(s)).length;
    if (missing) {
      const how = 'showDirectoryPicker' in window ? "'폴더 열기'" : "Chrome이나 Edge에서 '폴더 열기'";
      setDeck(d);
      toast(`deck.json을 불러왔어요. 이미지 ${missing}장은 파일에 없어서 안 보여요. 이미지가 있는 폴더는 ${how}로 열어 주세요`, 7000);
    } else setDeck(d, 'deck.json을 불러왔어요');
  } catch { toast('deck.json 형식이 아니에요'); }
});
function download(href, name) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}
$('#btn-export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(deck, null, 2)], { type: 'application/json' }));
  download(url, 'deck.json');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('deck.json을 저장했어요 (이미지는 파일 안에 포함돼요)');
};

/* ---------- 폴더 열기 / 폴더에 저장 (Chrome·Edge) ---------- */
// 고른 폴더(예: docs/app-intro/앱이름/)의 deck.json과 이미지를 읽고, 저장하면 같은 폴더에 deck.json과 out/ PNG를 덮어쓴다.
let dirH = null;
const blobs = new Map();
const getFileH = async (dir, path, create = false) => {
  const parts = path.split('/').filter(Boolean);
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
  return d.getFileHandle(parts[parts.length - 1], { create });
};
const writeFileH = async (dir, path, data) => {
  const w = await (await getFileH(dir, path, true)).createWritable();
  await w.write(data);
  await w.close();
};
const imagePaths = (d) => d.cards.flatMap((c) => [c.image, ...(c.images || []).map((i) => i.src)]).filter((s) => s && !/^(data:|blob:|https?:)/.test(s));
if ('showDirectoryPicker' in window) $('#btn-folder').hidden = false;

$('#btn-folder').onclick = async () => {
  try {
    const dir = await showDirectoryPicker({ mode: 'readwrite' });
    let d;
    try { d = JSON.parse(await (await (await dir.getFileHandle('deck.json')).getFile()).text()); } catch { toast('이 폴더에 deck.json이 없어요'); return; }
    if (!Array.isArray(d.cards)) { toast('deck.json 형식이 아니에요'); return; }
    d.style = d.style === 'a' ? 'a' : 'b';
    blobs.forEach((u) => URL.revokeObjectURL(u));
    blobs.clear();
    for (const p of imagePaths(d)) {
      try { blobs.set(p, URL.createObjectURL(await (await getFileH(dir, p)).getFile())); } catch { /* 없는 이미지는 건너뜀 */ }
    }
    dirH = dir;
    setImageResolver((p) => blobs.get(p));
    $('#btn-fsave').hidden = false;
    $('#btn-fsave').disabled = false;
    setDeck(d, `폴더를 열었어요: ${dir.name}`);
  } catch (err) {
    if (err?.name !== 'AbortError') toast('폴더를 열지 못했어요');
  }
};

$('#btn-fsave').onclick = async () => {
  if (!dirH) return;
  try {
    // 새로 넣은 이미지(data:)는 폴더의 screenshots/uploads/ 파일로 빼고 경로로 바꾼다
    let n = 0;
    const toFile = async (holder, key) => {
      const u = holder[key];
      if (!/^data:/.test(u)) return;
      const blob = await (await fetch(u)).blob();
      const name = `screenshots/uploads/img-${Date.now()}-${++n}.${blob.type === 'image/png' ? 'png' : 'jpg'}`;
      await writeFileH(dirH, name, blob);
      blobs.set(name, URL.createObjectURL(blob));
      holder[key] = name;
    };
    for (const c of deck.cards) {
      await toFile(c, 'image');
      for (const im of c.images || []) await toFile(im, 'src');
    }
    persist();
    try { await writeFileH(dirH, 'deck.json.bak', await (await (await getFileH(dirH, 'deck.json')).getFile()).text()); } catch { /* 첫 저장이면 백업 없음 */ }
    await writeFileH(dirH, 'deck.json', JSON.stringify(deck, null, 2));
    for (let i = 0; i < deck.cards.length; i++) {
      toast(`폴더에 저장 중… ${i + 1}/${deck.cards.length}`);
      await writeFileH(dirH, `out/${pad(i + 1)}-${deck.cards[i].type}.png`, await (await fetch(await cardToPng(i))).blob());
    }
    toast(`${dirH.name} 폴더에 deck.json과 out/ PNG를 저장했어요`);
  } catch (err) {
    toast(err?.message?.includes('로드 실패') ? err.message : '폴더에 저장하지 못했어요');
  }
};

/* ---------- PNG 저장 ---------- */
// 화면 밖에 1080×1350 크기의 iframe을 만들고, 그 안에서 html-to-image로 사진을 찍는다.
async function cardToPng(i) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;left:-9999px;top:0;width:1080px;height:1350px;border:0';
  f.srcdoc = html(i);
  document.body.append(f);
  try {
    await new Promise((r) => (f.onload = r));
    const d = f.contentDocument;
    await new Promise((res, rej) => {
      const s = d.createElement('script');
      s.src = H2I;
      s.onload = res;
      s.onerror = () => rej(new Error('html-to-image 로드 실패 (인터넷 연결 확인)'));
      d.head.append(s);
    });
    await Promise.all([...d.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
    await d.fonts.ready;
    return await f.contentWindow.htmlToImage.toPng(d.documentElement, { width: 1080, height: 1350, pixelRatio: 1, cacheBust: false });
  } finally {
    f.remove();
  }
}
const pad = (n) => String(n).padStart(2, '0');
async function savePng(indices) {
  try {
    for (const i of indices) {
      toast(`PNG 만드는 중… ${i + 1}/${deck.cards.length}`);
      download(await cardToPng(i), `card-${pad(i + 1)}-${deck.cards[i].type}.png`);
      await new Promise((r) => setTimeout(r, 250));
    }
    toast('PNG 저장 완료');
  } catch (err) { toast('PNG 저장 실패: ' + err.message); console.error(err); }
}
$('#btn-png').onclick = () => savePng([sel]);
$('#btn-all').onclick = () => savePng(deck.cards.map((_, i) => i));

// 개발·점검용: 콘솔에서 window.__cne.png(0) 로 데이터 주소를 바로 받아볼 수 있다
window.__cne = { png: cardToPng, hist, get hi() { return hi; }, get deck() { return deck; } };

/* ---------- 새 카드 / 새 덱 ---------- */
function newCard(type) {
  const c = { type, title: '제목을 입력하세요' };
  if (['hook', 'cover', 'cta', 'shot', 'intro'].includes(type)) c.sub = '설명을 입력하세요';
  if (type === 'list' || type === 'step') (type === 'step' ? (c.steps = []) : (c.items = [])).push({ t: '첫 번째', d: '설명' }, { t: '두 번째', d: '설명' });
  if (type === 'compare') c.rows = [{ no: '이전', ok: '이후' }];
  if (type === 'stat') { c.num = '100'; c.unit = '%'; }
  if (type === 'cta') c.button = '지금 써보기';
  return c;
}
$('#btn-new').onclick = () => {
  if (!confirm('새 덱을 시작할까요? 지금 내용은 되돌리기로 살릴 수 있어요.')) return;
  deck = { style: deck.style, brand: deck.brand || 'AKLABS', cards: [newCard(TYPES[deck.style][0])] };
  sel = 0;
  renderList(); select(0);
};

/* ---------- zip 저장 ---------- */
const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('도구를 불러오지 못했어요 (인터넷 연결 확인)'));
    document.head.append(s);
  });
}
$('#btn-zip').onclick = async () => {
  try {
    if (!window.JSZip) await loadScript(JSZIP);
    const zip = new window.JSZip();
    for (let i = 0; i < deck.cards.length; i++) {
      toast(`PNG 만드는 중… ${i + 1}/${deck.cards.length}`);
      zip.file(`card-${pad(i + 1)}-${deck.cards[i].type}.png`, (await cardToPng(i)).split(',')[1], { base64: true });
    }
    zip.file('deck.json', JSON.stringify(deck, null, 2));
    const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
    download(url, 'card-news.zip');
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('zip 저장 완료 (deck.json도 함께 들어 있어요)');
  } catch (err) { toast('zip 저장 실패: ' + err.message); console.error(err); }
};

/* ---------- 시작 ---------- */
(async function init() {
  await loadAssets();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* 저장본이 깨졌으면 샘플로 시작 */ }
  if (saved?.deck?.cards?.length) { deck = saved.deck; sel = Math.min(saved.sel || 0, deck.cards.length - 1); }
  else deck = await (await fetch('samples/deck.json')).json();
  deck.style = deck.style === 'a' ? 'a' : 'b';
  syncSeg();
  fit();
  new ResizeObserver(fit).observe($('.stage'));
  renderList();
  select(sel, false);
  snap(true);
})();

/* ---------- 상단 메뉴 닫기 ---------- */
const menus = [...document.querySelectorAll('.bar .menu')];
const closeMenus = (except) => menus.forEach((m) => { if (m !== except) m.open = false; });
menus.forEach((m) => m.addEventListener('toggle', () => { if (m.open) closeMenus(m); }));
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.menu')) closeMenus(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
menus.forEach((m) => m.querySelector('.pop').addEventListener('click', (e) => { if (e.target.closest('button')) m.open = false; }));
