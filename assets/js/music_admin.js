/* music_admin.js - Admin > Music: upload songs, order them, choose volume / shuffle, switch background music on or off. */
(function () {
  if (!window.AdminKit) return;
  const { aroute } = window.AdminKit;
  let ST = null, REMOVED = [];
  const EXT = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', wav: 'audio/wav', webm: 'audio/webm' };
  const url = (p) => window.sb.storage.from('site-music').getPublicUrl(p).data.publicUrl;
  const sniff = async (f) => { const b = new Uint8Array(await f.slice(0, 12).arrayBuffer()), h = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(''), t = String.fromCharCode(...b);
    if (t.startsWith('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3'; if (t.startsWith('OggS')) return 'ogg'; if (t.startsWith('RIFF') && t.slice(8, 12) === 'WAVE') return 'wav'; if (t.slice(4, 8) === 'ftyp') return 'm4a'; if (h.startsWith('1a45dfa3')) return 'webm'; return null; };
  const norm = (v) => { v = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; return { enabled: v.enabled === true, volume: Math.min(1, Math.max(0, Number(v.volume) || 0.5)), shuffle: v.shuffle === true, tracks: Array.isArray(v.tracks) ? v.tracks.filter((t) => t && t.path).map((t) => ({ id: t.id || t.path, title: String(t.title || 'Track'), path: t.path })) : [] }; };
  const html = () => `<div class="row between wrap mb"><h2>Music (background music)</h2><button class="btn p" data-act="muSave">Save changes</button></div>
    <p class="small muted mb">Songs play automatically when a visitor opens the website, and pause when the visitor leaves the website or switches to another app; they continue when the visitor comes back. Visitors get play / pause, next, mute and volume buttons in the top bar. Browsers allow sound only after the visitor's first tap or click, so the music starts at that moment. Upload only songs you have the right to use.</p>
    <section class="card mb"><label class="chk"><input type="checkbox" data-mu="enabled" ${ST.enabled ? 'checked' : ''}> Play background music on the website</label>
      <label class="chk"><input type="checkbox" data-mu="shuffle" ${ST.shuffle ? 'checked' : ''}> Shuffle the songs</label>
      <label class="f"><span class="h">Starting volume: <b id="muvol">${Math.round(ST.volume * 100)}</b>%  (visitors can change it)</span><input type="range" min="0" max="100" value="${Math.round(ST.volume * 100)}" data-mu="volume"></label></section>
    <section class="card mb"><h3 class="sfa-h">Songs (${ST.tracks.length} / 30)</h3>
      ${ST.tracks.map((t, i) => `<div class="card sfa-item"><div class="row between wrap"><b class="small">Song ${i + 1}</b><span class="row" style="gap:4px"><button type="button" class="btn sm" data-act="muMove" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button type="button" class="btn sm" data-act="muMove" data-i="${i}" data-d="1" ${i === ST.tracks.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button><button type="button" class="btn sm o-d" data-act="muDel" data-i="${i}">Delete</button></span></div>
        <label class="f"><span class="h">Song name (shown to visitors)</span><input data-mt="${i}" value="${esc(t.title)}" maxlength="80"></label><audio controls preload="none" src="${esc(url(t.path))}" style="width:100%"></audio></div>`).join('') || '<p class="muted small">No songs yet.</p>'}
      <div class="row wrap mt"><label class="btn sm p" style="cursor:pointer">+ Upload songs<input type="file" data-musicfile accept=".mp3,.m4a,.aac,.ogg,.wav,audio/*" multiple hidden></label><span class="small muted">MP3, M4A, OGG or WAV, up to 15 MB each. A 128 kbps MP3 uses about 1 MB per minute of visitors' data.</span></div></section>
    <div class="row wrap"><button class="btn p" data-act="muSave">Save changes</button><button class="btn" data-act="muReload">Discard changes</button></div>`;
  const draw = () => { const el = $('#mu-ed'); if (el) el.innerHTML = html(); };
  aroute('/admin/music', 'music', async () => {
    const { data, error } = await window.sb.from('store_settings').select('value').eq('key', 'music').maybeSingle(); if (error) throw error;
    ST = norm(data ? data.value : null); REMOVED = [];
    return { html: '<div id="mu-ed">' + html() + '</div>', mount() {} };
  });
  document.addEventListener('input', (e) => { const t = e.target; if (!ST || !$('#mu-ed') || !t.dataset) return; if (t.dataset.mt !== undefined) ST.tracks[+t.dataset.mt].title = t.value; if (t.dataset.mu === 'volume') { ST.volume = t.value / 100; const v = $('#muvol'); if (v) v.textContent = t.value; } });
  document.addEventListener('change', async (e) => {
    const t = e.target; if (!ST || !$('#mu-ed') || !t.dataset) return;
    if (t.dataset.mu === 'enabled' || t.dataset.mu === 'shuffle') { ST[t.dataset.mu] = t.checked; return; }
    if (t.dataset.musicfile === undefined) return;
    const files = Array.from(t.files); t.value = '';
    for (const f of files) {
      if (ST.tracks.length >= 30) { toast('Maximum 30 songs', 'error'); break; }
      if (f.size > 15 * 1048576) { toast(f.name + ' is larger than 15 MB', 'error'); continue; }
      const ty = await sniff(f); if (!ty) { toast(f.name + ' is not a valid MP3 / M4A / OGG / WAV file', 'error'); continue; }
      toast('Uploading ' + f.name + '…', 'info');
      const path = 'tracks/' + uuid() + '.' + ty;
      const { error } = await window.sb.storage.from('site-music').upload(path, f, { contentType: EXT[ty], cacheControl: '31536000' });
      if (error) { toast(/mime|bucket|not found|not supported/i.test(String(error.message)) ? 'Music storage is not set up yet. Run database/migration_v11.sql in Supabase.' : errMsg(error, 'Upload failed'), 'error'); break; }
      ST.tracks.push({ id: uuid(), title: f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').slice(0, 80), path }); draw();
    }
  });
  Object.assign(A, {
    muMove: (b) => { const i = +b.dataset.i, j = i + +b.dataset.d; if (j < 0 || j >= ST.tracks.length) return; [ST.tracks[i], ST.tracks[j]] = [ST.tracks[j], ST.tracks[i]]; draw(); },
    muDel: (b) => { if (!confirm('Delete this song?')) return; const t = ST.tracks.splice(+b.dataset.i, 1)[0]; REMOVED.push(t.path); draw(); },
    muReload: () => R.render(),
    muSave: async (b) => { btnBusy(b, true, 'Saving…');
      try { const v = { enabled: ST.enabled, volume: Math.round(ST.volume * 100) / 100, shuffle: ST.shuffle, tracks: ST.tracks.map((t) => ({ id: t.id, title: String(t.title || 'Track').trim().slice(0, 80) || 'Track', path: t.path })) };
        const { error } = await window.sb.from('store_settings').upsert({ key: 'music', value: v, is_public: true, description: 'Background music playlist (managed in Admin > Music)' }, { onConflict: 'key' }); if (error) throw error;
        if (REMOVED.length) { window.sb.storage.from('site-music').remove(REMOVED).then(() => {}, () => {}); REMOVED = []; }
        toast('Music saved'); if (window.Music) Music.reload(); } catch (e) { toast(errMsg(e, 'Could not save'), 'error'); }
      btnBusy(b, false); },
  });
})();
