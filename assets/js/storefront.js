/* storefront.js - Meesho / Flipkart style storefront pieces, all editable from Admin > Storefront.
   Layout data lives in store_settings key "storefront" (public). Images live in the brand-assets bucket. */
(function () {
  const DEFAULTS = {
    hero: { enabled: false, image_path: null, offer_text: 'Upto 35% OFF on your first order', offer_sub: '*Only on App', qr_path: null, qr_caption: 'Scan now to install', headline: 'Smart Shopping', subheadline: 'Trusted by Millions', button_text: 'Shop Now', button_link: '/search' },
    circles: { enabled: true, items: [] },
    banners: [],
    cards: { enabled: false, title: 'Original Brands', view_all: '/search', items: [] },
    marquee: { enabled: true, title: '' },
    menu: { enabled: true },
  };
  const merge = (v) => { v = v && typeof v === 'object' ? v : {}; return { hero: Object.assign({}, DEFAULTS.hero, v.hero), circles: Object.assign({}, DEFAULTS.circles, v.circles, { items: ((v.circles || {}).items) || [] }), banners: Array.isArray(v.banners) ? v.banners : [], cards: Object.assign({}, DEFAULTS.cards, v.cards, { items: ((v.cards || {}).items) || [] }), marquee: Object.assign({}, DEFAULTS.marquee, v.marquee), menu: Object.assign({}, DEFAULTS.menu, v.menu) }; };

  /* A link typed by the admin: "/c/sarees", "/product/abc", a full http link, or a pasted browser address like http://localhost:8090/#/product/abc */
  const lnk = (l) => {
    l = String(l || '').trim(); if (!l) return { href: '#/', ext: false };
    if (l.indexOf('#/') >= 0) l = l.slice(l.indexOf('#') + 1);
    if (/^https?:\/\//i.test(l)) return { href: l, ext: true };
    return { href: '#' + (l[0] === '/' ? l : '/' + l), ext: false };
  };
  const attr = (l) => { const x = lnk(l); return `href="${esc(x.href)}"${x.ext ? ' target="_blank" rel="noopener noreferrer"' : ''}`; };
  const img = (p, alt, cls) => `<img ${cls ? `class="${cls}" ` : ''}loading="lazy" decoding="async" src="${esc(aimg(p))}" alt="${esc(alt || '')}" onerror="this.onerror=null;this.style.visibility='hidden'">`;

  async function load(force) {
    const data = await Data.query('storefront', async () => { const r = await window.sb.from('store_settings').select('value').eq('key', 'storefront').maybeSingle(); if (r.error) throw r.error; return r.data ? r.data.value : null; }, { ttl: CACHE_POLICY.home, force: !!force }).catch(() => null);
    return merge(data);
  }

  /* ---------- top bar with mega menu (desktop) ---------- */
  function catbar(cats) {
    const kids = (id) => cats.filter((c) => c.parent_id === id);
    const top = cats.filter((c) => !c.parent_id);
    return `<nav class="catbar" aria-label="Categories"><div class="catbar-in">${[`<div class="mi"><a href="#/search">All products</a></div>`].concat(top.map((c) => {
      const l2 = kids(c.id);
      const panel = l2.length ? `<div class="mm" role="menu"><div class="mm-in">${l2.map((g) => `<div class="mm-col"><a class="mm-h" href="#/c/${esc(g.slug)}">${esc(g.name)}</a>${kids(g.id).map((x) => `<a href="#/c/${esc(x.slug)}">${esc(x.name)}</a>`).join('')}</div>`).join('')}</div></div>` : '';
      return `<div class="mi ${l2.length ? 'has' : ''}"><a href="#/c/${esc(c.slug)}" ${l2.length ? 'aria-haspopup="true"' : ''}>${esc(c.name)}</a>${panel}</div>`;
    })).join('')}</div></nav>`;
  }

  /* ---------- home blocks ---------- */
  function hero(h) {
    if (!h.enabled) return '';
    const bg = h.image_path ? `style="background-image:url('${esc(aimg(h.image_path))}')"` : '';
    return `<section class="sf-hero ${h.image_path ? '' : 'nobg'}" ${bg} aria-label="Welcome">
      <div class="sf-hero-mid">${h.offer_text ? `<div class="sf-offer">${esc(h.offer_text)}</div>` : ''}${h.offer_sub ? `<div class="sf-offer-sub">${esc(h.offer_sub)}</div>` : ''}${h.qr_path ? `<img class="sf-qr" src="${esc(aimg(h.qr_path))}" alt="QR code to install the app">` : ''}${h.qr_caption ? `<div class="sf-qr-cap">${esc(h.qr_caption)}</div>` : ''}</div>
      <div class="sf-hero-right">${h.headline ? `<h2>${esc(h.headline)}</h2>` : ''}${h.subheadline ? `<p>${esc(h.subheadline)}</p>` : ''}${h.button_text ? `<a class="sf-btn" ${attr(h.button_link)}>${esc(h.button_text)}</a>` : ''}</div></section>`;
  }
  function circles(c, cats) {
    if (!c.enabled) return '';
    let items = (c.items || []).filter((i) => i.image_path || i.label);
    if (!items.length) items = cats.filter((x) => !x.parent_id).map((x) => ({ label: x.name, image_path: x.image_url, link: '/c/' + x.slug }));
    if (!items.length) return '<p class="muted small center">No categories yet - add them in Admin.</p>';
    return `<nav class="sf-circles" aria-label="Shop by category">${items.map((i) => `<a ${attr(i.link)}><span class="arch">${i.image_path ? img(i.image_path, i.label) : `<b>${esc((i.label || '?')[0])}</b>`}</span><span class="lb">${esc(i.label)}</span></a>`).join('')}</nav>`;
  }
  function banner(b) {
    if (!b.image_path) return '';
    return `<div class="sf-banner"><img loading="lazy" decoding="async" src="${esc(aimg(b.image_path))}" alt="${esc(b.title || 'Offer')}">${(b.hotspots || []).map((h) => `<a class="hs" ${attr(h.link)} aria-label="${esc(h.label || 'Open')}" style="left:${+h.x || 0}%;top:${+h.y || 0}%;width:${+h.w || 10}%;height:${+h.h || 10}%"><span>${esc(h.label || '')}</span></a>`).join('')}</div>`;
  }
  const banners = (list, pos) => (list || []).filter((b) => (b.position || 'circles') === pos).map(banner).join('');
  function cards(c) {
    const items = (c.items || []).filter((i) => i.image_path);
    if (!c.enabled || !items.length) return '';
    return `<section class="sec sf-cards"><div class="row between"><h2>${esc(c.title)}</h2>${c.view_all ? `<a class="linkbtn" ${attr(c.view_all)}>VIEW ALL ›</a>` : ''}</div><div class="sf-cardrow">${items.map((i) => `<a class="sf-card" ${attr(i.link)}><span class="im">${img(i.image_path, i.label)}</span><span class="lb">${esc(i.label)}</span></a>`).join('')}</div></section>`;
  }
  async function marquee(m) {
    if (!m.enabled) return '';
    const bs = (await getBrands().catch(() => [])).filter((b) => b.logo_url);
    if (!bs.length) return '';
    let row = bs; while (row.length < 10) row = row.concat(bs);
    const one = row.map((b) => `<a class="lg" href="#/search?brand=${esc(b.id)}" aria-label="${esc(b.name)}"><img loading="lazy" src="${esc(aimg(b.logo_url))}" alt="${esc(b.name)}"></a>`).join('');
    return `<section class="sf-marq" aria-label="Brands">${m.title ? `<h2>${esc(m.title)}</h2>` : ''}<div class="track"><div class="slide">${one}</div><div class="slide" aria-hidden="true">${one}</div></div></section>`;
  }

  /* html pieces for the home page; "after" decides where banners go */
  async function homeTop(cfg, cats) { return hero(cfg.hero) + circles(cfg.circles, cats) + banners(cfg.banners, 'circles') + cards(cfg.cards) + banners(cfg.banners, 'cards') + (await marquee(cfg.marquee)) + banners(cfg.banners, 'marquee'); }

  /* ---------- Categories page (Flipkart style: list on the left, sub categories on the right) ---------- */
  async function categoriesPage(q) {
    const cats = await getCats(); const top = cats.filter((c) => !c.parent_id);
    if (!top.length) return `<div class="page">${empty('No categories yet', 'Add categories in Admin > Categories.')}</div>`;
    const cur = top.find((c) => c.slug === q.c) || top[0];
    const kids = (id) => cats.filter((c) => c.parent_id === id);
    const tile = (c) => `<a class="ct" href="#/c/${esc(c.slug)}"><span class="im">${c.image_url ? img(c.image_url, c.name) : `<b>${esc(c.name[0])}</b>`}</span><span class="lb">${esc(c.name)}</span></a>`;
    const l2 = kids(cur.id);
    const right = l2.length ? l2.map((g) => { const l3 = kids(g.id); return `<h3 class="ch">${esc(g.name)}</h3><div class="cgrid">${(l3.length ? l3 : [g]).map(tile).join('')}</div>`; }).join('') : `<div class="cgrid">${tile(cur)}</div>`;
    return `<div class="page cats-page"><div class="cats-l" role="tablist" aria-label="Main categories">${top.map((c) => `<a role="tab" aria-selected="${c.id === cur.id}" class="${c.id === cur.id ? 'on' : ''}" href="#/categories?c=${esc(c.slug)}"><span class="im">${c.image_url ? img(c.image_url, '') : `<b>${esc(c.name[0])}</b>`}</span><span class="lb">${esc(c.name)}</span></a>`).join('')}</div>
      <div class="cats-r"><div class="row between"><h2>${esc(cur.name)}</h2><a class="linkbtn" href="#/c/${esc(cur.slug)}">View all ›</a></div>${right}</div></div>`;
  }

  window.SF = { DEFAULTS, merge, load, lnk, catbar, homeTop, categoriesPage };
})();
