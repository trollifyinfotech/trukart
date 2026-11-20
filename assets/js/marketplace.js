/* marketplace.js - posters + links to other marketplaces (Amazon, Flipkart, Meesho ...). Admin chooses the marketplaces and their poster pictures;
   sellers attach a link per product. Only https links that belong to the marketplace's own web address are accepted (also checked in the database). */
(function () {
  let cache = null, at = 0;
  async function list(force) {
    if (!force && cache && Date.now() - at < 60000) return cache;
    try { const { data, error } = await window.sb.from('marketplaces').select('*').eq('is_active', true).order('sort_order'); if (error) throw error; cache = data || []; at = Date.now(); }
    catch (e) { cache = cache || []; }
    return cache;
  }
  const map = async () => new Map((await list()).map((m) => [m.id, m]));
  const authority = (url) => { const m = /^https:\/\/([^\/?#]*)/i.exec(String(url || '').trim()); return m ? m[1].toLowerCase() : null; };
  /* returns null when the link is fine, otherwise a short message */
  function check(url, m) {
    url = String(url || '').trim(); if (!url) return null;
    if (!/^https:\/\//i.test(url)) return 'The link must start with https://';
    if (/\s/.test(url) || url.length > 600) return 'The link is not valid.';
    const a = authority(url); if (!a || !/^[a-z0-9.-]+$/.test(a)) return 'The link is not valid (no user names or port numbers).';
    if (!m) return 'Choose the marketplace first.';
    if (!(m.domains || []).some((d) => a === d || a.endsWith('.' + d))) return `This link does not belong to ${m.name}. Open the product on ${m.name} and copy its address.`;
    return null;
  }
  const safeUrl = (u) => (/^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? u : '#');
  /* one poster / chip. Poster picture = admin upload; without a picture a plain text chip is shown */
  function badge(link, mk, opts) {
    const m = mk.get ? mk.get(link.m) : mk[link.m]; if (!m || !/^https:\/\//i.test(link.url || '')) return '';
    const pic = m.poster_path ? `<img src="${esc(aimg(m.poster_path))}" alt="${esc(m.name)}" loading="lazy" decoding="async" onerror="this.parentNode.classList.add('nopic');this.remove()">` : '';
    return `<a class="mk ${m.poster_path ? '' : 'nopic'}" href="${esc(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer sponsored nofollow" aria-label="${esc((opts && opts.label) || 'Buy on')} ${esc(m.name)} (opens in a new tab)">${pic}<span class="mkf">${esc((opts && opts.short) ? m.name : 'Buy on ' + m.name)}</span></a>`;
  }
  window.Mkt = { list, map, check, badge, authority };
})();
