/* storefront_admin.js - Admin > Storefront: edit the home page (hero + QR, category arches, banners with clickable areas, brand cards).
   Saved into store_settings key "storefront". Images are uploaded to the admin-only brand-assets bucket (folder storefront/). */
(function () {
  if (!window.AdminKit) return;
  const { aroute } = window.AdminKit;
  let ST = null, CATS = [];
  const EXT = { png: 'png', jpg: 'jpg', webp: 'webp' };

  const sniff = async (file) => { const b = new Uint8Array(await file.slice(0, 12).arrayBuffer()), h = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(''); if (h.startsWith('89504e470d0a1a0a')) return 'png'; if (h.startsWith('ffd8ff')) return 'jpg'; if (h.startsWith('52494646') && h.slice(16, 24) === '57454250') return 'webp'; return null; };
  const getp = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), ST);
  const setp = (path, v) => { const ks = path.split('.'), last = ks.pop(); const o = ks.reduce((a, k) => a[k], ST); o[last] = v; };
  const thumb = (p, cls) => (p ? `<img class="${cls || 'sfa-th'}" src="${esc(aimg(p))}" alt="">` : `<span class="${cls || 'sfa-th'} none">No image</span>`);
  const txt = (path, label, ph, extra) => `<label class="f"><span class="h">${label}</span><input data-p="${path}" value="${esc(getp(path) || '')}" ${ph ? `placeholder="${esc(ph)}"` : ''} ${extra || ''}></label>`;
  const lnkIn = (path, label) => txt(path, label || 'Click opens (link)', '/c/sarees  or  /product/product-name  or paste a page address', 'list="sf-links" autocomplete="off"');
  const upl = (path, label, hint) => `<div class="sfa-up"><b class="small">${label}</b>${hint ? `<div class="small muted">${hint}</div>` : ''}<div class="row wrap mt">${thumb(getp(path))}<label class="btn sm" style="cursor:pointer">Choose image<input type="file" data-up="${path}" accept="image/png,image/jpeg,image/webp" hidden></label>${getp(path) ? `<button type="button" class="btn sm o-d" data-act="sfClear" data-p="${path}">Remove</button>` : ''}</div></div>`;
  const chk = (path, label) => `<label class="chk"><input type="checkbox" data-pc="${path}" ${getp(path) ? 'checked' : ''}> ${label}</label>`;
  const mv = (path, i, n) => `<span class="row" style="gap:4px"><button type="button" class="btn sm" data-act="sfMove" data-p="${path}" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button type="button" class="btn sm" data-act="sfMove" data-p="${path}" data-i="${i}" data-d="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Move down">↓</button><button type="button" class="btn sm o-d" data-act="sfDel" data-p="${path}" data-i="${i}">Delete</button></span>`;

  function itemsEditor(path, title) {
    const items = getp(path);
    return `<div class="mt">${items.map((it, i) => `<div class="card sfa-item"><div class="row between wrap"><b class="small">${title} ${i + 1}</b>${mv(path, i, items.length)}</div><div class="row wrap" style="align-items:flex-start;gap:14px">${upl(`${path}.${i}.image_path`, 'Image (PNG / JPG / WebP)')}<div class="grow" style="min-width:220px">${txt(`${path}.${i}.label`, 'Name shown below the image')}${lnkIn(`${path}.${i}.link`)}</div></div></div>`).join('')}<button type="button" class="btn sm" data-act="sfAdd" data-p="${path}">+ Add</button></div>`;
  }
  function bannerEditor(b, bi) {
    const rects = (b.hotspots || []).map((h, hi) => `<span class="hr" style="left:${h.x}%;top:${h.y}%;width:${h.w}%;height:${h.h}%"><i>${hi + 1}</i></span>`).join('');
    return `<div class="card sfa-item"><div class="row between wrap"><b>Banner ${bi + 1}</b>${mv('banners', bi, ST.banners.length)}</div>
      <div class="grid2 mt">${txt(`banners.${bi}.title`, 'Name (for your reference and screen readers)')}<label class="f"><span class="h">Where to show</span><select data-p="banners.${bi}.position">${[['circles', 'After the category arches'], ['cards', 'After the brand cards'], ['marquee', 'After the brand logo strip']].map(([v, l]) => `<option value="${v}" ${(b.position || 'circles') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      ${upl(`banners.${bi}.image_path`, 'Banner picture (PNG / JPG / WebP, up to 5 MB)', 'Use a wide picture. Tip: one full picture that already contains the buttons and tiles (like your Gold banner).')}
      ${b.image_path ? `<p class="small mt"><b>Make parts of the picture clickable:</b> drag a box with your mouse on the picture below. Each box opens its own page (a tile, a product, or the "Shop Now" button).</p>
        <div class="hs-edit" data-bi="${bi}"><img src="${esc(aimg(b.image_path))}" alt="Banner preview" draggable="false">${rects}<span class="hr live" hidden></span></div>
        ${(b.hotspots || []).map((h, hi) => `<div class="card sfa-hs"><div class="row between wrap"><b class="small">Clickable box ${hi + 1}</b><button type="button" class="btn sm o-d" data-act="sfDel" data-p="banners.${bi}.hotspots" data-i="${hi}">Delete</button></div><div class="grid2">${txt(`banners.${bi}.hotspots.${hi}.label`, 'Name (e.g. Lehengas)')}${lnkIn(`banners.${bi}.hotspots.${hi}.link`)}</div><div class="row wrap small">${['x', 'y', 'w', 'h'].map((k) => `<label style="flex:1;min-width:70px">${{ x: 'Left %', y: 'Top %', w: 'Width %', h: 'Height %' }[k]}<input type="number" step="0.1" min="0" max="100" data-pn="banners.${bi}.hotspots.${hi}.${k}" value="${h[k]}"></label>`).join('')}</div></div>`).join('') || '<p class="muted small">No clickable boxes yet.</p>'}` : '<p class="muted small mt">Upload the picture first, then you can mark clickable areas.</p>'}</div>`;
  }

  function html() {
    const h = ST.hero;
    return `<datalist id="sf-links"><option value="/search">All products</option>${CATS.map((c) => `<option value="/c/${esc(c.slug)}">${esc(c.name)}</option>`).join('')}</datalist>
    <div class="row between wrap mb"><h2>Storefront (home page)</h2><div class="row"><a class="btn sm" href="#/" target="_blank" rel="noopener">View website</a><button class="btn p" data-act="sfSave">Save changes</button></div></div>
    <p class="small muted mb">Edit the home page like Meesho / Flipkart. Nothing changes on the live website until you press <b>Save changes</b>. Links: write <code>/c/category-slug</code>, <code>/product/product-slug</code>, <code>/search?q=kurti</code> or a full https:// address. You may also paste the page address from your browser.</p>
    <section class="card mb"><h3 class="sfa-h">Top category menu (the coloured bar under the search box)</h3>${chk('menu.enabled', 'Show the top category menu')}<p class="small muted">Untick to hide it everywhere on the website. Press Save changes.</p></section>
    <section class="card mb"><h3 class="sfa-h">1. Top banner (desktop only) - logo, offer, QR code</h3>${chk('hero.enabled', 'Show this top banner on desktop')}
      <p class="small muted">The website <b>logo</b> and the colours are changed in Admin &gt; Appearance. Top menu categories come from Admin &gt; Categories (parent / child = drop-down menu).</p>
      ${upl('hero.image_path', 'Banner background picture', 'Wide picture, about 1400 x 330. Leave empty for a plain colour background.')}
      <div class="grid2 mt">${txt('hero.offer_text', 'Offer line')}${txt('hero.offer_sub', 'Small line under the offer')}</div>
      ${upl('hero.qr_path', 'QR code picture (app download)', 'Upload your QR code as PNG / JPG.')}
      ${txt('hero.qr_caption', 'Text under the QR code')}
      <div class="grid2">${txt('hero.headline', 'Big heading (right side)')}${txt('hero.subheadline', 'Second line')}</div>
      <div class="grid2">${txt('hero.button_text', 'Button text')}${lnkIn('hero.button_link', 'Button opens (link)')}</div></section>
    <section class="card mb"><h3 class="sfa-h">2. Category arches (round pictures under the banner)</h3>${chk('circles.enabled', 'Show category arches')}
      <p class="small muted">If you add nothing here, your categories (with their thumbnails from Admin &gt; Categories) are shown automatically.</p>${itemsEditor('circles.items', 'Arch')}
      <button type="button" class="btn sm mt" data-act="sfFromCats">Fill from my categories</button></section>
    <section class="card mb"><h3 class="sfa-h">3. Big banners (picture with clickable tiles / buttons)</h3>${ST.banners.map(bannerEditor).join('')}<button type="button" class="btn sm mt" data-act="sfAdd" data-p="banners">+ Add banner</button></section>
    <section class="card mb"><h3 class="sfa-h">4. Brand / category cards (picture with coloured label)</h3>${chk('cards.enabled', 'Show this row')}
      <div class="grid2">${txt('cards.title', 'Heading (e.g. Original Brands)')}${lnkIn('cards.view_all', '"VIEW ALL" opens (link)')}</div>${itemsEditor('cards.items', 'Card')}</section>
    <section class="card mb"><h3 class="sfa-h">5. Brand logo strip (scrolls in a loop)</h3>${chk('marquee.enabled', 'Show the logo strip')}${txt('marquee.title', 'Heading (optional)')}
      <p class="small muted">Logos come from Admin &gt; Brands (upload a logo for each brand). Clicking a logo shows that brand's products.</p></section>
    <div class="row wrap"><button class="btn p" data-act="sfSave">Save changes</button><button class="btn" data-act="sfReload">Discard changes</button></div>`;
  }
  const draw = () => { const el = $('#sf-ed'); if (el) el.innerHTML = html(); };

  aroute('/admin/storefront', 'storefront', async () => {
    const { data, error } = await window.sb.from('store_settings').select('value').eq('key', 'storefront').maybeSingle(); if (error) throw error;
    ST = JSON.parse(JSON.stringify(SF.merge(data ? data.value : null))); CATS = await getCats().catch(() => []);
    ST.banners.forEach((b) => { b.hotspots = b.hotspots || []; });
    return { html: '<div id="sf-ed" class="sfa">' + html() + '</div>', mount() {} };
  });

  const num = (v) => Math.max(0, Math.min(100, Math.round((Number(v) || 0) * 10) / 10));
  const clean = () => { const c = JSON.parse(JSON.stringify(ST)); c.circles.items = c.circles.items.filter((i) => i.image_path || i.label); c.cards.items = c.cards.items.filter((i) => i.image_path || i.label); c.banners = c.banners.filter((b) => b.image_path).map((b) => Object.assign(b, { id: b.id || uuid(), hotspots: (b.hotspots || []).map((h) => ({ label: h.label || '', link: h.link || '', x: num(h.x), y: num(h.y), w: num(h.w), h: num(h.h) })) })); return c; };

  Object.assign(A, {
    sfSave: async (b) => { btnBusy(b, true, 'Saving…'); try { const v = clean(); const { error } = await window.sb.from('store_settings').upsert({ key: 'storefront', value: v, is_public: true, description: 'Home page layout (managed in Admin > Storefront)' }, { onConflict: 'key' }); if (error) throw error; toast('Storefront saved'); await SF.load(true); renderChrome(); } catch (e) { toast(errMsg(e, 'Could not save'), 'error'); } btnBusy(b, false); },
    sfReload: () => R.render(),
    sfAdd: (b) => { const p = b.dataset.p; if (p === 'banners') getp(p).push({ id: uuid(), title: '', position: 'circles', image_path: null, hotspots: [] }); else getp(p).push({ label: '', image_path: null, link: '' }); draw(); },
    sfDel: (b) => { if (!confirm('Delete this item?')) return; getp(b.dataset.p).splice(+b.dataset.i, 1); draw(); },
    sfMove: (b) => { const a = getp(b.dataset.p), i = +b.dataset.i, j = i + +b.dataset.d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; draw(); },
    sfClear: (b) => { setp(b.dataset.p, null); draw(); },
    sfFromCats: () => { ST.circles.items = CATS.filter((c) => !c.parent_id).map((c) => ({ label: c.name, image_path: c.image_url || null, link: '/c/' + c.slug })); draw(); toast('Filled from your categories - you can edit each one'); },
  });

  document.addEventListener('input', (e) => { const t = e.target; if (!ST || !$('#sf-ed') || !t.dataset) return; if (t.dataset.p) setp(t.dataset.p, t.value); });
  document.addEventListener('change', async (e) => {
    const t = e.target; if (!ST || !$('#sf-ed') || !t.dataset) return;
    if (t.dataset.pc) { setp(t.dataset.pc, t.checked); return; }
    if (t.dataset.pn) { setp(t.dataset.pn, num(t.value)); draw(); return; }
    if (t.dataset.p && t.tagName === 'SELECT') { setp(t.dataset.p, t.value); return; }
    if (t.dataset.up) {
      const f = t.files[0]; const path = t.dataset.up; t.value = ''; if (!f) return;
      if (f.size > 5 * 1048576) return toast('Image is larger than 5 MB', 'error');
      const type = await sniff(f); if (!type) return toast('Use a PNG, JPG or WebP picture', 'error');
      toast('Uploading…', 'info');
      const name = 'storefront/' + uuid() + '.' + EXT[type];
      const { error } = await window.sb.storage.from('brand-assets').upload(name, f, { contentType: 'image/' + (type === 'jpg' ? 'jpeg' : type) });
      if (error) return toast(errMsg(error, 'Upload failed'), 'error');
      setp(path, name); draw(); toast('Picture uploaded. Press "Save changes" to publish.');
    }
  });

  /* drag a box on a banner picture to create a clickable area */
  let drag = null;
  document.addEventListener('pointerdown', (e) => { const c = e.target.closest && e.target.closest('.hs-edit'); if (!c || !ST) return; const r = c.getBoundingClientRect(); drag = { c, bi: +c.dataset.bi, r, x0: (e.clientX - r.left) / r.width * 100, y0: (e.clientY - r.top) / r.height * 100 }; drag.x1 = drag.x0; drag.y1 = drag.y0; e.preventDefault(); });
  document.addEventListener('pointermove', (e) => { if (!drag) return; drag.x1 = Math.max(0, Math.min(100, (e.clientX - drag.r.left) / drag.r.width * 100)); drag.y1 = Math.max(0, Math.min(100, (e.clientY - drag.r.top) / drag.r.height * 100)); const l = $('.hr.live', drag.c); if (l) { l.hidden = false; l.style.left = Math.min(drag.x0, drag.x1) + '%'; l.style.top = Math.min(drag.y0, drag.y1) + '%'; l.style.width = Math.abs(drag.x1 - drag.x0) + '%'; l.style.height = Math.abs(drag.y1 - drag.y0) + '%'; } });
  document.addEventListener('pointerup', () => { if (!drag) return; const d = drag; drag = null; const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0); if (w < 2 || h < 2) { draw(); return; } ST.banners[d.bi].hotspots.push({ label: '', link: '', x: num(Math.min(d.x0, d.x1)), y: num(Math.min(d.y0, d.y1)), w: num(w), h: num(h) }); draw(); toast('Box added - now type its name and link below the picture', 'info'); });
})();
