/* cache.js - ONE small data layer: IndexedDB cache (stale-while-revalidate), request de-duplication,
   online/offline detection, offline action queue. Public catalogue data only - never orders, addresses, tokens or keys.
   Why sharing one cache between all users is safe: every cached query asks only for PUBLIC rows (approved products,
   active categories, public settings); RLS returns the same rows for anonymous, buyers, sellers and admins. */
(function () {
  const CACHE_VER = '7';                       // bump when cached data shapes change; old caches are wiped automatically
  const POLICY = { cats: 30 * 60e3, brands: 30 * 60e3, settings: 5 * 60e3, home: 5 * 60e3, plist: 2 * 60e3, pids: 2 * 60e3, prod: 5 * 60e3 };
  window.CACHE_POLICY = POLICY;
  const Stats = window.NetStats = { requests: 0, cacheHits: 0, dedup: 0, revalidations: 0 };

  /* ---------- tiny IndexedDB key-value store (memory fallback if IndexedDB is blocked) ---------- */
  let dbp = null; const mem = new Map(), memQ = [];
  const openDb = () => dbp || (dbp = new Promise((res) => {
    if (!window.indexedDB) return res(null);
    try { const r = indexedDB.open('veloura-cache', 1);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'k' }); if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath: 'id', autoIncrement: true }); };
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null); } catch (e) { res(null); } }));
  const run = (store, mode, fn) => openDb().then((db) => (!db ? undefined : new Promise((res, rej) => { const t = db.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }))).catch(() => undefined);
  const KV = {
    async get(k) { const db = await openDb(); return db ? run('kv', 'readonly', (s) => s.get(k)) : mem.get(k); },
    async set(k, v) { const rec = { k, v, t: Date.now() }; const db = await openDb(); if (db) await run('kv', 'readwrite', (s) => s.put(rec)); else mem.set(k, rec); },
    async all() { const db = await openDb(); return db ? (await run('kv', 'readonly', (s) => s.getAll())) || [] : [...mem.values()]; },
    async stale(k) { const db = await openDb(); if (db) { const r = await run('kv', 'readonly', (st) => st.get(k)); if (r) { r.t = 0; await run('kv', 'readwrite', (st) => st.put(r)); } } else { const r = mem.get(k); if (r) r.t = 0; } },
    async del(k) { const db = await openDb(); if (db) await run('kv', 'readwrite', (s) => s.delete(k)); else mem.delete(k); },
    async clear() { const db = await openDb(); if (db) await run('kv', 'readwrite', (s) => s.clear()); else mem.clear(); },
  };

  /* ---------- network state ---------- */
  const isNetErr = (e) => { const m = String((e && (e.message || e)) || ''); return /Failed to fetch|NetworkError|Load failed|network request failed|ERR_INTERNET|fetch failed/i.test(m) || (e && e.name === 'TypeError' && /fetch/i.test(m)); };
  const Net = window.Net = {
    offline: typeof navigator !== 'undefined' && navigator.onLine === false, isNetErr, listeners: [],
    set(off) { if (off === this.offline) return; this.offline = off; renderBar(); if (!off) { recovered(); } },
    mark(ok) { if (ok && this.offline) this.set(false); else if (!ok && !this.offline) this.set(true); },
    async retry() { renderBar('Checking connection…'); try { const { error } = await window.sb.from('store_settings').select('key').limit(1); if (error && isNetErr(error)) { this.offline = true; renderBar(); toast('Still offline. Showing saved content.', 'error'); return; } this.set(false); this.offline = false; renderBar(); } catch (e) { this.offline = true; renderBar(); } },
  };
  let barTimer = null;
  function renderBar(msg, kind) {
    const b = document.getElementById('netbar'); if (!b) return; clearTimeout(barTimer);
    if (Net.offline || msg) { b.hidden = false; b.className = 'netbar' + (kind ? ' ' + kind : ' off'); b.innerHTML = Net.offline && !msg ? `${icon('wifi-off', 16)}<span>You are offline. Showing saved content - prices and stock may be outdated. Checkout needs a connection.</span><button type="button" class="btn sm" data-act="netRetry">${icon('refresh', 14)} Retry</button>` : `${icon(kind === 'ok' ? 'check-circle' : 'refresh', 16)}<span>${esc(msg)}</span>`; }
    else b.hidden = true;
    if (kind === 'ok') barTimer = setTimeout(() => { b.hidden = true; }, 3500);
  }
  Net.bar = renderBar;
  window.addEventListener('offline', () => Net.set(true));
  window.addEventListener('online', () => { Net.retry(); });   // navigator.onLine is only a hint - retry() really pings the backend
  let probe = null; setInterval(() => { if (Net.offline && navigator.onLine !== false && !probe) { probe = Net.retry().finally(() => { probe = null; }); } }, 30000);
  async function recovered() { renderBar('Back online. Updating…', 'ok'); try { await Queue.flush(); } catch (e) { /* reported by flush */ } Data.revalidateCurrent(); }

  /* ---------- stale-while-revalidate data cache ---------- */
  const inflight = new Map(), seen = new Set(), registry = new Map(), listeners = [];
  const same = (a, b) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; } };
  const emit = (key) => listeners.forEach((f) => { try { f(key); } catch (e) { console.warn(e); } });
  function fetchStore(key, fetcher) {
    if (inflight.has(key)) { Stats.dedup++; return inflight.get(key); }          // concurrent identical requests share one call
    const p = (async () => { const v = await fetcher(); await KV.set(key, v); return v; })().finally(() => inflight.delete(key));
    inflight.set(key, p); return p;
  }
  async function revalidate(key, fetcher, rec) {
    if (Net.offline) return;                                                   // do not hammer the network while offline
    Stats.revalidations++;
    try { const v = await fetchStore(key, fetcher); if (rec && !same(v, rec.v)) emit(key); }   // only notify when data really changed
    catch (e) { if (isNetErr(e)) Net.mark(false); else console.warn('[cache] background refresh failed for', key, e && e.message); }
  }
  const Data = window.Data = {
    async init() { try { if (localStorage.getItem('cache_ver') !== CACHE_VER) { await KV.clear(); localStorage.setItem('cache_ver', CACHE_VER); } } catch (e) { /* ignore */ } },
    /** query(key, fetcher, {ttl}) -> cached value immediately if present (revalidated in background when stale or first use this session). */
    async query(key, fetcher, opt) {
      const ttl = (opt && opt.ttl) || 120000; registry.set(key, { fetcher, ttl }); if (window.R && R.noteKey) R.noteKey(key);
      if (opt && opt.force) { try { return await fetchStore(key, fetcher); } catch (e) { if (isNetErr(e)) Net.mark(false); } }   // explicit refresh after an admin save
      const rec = await KV.get(key);
      if (rec) { Stats.cacheHits++; const stale = Date.now() - rec.t >= ttl; if (stale || !seen.has(key)) { seen.add(key); revalidate(key, fetcher, rec); } return rec.v; }
      seen.add(key);
      if (Net.offline) throw new Error('OFFLINE_NO_CACHE');
      try { return await fetchStore(key, fetcher); } catch (e) { if (isNetErr(e)) { Net.mark(false); throw new Error('OFFLINE_NO_CACHE'); } throw e; }
    },
    /** Mark datasets stale after a change and refresh the ones the current page uses (no forced reload). */
    async bump(prefixes) {
      prefixes = prefixes || ['plist', 'pids', 'prod', 'home', 'cats', 'brands', 'settings'];
      await markStale(prefixes); this.revalidateCurrent(prefixes); try { bc && bc.postMessage({ type: 'bump', prefixes }); } catch (e) { /* ignore */ }
    },
    revalidateCurrent(prefixes) { const keys = (window.R && R.keys) ? [...R.keys] : []; keys.filter((k) => !prefixes || prefixes.some((p) => k.startsWith(p + ':') || k === p)).forEach((k) => { const r = registry.get(k); if (r) KV.get(k).then((rec) => revalidate(k, r.fetcher, rec)); }); },
    onChange(f) { listeners.push(f); },
    async hasAny() { return (await KV.all()).length > 0; },
    clearAll: () => KV.clear(),
    _kv: KV,
  };
  const match = (k, ps) => ps.some((p) => k.startsWith(p + ':') || k === p);
  async function markStale(ps) { const recs = await KV.all(); for (const r of recs) if (match(r.k, ps)) await KV.stale(r.k); for (const k of [...seen]) if (match(k, ps)) seen.delete(k); }
  let bc = null; try { bc = new BroadcastChannel('veloura-cache'); bc.onmessage = async (e) => { if (e.data && e.data.type === 'bump') { await markStale(e.data.prefixes); Data.revalidateCurrent(e.data.prefixes); } }; } catch (e) { /* no BroadcastChannel */ }

  /* Central fetch wrapper used by the single Supabase client (see supabase/supabase.js):
     counts requests, tracks reachability, and bumps catalogue caches after any successful write. */
  const WRITES = /\/rest\/v1\/(products|product_variants|product_images|categories|brands|banners|home_sections|store_settings|product_reviews|pincodes)\b|\/rest\/v1\/rpc\/(admin_moderate_product|seller_update_item|cancel_order|request_return|place_order_cod|admin_save_branding|admin_decide_seller|admin_update_order_status|admin_resolve_return)\b|\/functions\/v1\/(payment-init|payment-verify)\b|\/storage\/v1\/object\//;
  window.VFetch = async (input, init) => {
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase(), url = typeof input === 'string' ? input : (input && input.url) || '';
    Stats.requests++;
    try { const res = await fetch(input, init); Net.mark(true); if (method !== 'GET' && method !== 'HEAD' && res.ok && WRITES.test(url)) setTimeout(() => Data.bump(), 0); return res; }
    catch (e) { Net.mark(false); throw e; }
  };

  /* ---------- offline action queue (idempotent "set state" operations; only wishlist + signed-in cart) ---------- */
  const Queue = window.Queue = {
    async add(op) {   // op: {type:'cart'|'wish', uid, id: target id, value}; last write per target wins
      const db = await openDb(); op.t = Date.now();
      if (db) { const all = (await run('queue', 'readonly', (s) => s.getAll())) || []; for (const o of all) if (o.uid === op.uid && o.type === op.type && o.target === op.target) await run('queue', 'readwrite', (s) => s.delete(o.id)); await run('queue', 'readwrite', (s) => s.add(op)); }
      else { const i = memQ.findIndex((o) => o.uid === op.uid && o.type === op.type && o.target === op.target); if (i >= 0) memQ.splice(i, 1); memQ.push(Object.assign({ id: Date.now() + Math.random() }, op)); }
      renderBar(); this.badge();
    },
    async list(uid) { const db = await openDb(); const all = db ? (await run('queue', 'readonly', (s) => s.getAll())) || [] : memQ.slice(); return all.filter((o) => o.uid === uid); },
    async remove(id) { const db = await openDb(); if (db) await run('queue', 'readwrite', (s) => s.delete(id)); else { const i = memQ.findIndex((o) => o.id === id); if (i >= 0) memQ.splice(i, 1); } },
    async count() { return S.user ? (await this.list(S.user.id)).length : 0; },
    async badge() { const n = await this.count(); if (n && Net.offline) renderBar(); },
    /** Replay queued actions for the signed-in user. Each op is re-validated by the backend (RLS + FK); failures are reported, not hidden. */
    async flush() {
      if (!S.user || Net.offline) return; const ops = await this.list(S.user.id); if (!ops.length) return;
      renderBar(`Syncing ${ops.length} change${ops.length > 1 ? 's' : ''}…`); let ok = 0, failed = 0;
      for (const o of ops.sort((a, b) => a.t - b.t)) {
        try {
          if (o.type === 'cart') { const cid = await Cart.ensure(); if (o.value < 1) { const r = await window.sb.from('cart_items').delete().eq('cart_id', cid).eq('product_variant_id', o.target); if (r.error) throw r.error; } else { const r = await window.sb.from('cart_items').upsert({ cart_id: cid, product_variant_id: o.target, quantity: o.value }, { onConflict: 'cart_id,product_variant_id' }); if (r.error) throw r.error; } }
          else if (o.type === 'wish') { if (!Wish.id) await Wish.load(); if (o.value) { const r = await window.sb.from('wishlist_items').upsert({ wishlist_id: Wish.id, product_id: o.target }, { onConflict: 'wishlist_id,product_id', ignoreDuplicates: true }); if (r.error) throw r.error; } else { const r = await window.sb.from('wishlist_items').delete().eq('wishlist_id', Wish.id).eq('product_id', o.target); if (r.error) throw r.error; } }
          await this.remove(o.id); ok++;
        } catch (e) { if (isNetErr(e)) { Net.mark(false); renderBar(); return; } await this.remove(o.id); failed++; console.warn('[sync] dropped op', o.type, e && e.message); }
      }
      await Cart.load(); await Wish.load(); updateChrome();
      renderBar(failed ? `Synced ${ok}. ${failed} change${failed > 1 ? 's' : ''} could not be applied (item no longer available).` : `${ok} offline change${ok > 1 ? 's' : ''} synced.`, failed ? undefined : 'ok');
    },
  };
  /* privacy: nothing private is cached in IndexedDB; only these tiny mirrors exist and they are wiped on sign-out */
  window.Priv = { clear() { try { localStorage.removeItem('cart_mirror'); localStorage.removeItem('wish_mirror'); } catch (e) { /* ignore */ } } };
  window.addEventListener('DOMContentLoaded', () => renderBar());
})();
