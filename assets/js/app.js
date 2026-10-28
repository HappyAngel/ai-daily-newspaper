// AIGC START
'use strict';

/* ============================================================
   小熊早报 · 前端主逻辑
   数据流：data/editions/index.json（期数清单，新→旧）
        → data/editions/YYYY-MM-DD.json（单期内容）
   页面固定单页：最新一期默认展示，归档面板可回看历史。
   ============================================================ */

/* ---------------- 基础工具 ---------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/** 双语字段解析：字符串原样返回；{zh, en} 对象按当前语言取值并回退 */
const L = (v, lang = state.lang) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v[lang] || v.zh || v.en || '';
  return String(v);
};

const t = (key) => {
  const dict = window.XZB_I18N[state.lang] || {};
  return dict[key] ?? window.XZB_I18N.zh[key] ?? key;
};

const localeOf = () => (state.lang === 'zh' ? 'zh-CN' : 'en-US');
const fmtDate = (iso, options) =>
  new Intl.DateTimeFormat(localeOf(), options).format(new Date(`${iso}T00:00:00`));

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const hrefAttr = (url) => ` href="${esc(url)}" target="_blank" rel="noopener"`;

/* ---------------- 内联图标（stroke 风格） ---------------- */

const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const svg = (inner, vb = '0 0 24 24') => `<svg viewBox="${vb}" ${S} aria-hidden="true">${inner}</svg>`;

const ICONS = {
  cpu: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>'),
  layers: svg('<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 12l10 5 10-5"/><path d="M2 17l10 5 10-5"/>'),
  chart: svg('<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>'),
  check: svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  left: svg('<polyline points="15 18 9 12 15 6"/>'),
  right: svg('<polyline points="9 18 15 12 9 6"/>'),
  ext: svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
};

const WEATHER_ICONS = {
  sunny: svg('<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>'),
  'sun-cloud': svg('<circle cx="16" cy="8" r="3.2"/><path d="M16 1.8v1.6M21.6 4.4l-1.1 1.1M23.6 8h-1.6M12.4 4.4l1.1 1.1"/><path d="M12.5 21H6.4a4.2 4.2 0 1 1 .8-8.3A5.6 5.6 0 0 1 17.8 13.3 4 4 0 0 1 12.5 21z"/>'),
  cloudy: svg('<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>'),
  rain: svg('<path d="M16 13a5 5 0 0 0-9.6-1.5A4 4 0 0 0 6 19h11a3.5 3.5 0 0 0 0-7z"/><path d="M8 19v2M12 19v3M16 19v2"/>'),
  snow: svg('<path d="M16 13a5 5 0 0 0-9.6-1.5A4 4 0 0 0 6 19h11a3.5 3.5 0 0 0 0-7z"/><path d="M8 21h.01M12 22h.01M16 21h.01"/>'),
};

/* ---------------- 全局状态 ---------------- */

const state = {
  lang: localStorage.getItem('xzb-lang') ||
    ((navigator.language || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh'),
  dates: [],       // 可用期数：由新到旧
  current: null,   // 当前展示的日期字符串
  edition: null,   // 当前期数 JSON
  galleries: {},   // gid -> [{src, caption}]，同一条目内的图片归为一组供灯箱轮播
};

let gidSeq = 0;

document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';

/* ---------------- 灯箱 ---------------- */

const lb = { gid: null, index: 0 };

function addGallery(images) {
  const gid = `g${++gidSeq}`;
  state.galleries[gid] = images;
  return gid;
}

function thumbsHtml(gid, images) {
  return `<div class="thumbs">${images.map((im, i) =>
    `<img class="thumb" data-gid="${gid}" data-i="${i}" src="${esc(im.src)}" alt="${esc(L(im.caption))}" loading="lazy">`
  ).join('')}</div>`;
}

function openLightbox(gid, index) {
  lb.gid = gid;
  lb.index = index;
  renderLightbox();
  $('#lightbox').hidden = false;
  document.body.style.overflow = 'hidden';
}

function lbStep(delta) {
  const g = state.galleries[lb.gid];
  if (!g || g.length < 2) return;
  lb.index = (lb.index + delta + g.length) % g.length;
  renderLightbox();
}

function renderLightbox() {
  const g = state.galleries[lb.gid] || [];
  const im = g[lb.index] || {};
  const stage = $('#lb-stage');
  $('#lb-img').src = im.src || '';
  $('#lb-img').alt = L(im.caption);
  $('#lb-caption').textContent = L(im.caption);
  $('#lb-count').textContent = t('lbImageOf').replace('{i}', lb.index + 1).replace('{n}', g.length);
  $('#lb-prev').hidden = g.length < 2;
  $('#lb-next').hidden = g.length < 2;
  stage.classList.remove('lb-stage');
  void stage.offsetWidth;
  stage.classList.add('lb-stage');
}

function closeLightbox() {
  $('#lightbox').hidden = true;
  document.body.style.overflow = '';
}

/* ---------------- 归档面板 ---------------- */

let archiveOpen = false;

function toggleArchive(open) {
  archiveOpen = open ?? !archiveOpen;
  $('#archive-panel').classList.toggle('open', archiveOpen);
  $('#archive-backdrop').classList.toggle('open', archiveOpen);
}

function renderArchivePanel() {
  const list = $('#archive-list');
  list.innerHTML = state.dates.map((d, idx) => {
    const no = state.dates.length - idx;
    return `<button class="archive-item${d === state.current ? ' active' : ''}" data-date="${d}">
      <div>
        <div class="archive-date">${esc(fmtDate(d, { year: 'numeric', month: 'long', day: 'numeric' }))}</div>
        <div class="archive-sub">${esc(t('editionNo').replace('{n}', no))} · ${esc(fmtDate(d, { weekday: 'long' }))}</div>
      </div>
    </button>`;
  }).join('') || `<p class="archive-empty">${esc(t('archiveEmpty'))}</p>`;
}

/* ---------------- 渲染：静态文案 ---------------- */

function renderStatic() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  $('#brand-tagline').textContent = t('tagline');
  $('#btn-archive').querySelector('span').textContent = t('archiveBtn');
  $('#archive-title').textContent = t('archiveTitle');
  $('#archive-backdrop').setAttribute('aria-label', t('archiveBtn'));
  $$('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === state.lang));
  $('#footer-note').textContent = t('footerNote');
  $('#footer-powered').textContent = t('footerPowered');
  $('#footer-link span').textContent = t('viewGithub');
  $('#lb-close').setAttribute('aria-label', t('lbClose'));
  $('#lb-prev').setAttribute('aria-label', t('lbPrev'));
  $('#lb-next').setAttribute('aria-label', t('lbNext'));
  if (state.edition) renderMetaBar();
}

/* ---------------- 渲染：期数信息条 ---------------- */

function renderMetaBar() {
  const idx = state.dates.indexOf(state.current);
  const older = idx > -1 && idx < state.dates.length - 1 ? state.dates[idx + 1] : null;
  const newer = idx > 0 ? state.dates[idx - 1] : null;
  const no = state.dates.length - idx;

  $('#meta-bar').innerHTML = `
    <button class="nav-btn" id="btn-prev-day" title="${esc(fmtDate(older || state.current, { month: 'short', day: 'numeric' }))}" aria-label="${esc(t('prevDay'))}" ${older ? '' : 'disabled'}>${ICONS.left}</button>
    <span class="meta-date">${esc(fmtDate(state.current, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }))}</span>
    <span class="meta-no">${esc(t('editionNo').replace('{n}', no))}</span>
    ${state.edition.sample ? `<span class="badge-sample">${esc(t('sampleBadge'))}</span>` : ''}
    <span class="meta-spacer"></span>
    <button class="nav-btn" id="btn-next-day" title="${esc(fmtDate(newer || state.current, { month: 'short', day: 'numeric' }))}" aria-label="${esc(t('nextDay'))}" ${newer ? '' : 'disabled'}>${ICONS.right}</button>`;

  $('#btn-prev-day').addEventListener('click', () => older && showEdition(older));
  $('#btn-next-day').addEventListener('click', () => newer && showEdition(newer));
}

/* ---------------- 渲染：单期内容 ---------------- */

function sectionHead(icon, title, sub, tone = 'warm') {
  return `<div class="section-head">
    <span class="section-icon${tone === 'cool' ? ' cool' : ''}">${icon}</span>
    <div><h2>${esc(title)}</h2><p class="section-sub">${esc(sub)}</p></div>
  </div>`;
}

function sectionWeather(w, openingText) {
  const labels = {
    feels: t('weatherFeels'),
    wind: t('weatherWind'),
    humidity: t('weatherHumidity'),
    air: t('weatherAir'),
    sunrise: t('weatherSunrise'),
    sunset: t('weatherSunset'),
  };
  const stats = [
    [labels.feels, w.feels], [labels.wind, L(w.wind)], [labels.humidity, w.humidity],
    [labels.air, L(w.air)], [labels.sunrise, w.sunrise], [labels.sunset, w.sunset],
  ].filter(([, v]) => v);
  return `
  <section class="section" id="sec-weather">
    ${sectionHead(WEATHER_ICONS[w.icon] || WEATHER_ICONS['sun-cloud'], t('sectionWeather'), t('sectionWeatherSub'))}
    <div class="grid">
      <div class="card span-4">
        <div class="weather-top">
          <div>
            <div class="weather-city">${esc(L(w.city))}</div>
            <div class="weather-cond">${esc(L(w.condition))}</div>
            <div class="weather-temp">${esc(w.temp)}</div>
          </div>
          <div class="weather-icon">${WEATHER_ICONS[w.icon] || WEATHER_ICONS['sun-cloud']}</div>
        </div>
        <div class="weather-stats">
          ${stats.map(([k, v]) => `<div class="wstat"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join('')}
        </div>
        <div class="weather-tip">${esc(L(w.tip))}</div>
      </div>
      <div class="card span-8 opening">
        <div class="opening-label">${ICONS.info}<span>${esc(t('openingLabel'))}</span></div>
        ${String(openingText || '').split('\n').filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('')}
      </div>
    </div>
  </section>`;
}

function sectionAiTech(tech) {
  const xPosts = tech.xPosts || [];
  const blogs = tech.engBlogs || [];
  const alpha = tech.alphaxivTop3 || [];
  const weekly = tech.weeklyTrend;

  const avatarGrads = [
    'linear-gradient(135deg,#ffb454,#ff7b54)',
    'linear-gradient(135deg,#38c9e5,#8b7cf6)',
    'linear-gradient(135deg,#3ddc97,#38c9e5)',
    'linear-gradient(135deg,#ff8a8a,#ffb454)',
  ];

  const postsHtml = xPosts.map((p, i) => {
    const g = p.images && p.images.length ? addGallery(p.images) : null;
    return `
    <article class="xpost">
      <div class="xpost-avatar" style="background:${avatarGrads[i % avatarGrads.length]}">${esc((L(p.author) || '?').trim().charAt(0))}</div>
      <div class="xpost-body">
        <div class="xpost-row">
          <span class="xpost-name">${esc(L(p.author))}</span>
          <span class="xpost-handle">${esc(L(p.handle))}</span>
          ${p.time ? `<span class="xpost-time">${esc(p.time)}</span>` : ''}
        </div>
        <p class="xpost-summary">${esc(L(p.summary))}</p>
        ${g ? thumbsHtml(g, p.images) : ''}
        ${p.link ? `<a class="link-row"${hrefAttr(p.link)}>${esc(t('viewPost'))} ${ICONS.ext}</a>` : ''}
      </div>
    </article>`;
  }).join('');

  const blogsHtml = blogs.map((b) => `
    <a class="blog"${hrefAttr(b.link || '#')}>
      <div class="blog-source">${esc(L(b.source))}</div>
      <div class="blog-title">${esc(L(b.title))}</div>
      <div class="blog-summary">${esc(L(b.summary))}</div>
    </a>`).join('');

  const alphaHtml = alpha.map((a) => {
    const g = a.images && a.images.length ? addGallery(a.images) : null;
    return `
    <div class="card alpha-card">
      <div class="alpha-rank">${String(a.rank || 1).padStart(2, '0')}</div>
      ${g ? thumbsHtml(g, a.images) : ''}
      <div class="alpha-title">${esc(L(a.title))}</div>
      <div class="alpha-authors">${esc(L(a.authors))}</div>
      <p class="alpha-summary">${esc(L(a.summary))}</p>
      ${a.link ? `<a class="link-row"${hrefAttr(a.link)}>${esc(t('readOriginal'))} ${ICONS.ext}</a>` : ''}
    </div>`;
  }).join('');

  const weeklyHtml = weekly ? `
    <div class="weekly span-12">
      <span class="weekly-badge">${esc(t('weeklyTrendBadge'))}</span>
      <h3>${esc(L(weekly.title) || t('weeklyTrendTitle'))}</h3>
      <p>${esc(L(weekly.summary))}</p>
      ${(weekly.points || []).length ? `<ul>${weekly.points.map((pt) => `<li><b>${esc(L(pt.label))}</b> — ${esc(L(pt.text))}</li>`).join('')}</ul>` : ''}
    </div>` : '';

  return `
  <section class="section" id="sec-ai-tech">
    ${sectionHead(ICONS.cpu, t('sectionAiTech'), t('sectionAiTechSub'), 'cool')}
    ${weeklyHtml}
    <div class="grid">
      <div class="card span-7">
        <div class="card-title">${esc(t('xPostsTitle'))}<span class="count">· ${xPosts.length}</span></div>
        ${postsHtml}
      </div>
      <div class="card span-5">
        <div class="card-title">${esc(t('blogsTitle'))}<span class="count">· ${blogs.length}</span></div>
        ${blogsHtml}
      </div>
      <div class="span-12">
        <div class="card-title">${esc(t('alphaxivTitle'))}</div>
        <div class="alpha-grid">${alphaHtml}</div>
      </div>
    </div>
  </section>`;
}

function sectionProducts(prods) {
  const dots = ['#ffb454', '#38c9e5', '#8b7cf6', '#3ddc97', '#ff8a8a', '#ff7b54'];
  const items = prods.items || [];
  return `
  <section class="section" id="sec-products">
    ${sectionHead(ICONS.layers, t('sectionProducts'), t('sectionProductsSub'))}
    <div class="products-grid">
      ${items.map((p, i) => `
      <div class="card product">
        <div class="product-top">
          <span class="product-name"><span class="product-dot" style="background:${dots[i % dots.length]}"></span>${esc(L(p.name))}</span>
          <span class="product-tag ${p.tag === 'release' ? 'tag-release' : 'tag-update'}">${esc(t(p.tag === 'release' ? 'tagRelease' : 'tagUpdate'))}</span>
        </div>
        <p class="product-summary">${esc(L(p.summary))}</p>
        ${p.link && p.link !== '#' ? `<a class="product-link"${hrefAttr(p.link)}>${esc(t('readOriginal'))} ${ICONS.ext}</a>` : ''}
      </div>`).join('')}
    </div>
  </section>`;
}

function sparklineSvg(values, w = 660, h = 130) {
  if (!values || values.length < 2) return '';
  const pad = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (w - pad * 2),
    h - pad - ((v - min) / range) * (h - pad * 2),
  ]);
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  d += ` L ${pts[pts.length - 1][0].toFixed(1)} ${pts[pts.length - 1][1].toFixed(1)}`;
  const area = `${d} L ${pts[pts.length - 1][0].toFixed(1)} ${h - pad} L ${pts[0][0].toFixed(1)} ${h - pad} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="sparkline">
    <defs>
      <linearGradient id="spk-line" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#38c9e5"/><stop offset="1" stop-color="#8b7cf6"/>
      </linearGradient>
      <linearGradient id="spk-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="rgba(139,124,246,0.28)"/><stop offset="1" stop-color="rgba(56,201,229,0)"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#spk-area)"/>
    <path d="${d}" fill="none" stroke="url(#spk-line)" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="4" fill="#ffb454"/>
  </svg>`;
}

function sectionFinanceTodos(fin) {
  const s = fin.stock || {};
  const up = (s.changePercent ?? 0) >= 0;
  const stats = [
    [t('statOpen'), s.open], [t('statHigh'), s.high], [t('statLow'), s.low],
    [t('statPrevClose'), s.prevClose], [t('statVolume'), L(s.volume)], [t('statAmount'), L(s.amount)],
  ].filter(([, v]) => v != null && v !== '');
  const arrow = up
    ? '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2l5 8H1z" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10L1 2h10z" fill="currentColor"/></svg>';
  return `
  <section class="section" id="sec-finance-todos">
    <div class="grid">
      <div class="span-7">
        ${sectionHead(ICONS.chart, t('sectionFinance'), t('sectionFinanceSub'))}
        <div class="card">
          <div class="fin-head">
            <span class="fin-name">${esc(L(s.name))}</span>
            <span class="fin-symbol">${esc(s.symbol)}</span>
          </div>
          <div class="fin-price-row">
            <span class="fin-price">${Number(s.price).toFixed(2)}</span>
            <span class="fin-currency">${esc(s.currency)}</span>
            <span class="chip ${up ? 'up' : 'down'}">${arrow}${up ? '+' : ''}${Number(s.change).toFixed(2)} (${up ? '+' : ''}${Number(s.changePercent).toFixed(2)}%)</span>
          </div>
          <div class="fin-stats">
            ${stats.map(([k, v]) => `<div class="wstat"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join('')}
          </div>
          <div class="fin-spark">${sparklineSvg(s.spark)}</div>
          <p class="fin-summary">${esc(L(s.summary))}</p>
          <div class="fin-highlights">
            <ul>${(s.highlights || []).map((h) => `<li>${esc(L(h))}</li>`).join('')}</ul>
          </div>
          <p class="fin-note">${esc(t('financeNote'))}</p>
        </div>
      </div>
      <div class="span-5">
        ${sectionHead(ICONS.check, t('sectionTodos'), t('sectionTodosSub'), 'cool')}
        <div class="card" id="todos-card"></div>
      </div>
    </div>
  </section>`;
}

function renderTodosInto(date) {
  const todos = state.edition.todos || [];
  const saved = JSON.parse(localStorage.getItem(`xzb-todos-${date}`) || '{}');
  const card = $('#todos-card');
  card.innerHTML = `
    <div class="todo-progress"><span>${esc(t('todoProgress').replace('{d}', String(Object.values(saved).filter(Boolean).length)).replace('{t}', String(todos.length)))}</span></div>
    <div class="todo-bar"><div class="todo-bar-fill" style="width:${todos.length ? Math.round(Object.values(saved).filter(Boolean).length / todos.length * 100) : 0}%"></div></div>
    <ul>${todos.map((td, i) => `
      <li class="todo${saved[i] ? ' done' : ''}" data-i="${i}">
        <input type="checkbox" class="todo-check" ${saved[i] ? 'checked' : ''} aria-label="${esc(L(td.text))}">
        <span class="todo-text">${esc(L(td.text))}</span>
        <span class="prio ${td.priority || 'mid'}">${esc(t(`prio${(td.priority || 'mid').replace(/^./, (c) => c.toUpperCase())}`))}</span>
      </li>`).join('')}
    </ul>`;
}

function renderEdition() {
  const e = state.edition;
  renderMetaBar();
  $('#content').innerHTML = [
    e.sample ? `<div class="sample-notice">${ICONS.info}<span>${esc(t('sampleNotice'))}</span></div>` : '',
    sectionWeather(e.weather || {}, L((e.aiTech || {}).openingSummary)),
    sectionAiTech(e.aiTech || {}),
    sectionProducts(e.aiProducts || {}),
    sectionFinanceTodos(e.finance || {}),
  ].join('');
  renderTodosInto(e.date);
  document.title = `${fmtDate(e.date, { month: 'long', day: 'numeric' })} · ${t('brand')}`;
}

/* ---------------- 数据加载 ---------------- */

async function showEdition(date) {
  state.current = date;
  state.edition = await fetchJson(`data/editions/${date}.json`);
  state.galleries = {};
  gidSeq = 0;
  renderEdition();
  renderArchivePanel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  history.replaceState(null, '', `${location.pathname}?date=${date}`);
}

function showError(err) {
  console.error(err);
  $('#content').innerHTML = `<div class="card state-box">
    <h3>${esc(t('errorTitle'))}</h3>
    <p>${esc(t('errorBody'))}</p>
    <p style="margin-top:8px;color:var(--text-faint)">${esc(err.message || '')}</p>
  </div>`;
}

/* ---------------- 事件绑定 ---------------- */

function bindEvents() {
  // 语言切换
  $('#lang-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    state.lang = btn.dataset.lang;
    localStorage.setItem('xzb-lang', state.lang);
    renderStatic();
    if (state.edition) {
      state.galleries = {};
      gidSeq = 0;
      renderEdition();
    }
    renderArchivePanel();
  });

  // 归档面板
  $('#btn-archive').addEventListener('click', () => toggleArchive());
  $('#archive-close').addEventListener('click', () => toggleArchive(false));
  $('#archive-backdrop').addEventListener('click', () => toggleArchive(false));
  $('#archive-list').addEventListener('click', (e) => {
    const item = e.target.closest('.archive-item');
    if (!item) return;
    toggleArchive(false);
    showEdition(item.dataset.date);
  });

  // 内容区：缩略图 → 灯箱；待办勾选
  $('#content').addEventListener('click', (e) => {
    const thumb = e.target.closest('.thumb');
    if (thumb) openLightbox(thumb.dataset.gid, Number(thumb.dataset.i));
  });
  $('#content').addEventListener('change', (e) => {
    const check = e.target.closest('.todo-check');
    if (!check || !state.edition) return;
    const li = check.closest('.todo');
    const i = li.dataset.i;
    const key = `xzb-todos-${state.edition.date}`;
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    saved[i] = check.checked;
    localStorage.setItem(key, JSON.stringify(saved));
    li.classList.toggle('done', check.checked);
    renderTodosInto(state.edition.date);
  });

  // 灯箱
  $('#lb-close').addEventListener('click', closeLightbox);
  $('#lb-prev').addEventListener('click', () => lbStep(-1));
  $('#lb-next').addEventListener('click', () => lbStep(1));
  $('#lightbox .lb-backdrop').addEventListener('click', closeLightbox);

  // 键盘：Esc 关闭 / 左右轮播
  document.addEventListener('keydown', (e) => {
    const lbEl = $('#lightbox');
    if (lbEl && !lbEl.hidden) {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') lbStep(-1);
      if (e.key === 'ArrowRight') lbStep(1);
    } else if (archiveOpen && e.key === 'Escape') {
      toggleArchive(false);
    }
  });
}

/* ---------------- 启动 ---------------- */

async function boot() {
  bindEvents();
  renderStatic();
  try {
    const manifest = await fetchJson('data/editions/index.json');
    state.dates = (manifest.editions || []).slice().sort().reverse();
    if (!state.dates.length) throw new Error('manifest has no editions');
    const param = new URLSearchParams(location.search).get('date');
    const target = state.dates.includes(param) ? param : state.dates[0];
    await showEdition(target);
  } catch (err) {
    showError(err);
  }
}

boot();

// AIGC END
