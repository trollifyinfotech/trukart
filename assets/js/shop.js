/* shop.js - cart, wishlist, home, listing, product page, cart page, checkout */
(function () {
  const MAXQ = 10;
  /* ================= CART ================= */
  window.Cart = {
    items: [], cartId: null,
    count() { return this.items.reduce((n, i) => n + i.quantity, 0); },
    async ensure() { if (this.cartId) return this.cartId; const { data, error } = await window.sb.from('carts').upsert({ user_id: S.user.id }, { onConflict: 'user_id' }).select('id').single(); if (error) throw error; this.cartId = data.id; return data.id; },
    async load() {
      if (!S.user) { this.cartId = null; this.items = L.rd('guest_cart', []); return; }
      try {
        const cid = await this.ensure(); const { data } = await window.sb.from('cart_items').select('product_variant_id,quantity').eq('cart_id', cid);
        const m = new Map((data || []).map((r) => [r.product_variant_id, r.quantity])); const g = L.rd('guest_cart', []);
        if (g.length) { g.forEach((x) => m.set(x.variantId, Math.min(MAXQ, Math.max(m.get(x.variantId) || 0, x.quantity)))); const rows = [...m].map(([v, q]) => ({ cart_id: cid, product_variant_id: v, quantity: q })); const r = await window.sb.from('cart_items').upsert(rows, { onConflict: 'cart_id,product_variant_id' }); if (!r.error) L.wr('guest_cart', []); }
        this.items = [...m].map(([variantId, quantity]) => ({ variantId, quantity })); L.wr('cart_mirror', { uid: S.user.id, items: this.items });
      } catch (e) { if (Net.isNetErr(e) || navigator.onLine === false) { const mm = L.rd('cart_mirror', null); if (mm && mm.uid === S.user.id) this.items = mm.items; } else toast(errMsg(e), 'error'); }
    },
    async set(variantId, qty) {
      qty = Math.min(MAXQ, qty); const rest = this.items.filter((i) => i.variantId !== variantId); this.items = qty < 1 ? rest : [...rest, { variantId, quantity: qty }];
      if (!S.user) L.wr('guest_cart', this.items);
      else {
        L.wr('cart_mirror', { uid: S.user.id, items: this.items });
        const queue = async () => { await Queue.add({ type: 'cart', uid: S.user.id, target: variantId, value: qty }); toast('Saved on this device. It will sync when you are back online.', 'info'); };
        if (Net.offline || navigator.onLine === false) await queue();
        else { try { const cid = await this.ensure(); if (qty < 1) { const r = await window.sb.from('cart_items').delete().eq('cart_id', cid).eq('product_variant_id', variantId); if (r.error) throw r.error; } else { const { error } = await window.sb.from('cart_items').upsert({ cart_id: cid, product_variant_id: variantId, quantity: qty }, { onConflict: 'cart_id,product_variant_id' }); if (error) throw error; } }
          catch (e) { if (Net.isNetErr(e)) await queue(); else { toast(errMsg(e), 'error'); await this.load(); } } }
      }
      updateChrome();
    },
    async add(variantId, qty, productId) { const cur = this.items.find((i) => i.variantId === variantId); await this.set(variantId, (cur ? cur.quantity : 0) + qty); window.sb.rpc('track_event', { p_event: 'add_to_cart', p_product: productId || null }).then(() => {}, () => {}); },
    payload() { return this.items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })); },
    clearLocal() { this.items = []; L.wr('guest_cart', []); updateChrome(); },
  };
  /* ================= WISHLIST ================= */
  window.Wish = {
    id: null,
    has(pid) { return S.wish.includes(pid); },
    async load() {
      if (!S.user) { this.id = null; S.wish = L.rd('guest_wish', []); return; }
      try { const { data: w } = await window.sb.from('wishlists').upsert({ user_id: S.user.id }, { onConflict: 'user_id' }).select('id').single(); this.id = w.id;
        const { data } = await window.sb.from('wishlist_items').select('product_id').eq('wishlist_id', w.id); const server = (data || []).map((r) => r.product_id); const g = L.rd('guest_wish', []).filter((x) => !server.includes(x));
        if (g.length) { await window.sb.from('wishlist_items').upsert(g.map((p) => ({ wishlist_id: w.id, product_id: p })), { onConflict: 'wishlist_id,product_id', ignoreDuplicates: true }); L.wr('guest_wish', []); }
        S.wish = [...server, ...g]; L.wr('wish_mirror', { uid: S.user.id, ids: S.wish }); } catch (e) { const mm = L.rd('wish_mirror', null); S.wish = (Net.isNetErr(e) || navigator.onLine === false) && mm && mm.uid === S.user.id ? mm.ids : []; }
    },
    async toggle(pid) {
      const has = this.has(pid); S.wish = has ? S.wish.filter((x) => x !== pid) : [pid, ...S.wish];
      const paint = () => $$(`[data-heart="${pid}"]`).forEach((b) => { b.classList.toggle('on', this.has(pid)); b.classList.add('pop'); setTimeout(() => b.classList.remove('pop'), 350); b.innerHTML = icon('heart', 20, this.has(pid) ? 'filled' : ''); b.setAttribute('aria-pressed', this.has(pid)); });
      if (!S.user) { L.wr('guest_wish', S.wish); toast(has ? 'Removed from wishlist' : 'Saved to wishlist'); }
      else {
        L.wr('wish_mirror', { uid: S.user.id, ids: S.wish });
        const queue = async () => { await Queue.add({ type: 'wish', uid: S.user.id, target: pid, value: !has }); toast('Saved on this device. It will sync when you are back online.', 'info'); };
        if (Net.offline || navigator.onLine === false) await queue();
        else { try { if (!this.id) await this.load(); if (has) { const r = await window.sb.from('wishlist_items').delete().eq('wishlist_id', this.id).eq('product_id', pid); if (r.error) throw r.error; } else { const { error } = await window.sb.from('wishlist_items').insert({ wishlist_id: this.id, product_id: pid }); if (error && error.code !== '23505') throw error; } toast(has ? 'Removed from wishlist' : 'Saved to wishlist'); }
          catch (e) { if (Net.isNetErr(e)) await queue(); else { toast(errMsg(e), 'error'); await this.load(); } } }
      }
      updateChrome(); paint();
    },
  };
  /* ================= PRODUCTS ================= */
  window.pcard = (p) => `<article class="pc"><a href="#/product/${esc(p.slug)}" aria-label="${esc(p.title)}"><div class="im"><img loading="lazy" decoding="async" src="${esc(pimg(p.image_path))}" alt="${esc(p.title)}" onerror="this.onerror=null;this.src='assets/img/placeholder.svg'" style="${p.in_stock ? '' : 'opacity:.5'}">${p.in_stock ? '' : '<div class="oos">Out of stock</div>'}</div>
    <div class="info"><div class="t2">${esc(p.title)}</div>
    <div class="pr"><b>${inr(p.min_price)}</b>${p.discount_pct > 0 ? `<s>${inr(p.original_price)}</s><em>↓${p.discount_pct}%</em>` : ''}</div>
    ${p.avg_rating && p.review_count > 0 ? `<div class="rrow"><span class="pill r${Math.round(p.avg_rating)}">${Number(p.avg_rating).toFixed(1)} ${icon('star', 11, 'filled')}</span><span class="muted small">(${Number(p.review_count).toLocaleString('en-IN')})</span></div>` : ''}</div></a>
    <button class="heart ${Wish.has(p.id) ? 'on' : ''}" data-heart="${p.id}" data-act="wish" data-id="${p.id}" aria-pressed="${Wish.has(p.id)}" aria-label="Toggle wishlist">${icon('heart', 20, Wish.has(p.id) ? 'filled' : '')}</button></article>`;
  const fetchProductsRaw = async (f, page, limit) => {
    limit = limit || 24; page = page || 0;
    let q = window.sb.from('v_products').select('*', { count: 'exact' });
    sanitizeQ(f.q).split(' ').filter(Boolean).forEach((w) => { q = q.ilike('search_document', '%' + w + '%'); });
    if (f.seller) q = q.eq('seller_id', f.seller);
    if (f.cats && f.cats.length) q = q.in('category_id', f.cats);
    if (f.brands && f.brands.length) q = q.in('brand_id', f.brands);
    if (f.min) q = q.gte('min_price', f.min); if (f.max) q = q.lte('min_price', f.max);
    if (f.disc) q = q.gte('discount_pct', f.disc); if (f.sizes && f.sizes.length) q = q.overlaps('sizes', f.sizes); if (f.colors && f.colors.length) q = q.overlaps('colors', f.colors);
    if (f.stock) q = q.eq('in_stock', true); if (f.rating) q = q.gte('avg_rating', f.rating);
    const s = f.sort || 'recommended';
    if (s === 'newest') q = q.order('created_at', { ascending: false }); else if (s === 'price_asc') q = q.order('min_price'); else if (s === 'price_desc') q = q.order('min_price', { ascending: false });
    else if (s === 'discount') q = q.order('discount_pct', { ascending: false }); else if (s === 'rating') q = q.order('avg_rating', { ascending: false, nullsFirst: false });
    else q = q.order('sales_count', { ascending: false }).order('view_count', { ascending: false }).order('created_at', { ascending: false });
    const { data, error, count } = await q.range(page * limit, page * limit + limit - 1); if (error) throw error;
    return { items: data || [], total: count || 0, more: (count || 0) > page * limit + limit };
  };
  window.fetchProducts = (f, page, limit) => Data.query('plist:' + JSON.stringify([f || {}, page || 0, limit || 24]), () => fetchProductsRaw(f, page, limit), { ttl: CACHE_POLICY.plist });
  const byIds = (ids) => (!ids.length ? Promise.resolve([]) : Data.query('pids:' + ids.join(','), async () => { const { data, error } = await window.sb.from('v_products').select('*').in('id', ids); if (error) throw error; const m = new Map((data || []).map((p) => [p.id, p])); return ids.map((i) => m.get(i)).filter(Boolean); }, { ttl: CACHE_POLICY.pids }));

  /* ================= HOME ================= */
  R.add('/', async () => {
    const qrows = (key, table, build) => Data.query(key, async () => { const r = await build(window.sb.from(table).select('*')); if (r.error) throw r.error; return r.data || []; }, { ttl: CACHE_POLICY.home });
    const [cats, bnd, secd, sfcfg] = await Promise.all([getCats(), qrows('home:banners', 'banners', (q) => q.order('sort_order')), qrows('home:sections', 'home_sections', (q) => q.eq('is_active', true).order('sort_order')), SF.load()]);
    const now = Date.now(), bn = { data: bnd.filter((b) => (!b.starts_at || new Date(b.starts_at) <= now) && (!b.ends_at || new Date(b.ends_at) >= now) && b.is_active !== false) }, sec = { data: secd };
    const banners = bn.data || [], hero = banners.filter((b) => b.placement === 'hero'), mid = banners.find((b) => b.placement === 'mid'), strip = banners.find((b) => b.placement === 'strip');
    const bl = (b) => (/^https?:/.test(b.target_url) ? b.target_url : '#' + (b.target_url.startsWith('/') ? b.target_url : '/' + b.target_url));
    const top = cats.filter((c) => !c.parent_id);
    let html = `<div class="page">${strip ? `<a class="strip" href="${esc(bl(strip))}">${esc(strip.title)}${strip.show_countdown && strip.ends_at ? ` · ends in <span data-cd="${esc(strip.ends_at)}"></span>` : ''}</a>` : ''}
      ${await SF.homeTop(sfcfg, cats)}`;
    if (hero.length) html += `<section class="hero" id="hero" aria-roledescription="carousel" aria-label="Campaigns"></section>`;
    const recentCats = L.rd('recent_cats', []);
    const sects = sec.data || [];
    const blocks = await Promise.all(sects.map(async (s) => {
      try {
        if (s.kind === 'brands') { const bs = await getBrands(); if (!bs.length) return ''; return `<section class="sec"><h2>${esc(s.title)}</h2><div class="rail">${bs.slice(0, s.item_limit).map((b) => `<a class="card" style="flex:0 0 130px;text-align:center;font-weight:700" href="#/search?brand=${b.id}">${b.logo_url ? `<img src="${esc(aimg(b.logo_url))}" alt="${esc(b.name)}" style="max-height:44px">` : esc(b.name)}</a>`).join('')}</div></section>`; }
        let items = [];
        if (s.kind === 'recent') items = await byIds(L.rd('recent_view', []).slice(0, s.item_limit));
        else { const f = { trending: { sort: 'recommended' }, bestsellers: { sort: 'recommended' }, new: { sort: 'newest' }, deals: { sort: 'discount', disc: s.min_discount || 20 }, budget: { sort: 'price_asc', max: s.max_price || 999 }, category: { cats: s.category_id ? [s.category_id] : null }, recommended: { cats: recentCats.length ? recentCats : null, sort: recentCats.length ? 'rating' : 'recommended' } }[s.kind] || {}; items = (await fetchProducts(f, 0, s.item_limit)).items; }
        if (!items.length) return '';
        return `<section class="sec"><div class="row between"><h2>${esc(s.title)}</h2><a class="arrowbtn" aria-label="See all" href="#/search${s.kind === 'deals' ? '?sort=discount' : s.kind === 'new' ? '?sort=newest' : ''}">${icon('arrow-right', 18)}</a></div><div class="rail">${items.map(pcard).join('')}</div></section>`;
      } catch (e) { return ''; }
    }));
    blocks.forEach((b, i) => { html += b; if (i === 1 && mid) html += `<a class="sec" style="display:block" href="${esc(bl(mid))}"><img src="${esc(aimg(mid.image_path))}" alt="${esc(mid.title)}" style="width:100%;border-radius:22px;aspect-ratio:16/6;object-fit:cover"></a>`; });
    if (!blocks.join('').trim()) html += empty('Store is getting ready', 'Products will appear here once sellers publish them and an admin approves them.', '<a class="btn p" href="#/search">Browse all</a>');
    html += '</div>';
    return { html, mount() {
      if (hero.length) { let i = 0; const el = $('#hero'); const draw = () => { const b = hero[i % hero.length]; el.innerHTML = `<a href="${esc(bl(b))}"><img src="${esc(aimg(b.image_path))}" alt="${esc(b.title)}"><div class="ov"><h2>${esc(b.title)}</h2>${b.subtitle ? `<p style="margin:0">${esc(b.subtitle)}</p>` : ''}${b.show_countdown && b.ends_at ? `<div>Ends in <b data-cd="${esc(b.ends_at)}"></b></div>` : ''}<span class="btn p">${esc(b.cta_label || 'Shop now')}</span></div></a>${hero.length > 1 ? `<div class="dots">${hero.map((_, k) => `<button class="${k === i % hero.length ? 'on' : ''}" data-act="heroGo" data-i="${k}" aria-label="Banner ${k + 1}"></button>`).join('')}</div>` : ''}`; };
        draw(); A.heroGo = (b) => { i = Number(b.dataset.i); draw(); }; if (hero.length > 1) R.timer(setInterval(() => { i++; draw(); }, 5500)); }
      const cd = () => $$('[data-cd]').forEach((e) => { const ms = new Date(e.dataset.cd) - Date.now(); if (ms <= 0) { e.textContent = 'ended'; return; } const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = String(Math.floor(s % 86400 / 3600)).padStart(2, '0'), m = String(Math.floor(s % 3600 / 60)).padStart(2, '0'), x = String(s % 60).padStart(2, '0'); e.textContent = (d ? d + 'd ' : '') + h + ':' + m + ':' + x; });
      cd(); R.timer(setInterval(cd, 1000));
    } };
  });
  R.add('/categories', async (p, q) => SF.categoriesPage(q || {}));

  /* ================= LISTING ================= */
  const SORTS = [['recommended', 'Recommended'], ['newest', 'Newest'], ['price_asc', 'Price: Low to High'], ['price_desc', 'Price: High to Low'], ['discount', 'Highest Discount'], ['rating', 'Best Rated']];
  const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36', '38', '40', '6', '7', '8', '9', '10', 'Free'], COLORS = ['Black', 'White', 'Pink', 'Red', 'Blue', 'Green', 'Yellow', 'Beige', 'Brown', 'Grey', 'Navy', 'Maroon'];
  const csv = (v) => (v ? String(v).split(',').filter(Boolean) : []);
  async function listing(title, q, lockedCat, route) {
    const cats = await getCats(), brands = await getBrands();
    const root = lockedCat || (q.cat ? (cats.find((c) => c.slug === q.cat) || {}).id : null);
    const f = { q: q.q, cats: root ? descendants(cats, root) : null, brands: csv(q.brand), min: q.min && +q.min, max: q.max && +q.max, disc: q.disc && +q.disc, sizes: csv(q.size), colors: csv(q.color), stock: q.stock === '1', rating: q.rating && +q.rating, sort: q.sort || 'recommended' };
    const mk = (k, v) => { const n = Object.assign({}, q); if (v == null || v === '') delete n[k]; else n[k] = v; return route + '?' + new URLSearchParams(n).toString(); };
    const tog = (k, val) => { const c = csv(q[k]); return mk(k, (c.includes(val) ? c.filter((x) => x !== val) : c.concat(val)).join(',') || null); };
    const chip = (k, val, text) => `<a class="chip ${csv(q[k]).includes(val) ? 'on' : ''}" style="display:inline-flex;align-items:center" href="#${tog(k, val)}">${esc(text || val)}</a>`;
    const active = ['cat', 'brand', 'min', 'max', 'disc', 'size', 'color', 'stock', 'rating'].filter((k) => q[k]).length;
    const panel = `<div class="filters" id="filters"><div class="row between"><h3>Filters</h3><button class="btn sm fclose" data-act="filters">Close</button></div>
      ${lockedCat ? '' : `<h4>Category</h4><div class="chips">${cats.filter((c) => !c.parent_id).map((c) => `<a class="chip ${q.cat === c.slug ? 'on' : ''}" style="display:inline-flex;align-items:center" href="#${mk('cat', q.cat === c.slug ? null : c.slug)}">${esc(c.name)}</a>`).join('')}</div>`}
      <h4>Brand</h4><div class="chips">${brands.map((b) => chip('brand', b.id, b.name)).join('') || '<span class="muted small">No brands yet</span>'}</div>
      <h4>Price (₹)</h4><div class="row"><input id="fmin" inputmode="numeric" placeholder="Min" value="${esc(q.min || '')}" aria-label="Minimum price"><span>–</span><input id="fmax" inputmode="numeric" placeholder="Max" value="${esc(q.max || '')}" aria-label="Maximum price"></div><button class="btn sm mt" data-act="priceGo" data-route="${esc(route)}">Apply price</button>
      <h4>Discount</h4><div class="chips">${[10, 25, 40, 60].map((d) => `<a class="chip ${q.disc == d ? 'on' : ''}" style="display:inline-flex;align-items:center" href="#${mk('disc', q.disc == d ? null : d)}">${d}%+</a>`).join('')}</div>
      <h4>Size</h4><div class="chips">${SIZES.map((s) => chip('size', s)).join('')}</div><h4>Color</h4><div class="chips">${COLORS.map((s) => chip('color', s)).join('')}</div>
      <h4>Rating</h4><div class="chips">${[4, 3].map((r) => `<a class="chip ${q.rating == r ? 'on' : ''}" style="display:inline-flex;align-items:center" href="#${mk('rating', q.rating == r ? null : r)}">${r} ${icon('star',12,'filled gold')} &amp; up</a>`).join('')}</div>
      <label class="chk mt"><input type="checkbox" ${q.stock === '1' ? 'checked' : ''} data-act="stockTog" data-href="${esc(mk('stock', q.stock === '1' ? null : '1'))}"> In stock only</label>
      ${active ? `<a class="btn full mt" href="#${route}${q.q ? '?q=' + encodeURIComponent(q.q) : ''}">Clear all filters</a>` : ''}<button class="btn p full mt fclose" data-act="filters">Show results</button></div>`;
    let first; try { first = await fetchProducts(f, 0); } catch (e) { return `<div class="page">${empty('Could not load products', errMsg(e))}</div>`; }
    const body = first.items.length ? `<div class="pgrid" id="plist">${first.items.map(pcard).join('')}</div>${first.more ? `<div class="center mt"><button class="btn" data-act="loadMore">Load more</button></div>` : ''}`
      : empty('No products found', q.q ? `Nothing matched "${q.q}". Check spelling or try a broader word like "kurta" or "jeans".` : active ? 'Try removing a few filters.' : 'Check back soon - new styles are on the way.', active ? `<a class="btn p" href="#${route}">Clear filters</a>` : '');
    return { html: `<div class="page"><h1 class="mb">${esc(title)}</h1><div class="list">${panel}<div><div class="row between wrap mb"><span class="muted small" aria-live="polite">${first.total} item${first.total === 1 ? '' : 's'}</span><div class="row"><button class="btn sm fopen" data-act="filters">Filter${active ? ' (' + active + ')' : ''}</button><select id="sortsel" aria-label="Sort by" style="width:auto;min-height:38px">${SORTS.map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>${body}</div></div></div>`,
      mount() { let page = 0; const sel = $('#sortsel'); sel.onchange = () => { location.hash = mk('sort', sel.value === 'recommended' ? null : sel.value); };
        A.loadMore = async (b) => { R.loadedMore = true; btnBusy(b, true); try { const r = await fetchProducts(f, ++page); $('#plist').insertAdjacentHTML('beforeend', r.items.map(pcard).join('')); if (!r.more) b.remove(); else btnBusy(b, false); } catch (e) { toast(errMsg(e), 'error'); btnBusy(b, false); } };
        A.priceGo = (b) => { const n = Object.assign({}, q); const mn = $('#fmin').value.replace(/\D/g, ''), mx = $('#fmax').value.replace(/\D/g, ''); mn ? n.min = mn : delete n.min; mx ? n.max = mx : delete n.max; location.hash = b.dataset.route + '?' + new URLSearchParams(n).toString(); };
        A.stockTog = (el) => { location.hash = el.dataset.href; }; } };
  }
  R.add('/c/:slug', async (p, q) => { const cats = await getCats(); const c = cats.find((x) => x.slug === p.slug); if (!c) return `<div class="page">${empty('Category not found', 'It does not exist or is no longer available.', '<a class="btn p" href="#/">Go home</a>')}</div>`; L.addRecent('recent_cats', c.id, 5); document.title = c.name; return listing(c.name, q, c.id, '/c/' + p.slug); });
  R.add('/search', async (p, q) => { if (q.q) L.addRecent('recent_search', q.q, 8); return listing(q.q ? 'Results for "' + q.q + '"' : 'All products', q, null, '/search'); });

  /* ================= PRODUCT PAGE ================= */
  let P = null;
  R.add('/product/:slug', async (p) => {
    let pd; try { pd = await Data.query('prod:' + p.slug, async () => {
      const r = await window.sb.from('products').select('*, brands(name), categories(name,slug), product_images(*), product_variants(*)').eq('slug', p.slug).eq('approval_status', 'approved').eq('is_active', true).maybeSingle(); if (r.error) throw r.error; if (!r.data) return null;
      const [sl, rt, rv, ds] = await Promise.all([window.sb.from('public_sellers').select('*').eq('id', r.data.seller_id).maybeSingle(), window.sb.from('v_products').select('avg_rating,review_count').eq('id', r.data.id).maybeSingle(), window.sb.from('product_reviews').select('*').eq('product_id', r.data.id).eq('moderation_status', 'approved').order('created_at', { ascending: false }).limit(30), window.sb.from('product_reviews').select('rating').eq('product_id', r.data.id).eq('moderation_status', 'approved').limit(2000)]);
      const dist = [0, 0, 0, 0, 0]; (ds.data || []).forEach((x) => { if (x.rating >= 1 && x.rating <= 5) dist[x.rating - 1]++; });
      return { data: r.data, seller: sl.data, rating: rt.data, reviews: rv.data || [], dist }; }, { ttl: CACHE_POLICY.prod }); }
    catch (e) { if (e.message === 'OFFLINE_NO_CACHE') return `<div class="page">${empty('Not available offline', 'You have not opened this product while online, so it was not saved on this device.', '<button class="btn p" data-act="netRetry">Retry</button>', 'wifi-off')}</div>`; return `<div class="page">${empty('Could not load product', errMsg(e))}</div>`; }
    if (!pd) return `<div class="page">${empty('Product not found', 'It may have been removed or is no longer available.', '<a class="btn p" href="#/">Continue shopping</a>')}</div>`;
    const data = pd.data, sl = { data: pd.seller }, rt = { data: pd.rating }, rv = { data: pd.reviews };
    P = { p: data, seller: sl.data, rating: rt.data, reviews: rv.data || [], dist: pd.dist, vars: data.product_variants.filter((v) => v.is_active), imgs: [...data.product_images].sort((a, b) => (b.is_primary - a.is_primary) || (a.sort_order - b.sort_order)), size: null, color: null, qty: 1, img: 0 };
    L.addRecent('recent_view', data.id, 20); L.addRecent('recent_cats', data.category_id, 5); document.title = data.title;
    window.sb.rpc('record_product_view', { p_product: data.id }).then(() => {}, () => {}); window.sb.rpc('track_event', { p_event: 'product_view', p_product: data.id }).then(() => {}, () => {});
    let canReview = null; if (S.user && !Net.offline) { try { const { data: its } = await window.sb.from('order_items').select('id').eq('product_id', data.id).eq('fulfillment_status', 'delivered'); const { data: done } = await window.sb.from('product_reviews').select('id').eq('product_id', data.id).eq('user_id', S.user.id); if (its && its.length && !(done && done.length)) canReview = its[0].id; } catch (e) { canReview = null; } }
    P.canReview = canReview;
    P.voted = new Set(); if (S.user && !Net.offline && P.reviews.length) { try { const { data: vs } = await window.sb.from('review_votes').select('review_id').in('review_id', P.reviews.map((x) => x.id)); P.voted = new Set((vs || []).map((x) => x.review_id)); } catch (e) { /* votes are optional */ } }
    const sim = (await fetchProducts({ cats: data.category_id ? [data.category_id] : null }, 0, 12)).items.filter((x) => x.id !== data.id); P.sim = sim; const rec = await byIds(L.rd('recent_view', []).filter((i) => i !== data.id).slice(0, 10));
    const rail = (t, a, href) => (a.length ? `<section class="sec"><div class="row between"><h2>${t}</h2>${href ? `<a class="arrowbtn" href="${href}" aria-label="See all">${icon('arrow-right', 18)}</a>` : ''}</div><div class="rail">${a.map(pcard).join('')}</div></section>` : '');
    const seen = new Set([data.id].concat(sim.map((x) => x.id))), more = (await fetchProducts({}, 0, 14)).items.filter((x) => !seen.has(x.id)).slice(0, 10);
    const alsoV = more.concat(sim).filter((x, k, a) => a.findIndex((y) => y.id === x.id) === k).slice(0, 12);
    const ld = { '@context': 'https://schema.org', '@type': 'Product', name: data.title, image: P.imgs.map((i) => pimg(i.storage_path)), description: data.description || data.title, sku: (P.vars[0] || {}).sku, offers: { '@type': 'Offer', priceCurrency: 'INR', price: Number(data.base_price), availability: P.vars.some((v) => v.stock_quantity > 0) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' } };
    return { html: `<div class="page pdp-page"><script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script><p class="small muted crumbs"><a href="#/">Home</a> / ${data.categories ? `<a href="#/c/${esc(data.categories.slug)}">${esc(data.categories.name)}</a> / ` : ''}${esc(data.title)}</p><div class="pdp" id="pdp"></div><div class="pdp-more"><div id="pdpsold"></div><div id="pdpdet"></div><div id="reviews"></div><div class="trust"><div>${icon('shield', 26)}<span>Secure Payments</span></div>${S.settings.cod_enabled ? `<div>${icon('banknote', 26)}<span>Cash on Delivery</span></div>` : ''}<div>${icon('undo', 26)}<span>${data.is_returnable ? S.settings.return_window_days + '-day Returns' : 'No returns'}</span></div></div>${alsoV.length ? `<section class="sec"><h2>People also viewed</h2><div class="pgrid" style="margin-top:10px">${alsoV.map(pcard).join('')}</div></section>` : ''}${rail('Recently Viewed', rec)}</div></div>`, mount() { drawPdp(); drawSold(); drawDetails(); drawReviews(); const pr = sessionStorage.getItem('pre_rating'); if (pr) { sessionStorage.removeItem('pre_rating'); const b = $('#stars [data-v="' + pr + '"]'); if (b) { b.click(); $('#stars').scrollIntoView({ block: 'center' }); } } } };
  });
  const stockFor = (s, c) => P.vars.filter((v) => (!s || v.size === s) && (!c || v.color === c)).reduce((n, v) => n + v.stock_quantity, 0);
  const selVar = () => P.vars.find((v) => (P.sizes.length ? v.size === P.size : true) && (P.colors.length ? v.color === P.color : true)) || null;
  const rimg = (p) => (/^https?:/.test(p) ? p : window.sb.storage.from('review-images').getPublicUrl(p).data.publicUrl);
  const rvPill = (r) => `<span class="pill r${r}">${r} ${icon('star', 11, 'filled')}</span>`;
  function drawPdp() {
    P.sizes = [...new Set(P.vars.map((v) => v.size).filter(Boolean))]; P.colors = [...new Set(P.vars.map((v) => v.color).filter(Boolean))];
    const p = P.p, v = selVar(), prices = P.vars.map((x) => Number(x.price_override || p.base_price)), price = v ? Number(v.price_override || p.base_price) : Math.min(Number(p.base_price), ...prices), onwards = !v && prices.some((x) => x !== price), pct = p.original_price > price ? Math.round((p.original_price - price) / p.original_price * 100) : 0, inStock = P.vars.some((x) => x.stock_quantity > 0), maxq = Math.min(S.settings.max_qty_per_item, v ? v.stock_quantity : 1);
    const rt = P.rating && P.rating.review_count > 0 ? P.rating : null, wished = Wish.has(p.id);
    const sizes = P.sizes.length ? `<div class="sizes"><div class="row between"><h4>Select Size</h4><button class="linkbtn" data-act="sizeguide">Size Chart</button></div><div class="szrow">${P.sizes.map((s) => { const na = stockFor(s, P.color) < 1; return `<button class="sz ${P.size === s ? 'on' : ''} ${na ? 'na' : ''}" data-act="psize" data-v="${esc(s)}" ${na ? 'disabled' : ''} aria-label="Size ${esc(s)}${na ? ' (not available)' : ''}">${esc(s)}</button>`; }).join('')}</div></div>` : '';
    const colors = P.colors.length ? `<div class="sizes"><h4>Colour${P.color ? ': <span class="muted" style="font-weight:400">' + esc(P.color) + '</span>' : ''}</h4><div class="szrow">${P.colors.map((c) => { const na = P.size && stockFor(P.size, c) < 1; return `<button class="sz wide ${P.color === c ? 'on' : ''} ${na ? 'na' : ''}" data-act="pcolor" data-v="${esc(c)}" ${na ? 'disabled' : ''}>${esc(c)}</button>`; }).join('')}</div></div>` : '';
    const sim = (P.sim || []).slice(0, 5), cur = P.imgs[0];
    const simRow = sim.length ? `<div class="simrow"><h4>${sim.length} Similar Product${sim.length > 1 ? 's' : ''}</h4><div class="simth"><a class="on" href="#/product/${esc(p.slug)}" aria-label="This product"><img src="${esc(pimg(cur && cur.storage_path))}" alt="" onerror="this.onerror=null;this.src='assets/img/placeholder.svg'"></a>${sim.map((x) => `<a href="#/product/${esc(x.slug)}" aria-label="${esc(x.title)}"><img loading="lazy" src="${esc(pimg(x.image_path))}" alt="" onerror="this.onerror=null;this.src='assets/img/placeholder.svg'"></a>`).join('')}</div></div>` : '';
    $('#pdp').innerHTML = `<div class="gal-wrap"><div class="gal"><div class="gal-track" id="galtrack">${(P.imgs.length ? P.imgs : [{}]).map((im, i) => `<div class="gs"><img src="${esc(pimg(im.storage_path))}" ${i ? 'loading="lazy"' : ''} onerror="this.onerror=null;this.src='assets/img/placeholder.svg'" alt="${esc(p.title)}${P.imgs.length > 1 ? ' - image ' + (i + 1) : ''}" data-act="zoom" data-i="${i}"></div>`).join('')}</div>
        ${P.imgs.length > 1 ? `<div class="gal-dots" id="galdots">${P.imgs.map((_, i) => `<i class="${i === P.img ? 'on' : ''}"></i>`).join('')}</div>` : ''}
        <div class="thumbs">${P.imgs.length > 1 ? P.imgs.map((im, i) => `<button class="${i === P.img ? 'on' : ''}" data-act="pimg" data-i="${i}" aria-label="Image ${i + 1}"><img src="${esc(pimg(im.storage_path))}" alt=""></button>`).join('') : ''}</div></div>${simRow}</div>
      <div class="pinfo">
        <div class="ttl"><h1>${esc(p.title)}</h1><div class="ta"><button data-act="wishP" class="${wished ? 'on' : ''}" aria-pressed="${wished}">${icon('heart', 22, wished ? 'filled' : '')}<span>Wishlist</span></button><button data-act="shareP">${icon('share', 22)}<span>Share</span></button></div></div>
        <div class="pprice"><b>${inr(price)}</b>${onwards ? '<span class="onw">onwards</span>' : ''}${pct ? `<s>${inr(p.original_price)}</s><span class="dn">↓${pct}% off</span>` : ''}</div><p class="ok small" style="margin:2px 0 0">Inclusive of all taxes${p.tax_rate ? ' (GST ' + Number(p.tax_rate) + '%)' : ''}</p>
        ${rt ? `<div class="rrow"><span class="pill r${Math.round(rt.avg_rating)}">${rt.avg_rating} ${icon('star', 12, 'filled')}</span><span class="muted small">${rt.review_count} Rating${rt.review_count > 1 ? 's' : ''} &amp; Review${rt.review_count > 1 ? 's' : ''}</span></div>` : ''}
        ${v && v.stock_quantity > 0 && v.stock_quantity <= 5 ? `<p class="err" style="margin:8px 0 0"><b>Only ${v.stock_quantity} left!</b></p>` : ''}${!inStock ? '<p class="err" style="margin:8px 0 0"><b>Currently out of stock</b></p>' : ''}
        <div style="margin-top:14px">${sizes}${colors}</div>
        ${v && v.stock_quantity > 0 ? `<div class="row"><b>Qty</b><div class="qty"><button data-act="pqty" data-d="-1" aria-label="Decrease">−</button><span>${P.qty}</span><button data-act="pqty" data-d="1" aria-label="Increase" ${P.qty >= maxq ? 'disabled' : ''}>+</button></div></div>` : ''}
        <section class="dcard" aria-label="Delivery details"><h4>Delivery details</h4>
          <div class="dr">${icon('pin', 20)}<div class="grow"><div class="row"><input id="pin" inputmode="numeric" maxlength="6" placeholder="Enter delivery PIN code" aria-label="Delivery PIN code"><button class="btn sm" data-act="checkPin">Check</button></div></div></div>
          <div class="dr">${icon('truck', 20)}<div id="pinmsg" class="grow small" role="status">Enter your PIN code to see delivery time</div></div></section>
        <div class="buybar"><button class="btn o-p grow" data-act="addBag" ${inStock ? '' : 'disabled'}>${icon('bag', 20)} Add to Cart</button><button class="btn p grow" data-act="buyNow" ${inStock ? '' : 'disabled'}>${icon('fast-forward', 20)} Buy Now</button></div></div>`;
    const t = $('#galtrack'); if (t) { t.scrollLeft = P.img * t.clientWidth; let raf = 0; t.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const i = Math.round(t.scrollLeft / Math.max(1, t.clientWidth)); if (i !== P.img) { P.img = i; $$('#galdots i').forEach((d, k) => d.classList.toggle('on', k === i)); $$('.thumbs button').forEach((d, k) => d.classList.toggle('on', k === i)); } }); }, { passive: true }); }
  }
  function drawSold() {
    const s = P.seller, el = $('#pdpsold'); if (!el) return; if (!s) { el.innerHTML = ''; return; }
    const rc = Number(s.rating_count || 0);
    el.innerHTML = `<section class="sec sold"><h2>Sold By</h2><div class="row between" style="margin-top:12px;gap:12px"><div class="row" style="min-width:0"><span class="shoplogo sm">${s.logo_path ? `<img src="${esc(pimg(s.logo_path))}" alt="">` : icon('store', 26)}</span><b class="sn">${esc(s.store_name)}</b></div>${s.shop_slug ? `<a class="btn o-p" href="#/shop/${esc(s.shop_slug)}">View Shop</a>` : ''}</div>
      <div class="sold-st">${s.avg_rating ? `<div class="ss"><span class="pill blue">${s.avg_rating} ${icon('star', 11, 'filled')}</span><small>${rc.toLocaleString('en-IN')} Rating${rc === 1 ? '' : 's'}</small></div>` : '<div class="ss"><small>No ratings yet</small></div>'}<div class="ss"><b>${Number(s.product_count || 0)}</b><small>Products</small></div></div></section>`;
  }
  function drawDetails() {
    const p = P.p, specs = Object.entries(p.specifications || {}).filter(([, x]) => x !== '' && x != null);
    const all = [P.colors.length && ['Color', P.colors.join(', ')], p.material && ['Fabric', p.material], ...specs, p.care_instructions && ['Care', p.care_instructions], P.sizes.length && ['Sizes', P.sizes.join(', ')]].filter(Boolean);
    const hi = all.slice(0, 4), more = all.slice(4);
    $('#pdpdet').innerHTML = `<section class="sec"><div class="row between"><h2>Product Highlights</h2><button class="linkbtn" data-act="copyDet">COPY</button></div>
      ${hi.length ? `<div class="hl">${hi.map(([k, x]) => `<div><small>${esc(k)}</small><div>${esc(x)}</div></div>`).join('')}</div>` : '<p class="muted">No specifications added yet.</p>'}
      ${more.length ? `<details class="acc2" open><summary><b>Additional Details</b>${icon('chevron-down', 20)}</summary><table><tbody>${more.map(([k, x]) => `<tr><td>${esc(k)}</td><td>${esc(x)}</td></tr>`).join('')}</tbody></table></details>` : ''}
      ${p.description ? `<details class="moreinfo"><summary>More Information</summary><p style="white-space:pre-line">${esc(p.description)}</p></details>` : ''}</section>`;
    P.copy = all.map(([k, x]) => k + ': ' + x).join('\n');
  }
  const ago = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const BAR = [[5, 'Excellent'], [4, 'Very Good'], [3, 'Good'], [2, 'Average'], [1, 'Poor']];
  function drawReviews() {
    const r = P.reviews, rt = P.rating && P.rating.review_count > 0 ? P.rating : null, avg = rt ? Number(rt.avg_rating) : 0, n = rt ? rt.review_count : 0, dist = P.dist || [0, 0, 0, 0, 0], mx = Math.max(1, ...dist);
    const list = P.allRv ? r : r.slice(0, 2);
    $('#reviews').innerHTML = `<section class="sec rvs"><h2>Product Ratings &amp; Reviews</h2>
      ${rt ? `<div class="rv-top"><div class="rv-big"><div class="num r${Math.round(avg)}"><b>${avg.toFixed(1)}</b>${icon('star', 22, 'filled')}</div><small>${n.toLocaleString('en-IN')} Rating${n > 1 ? 's' : ''}${r.length ? ', ' + r.filter((x) => x.review_text).length + (r.length >= 30 ? '+' : '') + ' Reviews' : ''}</small></div>
      <div class="rv-bars">${BAR.map(([s, l]) => `<div class="rv-bar"><span class="lbl">${l}</span><div class="bar"><i class="s${s}" style="width:${Math.round(dist[s - 1] / mx * 100)}%"></i></div><span class="ct">${dist[s - 1]}</span></div>`).join('')}</div></div>` : ''}
      ${P.canReview ? `<form class="card mt" data-form="review"><b>You bought this - how was it?</b><div id="stars" class="row" style="font-size:30px" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((i) => `<button type="button" class="ibtn" data-act="star" data-v="${i}" role="radio" aria-checked="false" aria-label="${i} stars">${icon('star', 28)}</button>`).join('')}</div><input type="hidden" name="rating" value="0"><label class="f"><span class="h">Review (optional)</span><textarea name="text" maxlength="2000" rows="3"></textarea></label><label class="f"><span class="h">Add photos (optional, up to 3)</span><input type="file" name="photos" accept="image/png,image/jpeg,image/webp" multiple></label><button class="btn p">Submit review</button></form>` : ''}
      ${list.length ? list.map((x) => `<article class="rvc"><div class="row" style="gap:10px"><span class="av">${esc((x.reviewer_name || 'V')[0].toUpperCase())}</span><b>${esc(x.reviewer_name)}</b></div><div class="row" style="margin-top:8px">${rvPill(x.rating)}<span class="muted small">· Posted on ${ago(x.created_at)}</span></div>${x.review_text ? `<p>${esc(x.review_text)}</p>` : ''}${(x.image_paths || []).length ? `<div class="rvimgs">${x.image_paths.map((ip) => `<button type="button" data-act="rvzoom" data-src="${esc(rimg(ip))}" aria-label="Open photo"><img loading="lazy" src="${esc(rimg(ip))}" alt="Review photo"></button>`).join('')}</div>` : ''}<button type="button" class="helpful ${P.voted && P.voted.has(x.id) ? 'on' : ''}" data-act="voteR" data-id="${x.id}" aria-pressed="${!!(P.voted && P.voted.has(x.id))}">${icon('thumb', 20)} Helpful (${x.helpful_count || 0})</button></article>`).join('') : '<p class="muted">No reviews yet. Only customers who received this product can review it.</p>'}
      ${r.length > 2 && !P.allRv ? `<button class="linkbtn big" data-act="allRv">VIEW ALL REVIEWS ›</button>` : ''}</section>`;
  }
  Object.assign(A, {
    pimg: (b) => { P.img = +b.dataset.i; const t = $('#galtrack'); if (t) t.scrollTo({ left: P.img * t.clientWidth, behavior: 'smooth' }); $$('.thumbs button').forEach((d, k) => d.classList.toggle('on', k === P.img)); $$('#galdots i').forEach((d, k) => d.classList.toggle('on', k === P.img)); },
    copyDet: async () => { try { await navigator.clipboard.writeText((P.copy || '').toString()); toast('Details copied'); } catch (e) { toast('Could not copy', 'error'); } },
    allRv: () => { P.allRv = true; drawReviews(); },
    rvzoom: (b) => modal('Photo', `<img src="${esc(b.dataset.src)}" alt="Review photo" style="width:100%;border-radius:12px">`),
    voteR: async (b) => { if (!S.user) { sessionStorage.setItem('after', location.hash.slice(1)); location.hash = '/login'; return; } try { const { data, error } = await window.sb.rpc('vote_review', { p_review: b.dataset.id }); if (error) throw error; const rv = P.reviews.find((x) => x.id === b.dataset.id); if (rv) rv.helpful_count = data.count; if (data.voted) P.voted.add(b.dataset.id); else P.voted.delete(b.dataset.id); drawReviews(); } catch (e) { toast(errMsg(e, 'Could not save your vote'), 'error'); } },
    shareP: async () => { const url = location.href, data = { title: P.p.title, text: P.p.title + ' - ' + (S.settings.brand_name || ''), url }; try { if (navigator.share) { await navigator.share(data); return; } await navigator.clipboard.writeText(url); toast('Link copied'); } catch (e) { if (!e || e.name !== 'AbortError') toast('Copy this page address to share it', 'info'); } }, pcolor: (b) => { P.color = P.color === b.dataset.v ? null : b.dataset.v; P.qty = 1; drawPdp(); }, psize: (b) => { P.size = P.size === b.dataset.v ? null : b.dataset.v; P.qty = 1; drawPdp(); },
    pqty: (b) => { const v = selVar(); const m = Math.min(S.settings.max_qty_per_item, v ? v.stock_quantity : 1); P.qty = Math.max(1, Math.min(m, P.qty + +b.dataset.d)); drawPdp(); },
    zoom: (b) => modal(P.p.title, `<img src="${esc(pimg((P.imgs[+(b && b.dataset.i) || P.img] || {}).storage_path))}" alt="" style="width:100%;border-radius:12px">`, true),
    sizeguide: () => modal('Size guide', '<p class="muted small">Body measurements in inches.</p><div class="tw"><table><tr><th>Size</th><th>Chest</th><th>Waist</th><th>Hip</th></tr>' + [['XS', 32, 26, 34], ['S', 34, 28, 36], ['M', 36, 30, 38], ['L', 38, 32, 40], ['XL', 40, 34, 42], ['XXL', 42, 36, 44]].map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') + '</table></div>'),
    wishP: async () => { await Wish.toggle(P.p.id); drawPdp(); },
    addBag: async (b) => { const v = checkSel(); if (!v) return; btnBusy(b, true); await Cart.add(v.id, P.qty, P.p.id); btnBusy(b, false); toast('Added to your bag'); },
    buyNow: async (b) => { const v = checkSel(); if (!v) return; btnBusy(b, true); await Cart.add(v.id, P.qty, P.p.id); location.hash = '/checkout'; },
    checkPin: async () => { const pin = $('#pin').value.trim(), m = $('#pinmsg'); if (!PIN_RE.test(pin)) { m.className = 'grow small err'; m.textContent = 'Enter a valid 6-digit PIN code'; return; } const { data, error } = await window.sb.rpc('check_pincode', { p_pin: pin }); if (error) { m.className = 'grow small err'; m.textContent = 'Could not check right now'; return; } m.className = 'grow small ' + (!data.configured || data.serviceable ? 'ok' : 'err'); m.textContent = !data.configured ? 'We will confirm delivery for this PIN at checkout.' : data.serviceable ? `Delivery by ${new Date(Date.now() + data.eta_days * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${data.city ? ' to ' + data.city : ''}${data.cod_available ? ' · Cash on Delivery available' : ''}` : 'Sorry, we do not deliver to this PIN code yet.'; },
    star: (b) => { const n = +b.dataset.v; $('[name=rating]', b.closest('form')).value = n; $$('#stars button').forEach((x, i) => { x.innerHTML = icon('star', 28, i < n ? 'filled gold' : ''); x.setAttribute('aria-checked', i + 1 === n); }); },
  });
  function checkSel() { const v = selVar(); if (P.sizes.length && !P.size) return toast('Please select a size', 'error'), null; if (P.colors.length && !P.color) return toast('Please select a color', 'error'), null; if (!v) return toast('This combination is unavailable', 'error'), null; if (v.stock_quantity < 1) return toast('Sorry, this variant is out of stock', 'error'), null; return v; }
  F.review = async (form) => { const d = formData(form); if (+d.rating < 1) return toast('Choose a star rating', 'error');
    const paths = []; const files = Array.from(form.querySelector('input[name=photos]') ? form.querySelector('input[name=photos]').files : []).slice(0, 3);
    for (const f of files) { if (f.size > 3 * 1048576) return toast('Each photo must be under 3 MB', 'error'); const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[f.type]; if (!ext) return toast('Photos must be PNG, JPG or WebP', 'error'); const path = S.user.id + '/' + uuid() + '.' + ext; const up = await window.sb.storage.from('review-images').upload(path, f, { contentType: f.type }); if (up.error) return toast(errMsg(up.error, 'Photo upload failed'), 'error'); paths.push(path); }
    const { error } = await window.sb.from('product_reviews').insert({ product_id: P.p.id, user_id: S.user.id, order_item_id: P.canReview, rating: +d.rating, review_text: d.text || null, image_paths: paths, reviewer_name: ((S.user.user_metadata || {}).full_name || 'Verified buyer').split(' ')[0] }); if (error) return toast(errMsg(error), 'error'); toast('Thanks for your review!'); R.render(); };

  /* ================= WISHLIST PAGE ================= */
  R.add('/wishlist', async () => { if (!S.wish.length) return `<div class="page"><h1 class="mb">Wishlist</h1>${empty('Your wishlist is empty', 'Tap the heart on anything you like to save it here.', '<a class="btn p" href="#/">Discover styles</a>')}</div>`; const items = await byIds(S.wish); return `<div class="page"><h1 class="mb">Wishlist</h1><div class="pgrid">${items.map(pcard).join('')}</div></div>`; });

  /* ================= CART PAGE ================= */
  const quote = async (coupon) => { const { data, error } = await window.sb.rpc('quote_order', { p_items: Cart.payload(), p_coupon: coupon || null }); if (error) throw error; return data; };
  const priceBox = (q) => `<div class="card"><h3 style="font-size:17px">Price details</h3><div class="row between mt"><span>Bag total</span><span>${inr(q.subtotal)}</span></div>${q.discount > 0 ? `<div class="row between ok"><span>Coupon ${esc((q.coupon || {}).code)}</span><span>−${inr(q.discount)}</span></div>` : ''}<div class="row between"><span>Shipping</span><span>${q.shipping > 0 ? inr(q.shipping) : '<b class="ok">FREE</b>'}</span></div><div class="row between muted small"><span>Includes GST</span><span>${inr2(q.tax)}</span></div><div class="row between mt" style="border-top:1px solid var(--line);padding-top:10px;font-weight:700;font-size:17px"><span>Total payable</span><span>${inr(q.total)}</span></div></div>`;
  R.add('/cart', async () => {
    if (!Cart.items.length) return `<div class="page"><h1 class="mb">Shopping bag</h1>${empty('Your bag is empty', 'Add something you love and it will show up here.', '<a class="btn p" href="#/">Continue shopping</a>')}</div>`;
    const coupon = sessionStorage.getItem('coupon'); let q; try { q = await quote(coupon); } catch (e) { return `<div class="page"><h1 class="mb">Shopping bag</h1>${Net.isNetErr(e) || Net.offline ? empty('You are offline', 'Your bag is saved on this device. Live prices and stock need a connection, so checkout is paused until you are back online.', '<button class="btn p" data-act="netRetry">Retry</button>', 'wifi-off') : empty('Could not refresh your bag', errMsg(e))}</div>`; }
    const bad = new Map(q.errors.filter((e) => e.variant_id).map((e) => [e.variant_id, e]));
    return `<div class="page"><h1 class="mb">Shopping bag <span class="muted" style="font-size:15px">(${Cart.count()})</span></h1><div class="cols2"><div>
      ${q.lines.map((l) => `<div class="card line-item mb"><a href="#/product/${esc(l.slug)}"><img src="${esc(pimg(l.image))}" alt="${esc(l.title)}"></a><div class="grow"><a href="#/product/${esc(l.slug)}"><b>${esc(l.title)}</b></a><div class="small muted">Sold by ${esc(l.seller_name)}</div><div class="small">${esc([l.size && 'Size: ' + l.size, l.color].filter(Boolean).join(' · '))}</div><div><b>${inr(l.unit_price)}</b> ${l.original_price > l.unit_price ? `<s class="muted small">${inr(l.original_price)}</s>` : ''}</div>
        <div class="row between mt"><div class="qty"><button data-act="cqty" data-v="${l.variant_id}" data-q="${l.quantity - 1}" aria-label="Decrease">−</button><span>${l.quantity}</span><button data-act="cqty" data-v="${l.variant_id}" data-q="${l.quantity + 1}" ${l.quantity >= l.stock ? 'disabled' : ''} aria-label="Increase">+</button></div><b>${inr(l.line_total)}</b><button class="btn sm o-d" data-act="cqty" data-v="${l.variant_id}" data-q="0">Remove</button></div></div></div>`).join('')}
      ${Cart.items.filter((i) => bad.has(i.variantId)).map((i) => `<div class="notice red mb row between"><span>${esc(bad.get(i.variantId).message)}</span><button class="btn sm" data-act="cqty" data-v="${i.variantId}" data-q="0">Remove</button></div>`).join('')}<a class="linkbtn" href="#/">${icon('chevron-left',16)} Continue shopping</a></div>
      <div><div class="card mb"><b>${icon('tag',18)} Coupon</b>${q.coupon && q.coupon.applied ? `<div class="row between mt notice green"><span><b>${esc(q.coupon.code)}</b> applied</span><button class="linkbtn" data-act="rmCoupon">Remove</button></div>` : `<form class="row mt" data-form="coupon"><input name="code" placeholder="Enter code" maxlength="30" style="text-transform:uppercase" aria-label="Coupon code"><button class="btn">Apply</button></form>`}${q.coupon && !q.coupon.applied ? `<p class="err small">${esc(q.coupon.error)}</p>` : ''}${S.user ? '' : '<p class="small muted">Log in to use a coupon.</p>'}</div>
      ${priceBox(q)}<button class="btn p full mt" data-act="toCheckout" ${q.errors.length || !q.lines.length ? 'disabled' : ''}>${S.user ? 'Proceed to checkout' : 'Log in to checkout'}</button>${q.errors.length ? '<p class="err small center">Fix the highlighted items to continue.</p>' : ''}</div></div></div>`;
  });
  Object.assign(A, { cqty: async (b) => { await Cart.set(b.dataset.v, +b.dataset.q); R.render(); }, rmCoupon: () => { sessionStorage.removeItem('coupon'); R.render(); }, toCheckout: () => { if (!S.user) { sessionStorage.setItem('after', '/checkout'); location.hash = '/login'; } else location.hash = '/checkout'; } });
  F.coupon = (form) => { if (!S.user) { sessionStorage.setItem('after', '/cart'); location.hash = '/login'; return; } const c = formData(form).code.toUpperCase(); if (c) { sessionStorage.setItem('coupon', c); R.render(); } };

  /* ================= CHECKOUT (Cash on Delivery) ================= */
  let CK = null;
  R.add('/checkout', async () => {
    if (!S.user) { sessionStorage.setItem('after', '/checkout'); location.hash = '/login'; return ''; }
    if (!Cart.items.length) return `<div class="page">${empty('Nothing to check out', 'Your bag is empty.', '<a class="btn p" href="#/">Start shopping</a>')}</div>`;
    if (Net.offline) return `<div class="page">${empty('Checkout needs an internet connection', 'Prices and stock are verified by the server when you order. Nothing can be ordered or paid offline.', '<button class="btn p" data-act="netRetry">Retry</button>', 'wifi-off')}</div>`;
    const [q, ad] = await Promise.all([quote(sessionStorage.getItem('coupon')), window.sb.from('addresses').select('*').order('is_default', { ascending: false }).order('created_at', { ascending: false })]);
    window.sb.rpc('track_event', { p_event: 'begin_checkout' }).then(() => {}, () => {});
    CK = { q, addrs: ad.data || [], sel: null, step: 1, key: CK && CK.key ? CK.key : uuid() }; const d = CK.addrs.find((a) => a.is_default) || CK.addrs[0]; CK.sel = d ? d.id : null;
    return { html: '<div class="page ck-page" id="ck"></div>', mount: drawCk };
  });
  function drawCk() {
    const { q, addrs } = CK, cod = S.settings.cod_enabled && q.total <= S.settings.cod_max_order_value, online = S.settings.online_payments_enabled === true || S.settings.online_payments_enabled === 'true';
    if (!online) CK.method = 'cod'; else if (!CK.method) CK.method = 'online'; if (CK.method === 'cod' && !cod && online) CK.method = 'online';
    const isOn = CK.method === 'online', canPay = isOn ? online : cod, step = CK.step || 1, n = q.lines.reduce((s, l) => s + l.quantity, 0);
    const head = (title, back) => `<div class="ckh">${back}<b>${title}</b><span class="stepchip">STEP ${step}/2</span></div>`;
    const bar = (btn) => `<div class="ckbar"><div class="in"><div class="tot"><b>${inr(q.total)}</b><button class="linkbtn" data-act="ckDetails">VIEW PRICE DETAILS</button></div>${btn}</div></div>`;
    const opt = (val, title, sub, en, ic) => { const on = CK.method === val; return `<label class="opt ${on ? 'on' : ''} ${en ? '' : 'off'}"><div class="op"><b>${inr(q.total)}</b></div><div class="ot grow"><b>${icon(ic, 18)} ${title}</b><small>${sub}</small></div><input type="radio" class="rad" name="pay" value="${val}" data-act="pickPay" ${on ? 'checked' : ''} ${en ? '' : 'disabled'} aria-label="${title}"></label>`; };
    if (step === 1) {
      $('#ck').innerHTML = `${head('DELIVERY ADDRESS', `<a class="ibtn" href="#/cart" aria-label="Back to bag">${icon('chevron-left', 22)}</a>`)}<div class="ckbody">
        <section class="card mb"><div class="row between"><b>${icon('pin', 18)} Deliver to</b><button class="btn sm" data-act="addrForm">+ Add new</button></div>${addrs.length ? addrs.map((a) => `<label class="card mt row addr ${CK.sel === a.id ? 'on' : ''}"><input type="radio" class="rad" name="addr" value="${a.id}" data-act="pickAddr" ${CK.sel === a.id ? 'checked' : ''}><span class="small"><b>${esc(a.full_name)}</b> <span class="badge">${esc(a.address_type)}</span><br>${esc(a.address_line)}${a.landmark ? ', ' + esc(a.landmark) : ''}<br>${esc(a.city)}, ${esc(a.state)} – ${esc(a.postal_code)}<br><span class="muted">Mobile: ${esc(a.phone)}</span></span></label>`).join('') : '<p class="muted">Add an address to continue.</p>'}</section>
        <section class="card mb"><b>Review items (${n})</b>${q.lines.map((l) => `<div class="row mt"><img src="${esc(pimg(l.image))}" alt="" style="width:56px;height:70px;object-fit:cover;border-radius:4px"><div class="grow small"><b>${esc(l.title)}</b><br><span class="muted">${esc([l.size && 'Size: ' + l.size, l.color].filter(Boolean).join(' · '))}${l.size || l.color ? ' · ' : ''}Qty: ${l.quantity}</span></div><b>${inr(l.line_total)}</b></div>`).join('')}${q.errors.map((e) => `<p class="err small">${esc(e.message)} - <a href="#/cart"><u>update bag</u></a></p>`).join('')}</section>
        <section class="card"><b>Delivery</b><p class="muted small" style="margin:6px 0 0">Standard delivery · ${q.shipping ? inr(q.shipping) : 'Free'}</p></section></div>
        ${bar(`<button class="btn p grow" data-act="ckNext" ${q.errors.length || !CK.sel ? 'disabled' : ''}>Continue</button>`)}`;
      return;
    }
    $('#ck').innerHTML = `${head('PAYMENT METHOD', `<button class="ibtn" data-act="ckBack" aria-label="Back to address">${icon('chevron-left', 22)}</button>`)}<div class="ckbody">
      ${opt('online', 'Pay Online', online ? 'UPI, cards, netbanking · secure payment by Razorpay' : 'Currently unavailable', online, 'card')}
      ${opt('cod', 'Cash on Delivery', cod ? 'Pay when your order arrives' : !S.settings.cod_enabled ? 'Currently unavailable' : 'Not available above ' + inr(S.settings.cod_max_order_value), cod, 'banknote')}
      <details class="pdet" id="ckpd" ${CK.pd ? 'open' : ''}><summary>Price Details (${n} Item${n > 1 ? 's' : ''})${icon('chevron-down', 20)}</summary>${priceBox(q)}${q.coupon && !q.coupon.applied ? `<p class="err small">${esc(q.coupon.error)} <a href="#/cart"><u>Change coupon</u></a></p>` : ''}</details>
      <p class="muted small center" style="margin-top:14px">Prices and stock are re-checked securely when you confirm.</p></div>
      ${bar(`<button class="btn p grow" data-act="placeOrder" ${q.errors.length || !CK.sel || !canPay ? 'disabled' : ''}>${isOn ? 'Pay Now' : 'Place Order'}</button>`)}`;
  }
  window.afterPay = (r) => {
    if (r.status === 'paid') { location.hash = '/order-success/' + r.order_id; return; }
    if (r.status === 'unconfirmed') { toast('We are confirming your payment. If it was successful this order will update in a minute.', 'info'); location.hash = '/orders/' + r.order_id; R.render(); return; }
    toast('Payment not completed. Your order is saved - you can pay from this page within ' + ((S.settings && S.settings.online_payment_window_minutes) || 30) + ' minutes.', 'info'); location.hash = '/orders/' + r.order_id; R.render();
  };
  const addrFormHtml = (a) => { a = a || {}; return `<form data-form="address" data-id="${esc(a.id || '')}"><div class="grid2"><label class="f"><span class="h">Full name</span><input name="full_name" value="${esc(a.full_name || '')}" required autocomplete="name"></label><label class="f"><span class="h">Mobile number</span><input name="phone" value="${esc(a.phone || '')}" inputmode="numeric" maxlength="10" required></label></div>
    <label class="f"><span class="h">Address (house no., street, area)</span><input name="address_line" value="${esc(a.address_line || '')}" required></label><div class="grid2"><label class="f"><span class="h">Landmark (optional)</span><input name="landmark" value="${esc(a.landmark || '')}"></label><label class="f"><span class="h">PIN code</span><input name="postal_code" value="${esc(a.postal_code || '')}" inputmode="numeric" maxlength="6" required></label></div>
    <div class="grid2"><label class="f"><span class="h">City</span><input name="city" value="${esc(a.city || '')}" required></label><label class="f"><span class="h">State</span><input name="state" value="${esc(a.state || '')}" list="states" required></label></div><datalist id="states">${['Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Jammu and Kashmir', 'Chandigarh', 'Puducherry'].map((s) => `<option>${s}</option>`).join('')}</datalist>
    <label class="f"><span class="h">Address type</span><select name="address_type">${['Home', 'Work', 'Other'].map((t) => `<option ${a.address_type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label class="chk"><input type="checkbox" name="is_default" ${a.is_default ? 'checked' : ''}> Make this my default address</label><button class="btn p full mt">Save address</button></form>`; };
  window.addrFormHtml = addrFormHtml;
  F.address = async (form) => {
    const d = formData(form), id = form.dataset.id; if (d.full_name.length < 2) return toast('Enter full name', 'error'); if (!PHONE_RE.test(d.phone)) return toast('Enter a valid 10-digit mobile number', 'error'); if (d.address_line.length < 5) return toast('Enter the full address', 'error'); if (!PIN_RE.test(d.postal_code)) return toast('Enter a valid 6-digit PIN code', 'error'); if (!d.city || !d.state) return toast('Enter city and state', 'error');
    if (d.is_default) await window.sb.from('addresses').update({ is_default: false }).eq('user_id', S.user.id).eq('is_default', true);
    const row = { full_name: d.full_name, phone: d.phone, address_line: d.address_line, landmark: d.landmark || null, city: d.city, state: d.state, postal_code: d.postal_code, address_type: d.address_type, is_default: d.is_default, user_id: S.user.id };
    const { error } = id ? await window.sb.from('addresses').update(row).eq('id', id) : await window.sb.from('addresses').insert(row); if (error) return toast(errMsg(error), 'error'); closeModal(); toast('Address saved'); R.render();
  };
  Object.assign(A, { addrForm: () => modal('Add delivery address', addrFormHtml()), pickAddr: (el) => { CK.sel = el.value; drawCk(); }, pickPay: (el) => { CK.method = el.value; drawCk(); },
    ckNext: () => { if (!CK.sel) return toast('Choose a delivery address', 'error'); CK.step = 2; drawCk(); window.scrollTo(0, 0); }, ckBack: () => { CK.step = 1; drawCk(); window.scrollTo(0, 0); },
    ckDetails: () => { if ((CK.step || 1) === 2) { CK.pd = true; drawCk(); const el = $('#ckpd'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } else modal('Price details', priceBox(CK.q)); },
    placeOrder: async (b) => { if (Net.offline || navigator.onLine === false) return toast('Checkout needs an internet connection. Nothing was ordered.', 'error');
      if (CK && CK.method === 'online') { btnBusy(b, true, 'Opening payment…'); try {
        const r = await Pay.start({ address_id: CK.sel, items: Cart.payload(), coupon: sessionStorage.getItem('coupon'), key: CK.key });
        Cart.clearLocal(); await Cart.load(); sessionStorage.removeItem('coupon'); CK = null; window.afterPay(r);   /* the order exists on the server now (and the server emptied the bag) */
      } catch (e) {
        if (e && e.order_id) { Cart.clearLocal(); await Cart.load(); CK = null; toast(errMsg(e), 'error'); location.hash = '/orders/' + e.order_id; return; }   // order saved but gateway failed: buyer can press Pay now
        toast(errMsg(e, 'Could not start the payment. Nothing was charged.'), 'error'); if (CK && !Net.isNetErr(e)) CK.key = uuid(); btnBusy(b, false); R.render();
      } return; }
      btnBusy(b, true, 'Placing order…'); try {
      const { data, error } = await window.sb.rpc('place_order_cod', { p_address_id: CK.sel, p_items: Cart.payload(), p_coupon: sessionStorage.getItem('coupon'), p_key: CK.key });
      if (error) { const det = error.details ? ' ' + error.details : ''; throw Object.assign(error, { message: error.message }), error; }
      Cart.clearLocal(); await Cart.load(); sessionStorage.removeItem('coupon'); CK = null; window.sb.rpc('track_event', { p_event: 'purchase' }).then(() => {}, () => {}); location.hash = '/order-success/' + data.order_id;
    } catch (e) { toast(errMsg(e, 'Could not place your order. Please try again.'), 'error'); if (CK && !Net.isNetErr(e)) CK.key = uuid(); /* keep the key after a network error so a retry cannot create a duplicate order */ btnBusy(b, false); R.render(); } } });
})();
