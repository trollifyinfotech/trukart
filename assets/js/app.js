/* app.js - router, page chrome (header/footer/nav), global event handling, startup */
(function () {
  window.A = {}; window.F = {};
  window.R = {
    routes: [], timers: [], token: 0,
    add(pattern, fn) { const keys = []; const re = new RegExp('^' + pattern.replace(/:[a-z]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }).replace(/\*/g, '.*') + '$'); this.routes.push({ re, keys, fn }); },
    timer(t) { this.timers.push(t); },
    parse() { let h = location.hash.slice(1); if (!h.startsWith('/')) h = '/' + h.replace(/^\/?/, ''); const [path, qs] = h.split('?'); return { path: path.replace(/\/+$/, '') || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) }; },
    keys: new Set(), noteKey(k) { this.keys.add(k); },
    async render(opt) {
      const soft = !!(opt && opt.soft); const my = ++this.token; this.timers.forEach(clearInterval); this.timers = []; this.keys = new Set(); if (!soft) this.loadedMore = false;
      const main = $('#main'); const { path, query } = this.parse(); let hit = null, params = {};
      for (const r of this.routes) { const m = path.match(r.re); if (m) { hit = r; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; } }
      closeModal(); $('#filters') && $('#filters').classList.remove('open');
      if (!window.sb || window.SB_FATAL) { main.innerHTML = setupNeeded(); return; }
      if (!soft) main.innerHTML = '<div class="page">' + skeletonGrid(4) + '</div>';
      try {
        const out = hit ? await hit.fn(params, query) : `<div class="page">${empty('Page not found', 'The page you are looking for does not exist.', '<a class="btn p" href="#/">Back to home</a>')}</div>`;
        if (my !== this.token) return; if (out === '' || out === undefined) return;
        if (typeof out === 'string') main.innerHTML = out; else { main.innerHTML = out.html; out.mount && out.mount(); }
      } catch (e) { if (my !== this.token) return; if (soft) return; main.innerHTML = e.message === 'OFFLINE_NO_CACHE' ? `<div class="page">${empty('Not available offline', errMsg(e), '<button class="btn p" data-act="netRetry">Retry</button>', 'wifi-off')}</div>` : `<div class="page">${empty('Something went wrong', errMsg(e), '<button class="btn p" data-act="reload">Try again</button>')}</div>`; }
      if (!soft) window.scrollTo(0, 0); $$('nav.bottom a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + path || (a.dataset.m && path.startsWith(a.dataset.m))));
    },
  };
  window.setupNeeded = () => {
    const msg = window.SB_CONFIG_ERROR || window.SB_FATAL || 'The website could not connect to Supabase.';
    const hint = window.SB_CONFIG_ERROR ? 'Open <b>supabase/supabase.js</b> in Notepad, enter your Supabase Project URL and Publishable (anon) key, save, then refresh this page.'
      : window.SB_FATAL_KIND === 'schema' ? 'Open the Supabase <b>SQL Editor</b>, paste the whole file <b>database/setup.sql</b> and press <b>Run</b> (once). Then refresh this page.'
      : 'Check your internet connection and your Supabase project (is it paused?). Then refresh this page.';
    return `<div class="page"><div class="card" style="max-width:560px;margin:30px auto"><h2>Setup needed</h2><p class="err"><b>${esc(msg)}</b></p><p class="muted">${hint}</p><p class="small muted">Full steps are in README.txt.</p></div></div>`;
  };
  /* one cheap request at startup to give a precise message instead of a broken page */
  window.dbCheck = async () => {
    const netFail = async (msg) => {   // network failure: fine if we already have saved content (offline mode), fatal on a first-ever visit
      if (await Data.hasAny()) { Net.mark(false); return; }
      window.SB_FATAL_KIND = 'net'; window.SB_FATAL = msg;
    };
    try {
      const { error, status } = await window.sb.from('store_settings').select('key').limit(1);
      if (!error) return;
      if (error.code === 'PGRST205' || error.code === '42P01' || /schema cache|does not exist/i.test(error.message || '')) { window.SB_FATAL_KIND = 'schema'; window.SB_FATAL = 'Connected to Supabase, but the database tables are missing.'; }
      else if (status === 401 || status === 403 || /Invalid API key|JWT/i.test(error.message || '')) { window.SB_FATAL_KIND = 'key'; window.SB_FATAL = 'Supabase rejected the API key. Check SUPABASE_ANON_KEY in supabase/supabase.js (and that it belongs to this project).'; }
      else if (Net.isNetErr(error) || navigator.onLine === false) await netFail('Could not reach Supabase. You are offline, or SUPABASE_URL is wrong, and nothing has been saved on this device yet.');
      else { window.SB_FATAL_KIND = 'net'; window.SB_FATAL = 'Could not talk to Supabase: ' + (error.message || 'unknown error'); }
    } catch (e) { await netFail('Could not reach Supabase. Check your internet connection and SUPABASE_URL.'); }
  };

  /* ---------- chrome ---------- */
  window.renderChrome = async () => {
    const cats = window.sb && !window.SB_FATAL ? await getCats().catch(() => []) : [];
    const top = cats.filter((c) => !c.parent_id);
    const sfc = window.sb && !window.SB_FATAL ? await SF.load().catch(() => null) : null, showMenu = !sfc || sfc.menu.enabled !== false;   // Admin > Storefront > "Show the top category menu"
    $('#hdr').innerHTML = `<div class="in"><a class="logo" href="#/" aria-label="${esc(S.settings.brand_name)} home">${logoHtml(false)}</a>
      <div class="searchbox"><div class="sfield"><span class="sico">${icon('search', 18)}</span><input id="q" type="search" placeholder="Search for products, brands and more" aria-label="Search products" autocomplete="off"></div><div class="sugg" id="sugg" hidden></div></div><span id="hdr-icons" class="row" style="gap:0"></span></div>
      <div class="mobsearch" id="msearch"><div class="sfield"><span class="sico">${icon('search', 18)}</span><input id="q2" type="search" placeholder="Search for products, brands and more" aria-label="Search products" autocomplete="off"></div><div class="sugg" id="sugg2" hidden></div></div>
      ${showMenu ? SF.catbar(cats) : ''}`;
    if (window.Music) { Music.mount(); Music.ensure(); }
    $('#foot').innerHTML = `<div class="cols"><div><a class="logo" href="#/">${logoHtml(true)}</a><p class="muted">${esc(S.settings.brand_tagline)}</p></div><div><h4>Customer support</h4><a href="#/contact">Contact us</a><a href="#/orders">Track your order</a><a href="#/shipping-policy">Shipping policy</a><a href="#/returns-policy">Returns &amp; refunds</a></div><div><h4>Useful links</h4><a href="#/categories">All categories</a><a href="#/privacy-policy">Privacy policy</a><a href="#/terms">Terms &amp; conditions</a><a href="#/seller/register">Sell on ${esc(S.settings.brand_name)}</a></div><div><h4>Reach us</h4><span class="muted">${esc(S.settings.contact_email)}<br>${esc(S.settings.contact_phone)}<br>${esc(S.settings.contact_address)}</span></div></div><p class="center muted small">© ${new Date().getFullYear()} ${esc(S.settings.brand_name)}</p>`;
    updateChrome();
  };
  window.updateChrome = () => {
    const ic = $('#hdr-icons'); if (!ic) return; const n = Cart.count(), w = S.wish.length;
    // The menu only decides which links to SHOW. Admin/seller pages re-check on the server (RLS + SQL functions).
    const menu = S.user ? `<div class="hello">${esc(S.user.email)}</div><a href="#/account">${icon('user',16)} My account</a><a href="#/orders">${icon('package',16)} My orders</a><a href="#/wishlist">${icon('heart',16)} Wishlist</a>${isSeller() ? `<a href="#/seller">${icon('store',16)} Seller dashboard</a>` : S.seller ? '<a href="#/seller">Seller application</a>' : '<a href="#/seller/apply">Become a seller</a>'}${isAdmin() ? `<a href="#/admin">${icon('shield',16)} Admin dashboard</a>` : ''}<hr><button data-act="logout">${icon('log-out',16)} Log out</button>` : `<a href="#/login">${icon('log-in',16)} Log in</a><a href="#/register">Create account</a><hr><a href="#/seller/register">Sell on ${esc(S.settings.brand_name)}</a>`;
    ic.innerHTML = `<a class="ibtn" href="#/wishlist" aria-label="Wishlist, ${w} items">${icon('heart',22)}${w ? `<span class="cnt">${w}</span>` : ''}</a><span class="acct"><button class="ibtn" data-act="acctMenu" aria-haspopup="true" aria-expanded="false" aria-label="${S.user ? 'Account menu' : 'Log in menu'}">${icon('user',22)}</button><div class="acct-menu" id="acctmenu" hidden>${menu}</div></span><a class="ibtn" href="#/cart" aria-label="Shopping bag, ${n} items">${icon('bag',22)}${n ? `<span class="cnt">${n}</span>` : ''}</a>`;
    $('#bnav').innerHTML = `<a href="#/">${icon('home',22)}Home</a><a href="#/categories">${icon('grid',22)}Categories</a><a href="#/wishlist">${icon('heart',22)}Wishlist</a><a href="#${S.user ? '/account' : '/login'}">${icon('user',22)}Profile</a>`;
  };
  /* search + suggestions */
  let st; const suggest = async (input, box) => {
    clearTimeout(st); const v = sanitizeQ(input.value);
    st = setTimeout(async () => {
      if (v.length < 2) { const rs = L.rd('recent_search', []); box.innerHTML = rs.length ? rs.map((r) => `<button data-act="doSearch" data-q="${esc(r)}">${icon('clock',14)} ${esc(r)}</button>`).join('') + '<button data-act="clearRecent" class="linkbtn">Clear recent searches</button>' : ''; box.hidden = !rs.length || document.activeElement !== input; return; }
      const { data } = await window.sb.from('v_products').select('title,brand_name').ilike('search_document', '%' + v + '%').limit(6);
      box.innerHTML = (data || []).map((r) => `<button data-act="doSearch" data-q="${esc(r.title)}">${icon('search',14)} ${esc(r.title)}${r.brand_name ? ' <span class="muted">· ' + esc(r.brand_name) + '</span>' : ''}</button>`).join(''); box.hidden = !(data || []).length;
    }, 220);
  };
  document.addEventListener('input', (e) => { if (e.target.id === 'q') suggest(e.target, $('#sugg')); if (e.target.id === 'q2') suggest(e.target, $('#sugg2')); });
  document.addEventListener('focusin', (e) => { if (e.target.id === 'q') suggest(e.target, $('#sugg')); if (e.target.id === 'q2') suggest(e.target, $('#sugg2')); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.target.id === 'q' || e.target.id === 'q2') && e.target.value.trim()) A.doSearch({ dataset: { q: e.target.value.trim() } }); });
  Object.assign(A, {
    doSearch: (el) => { const q = el.dataset.q; L.addRecent('recent_search', q, 8); $('#sugg').hidden = $('#sugg2').hidden = true; $('#q').value = $('#q2').value = q; location.hash = '/search?q=' + encodeURIComponent(q); },
    clearRecent: () => { L.wr('recent_search', []); $('#sugg').hidden = $('#sugg2').hidden = true; }, msearch: () => { $('#msearch').classList.toggle('open'); $('#q2').focus(); },
    wish: (el, ev) => { ev.preventDefault(); Wish.toggle(el.dataset.id); }, closeModal, reload: () => R.render(), filters: () => $('#filters').classList.toggle('open'),
    acctMenu: (b) => { const m = $('#acctmenu'); m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden)); },
    netRetry: () => Net.retry().then(() => R.render()),
    logout: async () => { Priv.clear(); await window.sb.auth.signOut(); toast('Logged out'); location.hash = '/'; },
  });
  document.addEventListener('click', (e) => {
    const am = $('#acctmenu'); if (am && !am.hidden && !e.target.closest('.acct')) am.hidden = true;
    const el = e.target.closest('[data-act]'); if (!el) { if (!e.target.closest('.sugg,#q,#q2')) { const a = $('#sugg'), b = $('#sugg2'); a && (a.hidden = true); b && (b.hidden = true); } return; }
    if (el.tagName === 'INPUT') return; const fn = A[el.dataset.act]; if (fn) { const r = fn(el, e); if (r && r.catch) r.catch((x) => toast(errMsg(x), 'error')); }
  });
  document.addEventListener('change', (e) => { const el = e.target.closest('input[data-act]'); if (el && A[el.dataset.act]) A[el.dataset.act](el, e); });
  document.addEventListener('submit', async (e) => { const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); const fn = F[f.dataset.form]; if (!fn) return; const b = $('button:not([type=button])', f); if (b && b.disabled) return; btnBusy(b, true); try { await fn(f, e); } catch (x) { toast(errMsg(x), 'error'); } finally { if (document.body.contains(b)) btnBusy(b, false); } });

  /* ---------- startup ---------- */
  /* ---------- service worker (offline app shell). Only on https or localhost - browsers refuse it elsewhere. ---------- */
  const registerSW = () => {
    if (!('serviceWorker' in navigator)) return console.info('[sw] not supported in this browser');
    if (!(location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))) return console.info('[sw] not registered: needs https or http://localhost');
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then((r) => console.info('[sw] registered, scope', r.scope), (e) => console.warn('[sw] registration failed:', e.message)));
  };
  /* ---------- live refresh: when cached data turns out to be outdated, redraw the current page in place (no full reload) ---------- */
  const SOFT_OK = /^(\/|\/categories|\/c\/[^/]+|\/search|\/product\/[^/]+|\/wishlist)$/;
  let softT = null;
  const softRefresh = () => {
    if (!SOFT_OK.test(R.parse().path) || R.loadedMore || $('#modalbg') || ($('#filters') && $('#filters').classList.contains('open'))) return;
    const ae = document.activeElement; if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.id !== 'sortsel') return;
    R.render({ soft: true }).then(() => toast('Updated with the latest data', 'info'));
  };
  window.startApp = async () => {
    window.addEventListener('hashchange', () => R.render());
    registerSW();
    if (!window.sb) { await renderChrome(); R.render(); return; }
    await Data.init();
    await dbCheck(); if (window.SB_FATAL) { await renderChrome(); R.render(); return; }
    try {
      await loadSettings(); await loadAccount(); await Promise.all([Cart.load(), Wish.load()]);
    } catch (e) { console.warn(e); }
    window.sb.auth.onAuthStateChange(async (evt) => {
      if (evt === 'PASSWORD_RECOVERY') { await loadAccount(); location.hash = '/reset-password'; return; }
      if (evt === 'SIGNED_OUT') Priv.clear();     // private mirrors removed; public catalogue cache is kept on purpose
      if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT') { setTimeout(async () => { await loadAccount(); S.cart = []; await Promise.all([Cart.load(), Wish.load()]); updateChrome(); if (evt === 'SIGNED_IN') { Queue.flush(); const after = sessionStorage.getItem('after'); if (after && /^\/[a-z]/.test(after)) { sessionStorage.removeItem('after'); location.hash = after; } else if (R.parse().path === '/login' || R.parse().path === '/register') location.hash = '/'; } else R.render(); }, 0); }
    });
    Data.onChange((key) => {
      if (/^(cats|brands):/.test(key)) { S.cats = null; S.brands = null; renderChrome(); }
      if (key === 'settings:public') loadSettings().then(renderChrome);
      if (R.keys.has(key)) { clearTimeout(softT); softT = setTimeout(softRefresh, 400); }
    });
    // controlled background revalidation (no Realtime needed): when the tab becomes visible again, and every 3 minutes while it is visible
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !Net.offline) Data.revalidateCurrent(); });
    setInterval(() => { if (!document.hidden && !Net.offline) Data.revalidateCurrent(['plist', 'pids', 'home', 'prod']); }, 180000);
    await renderChrome(); R.render(); if (S.user) Queue.flush();
  };
})();
