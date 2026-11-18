/* music.js - background music for the website.
   Admin > Music chooses the songs. Visitors hear them while they are ON the website: the music pauses when they leave the tab / app
   and continues when they come back. Controls sit in the top bar (pause/play, next, mute, volume). A visitor's own choice (paused / muted) is remembered.
   Browsers only allow sound after the visitor touches the page once, so the first tap / click / key press starts the music. */
(function () {
  const LS = { paused: 'music_user_paused', muted: 'music_muted', vol: 'music_vol' };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const DEF = { enabled: false, volume: 0.5, shuffle: false, tracks: [] };
  const audio = new Audio(); audio.preload = 'none'; audio.loop = false;
  let loaded = false, cfg = DEF, order = [], idx = 0, started = false, wantPlay = false, armed = false, pendingSeek = 0;
  const trackUrl = (t) => window.sb.storage.from('site-music').getPublicUrl(t.path).data.publicUrl;
  const clean = (v) => { v = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; const tr = (Array.isArray(v.tracks) ? v.tracks : []).filter((t) => t && typeof t.path === 'string' && /^tracks\/[a-z0-9-]+\.(mp3|m4a|aac|ogg|wav|webm)$/i.test(t.path)).slice(0, 30).map((t) => ({ id: String(t.id || t.path), title: String(t.title || 'Track').slice(0, 80), path: t.path })); return { enabled: v.enabled === true, volume: Math.min(1, Math.max(0, Number(v.volume) || 0.5)), shuffle: v.shuffle === true, tracks: tr }; };
  const onAdminPage = () => /^#\/(admin|seller)/.test(location.hash);
  const userPaused = () => lsGet(LS.paused) === '1';
  const muted = () => lsGet(LS.muted) === '1';
  const volume = () => { const v = parseFloat(lsGet(LS.vol)); return isNaN(v) ? cfg.volume : Math.min(1, Math.max(0, v)); };
  const applyVol = () => { audio.volume = volume(); audio.muted = muted(); };
  const shuffleOrder = () => { order = cfg.tracks.map((_, i) => i); if (cfg.shuffle) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } };
  const cur = () => cfg.tracks[order[idx]];

  function setSrc(keepTime) { const t = cur(); if (!t) return false; audio.src = trackUrl(t); if (keepTime) pendingSeek = keepTime; audio.load(); return true; }
  async function play() { if (!cfg.enabled || !cfg.tracks.length || onAdminPage()) return; if (!started) { shuffleOrder(); idx = 0; try { const st = JSON.parse(sessionStorage.getItem('music_state') || 'null'); if (st && cfg.tracks[st.t] && !cfg.shuffle) { idx = st.t; pendingSeek = st.s || 0; } } catch (e) { /* ignore */ } started = setSrc(pendingSeek); }
    applyVol(); wantPlay = true;
    try { await audio.play(); armed = false; } catch (e) { armed = true; }   // blocked until the visitor touches the page
    ui(); }
  function pause(byUser) { wantPlay = false; audio.pause(); if (byUser) lsSet(LS.paused, '1'); ui(); }
  function next() { if (!cfg.tracks.length) return; if (!started) { play(); return; } idx = (idx + 1) % order.length; if (idx === 0 && cfg.shuffle) shuffleOrder(); setSrc(0); lsSet(LS.paused, null); wantPlay = true; audio.play().catch(() => { armed = true; }); ui(); }
  audio.addEventListener('loadedmetadata', () => { if (pendingSeek && isFinite(audio.duration) && pendingSeek < audio.duration - 2) { try { audio.currentTime = pendingSeek; } catch (e) { /* ignore */ } } pendingSeek = 0; });
  audio.addEventListener('ended', () => next());
  audio.addEventListener('error', () => { if (cfg.tracks.length > 1 && started) setTimeout(next, 400); });   // a broken file is skipped
  audio.addEventListener('play', ui); audio.addEventListener('pause', ui);

  /* the first touch / click / key press lets the browser play sound */
  const unlock = () => { if (!armed || !wantPlay || userPaused() || document.hidden) return; armed = false; play(); };
  ['pointerdown', 'touchstart', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true, capture: true }));

  /* music lives only while the visitor is on the website */
  let wasPlaying = false;
  const away = () => { wasPlaying = !audio.paused || (wantPlay && armed); if (!audio.paused) { audio.pause(); } try { sessionStorage.setItem('music_state', JSON.stringify({ t: order[idx], s: audio.currentTime || 0 })); } catch (e) { /* ignore */ } ui(); };
  const back = () => { if (wasPlaying && !userPaused() && cfg.enabled && !onAdminPage()) { wasPlaying = false; wantPlay = true; audio.play().then(() => { armed = false; ui(); }, () => { armed = true; ui(); }); } };
  document.addEventListener('visibilitychange', () => (document.hidden ? away() : back()));
  window.addEventListener('pagehide', away); window.addEventListener('pageshow', (e) => { if (e.persisted) back(); });
  window.addEventListener('hashchange', () => { mount(); if (onAdminPage()) { if (!audio.paused) { wasPlaying = true; audio.pause(); } } else if (cfg.enabled && !userPaused() && (wasPlaying || !started)) { wasPlaying = false; play(); } ui(); });

  /* ---------- controls in the top bar ---------- */
  const ic = (n, s) => (window.icon ? icon(n, s || 18) : '');
  function html() {
    const playing = !audio.paused, t = cur();
    return `<div class="mus ${playing ? 'on' : ''}" id="mus"><button class="mb" data-mus="toggle" aria-label="${playing ? 'Pause music' : 'Play music'}" title="${playing ? 'Pause music' : 'Play music'}">${playing ? ic('pause', 17) : ic('play', 17)}</button>
      <button class="mb d" data-mus="next" aria-label="Next song" title="Next song">${ic('skip-forward', 17)}</button>
      <button class="mb d" data-mus="mute" aria-label="${muted() ? 'Unmute' : 'Mute'}" title="${muted() ? 'Unmute' : 'Mute'}">${ic(muted() ? 'volume-x' : 'volume', 17)}</button>
      <button class="mb m" data-mus="more" aria-label="More music controls" aria-expanded="false">${ic('chevron-down', 16)}</button>
      <div class="mpop" id="mpop" hidden><div class="mt">${esc(t ? t.title : 'Music')}</div><div class="mr"><button class="mb" data-mus="toggle" aria-label="Play or pause">${playing ? ic('pause', 18) : ic('play', 18)}</button><button class="mb" data-mus="next" aria-label="Next song">${ic('skip-forward', 17)}</button><button class="mb" data-mus="mute" aria-label="Mute or unmute">${ic(muted() ? 'volume-x' : 'volume', 17)}</button></div><label class="mv"><span class="small muted">Volume</span><input type="range" min="0" max="100" value="${Math.round(volume() * 100)}" data-mus="vol" aria-label="Volume"></label></div></div>`;
  }
  function ui() { const el = document.getElementById('mus'); if (!el) return; const open = !document.getElementById('mpop').hidden; const w = document.createElement('div'); w.innerHTML = html(); const n = w.firstElementChild; if (open) { n.querySelector('#mpop').hidden = false; } el.replaceWith(n); if (armed && wantPlay) n.classList.add('wait'); }
  function mount() { const hdr = document.querySelector('#hdr .in'), icons = document.getElementById('hdr-icons'); const old = document.getElementById('mus'); const show = cfg.enabled && cfg.tracks.length && !onAdminPage(); if (!hdr || !icons) return; if (!show) { if (old) old.remove(); return; } if (old) old.remove(); const w = document.createElement('div'); w.innerHTML = html(); hdr.insertBefore(w.firstElementChild, icons); }
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-mus]'); const pop = document.getElementById('mpop');
    if (!b) { if (pop && !pop.hidden && !e.target.closest('#mus')) { pop.hidden = true; } return; }
    const a = b.dataset.mus; if (a === 'vol') return; e.stopPropagation();
    if (a === 'toggle') { if (!audio.paused) pause(true); else { lsSet(LS.paused, null); play(); } }
    else if (a === 'next') next();
    else if (a === 'mute') { lsSet(LS.muted, muted() ? null : '1'); applyVol(); ui(); }
    else if (a === 'more') { pop.hidden = !pop.hidden; b.setAttribute('aria-expanded', String(!pop.hidden)); } }, true);
  document.addEventListener('input', (e) => { const t = e.target; if (t.dataset && t.dataset.mus === 'vol') { lsSet(LS.vol, String(t.value / 100)); if (+t.value > 0) lsSet(LS.muted, null); applyVol(); } });

  async function load(force) {
    const fetcher = async () => { const r = await window.sb.from('store_settings').select('value').eq('key', 'music').eq('is_public', true).maybeSingle(); if (r.error) throw r.error; return r.data ? r.data.value : null; };
    try { const v = await fetcher(); try { if (window.Data) await Data.query('music', async () => v, { force: true }); } catch (e) { /* cache is optional */ } return { c: clean(v), ok: true }; }
    catch (e) { try { return { c: clean(await Data.query('music', fetcher)), ok: false }; } catch (e2) { return { c: DEF, ok: false }; } }
  }
  async function init(force) {
    if (!window.sb || window.SB_FATAL) return; const was = JSON.stringify(cfg.tracks.map((t) => t.path)) + cfg.shuffle; const got = await load(force); cfg = got.c; loaded = got.ok;
    if (JSON.stringify(cfg.tracks.map((t) => t.path)) + cfg.shuffle !== was) { started = false; audio.pause(); audio.removeAttribute('src'); }
    applyVol(); mount();
    if (cfg.enabled && cfg.tracks.length && !userPaused() && !document.hidden && !onAdminPage()) { if (!started || audio.paused) play(); } else if (!cfg.enabled || !cfg.tracks.length) { audio.pause(); wantPlay = false; }
  }
  /* the page may finish starting after this file: keep trying until the playlist has been read, and re-check on every screen change */
  const ensure = () => { if (!loaded && window.sb && !window.SB_FATAL && !ensure.busy) { ensure.busy = true; init(false).finally(() => { ensure.busy = false; }); } };
  let tries = 0; const poll = setInterval(() => { ensure(); if (loaded || ++tries > 20) clearInterval(poll); }, 1500);
  window.Music = { ensure, init, mount, reload: () => init(true), stop: () => { audio.pause(); wantPlay = false; } };
  window.addEventListener('load', () => setTimeout(ensure, 300));
})();
