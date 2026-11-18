/* shoppage.js - public SHOP page (#/shop/<slug>) like Meesho: banner, logo, rating, followers, product count, Follow, Share,
   plus the seller's own tools to upload the shop logo / banner and copy the share link. */
(function () {
  let SH = null;
  const shopUrl = (slug) => location.origin + location.pathname + '#/shop/' + slug;
  const SORTS = [['recommended', 'Recommended'], ['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['discount', 'Discount'], ['rating', 'Rating']];

  R.add('/shop/:slug', async (p) => {
    let sh, items = [], following = false;
    try {
      sh = await Data.query('shop:' + p.slug, async () => { const r = await window.sb.from('public_sellers').select('*').eq('shop_slug', p.slug).maybeSingle(); if (r.error) throw r.error; return r.data; }, { ttl: CACHE_POLICY.prod });
      if (sh) items = (await fetchProducts({ seller: sh.id }, 0, 200)).items;
    } catch (e) { return `<div class="page">${empty('Could not load this shop', errMsg(e))}</div>`; }
    if (!sh) return `<div class="page">${empty('Shop not found', 'This shop does not exist or is not open yet.', '<a class="btn p" href="#/">Continue shopping</a>')}</div>`;
    if (S.user && !Net.offline) { try { const { data } = await window.sb.from('shop_follows').select('seller_id').eq('seller_id', sh.id); following = !!(data && data.length); } catch (e) { /* optional */ } }
    document.title = sh.store_name;
    SH = { sh, items, following, sort: 'recommended', cat: '', rating: 0, max: 0, shown: 24, fol: Number(sh.followers_count || 0) };
    const rc = Number(sh.rating_count || 0);
    return { html: `<div class="page shop-page"><div class="shop-hd"><button class="rnd shop-share" data-act="shareShop" aria-label="Share this shop">${icon('share', 20)}</button><div class="shop-banner" ${sh.banner_path ? `style="background-image:url('${esc(pimg(sh.banner_path))}')"` : ''}></div>
      <div class="shop-logo">${sh.logo_path ? `<img src="${esc(pimg(sh.logo_path))}" alt="${esc(sh.store_name)}">` : icon('store', 34)}</div>
      <h1 class="shop-name">${esc(sh.store_name)}</h1>
      <div class="shop-stats"><div class="ss">${sh.avg_rating ? `<span class="pill blue">${sh.avg_rating} ${icon('star', 12, 'filled')}</span><small>${rc.toLocaleString('en-IN')} Rating${rc === 1 ? '' : 's'}</small>` : '<small>No ratings yet</small>'}</div><div class="ss"><b id="shfol">${SH.fol.toLocaleString('en-IN')}</b><small>Follower${SH.fol === 1 ? '' : 's'}</small></div><div class="ss"><b>${Number(sh.product_count || 0)}</b><small>Product${Number(sh.product_count) === 1 ? '' : 's'}</small></div>
        <div class="shop-btns"><button class="btn p" id="folbtn" data-act="followShop">${following ? 'Following' : 'Follow'}</button></div></div>
      ${sh.business_description ? `<p class="shop-desc">${esc(sh.business_description)}</p>` : ''}</div>
      <section class="sec"><h2>All Products</h2><div class="shop-bar" role="group" aria-label="Filter products">
        <label class="sel"><span>${icon('sort', 16)} Sort</span><select data-shopf="sort">${SORTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
        <label class="sel"><span>Category</span><select data-shopf="cat"><option value="">All</option>${[...new Map(items.filter((x) => x.category_slug).map((x) => [x.category_slug, x.category_name])).entries()].map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('')}</select></label>
        <label class="sel"><span>Rating</span><select data-shopf="rating"><option value="0">All</option><option value="4">4★ &amp; above</option><option value="3">3★ &amp; above</option></select></label>
        <label class="sel"><span>Price</span><select data-shopf="max"><option value="0">All</option><option value="299">Under ₹299</option><option value="499">Under ₹499</option><option value="999">Under ₹999</option><option value="1999">Under ₹1999</option></select></label></div>
        <div class="pgrid shop-grid" id="shopgrid"></div><div class="center mt"><button class="btn" id="shopmore" data-act="shopMore" hidden>Load more</button></div></section></div>`, mount() { drawGrid(); } };
  });

  function drawGrid() {
    if (!SH || !$('#shopgrid')) return;
    let a = SH.items.filter((x) => (!SH.cat || x.category_slug === SH.cat) && (!SH.rating || Number(x.avg_rating || 0) >= SH.rating) && (!SH.max || Number(x.min_price) <= SH.max));
    const s = SH.sort, by = (f, d) => (x, y) => d * (f(x) - f(y));
    if (s === 'newest') a.sort(by((x) => +new Date(x.created_at), -1)); else if (s === 'price_asc') a.sort(by((x) => +x.min_price, 1)); else if (s === 'price_desc') a.sort(by((x) => +x.min_price, -1)); else if (s === 'discount') a.sort(by((x) => +x.discount_pct, -1)); else if (s === 'rating') a.sort(by((x) => +(x.avg_rating || 0), -1));
    $('#shopgrid').innerHTML = a.length ? a.slice(0, SH.shown).map(pcard).join('') : `<div style="grid-column:1/-1">${empty('No products found', 'Try changing the filters.')}</div>`;
    const mb = $('#shopmore'); if (mb) mb.hidden = a.length <= SH.shown;
  }

  document.addEventListener('change', (e) => { const t = e.target; if (!SH || !t.dataset || !t.dataset.shopf) return; const k = t.dataset.shopf; SH[k] = (k === 'rating' || k === 'max') ? +t.value : t.value; SH.shown = 24; drawGrid(); });

  Object.assign(A, {
    shopMore: () => { SH.shown += 24; drawGrid(); },
    followShop: async (b) => {
      if (!S.user) { sessionStorage.setItem('after', location.hash.slice(1)); location.hash = '/login'; return; }
      btnBusy(b, true, '…');
      try { const { data, error } = await window.sb.rpc('toggle_follow', { p_seller: SH.sh.id }); if (error) throw error; SH.following = data; SH.fol += data ? 1 : -1; const f = $('#shfol'); if (f) f.textContent = SH.fol.toLocaleString('en-IN'); b.textContent = data ? 'Following' : 'Follow'; }
      catch (e) { b.textContent = SH.following ? 'Following' : 'Follow'; toast(errMsg(e, 'Could not update'), 'error'); }
      btnBusy(b, false); b.textContent = SH.following ? 'Following' : 'Follow';
    },
    shareShop: async () => { const url = shopUrl(SH.sh.shop_slug), data = { title: SH.sh.store_name, text: 'Shop at ' + SH.sh.store_name, url }; try { if (navigator.share) { await navigator.share(data); return; } await navigator.clipboard.writeText(url); toast('Shop link copied'); } catch (e) { if (!e || e.name !== 'AbortError') toast('Copy this page address to share', 'info'); } },
    copyShopLink: async (b) => { try { await navigator.clipboard.writeText(b.dataset.url); toast('Shop link copied'); } catch (e) { toast('Could not copy - select the link and copy it', 'info'); } },
    shareMyShop: async (b) => { try { if (navigator.share) { await navigator.share({ title: b.dataset.name, url: b.dataset.url }); return; } await navigator.clipboard.writeText(b.dataset.url); toast('Shop link copied'); } catch (e) { if (!e || e.name !== 'AbortError') toast('Could not share', 'error'); } },
  });

  /* ---- seller: upload shop logo / banner ---- */
  const sniff = async (file) => { const b = new Uint8Array(await file.slice(0, 12).arrayBuffer()), h = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(''); if (h.startsWith('89504e470d0a1a0a')) return ['png', 'image/png']; if (h.startsWith('ffd8ff')) return ['jpg', 'image/jpeg']; if (h.startsWith('52494646') && h.slice(16, 24) === '57454250') return ['webp', 'image/webp']; return null; };
  document.addEventListener('change', async (e) => {
    const t = e.target; if (!t.dataset || !t.dataset.shopimg || !S.user) return;
    const kind = t.dataset.shopimg, f = t.files[0]; t.value = ''; if (!f) return;
    if (f.size > 5 * 1048576) return toast('Picture is larger than 5 MB', 'error');
    const ty = await sniff(f); if (!ty) return toast('Use a PNG, JPG or WebP picture', 'error');
    toast('Uploading…', 'info');
    const path = S.user.id + '/shop/' + kind + '-' + uuid() + '.' + ty[0];
    const up = await window.sb.storage.from('product-images').upload(path, f, { contentType: ty[1] }); if (up.error) return toast(errMsg(up.error, 'Upload failed'), 'error');
    const { error } = await window.sb.from('seller_profiles').update(kind === 'logo' ? { logo_path: path } : { banner_path: path }).eq('user_id', S.user.id);
    if (error) return toast(errMsg(error, 'Could not save'), 'error');
    toast(kind === 'logo' ? 'Shop logo updated' : 'Shop banner updated'); R.render();
  });

  window.shopTools = (d) => {
    const url = d.shop_slug ? shopUrl(d.shop_slug) : '';
    return `<div class="card mt" style="max-width:520px"><h3 class="mb">Shop page (what customers see)</h3>
      <div class="shop-banner prev" ${d.banner_path ? `style="background-image:url('${esc(pimg(d.banner_path))}')"` : ''}></div>
      <div class="row" style="margin-top:-30px;padding-left:14px;gap:12px;align-items:flex-end"><div class="shop-logo prev">${d.logo_path ? `<img src="${esc(pimg(d.logo_path))}" alt="">` : icon('store', 30)}</div></div>
      <div class="row wrap mt"><label class="btn sm" style="cursor:pointer">Change logo<input type="file" data-shopimg="logo" accept="image/png,image/jpeg,image/webp" hidden></label><label class="btn sm" style="cursor:pointer">Change banner<input type="file" data-shopimg="banner" accept="image/png,image/jpeg,image/webp" hidden></label></div>
      <p class="small muted">Logo: square picture. Banner: wide picture, about 1200 x 400. PNG, JPG or WebP up to 5 MB.</p>
      ${url ? `<h4 style="margin:14px 0 6px">Your shop link</h4><input readonly value="${esc(url)}" onfocus="this.select()" aria-label="Shop link"><div class="row wrap mt"><button class="btn sm p" data-act="copyShopLink" data-url="${esc(url)}">Copy link</button><button class="btn sm" data-act="shareMyShop" data-url="${esc(url)}" data-name="${esc(d.store_name)}">Share</button><a class="btn sm" href="#/shop/${esc(d.shop_slug)}">View my shop</a></div>${d.approval_status !== 'approved' ? '<p class="small err">Your shop is visible to customers only after approval.</p>' : ''}` : '<p class="small err">Shop link is not ready yet. Ask the admin to run migration_v6.sql.</p>'}</div>`;
  };
})();
