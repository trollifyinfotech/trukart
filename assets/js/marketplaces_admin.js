/* marketplaces_admin.js - Admin > Marketplaces: the poster pictures (Amazon, Flipkart, Meesho ...) and the web addresses sellers may link to. */
(function () {
  if (!window.AdminKit) return;
  const { aroute } = window.AdminKit;
  let MK = [], REMOVED = [];
  const sniff = async (f) => { const b = new Uint8Array(await f.slice(0, 12).arrayBuffer()), h = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(''); if (h.startsWith('89504e470d0a1a0a')) return ['png', 'image/png']; if (h.startsWith('ffd8ff')) return ['jpg', 'image/jpeg']; if (h.startsWith('52494646') && h.slice(16, 24) === '57454250') return ['webp', 'image/webp']; return null; };
  const cleanDomains = (s) => String(s || '').split(/[,\s]+/).map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[\/?#].*$/, '')).filter(Boolean);
  const html = () => `<div class="row between wrap mb"><h2>Marketplaces (posters and links)</h2><button class="btn p" data-act="mkSave">Save changes</button></div>
    <p class="small muted mb">Sellers can add a link to their product on another marketplace. Customers see the marketplace <b>poster</b> under the price; clicking it opens the link in a new tab. Upload the poster picture for each marketplace (about 110 x 34 px, PNG / JPG / WebP, transparent PNG looks best) - only use pictures you have the right to use. Without a picture a plain text button is shown. A seller's link is accepted only if its web address belongs to the marketplace's <b>allowed web addresses</b> below.</p>
    ${MK.map((m, i) => `<section class="card mb"><div class="row between wrap"><b>${esc(m.name || 'New marketplace')} <span class="small muted">(${esc(m.id)})</span></b><span class="row" style="gap:6px"><button type="button" class="btn sm" data-act="mkMove" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button type="button" class="btn sm" data-act="mkMove" data-i="${i}" data-d="1" ${i === MK.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button><button type="button" class="btn sm o-d" data-act="mkDel" data-i="${i}">Delete</button></span></div>
      <div class="grid2 mt"><label class="f"><span class="h">Name shown to customers</span><input data-mf="name" data-i="${i}" value="${esc(m.name)}" maxlength="40"></label><label class="f"><span class="h">Allowed web addresses (comma separated)</span><input data-mf="domains" data-i="${i}" value="${esc(m.domains)}" placeholder="amazon.in, amzn.to"></label></div>
      <div class="row wrap" style="align-items:flex-end;gap:14px"><div><span class="h small"><b>Poster</b></span><div class="row mt">${m.poster_path ? `<img src="${esc(aimg(m.poster_path))}" alt="" style="height:34px;max-width:170px;object-fit:contain;border:1px solid var(--line);border-radius:4px;background:#fff">` : '<span class="small muted">No poster yet</span>'}<label class="btn sm" style="cursor:pointer">Choose poster<input type="file" data-mkup="${i}" accept="image/png,image/jpeg,image/webp" hidden></label>${m.poster_path ? `<button type="button" class="btn sm o-d" data-act="mkClearPic" data-i="${i}">Remove</button>` : ''}</div></div><label class="chk"><input type="checkbox" data-mfc="${i}" ${m.is_active ? 'checked' : ''}> Active (sellers can use it)</label></div></section>`).join('')}
    <div class="row wrap"><button class="btn" data-act="mkAdd">+ Add marketplace</button><button class="btn p" data-act="mkSave">Save changes</button></div>`;
  const draw = () => { const el = $('#mk-ed'); if (el) el.innerHTML = html(); };
  aroute('/admin/marketplaces', 'marketplaces', async () => {
    const { data, error } = await window.sb.from('marketplaces').select('*').order('sort_order'); if (error) throw error;
    MK = (data || []).map((m) => ({ id: m.id, name: m.name, domains: (m.domains || []).join(', '), poster_path: m.poster_path, is_active: m.is_active, isNew: false })); REMOVED = [];
    return { html: '<div id="mk-ed">' + html() + '</div>', mount() {} };
  });
  document.addEventListener('input', (e) => { const t = e.target; if (!$('#mk-ed') || !t.dataset || !t.dataset.mf) return; MK[+t.dataset.i][t.dataset.mf] = t.value; });
  document.addEventListener('change', async (e) => { const t = e.target; if (!$('#mk-ed') || !t.dataset) return;
    if (t.dataset.mfc !== undefined) { MK[+t.dataset.mfc].is_active = t.checked; return; }
    if (t.dataset.mkup === undefined) return; const i = +t.dataset.mkup, f = t.files[0]; t.value = ''; if (!f) return;
    if (f.size > 1048576) return toast('Poster must be smaller than 1 MB', 'error'); const ty = await sniff(f); if (!ty) return toast('Use a PNG, JPG or WebP picture', 'error');
    const path = 'marketplaces/' + uuid() + '.' + ty[0]; const { error } = await window.sb.storage.from('brand-assets').upload(path, f, { contentType: ty[1], cacheControl: '31536000' }); if (error) return toast(errMsg(error, 'Upload failed'), 'error');
    if (MK[i].poster_path) REMOVED.push(MK[i].poster_path); MK[i].poster_path = path; draw(); toast('Poster uploaded. Press "Save changes" to publish.'); });
  Object.assign(A, {
    mkAdd: () => { const id = 'store-' + uuid().slice(0, 6); MK.push({ id, name: '', domains: '', poster_path: null, is_active: true, isNew: true }); draw(); },
    mkDel: (b) => { if (!confirm('Delete this marketplace? Links already added by sellers to it will stop showing.')) return; const m = MK.splice(+b.dataset.i, 1)[0]; if (!m.isNew) REMOVED.push(m); draw(); },
    mkMove: (b) => { const i = +b.dataset.i, j = i + +b.dataset.d; if (j < 0 || j >= MK.length) return; [MK[i], MK[j]] = [MK[j], MK[i]]; draw(); },
    mkClearPic: (b) => { const m = MK[+b.dataset.i]; REMOVED.push(m.poster_path); m.poster_path = null; draw(); },
    mkSave: async (b) => { btnBusy(b, true, 'Saving…');
      try { const rows = []; for (const [i, m] of MK.entries()) { const name = String(m.name || '').trim(), ds = cleanDomains(m.domains); if (name.length < 2) throw new Error('Every marketplace needs a name.'); if (!ds.length || ds.some((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d))) throw new Error(`"${name}": enter valid web addresses such as amazon.in (comma separated).`);
          let id = m.id; if (m.isNew) { id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || m.id; if (id.length < 2) id = m.id; if (MK.some((x, k) => k !== i && x.id === id)) id += '-' + uuid().slice(0, 3); }
          rows.push({ id, name, domains: ds, poster_path: m.poster_path || null, sort_order: i + 1, is_active: !!m.is_active }); }
        const gone = REMOVED.filter((x) => x && typeof x === 'object'), pics = REMOVED.filter((x) => typeof x === 'string');
        if (gone.length) { const { error } = await window.sb.from('marketplaces').delete().in('id', gone.map((g) => g.id)); if (error) throw error; }
        const { error } = await window.sb.from('marketplaces').upsert(rows, { onConflict: 'id' }); if (error) throw error;
        const still = new Set(rows.map((r) => r.poster_path)); const dead = pics.filter((p) => !still.has(p)); if (dead.length) window.sb.storage.from('brand-assets').remove(dead).then(() => {}, () => {}); REMOVED = [];
        toast('Marketplaces saved'); if (window.Mkt) await Mkt.list(true); R.render(); } catch (e) { toast(errMsg(e, 'Could not save'), 'error'); }
      btnBusy(b, false); },
  });
})();
