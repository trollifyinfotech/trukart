/* xlsx-lite.js - tiny, dependency-light spreadsheet reader / writer (needs JSZip, vendored in assets/vendor).
   Writes .xlsx with several sheets, header colours, dropdown lists and number checks; reads .xlsx (Excel, Google Sheets, LibreOffice) and .csv. */
(function () {
  const X = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colName = (i) => { let s = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const colIndex = (ref) => { const m = /^([A-Z]+)/i.exec(ref || ''); if (!m) return 0; let n = 0; for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

  /* cell styles used by the templates: 0 plain, 1 header (required), 2 header (optional), 3 example row, 4 wrapped text, 5 big title, 6 bordered input cell */
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><i/><sz val="11"/><color rgb="FF6B7280"/><name val="Calibri"/></font><font><b/><sz val="15"/><name val="Calibri"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFAA336A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF64748B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF7D6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  function sheetXml(sh) {
    const rows = sh.rows || [], maxC = Math.max(1, ...rows.map((r) => r.length));
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`;
    xml += `<sheetViews><sheetView workbookViewId="0"${sh.first ? ' tabSelected="1"' : ''}>${sh.freeze ? `<pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/>` : ''}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>`;
    if (sh.widths) xml += '<cols>' + sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    xml += '<sheetData>';
    rows.forEach((r, ri) => {
      const h = sh.heights && sh.heights[ri];
      xml += `<row r="${ri + 1}"${h ? ` ht="${h}" customHeight="1"` : ''}>`;
      r.forEach((c, ci) => { if (c === null || c === undefined || c === '') { if (c && c.s) return; return; }
        const cell = typeof c === 'object' ? c : { v: c }, ref = colName(ci) + (ri + 1), st = cell.s ? ` s="${cell.s}"` : '';
        if (typeof cell.v === 'number') xml += `<c r="${ref}"${st}><v>${cell.v}</v></c>`; else xml += `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${X(cell.v)}</t></is></c>`; });
      xml += '</row>';
    });
    xml += '</sheetData>';
    if ((sh.merges || []).length) xml += `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`;
    if ((sh.validations || []).length) xml += `<dataValidations count="${sh.validations.length}">${sh.validations.map((v) => `<dataValidation type="${v.type}"${v.op ? ` operator="${v.op}"` : ''} allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Check this cell" error="${X(v.error || 'This value is not allowed here.')}" sqref="${v.sqref}"><formula1>${X(v.f1)}</formula1>${v.f2 ? `<formula2>${X(v.f2)}</formula2>` : ''}</dataValidation>`).join('')}</dataValidations>`;
    return xml + '</worksheet>';
  }

  async function write(sheets) {
    const zip = new JSZip(); const n = sheets.length;
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${X(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file('xl/styles.xml', STYLES);
    sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(Object.assign({ first: i === 0 }, s))));
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  }

  /* ---------- reading ---------- */
  const txt = (el) => { let s = ''; (function walk(n) { for (const c of Array.from(n.childNodes)) { if (c.nodeType === 3) s += c.nodeValue; else if (c.nodeType === 1 && c.localName !== 'rPh' && c.localName !== 'phoneticPr') walk(c); } })(el); return s; };
  async function readXlsx(buf) {
    const zip = await JSZip.loadAsync(buf), dp = new DOMParser(), get = async (p) => { const f = zip.file(p); return f ? dp.parseFromString(await f.async('string'), 'application/xml') : null; };
    const wb = await get('xl/workbook.xml'); if (!wb) throw new Error('This is not an Excel (.xlsx) file.');
    const rels = await get('xl/_rels/workbook.xml.rels'), relMap = {}; if (rels) Array.from(rels.getElementsByTagName('Relationship')).forEach((r) => { relMap[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const ss = [], sst = await get('xl/sharedStrings.xml'); if (sst) Array.from(sst.getElementsByTagName('si')).forEach((si) => ss.push(txt(si)));
    const out = [];
    for (const sh of Array.from(wb.getElementsByTagName('sheet'))) {
      const rid = sh.getAttribute('r:id') || Array.from(sh.attributes).find((a) => a.localName === 'id' && a.prefix === 'r')?.value || sh.getAttribute('id'), target = relMap[rid]; if (!target) continue;
      const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, ''), doc = await get(path); if (!doc) continue;
      const rows = [];
      Array.from(doc.getElementsByTagName('row')).forEach((row) => {
        const ri = (parseInt(row.getAttribute('r'), 10) || rows.length + 1) - 1, arr = []; let next = 0;
        Array.from(row.getElementsByTagName('c')).forEach((c) => {
          const ci = c.getAttribute('r') ? colIndex(c.getAttribute('r')) : next; next = ci + 1; const t = c.getAttribute('t'); let v = '';
          if (t === 'inlineStr') { const is = Array.from(c.childNodes).find((n) => n.localName === 'is'); v = is ? txt(is) : ''; }
          else { const ve = Array.from(c.childNodes).find((n) => n.localName === 'v'); const raw = ve ? ve.textContent : ''; v = t === 's' ? (ss[parseInt(raw, 10)] ?? '') : t === 'b' ? (raw === '1' ? 'TRUE' : 'FALSE') : t === 'e' ? '' : raw; }
          arr[ci] = v;
        });
        while (rows.length < ri) rows.push([]); rows[ri] = arr;
      });
      out.push({ name: sh.getAttribute('name'), rows: rows.map((r) => Array.from(r || [], (x) => (x === undefined ? '' : x))) });
    }
    return out;
  }
  function readCsv(text) {
    text = text.replace(/^\uFEFF/, ''); const first = text.split(/\r?\n/)[0] || '', cnt = (ch) => first.split(ch).length - 1, d = cnt('\t') > cnt(',') && cnt('\t') > cnt(';') ? '\t' : cnt(';') > cnt(',') ? ';' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) { const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === d) { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; } else cur += ch; }
    if (cur !== '' || row.length) { row.push(cur.replace(/\r$/, '')); rows.push(row); }
    return [{ name: 'CSV', rows }];
  }
  async function read(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') return readCsv(await file.text());
    if (name.endsWith('.xls')) throw new Error('Old .xls files are not supported. In Excel choose File > Save As > "Excel Workbook (.xlsx)" and upload that.');
    return readXlsx(await file.arrayBuffer());
  }
  const toCsv = (rows) => '\uFEFF' + rows.map((r) => r.map((c) => { const s = String(c == null ? '' : c); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
  window.XlsxLite = { write, read, toCsv, colName };
})();
