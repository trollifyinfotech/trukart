/* core.js - config, Supabase client, helpers, auth state. Plain browser JS, no build step. */
(function () {
  const LS = window.localStorage;
  window.S = { user: null, roles: [], seller: null, cart: [], wish: [], settings: {}, cats: null, brands: null };

  /* ---------- helpers ---------- */
  window.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.$ = (sel, el = document) => el.querySelector(sel);
  window.$$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  window.inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  window.inr2 = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  window.fdate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  window.fdt = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  window.label = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  window.uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'k-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  window.slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'item';
  window.sanitizeQ = (q) => String(q || '').replace(/[%*,()\\"':;]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
  window.PIN_RE = /^[1-9]\d{5}$/; window.PHONE_RE = /^[6-9]\d{9}$/;
  window.tone = (s) => (['delivered', 'approved', 'paid', 'processed', 'refunded', 'cod_collected', 'active'].includes(s) ? 'b-ok' : ['cancelled', 'rejected', 'failed', 'suspended'].includes(s) ? 'b-err' : ['pending', 'pending_confirmation', 'pending_review', 'requested', 'cod_pending', 'refund_pending', 'return_requested'].includes(s) ? 'b-warn' : 'b-p');
  window.badge = (s) => `<span class="badge ${tone(s)}">${esc(label(s))}</span>`;
  window.pubUrl = (bucket, path) => (!path ? 'assets/img/placeholder.svg' : /^https?:/.test(path) ? path : window.sb.storage.from(bucket).getPublicUrl(path).data.publicUrl);
  window.pimg = (p) => pubUrl('product-images', p);
  window.aimg = (p) => pubUrl('brand-assets', p);

  const MAP = { FORBIDDEN: 'You do not have permission to do that.', AUTH_REQUIRED: 'Please log in to continue.', EMAIL_UNVERIFIED: 'Please verify your email (check your inbox) before placing an order.',
    ORDER_NOT_FOUND: 'Order not found.', CANNOT_CANCEL: 'This order has already shipped and cannot be cancelled. You can request a return after delivery.', ALREADY_CANCELLED: 'Already cancelled.',
    INVALID_TRANSITION: 'That status change is not allowed.', TRACKING_REQUIRED: 'Enter courier and tracking number to mark as shipped.', PAYMENT_PENDING: 'Payment for this order is not complete.',
    NOT_DELIVERED: 'Returns are only possible after delivery.', NOT_RETURNABLE: 'This item cannot be returned.', RETURN_WINDOW_CLOSED: 'The return window has closed.', ALREADY_REQUESTED: 'A return was already requested.',
    REASON_REQUIRED: 'Please give a reason (5+ characters).', ALREADY_APPLIED: 'You already have a seller application.', NOTE_REQUIRED: 'A note is required.', ADDRESS_INVALID: 'Choose a valid delivery address.',
    PIN_NOT_SERVICEABLE: 'We do not deliver to this PIN code yet.', COD_DISABLED: 'Cash on Delivery is unavailable.', COD_LIMIT_EXCEEDED: 'Order value is too high for Cash on Delivery.', COD_NOT_AVAILABLE_FOR_PIN: 'COD is not available for this PIN.',
    BRANDING_CONFLICT: 'Someone else changed the appearance settings. Reload this page and try again.', INVALID_COLOR: 'One of the colors is not a valid #RRGGBB value.', INVALID_NAME: 'Website name must be 2-60 characters.', INVALID_TAGLINE: 'Tagline must be 120 characters or fewer.', INVALID_PATH: 'Invalid logo/favicon file path.', INVALID_BRANDING: 'Invalid branding settings.',
    OFFLINE_NO_CACHE: 'This page was not saved for offline use. Connect to the internet and open it once while online.',
    CART_INVALID: 'Some items in your bag changed. Please review your bag.', COUPON_INVALID: 'That coupon cannot be applied.', OUT_OF_STOCK: 'An item just went out of stock.', ACCOUNT_SUSPENDED: 'Your account is suspended.', CANNOT_MODIFY_ADMIN: 'Admin accounts cannot be changed here.', INVALID_FONT: 'Font settings could not be saved. Run database/migration_v7.sql in Supabase and try again.', INVALID_BRANDING: 'The server does not know this setting yet. Run database/migration_v7.sql in Supabase and try again.', BRANDING_NOT_SAVED: 'The database did not keep the change. Run database/migration_v7.sql in Supabase and try again.', BRANDING_NOT_PUBLIC: 'Saved, but visitors cannot see it yet. Run database/migration_v7.sql in Supabase.',
    ONLINE_DISABLED: 'Online payment is currently switched off. Please use Cash on Delivery.', PAYMENT_GATEWAY_ERROR: 'The payment service did not respond. Your order is saved - open it from My Orders and press Pay now.',
    RAZORPAY_LOAD_FAILED: 'Could not load the payment window. Check your internet (or turn off an ad-blocker) and try again.', RAZORPAY_NOT_CONFIGURED: 'Online payment is not set up on the server yet (Razorpay keys missing).',
    FUNCTION_NOT_DEPLOYED: 'Online payment server function is not deployed yet. See README.txt (Razorpay section).', NOT_PAYABLE: 'This order cannot be paid any more.', ORDER_CANCELLED: 'This order was cancelled.',
    SIGNATURE_INVALID: 'Payment could not be verified.', PAYMENT_NOT_CAPTURED: 'Your payment has not been completed yet.', INVALID_KEY: 'Please try again.' };
  window.errMsg = (e, fb) => {
    const m = String((e && e.message) || '').trim();
    if (MAP[m]) return MAP[m];
    if (/Invalid login credentials/i.test(m)) return 'Incorrect email or password.';
    if (/Email not confirmed/i.test(m)) return 'Please verify your email first - check your inbox.';
    if (/already registered/i.test(m)) return 'An account with this email already exists. Try logging in.';
    if (/Bucket not found/i.test(m)) return 'Image storage is not set up. Run database/setup.sql in the Supabase SQL Editor (see README.txt).';
    if (/row-level security|violates row-level/i.test(m)) return 'You do not have permission to do that.';
    if (/Invalid API key|apikey/i.test(m)) return 'Supabase rejected the API key. Check supabase/supabase.js.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Network problem. Check your internet connection.';
    if (/JWT expired|invalid JWT/i.test(m)) return 'Your session expired. Please log in again.';
    if (/rate limit|too many requests|over_email_send_rate_limit/i.test(m) || (e && (e.status === 429 || e.code === 'over_email_send_rate_limit'))) return 'Supabase email limit reached (free built-in email allows only a few emails per hour). Fix: Supabase > Authentication > Sign In / Providers > Email > turn OFF "Confirm email" for testing, or wait 1 hour, or add your own SMTP. See README.txt.';
    if (e && e.code === '23505') return 'That already exists. Try a different value.';
    if (e && e.code === '23514') return 'One of the values is not allowed. Please check your entries.';
    if (e && e.code === '42501') return 'You do not have permission to do that.';
    if (e && (e.code === '42P01' || e.code === 'PGRST205')) return 'Database is not set up yet. Run database/setup.sql in the Supabase SQL Editor (see README.txt).';
    console.warn('[error]', e); return fb || 'Something went wrong. Please try again.';
  };
  window.toast = (msg, type) => { const b = $('#toasts'); if (!b) return; const t = document.createElement('div'); t.className = 'toast ' + (type || ''); t.setAttribute('role', type === 'error' ? 'alert' : 'status'); t.innerHTML = icon(type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check-circle', 18) + '<span></span>'; t.lastChild.textContent = msg; b.appendChild(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, type === 'error' ? 6000 : 3200); };
  window.modal = (title, html, wide) => {
    closeModal(); const prev = document.activeElement;
    const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.id = 'modalbg';
    bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><div class="row between"><h3>${esc(title)}</h3><button class="ibtn" data-act="closeModal" aria-label="Close">${icon('close',20)}</button></div><div id="modalbody">${html}</div></div>`;
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) closeModal(); });
    document.body.appendChild(bg); document.body.style.overflow = 'hidden'; bg._prev = prev;
    const f = $('input,select,textarea,button:not([data-act=closeModal])', bg); (f || $('.modal', bg)).focus(); return bg;
  };
  window.closeModal = () => { const b = $('#modalbg'); if (b) { b._prev && b._prev.focus && b._prev.focus(); b.remove(); } document.body.style.overflow = ''; };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  window.empty = (title, text, action, ic) => `<div class="empty"><div class="empty-ic">${icon(ic || 'bag', 28)}</div><h2>${esc(title)}</h2>${text ? `<p class="muted">${esc(text)}</p>` : ''}${action || ''}</div>`;
  window.skeletonGrid = (n = 8) => `<div class="pgrid">${Array.from({ length: n }, () => '<div><div class="sk" style="aspect-ratio:3/4"></div><div class="sk" style="height:12px;width:50%;margin-top:8px"></div><div class="sk" style="height:12px;width:80%;margin-top:6px"></div></div>').join('')}</div>`;
  window.btnBusy = (btn, on, text) => { if (!btn) return; if (on) { btn._h = btn.innerHTML; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.innerHTML = '<span class="spin" aria-hidden="true"></span> ' + esc(text || 'Please wait…'); } else { btn.disabled = false; btn.removeAttribute('aria-busy'); if (btn._h !== undefined) btn.innerHTML = btn._h; } };
  window.formData = (form) => { const o = {}; new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; }); $$('input[type=checkbox]', form).forEach((c) => { o[c.name] = c.checked; }); return o; };

  /* ---------- local (per-device, non-sensitive) ---------- */
  const rd = (k, d) => { try { const v = LS.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const wr = (k, v) => { try { LS.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  window.L = { rd, wr,
    addRecent(k, v, n) { wr(k, [v, ...rd(k, []).filter((x) => x !== v)].slice(0, n || 10)); } };

  /* ---------- Supabase: the single client lives in supabase/supabase.js (window.sb) ---------- */
  window.loadAccount = async () => {
    // Roles are re-read from the database on every load; they are never cached, so a stale/offline copy can never act as authorization.
    try { const { data } = await window.sb.auth.getSession(); S.user = data.session ? data.session.user : null; } catch (e) { S.user = null; }
    if (!S.user) { S.roles = []; S.seller = null; return; }
    try { const [r, s] = await Promise.all([window.sb.from('user_roles').select('role').eq('user_id', S.user.id), window.sb.from('seller_profiles').select('id,store_name,approval_status,decision_note').eq('user_id', S.user.id).maybeSingle()]);
      if (r.error && Net.isNetErr(r.error)) { S.roles = []; S.seller = null; return; } S.roles = (r.data || []).map((x) => x.role); S.seller = s.data || null; } catch (e) { S.roles = []; S.seller = null; }
  };
  window.isAdmin = () => S.roles.includes('admin');
  window.isSeller = () => S.roles.includes('seller') && S.seller && S.seller.approval_status === 'approved';
  /* ---------- branding / theme (single implementation, used by every page) ---------- */
  const BDEF = { site_name: 'Veloura', tagline: 'Style that feels like you', primary_color: '#AA336A', secondary_color: '#F8E8EF', accent_color: '#6B2146', logo_path: null, footer_logo_path: null, favicon_path: null, fonts: [], font_targets: {} };
  window.BRAND_DEFAULTS = BDEF; window.HEX_RE = /^#[0-9a-fA-F]{6}$/; window.BPATH_RE = /^branding\/[a-z0-9-]+\.(png|jpe?g|webp|ico)$/i;
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  window.contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  window.onColor = (hex) => (contrast(hex, '#ffffff') >= contrast(hex, '#222222') ? '#ffffff' : '#222222');
  window.cleanBrand = (raw) => { const b = Object.assign({}, BDEF); const r = raw && typeof raw === 'object' ? raw : {}; // never trust stored values blindly: re-validate before they reach CSS/DOM
    ['primary_color', 'secondary_color', 'accent_color'].forEach((k) => { if (typeof r[k] === 'string' && HEX_RE.test(r[k])) b[k] = r[k]; });
    if (typeof r.site_name === 'string' && r.site_name.trim().length >= 2) b.site_name = r.site_name.trim().slice(0, 60); if (typeof r.tagline === 'string') b.tagline = r.tagline.slice(0, 120);
    ['logo_path', 'footer_logo_path', 'favicon_path'].forEach((k) => { if (typeof r[k] === 'string' && BPATH_RE.test(r[k])) b[k] = r[k]; });
    b.fonts = Array.isArray(r.fonts) ? r.fonts.filter((f) => f && typeof f === 'object' && /^[a-z0-9-]{1,40}$/.test(f.id) && typeof f.name === 'string' && f.name.length && FPATH_RE.test(f.path)).slice(0, 6).map((f) => ({ id: f.id, name: f.name.slice(0, 40), path: f.path })) : [];
    b.font_targets = {}; if (r.font_targets && typeof r.font_targets === 'object') FONT_KEYS.forEach((k) => { const v = r.font_targets[k]; if (typeof v === 'string' && b.fonts.some((f) => f.id === v)) b.font_targets[k] = v; });
    return b; };
  /* ---------- custom fonts (uploaded in Admin > Appearance) ---------- */
  const FPATH_RE = /^branding\/fonts\/[a-z0-9-]+\.(otf|ttf|woff2?)$/i, FFMT = { otf: 'opentype', ttf: 'truetype', woff: 'woff', woff2: 'woff2' };
  const FONT_KEYS = ['all', 'headings', 'product', 'price', 'button', 'menu'];
  window.FONT_AREAS = [['all', 'Whole website (all text)', 'Everything that has no special font below'], ['headings', 'Headings and section titles', 'Page titles, "Suggested For You", shop names'], ['product', 'Product titles', 'Names on product cards and on the product page'], ['price', 'Prices', 'Price, MRP and % off'], ['button', 'Buttons', 'Add to Cart, Buy Now, Pay, Save...'], ['menu', 'Top menu and bottom bar', 'Category menu, mobile bottom bar']];
  window.fontCss = (b, urlOf, scope) => { const fonts = b.fonts || []; if (!fonts.length) return '';
    const fam = (id) => { const f = fonts.find((x) => x.id === id); return f ? `"BF-${f.id}"` : null; }, T = b.font_targets || {}, pre = scope || 'body';
    let css = fonts.map((f) => `@font-face{font-family:"BF-${f.id}";src:url("${urlOf(f)}") format("${FFMT[(f.path.split('.').pop() || '').toLowerCase()] || 'opentype'}");font-display:swap}`).join('');
    const rules = { all: `${pre}, ${pre} *`, headings: `${pre} h1, ${pre} h2, ${pre} h3, ${pre} h4, ${pre} .sec h2, ${pre} .ch, ${pre} .shop-name`, product: `${pre} .pc .t2, ${pre} .ttl h1, ${pre} .ptitle h1, ${pre} .pdp h1`, price: `${pre} .pr b, ${pre} .pr s, ${pre} .pr em, ${pre} .pprice b, ${pre} .pprice s, ${pre} .pprice .dn`, button: `${pre} .btn, ${pre} button.btn, ${pre} .buybar .btn`, menu: `${pre} .catbar .mi > a, ${pre} .mm a, ${pre} nav.bottom a` };
    FONT_KEYS.forEach((k) => { const f = fam(T[k]); if (f) css += `${rules[k]}{font-family:${f},Inter,system-ui,"Segoe UI",sans-serif!important}`; }); return css; };
  window.applyFonts = (b, v) => { let st = document.getElementById('brand-fonts'); if (!st) { st = document.createElement('style'); st.id = 'brand-fonts'; document.head.appendChild(st); }
    try { st.textContent = window.sb ? fontCss(b, (f) => aimg(f.path) + '?v=' + encodeURIComponent(v || '1')) : ''; } catch (e) { st.textContent = ''; } };
  window.themeStyle = (b) => `--color-primary:${b.primary_color};--color-secondary:${b.secondary_color};--color-accent:${b.accent_color};--p:${b.primary_color};--pl:${b.secondary_color};--ph:${b.accent_color};--on-p:${onColor(b.primary_color)}`;
  window.applyBranding = (b, version) => {
    b = cleanBrand(b); S.branding = b; S.brandVer = version || S.brandVer || '';
    const st = document.documentElement.style; themeStyle(b).split(';').forEach((d) => { const i = d.indexOf(':'); st.setProperty(d.slice(0, i), d.slice(i + 1)); });
    let l = document.getElementById('favicon'); if (!l) { l = document.createElement('link'); l.id = 'favicon'; l.rel = 'icon'; document.head.appendChild(l); }
    const v = encodeURIComponent(S.brandVer || '1');
    if (b.favicon_path && window.sb) { l.href = aimg(b.favicon_path) + '?v=' + v; l.type = /\.ico$/i.test(b.favicon_path) ? 'image/x-icon' : /\.png$/i.test(b.favicon_path) ? 'image/png' : /\.webp$/i.test(b.favicon_path) ? 'image/webp' : 'image/jpeg'; } else { l.href = 'assets/img/favicon.svg'; l.type = 'image/svg+xml'; }
    document.title = b.site_name + (b.tagline ? ' - ' + b.tagline : ''); applyFonts(b, S.brandVer);
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = b.primary_color;
    try { localStorage.setItem('brand_cache', JSON.stringify({ b, v: S.brandVer })); } catch (e) { /* ignore */ }
  };
  window.logoHtml = (footer) => { const b = S.branding || BDEF, path = footer ? (b.footer_logo_path || b.logo_path) : b.logo_path;
    const fb = `<span class="logo-fb"${path ? ' style="display:none"' : ''}><i>${esc(b.site_name[0] || 'V')}</i><span>${esc(b.site_name)}</span></span>`;
    return path ? `<img class="logo-img" src="${esc(aimg(path))}?v=${encodeURIComponent(S.brandVer || '1')}" alt="${esc(b.site_name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">${fb}` : fb; };
  // paint the last known theme immediately (no colour flash); fresh settings replace it a moment later
  try { const c = JSON.parse(localStorage.getItem('brand_cache') || 'null'); if (c && c.b) { S.brandVer = c.v; const b = cleanBrand(c.b); S.branding = b; const st = document.documentElement.style; themeStyle(b).split(';').forEach((d) => { const i = d.indexOf(':'); st.setProperty(d.slice(0, i), d.slice(i + 1)); }); document.title = b.site_name; if (window.sb) applyFonts(b, c.v); } } catch (e) { /* ignore */ }
  S.branding = S.branding || Object.assign({}, BDEF);

  window.loadSettings = async (force) => {
    const data = await Data.query('settings:public', async () => { const r = await window.sb.from('store_settings').select('key,value,updated_at').eq('is_public', true); if (r.error) throw r.error; return r.data || []; }, { ttl: CACHE_POLICY.settings, force: !!force }).catch(() => []);
    const rows = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    S.settings = Object.assign({ brand_name: 'Veloura', brand_tagline: 'Style that feels like you', contact_email: '', contact_phone: '', contact_address: '', cod_enabled: true, online_payments_enabled: false, cod_max_order_value: 20000, shipping_fee: 99, free_shipping_threshold: 999, max_qty_per_item: 10, low_stock_threshold: 5, return_window_days: 7 }, rows);
    const row = (data || []).find((r) => r.key === 'branding'); S.brandRowTs = row ? row.updated_at : null; let braw = rows.branding || {};
    try { if (!(window.Net && Net.offline)) { const r = await window.sb.from('store_settings').select('value,updated_at').eq('key', 'branding').eq('is_public', true).maybeSingle(); if (!r.error && r.data && r.data.value) { braw = r.data.value; S.brandRowTs = r.data.updated_at; } } } catch (e) { /* keep the cached copy */ }   // always ask the server for the latest look: logo, colours and fonts must never be stale
    const b = cleanBrand(Object.assign({ site_name: S.settings.brand_name, tagline: S.settings.brand_tagline }, braw));
    S.settings.brand_name = b.site_name; S.settings.brand_tagline = b.tagline; applyBranding(b, S.brandRowTs || '1');
  };
  window.getCats = async () => { if (!S.cats) S.cats = await Data.query('cats:all', async () => { const { data, error } = await window.sb.from('categories').select('*').eq('is_active', true).order('sort_order'); if (error) throw error; return data || []; }, { ttl: CACHE_POLICY.cats }); return S.cats; };
  window.getBrands = async () => { if (!S.brands) S.brands = await Data.query('brands:all', async () => { const { data, error } = await window.sb.from('brands').select('*').eq('is_active', true).order('name'); if (error) throw error; return data || []; }, { ttl: CACHE_POLICY.brands }); return S.brands; };
  window.descendants = (cats, id) => { const out = [id]; for (let i = 0; i < out.length; i++) cats.forEach((c) => { if (c.parent_id === out[i] && !out.includes(c.id)) out.push(c.id); }); return out; };
})();
