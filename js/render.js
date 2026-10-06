// 카드 한 장의 HTML을 만든다. 렌더러(~/.claude/skills/cardnews/scripts/render.mjs)와 같은 템플릿·CSS를 쓰고,
// 브라우저에서 돌도록 파일 읽기만 fetch로 바꿨다.
const ABS = (p) => new URL(p, document.baseURI).href;

export const TYPES = {
  a: ['cover', 'shot', 'list', 'step', 'stat', 'cta'],
  b: ['hook', 'intro', 'shot', 'compare', 'list', 'cta'],
};
export const TYPE_LABEL = {
  cover: '표지', shot: '화면 캡처', list: '목록', step: '단계', stat: '숫자', cta: '마지막(CTA)',
  hook: '훅', intro: '앱 소개', compare: '비교(❌→✅)',
};

/** 크기 조절 대상: 키 → [CSS 선택자, 방식] */
const SZ = {
  title: ['h1', 'zoom'], sub: ['.lead', 'zoom'], kicker: ['.kicker', 'zoom'], items: ['.items,.rows,.steps', 'zoom'],
  foot: ['.foot', 'scale'], bubble: ['.bubble', 'scale'], chips: ['.chips', 'scale'], char: ['.char', 'scale'],
  image: ['.shot,.phone,.frame,.stack', 'scale'],
};

/** 카드 위에서 직접 고를 수 있는 요소: 키 → CSS 선택자 (첫 번째로 맞는 요소가 대상) */
export const EL = {
  title: 'h1', sub: '.lead', kicker: '.kicker', foot: '.foot', bubble: '.bubble', char: '.char',
  image: '.phone,.frame,.stack,.shot', chips: '.chips', items: '.items,.rows,.steps',
  button: '.btn', url: '.url', brandbox: '.brandbox',
};
const OV_SEL = { image: '.phone,.stack,.shot,.frame:not(.stack .frame)' };
const STYLE_POS = new Set(['char', 'bubble', 'chips', 'image']); // 위치는 각자의 style 문자열(charStyle 등)에 있다
const ZOOM_KEYS = new Set(['title', 'sub', 'kicker', 'items']);

const tpl = {}; // 'a/cover' -> html
const css = { a: '', b: '' };

export async function loadAssets() {
  const kinds = { a: 'templates', b: 'templates-b' };
  const jobs = [];
  for (const s of ['a', 'b']) {
    jobs.push(fetch(`assets/${s === 'b' ? 'base-b' : 'base'}.css`).then((r) => r.text()).then((t) => (css[s] = t)));
    for (const t of TYPES[s]) jobs.push(fetch(`assets/${kinds[s]}/${t}.html`).then((r) => r.text()).then((h) => (tpl[`${s}/${t}`] = h)));
  }
  await Promise.all(jobs);
}

/** 이 카드 종류가 쓰는 칸 이름들 (편집 패널에 어떤 입력을 보일지 정할 때 쓴다) */
export function slotsOf(style, type) {
  const h = tpl[`${style}/${type}`] || '';
  return new Set([...h.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (s) => esc(s).replace(/\*(.+?)\*/g, '<span class="hl">$1</span>').replace(/~(.+?)~/g, '<span class="kw">$1</span>').replace(/\n/g, '<br>');
const st = (v) => (v ? ` style="${esc(v)}"` : '');

/** 이미지 주소: 업로드한 이미지(data:)는 그대로, 샘플의 상대경로는 samples/ 기준 */
let resolver = null; // 폴더 열기로 불러온 이미지: 경로 → blob 주소
export const setImageResolver = (f) => { resolver = f; };
export function imgUrl(src, base = 'samples/') {
  if (!src) return '';
  const r = resolver?.(src);
  if (r) return r;
  return /^(data:|blob:|https?:)/.test(src) ? src : ABS(base + src);
}

/** 이미지 위치·확대 → CSS. pos = {x:0~100, y:0~100, zoom:1~3} */
export function posStyle(pos, fallback = '') {
  if (!pos) return fallback;
  const { x = 50, y = 50, zoom = 1 } = pos;
  return `object-fit:cover;object-position:${x}% ${y}%;transform:scale(${zoom});transform-origin:${x}% ${y}%;`;
}

function mediaB(card) {
  let media = '';
  if (card.image) {
    const cls = card.frame === 'phone' ? 'phone' : 'frame';
    media = `<div class="${cls}"${st(card.imgStyle)}><img src="${imgUrl(card.image)}"${st(posStyle(card.imgPos, card.imgFit))}></div>`;
  }
  if (card.images) {
    media = `<div class="stack"${st(card.imgStyle)}>${card.images
      .map((im) => `<div class="frame"><img src="${imgUrl(im.src)}"${st(posStyle(im.pos))}><span class="tag">${fmt(im.label)}</span></div>`)
      .join('')}</div>`;
  }
  return media;
}

function slotsB(card, type) {
  const tone = card.tone || (type === 'hook' ? 'dark' : type === 'cta' ? 'blue' : 'light');
  let deco = '';
  if (card.deco === 'piano') {
    const bars = Array.from({ length: 40 }, (_, i) => {
      const h = Math.round(40 + Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21)) * 190);
      return `<div class="${i % 7 === 3 ? 'y' : ''}" style="height:${h}px"></div>`;
    }).join('');
    const n = 15, W = 1080 / n;
    const white = Array.from({ length: n }, (_, i) => `<div class="w" style="left:${(i * W).toFixed(1)}px;width:${(W - 2).toFixed(1)}px"></div>`).join('');
    const black = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12].map((i) => `<div class="b" style="left:${((i + 1) * W - 24).toFixed(1)}px"></div>`).join('');
    deco = `<div class="wave">${bars}</div><div class="keys">${white}${black}</div>`;
  }
  const bb = card.brandbox;
  return {
    tone,
    kicker: fmt(card.kicker),
    deco,
    char: card.char ? `<img class="char" src="${ABS(`assets/characters/${card.char}.png`)}"${st(card.charStyle)}>` : '',
    bubble: card.bubble ? `<div class="bubble"${st(card.bubbleStyle)}>${fmt(card.bubble)}</div>` : '',
    media: mediaB(card),
    chips: (card.chips || []).length ? `<div class="chips"${st(card.chipsStyle)}>${card.chips.map((c) => `<div class="chip${c.y ? ' y' : ''}">${fmt(c.t)}</div>`).join('')}</div>` : '',
    rows: (card.rows || []).map((r) => `<div class="row"><div class="no"><span class="ic">❌</span>${fmt(r.no)}</div><div class="ok"><span class="ic">✅</span>${fmt(r.ok)}</div></div>`).join(''),
    items: (card.items || []).map((it, k) => `<div class="item"><div class="ic">${esc(it.i || k + 1)}</div><div><div class="t">${fmt(it.t)}</div>${it.d ? `<div class="d">${fmt(it.d)}</div>` : ''}</div></div>`).join(''),
    brandbox: bb ? `<div class="brandbox"><div class="n">${esc(bb.name)} <small>${esc(bb.ko || '')}</small></div><div class="s">${esc(bb.sub || '')}</div></div>` : '',
  };
}

/** 카드 한 장 → 완성된 HTML 문서 문자열 (iframe srcdoc에 넣는다) */
export function buildCardHtml(deck, card, i, total) {
  const s = deck.style === 'b' ? 'b' : 'a';
  const type = card.type;
  let html = tpl[`${s}/${type}`];
  if (!html) return `<body style="font:40px sans-serif;padding:80px">알 수 없는 카드 종류: ${esc(type)}</body>`;
  const slots = {
    css: '',
    brand: esc(deck.brand || ''),
    page: `${i + 1}/${total}`,
    title: fmt(card.title),
    sub: fmt(card.sub),
    foot: fmt(card.foot),
    num: esc(card.num),
    unit: esc(card.unit),
    button: esc(card.button),
    url: fmt(card.url),
    items: (card.items || []).map((it, k) => `<div class="item"><div class="n">${k + 1}</div><div><div class="t">${fmt(it.t)}</div>${it.d ? `<div class="d">${fmt(it.d)}</div>` : ''}</div></div>`).join(''),
    steps: (card.steps || []).map((it, k) => `<div class="step"><div class="n">${k + 1}</div><div><div class="t">${fmt(it.t)}</div>${it.d ? `<div class="d">${fmt(it.d)}</div>` : ''}</div></div>`).join(''),
    shot: card.image
      ? `<div class="shot"><img src="${imgUrl(card.image)}"${st(posStyle(card.imgPos))}></div>`
      : '<div class="shot empty">스크린샷 자리</div>',
  };
  if (s === 'b') Object.assign(slots, slotsB(card, type));
  html = html.replace(/\{\{(\w+)\}\}/g, (_, k) => slots[k] ?? '');
  // CSS는 <link> 대신 <style>로 넣는다 (srcdoc 안에서도, 이미지로 저장할 때도 안전)
  html = html.replace(/<link rel="stylesheet" href="[^"]*">/, `<style>${css[s]}</style>`);
  // 요소별 크기: 글 덩어리는 zoom(주변 배치도 같이 밀림), 위치가 정해진 것들은 scale(제자리에서 커짐)
  const sz = Object.entries(card.sz || {})
    .filter(([k, v]) => SZ[k] && v && v !== 1)
    .map(([k, v]) => {
      const [sel, mode] = SZ[k];
      return mode === 'zoom' ? `${sel}{zoom:${v}}` : `${sel}{scale:${v}${k === 'foot' ? ';transform-origin:left bottom' : ''}}`;
    }).join('');
  if (sz) html = html.replace('</head>', `<style>${sz}</style></head>`);
  // 직접 옮기기·돌리기 값(card.ov): 글 덩어리는 zoom 때문에 이동값이 같이 커지므로 나눠 준다
  const ov = Object.entries(card.ov || {})
    .filter(([k]) => EL[k])
    .map(([k, o]) => {
      const z = ZOOM_KEYS.has(k) ? (card.sz?.[k] || 1) : 1;
      const d = [];
      if (!STYLE_POS.has(k) && (o.x || o.y)) d.push(`translate:${(o.x || 0) / z}px ${(o.y || 0) / z}px`);
      if (o.r) d.push(`rotate:${o.r}deg`);
      if (k === 'foot' && (d.length || card.sz?.foot)) d.push('transform-origin:left bottom');
      return d.length ? `${OV_SEL[k] || EL[k]}{${d.join(';')}}` : '';
    }).join('');
  if (ov) html = html.replace('</head>', `<style>${ov}</style></head>`);
  if (deck.theme) html = html.replace('</head>', `<style>:root{${Object.entries(deck.theme).map(([k, v]) => `--${k}:${v}`).join(';')}}</style></head>`);
  return html;
}
