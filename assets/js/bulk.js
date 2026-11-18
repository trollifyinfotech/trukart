/* bulk.js - Seller > Bulk upload: pick product types, download an Excel template, fill it, add photos, check, upload many products at once.
   Photos are matched by FILE NAME (columns Image 1-3 in the sheet). Products are created as drafts, then optionally sent for review. */
(function () {
  const CLOTH = ['Free Size', 'S', 'M', 'L', 'XL', 'XXL'];
  const TYPES = [
    { id: 'shirt', name: 'Shirts & T-shirts', sizes: CLOTH, care: true, specs: ['Fit', 'Pattern', 'Sleeve', 'Neck', 'Occasion'], ex: { title: 'Men Cotton Regular Fit Casual Shirt', mat: 'Cotton', color: 'Blue', stock: { S: 5, M: 10, L: 10, XL: 4 }, specs: { Fit: 'Regular', Pattern: 'Checked', Sleeve: 'Full Sleeve' } } },
    { id: 'jeans', name: 'Jeans & Trousers', sizes: ['28', '30', '32', '34', '36', '38'], care: true, specs: ['Fit', 'Rise', 'Stretch', 'Closure'], ex: { title: 'Men Slim Fit Stretchable Jeans', mat: 'Denim', color: 'Dark Blue', stock: { 30: 8, 32: 12, 34: 6 }, specs: { Fit: 'Slim', Stretch: 'Yes' } } },
    { id: 'ethnic', name: 'Kurti, Saree & Ethnic wear', sizes: CLOTH, care: true, specs: ['Pattern', 'Sleeve', 'Neck', 'Length', 'Occasion'], ex: { title: 'Women Embroidered Rayon Straight Kurti', mat: 'Rayon', color: 'Maroon', stock: { M: 6, L: 8, XL: 5, XXL: 3 }, specs: { Pattern: 'Embroidered', Sleeve: '3/4 Sleeve', Length: 'Calf Length' } } },
    { id: 'western', name: 'Western wear (tops, dresses)', sizes: CLOTH, care: true, specs: ['Fit', 'Pattern', 'Sleeve', 'Neck', 'Occasion'], ex: { title: 'Women Floral Print A-Line Dress', mat: 'Polyester', color: 'Pink', stock: { S: 4, M: 6, L: 6 }, specs: { Pattern: 'Floral', Sleeve: 'Short Sleeve' } } },
    { id: 'kids', name: 'Kids wear', sizes: ['0-1 Yr', '1-2 Yr', '2-3 Yr', '3-4 Yr', '5-6 Yr', '7-8 Yr'], care: true, specs: ['Pattern', 'Sleeve', 'Occasion'], ex: { title: 'Boys Cotton Printed T-shirt', mat: 'Cotton', color: 'Red', stock: { '1-2 Yr': 5, '2-3 Yr': 7 }, specs: { Pattern: 'Printed' } } },
    { id: 'footwear', name: 'Footwear', sizes: ['6', '7', '8', '9', '10', '11'], specs: ['Type', 'Sole material', 'Closure'], ex: { title: 'Men Casual Slip-on Sandals', mat: 'EVA', color: 'Brown', stock: { 7: 5, 8: 8, 9: 6, 10: 3 }, specs: { Type: 'Sandals', 'Sole material': 'EVA' } } },
    { id: 'grocery', name: 'Grocery & food', pack: true, specs: ['Shelf life', 'Veg / Non-veg', 'Brand origin'], ex: { title: 'Premium Basmati Rice', mat: '', color: '', pack: '5 kg', stock: 40, specs: { 'Shelf life': '12 months', 'Veg / Non-veg': 'Veg' } } },
    { id: 'bottle', name: 'Bottles & Home & kitchen', pack: true, specs: ['Capacity', 'Dimensions', 'Warranty'], ex: { title: 'Steel Insulated Water Bottle', mat: 'Stainless Steel', color: 'Silver', pack: '750 ml', stock: 25, specs: { Capacity: '750 ml', Warranty: '6 months' } } },
    { id: 'beauty', name: 'Beauty & personal care', pack: true, specs: ['Skin / hair type', 'Shelf life', 'Country of origin'], ex: { title: 'Aloe Vera Face Wash', mat: '', color: '', pack: '100 ml', stock: 30, specs: { 'Skin / hair type': 'All' } } },
    { id: 'electronics', name: 'Electronics & gadgets', pack: true, specs: ['Model', 'Warranty', 'Power / Battery'], ex: { title: 'Wireless Bluetooth Earbuds', mat: '', color: 'Black', pack: '', stock: 15, specs: { Model: 'BT-200', Warranty: '1 year' } } },
    { id: 'accessories', name: 'Bags, jewellery, watches & accessories', pack: true, specs: ['Type', 'Occasion', 'Closure'], ex: { title: 'Women Printed Sling Bag', mat: 'PU', color: 'Tan', pack: '', stock: 12, specs: { Type: 'Sling Bag' } } },
    { id: 'other', name: 'Anything else', pack: true, specs: ['Feature 1', 'Feature 2', 'Feature 3'], ex: { title: 'My Product Name', mat: '', color: '', pack: '', stock: 10, specs: {} } },
  ];
  const MAX_ROWS = 200, YN = 'Yes,No';
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[*₹()%\/\-_:.,]/g, ' ').replace(/\s+/g, ' ').trim();
  const sizeToken = (s) => String(s || 'STD').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'STD';
  const rnd = (n) => Math.random().toString(36).slice(2, 2 + n).toUpperCase();
  let BK = null;

  /* ---------- template ---------- */
  const catLabels = (cats) => { const byId = new Map(cats.map((c) => [c.id, c])), path = (c) => (c.parent_id && byId.get(c.parent_id) ? path(byId.get(c.parent_id)) + ' › ' : '') + c.name; return cats.map((c) => ({ id: c.id, label: path(c), slug: c.slug, name: c.name })).sort((a, b) => a.label.localeCompare(b.label)); };
  function columnsFor(t) {
    const c = [['code', 'Product Code', 16, false], ['title', 'Title', 40, true], ['brand', 'Brand', 18, false], ['category', 'Category', 34, true], ['description', 'Description', 55, false], ['mrp', 'MRP (₹)', 12, true], ['price', 'Selling Price (₹)', 16, true], ['gst', 'GST %', 9, false], ['material', 'Material / Fabric', 18, false], ['color', 'Colour', 14, false], ['returnable', 'Returnable (Yes/No)', 14, false]];
    if (t.sizes) t.sizes.forEach((s) => c.push(['stock:' + s, 'Stock - ' + s, 11, false])); else { c.push(['pack', 'Pack size / weight', 16, false]); c.push(['stock', 'Stock', 10, true]); }
    (t.specs || []).forEach((s) => c.push(['spec:' + s, s, 16, false])); if (t.care) c.push(['care', 'Care instructions', 28, false]);
    c.push(['img1', 'Image 1', 24, true], ['img2', 'Image 2', 24, false], ['img3', 'Image 3', 24, false]);
    return c.map(([k, h, w, req]) => ({ k, h, w, req }));
  }
  function sheetFor(t, nCat) {
    const cols = columnsFor(t), idx = (k) => cols.findIndex((c) => c.k === k), L = (k) => XlsxLite.colName(idx(k)), last = 501;
    const head = cols.map((c) => ({ v: c.h + (c.req ? ' *' : ''), s: c.req ? 1 : 2 }));
    const ex = cols.map((c) => { const e = t.ex, v = c.k === 'code' ? 'EXAMPLE-01' : c.k === 'title' ? 'EXAMPLE: ' + e.title : c.k === 'brand' ? 'Your Brand' : c.k === 'category' ? '(choose from the list)' : c.k === 'description' ? 'Write 2-4 lines about the product: fabric, fit, features.' : c.k === 'mrp' ? 999 : c.k === 'price' ? 599 : c.k === 'gst' ? 5 : c.k === 'material' ? e.mat : c.k === 'color' ? e.color : c.k === 'returnable' ? 'Yes' : c.k === 'pack' ? e.pack : c.k === 'stock' ? e.stock : c.k.startsWith('stock:') ? (e.stock[c.k.slice(6)] ?? '') : c.k.startsWith('spec:') ? (e.specs[c.k.slice(5)] || '') : c.k === 'care' ? 'Machine wash cold' : c.k === 'img1' ? 'example-front.jpg' : c.k === 'img2' ? 'example-back.jpg' : c.k === 'img3' ? 'example-side.jpg' : ''; return { v, s: 3 }; });
    const v = [{ type: 'list', sqref: `${L('category')}2:${L('category')}${last}`, f1: `Categories!$A$2:$A$${Math.max(3, nCat + 1)}`, error: 'Pick a category from the list (see the Categories sheet).' }, { type: 'list', sqref: `${L('returnable')}2:${L('returnable')}${last}`, f1: `"${YN}"`, error: 'Type Yes or No.' }, { type: 'decimal', op: 'greaterThan', sqref: `${L('mrp')}2:${L('price')}${last}`, f1: '0', error: 'Enter a price greater than 0.' }, { type: 'decimal', op: 'between', sqref: `${L('gst')}2:${L('gst')}${last}`, f1: '0', f2: '28', error: 'GST must be between 0 and 28.' }];
    const sc = cols.filter((c) => c.k === 'stock' || c.k.startsWith('stock:')); if (sc.length) v.push({ type: 'whole', op: 'greaterThanOrEqual', sqref: `${L(sc[0].k)}2:${L(sc[sc.length - 1].k)}${last}`, f1: '0', error: 'Stock must be a whole number (0 or more). Leave blank if you do not sell this size.' });
    return { name: t.name.replace(/[\[\]:*?\/\\]/g, '').slice(0, 31), rows: [head, ex], widths: cols.map((c) => c.w), freeze: 1, heights: [34, 48], validations: v };
  }
  function helpSheet(types) {
    const R = (a, s) => [{ v: a, s: s || 4 }], lines = [[{ v: 'Bulk product upload - how to fill this file', s: 5 }], [''], ...[
      '1. There is one sheet for each type of product you selected. Fill one ROW for every product. Delete nothing in the first (coloured) row.',
      '2. Columns with a * are required. Grey columns are optional.',
      '3. Category: choose from the drop-down list (the full list is on the "Categories" sheet).',
      '4. MRP is the printed price. Selling Price is what the customer pays (including GST). Selling Price cannot be more than MRP.',
      '5. SIZES: in the "Stock - ..." columns type how many pieces you have in each size. Leave the cell BLANK if you do not sell that size. Type 0 if the size exists but is out of stock.',
      '6. Products without sizes (grocery, bottles, etc.): use "Pack size / weight" (for example 500 g or 1 L) and "Stock".',
      '7. If the same product comes in another colour, add another row with the new colour and its own photos.',
      '8. PHOTOS: type the file name of each photo in Image 1, Image 2, Image 3 (for example kurti-red-front.jpg). Image 1 is required and is the main photo. Later, on the Bulk upload page, select all the photo files together - they are matched by file name.',
      '9. Photos: JPG, PNG or WebP. Big photos are reduced automatically.',
      '10. The yellow EXAMPLE row is skipped automatically - you can overwrite or delete it.',
      '11. Save the file as .xlsx (Excel / Google Sheets "Download as Excel") or as .csv for a single sheet, then upload it on the Bulk upload page.',
      `12. Up to ${MAX_ROWS} products in one upload. Products are first saved as drafts; you can choose to send them for review right away.`,
    ].map((x) => R(x)), [''], [{ v: 'Sheets in this file:', s: 5 }], ...types.map((t) => R('• ' + t.name))];
    return { name: 'How to fill', rows: lines, widths: [120], heights: lines.map((_, i) => (i > 1 && i < 14 ? 36 : 20)) };
  }
  async function downloadTemplate(ids) {
    const types = TYPES.filter((t) => ids.includes(t.id)); if (!types.length) return toast('Select at least one product type', 'error');
    const cats = catLabels(await getCats()); const blob = await XlsxLite.write([helpSheet(types), ...types.map((t) => sheetFor(t, cats.length)), { name: 'Categories', rows: [[{ v: 'Category (copy exactly)', s: 1 }], ...cats.map((c) => [c.label])], widths: [60], freeze: 1 }]);
    save(blob, 'bulk-product-template.xlsx'); toast('Template downloaded - fill it in Excel or Google Sheets');
  }
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); };

  /* ---------- reading + checking the filled sheet ---------- */
  const ALIASES = { code: ['product code', 'code', 'sku', 'item code'], title: ['title', 'product title', 'product name', 'name'], brand: ['brand', 'brand name'], category: ['category', 'category name'], description: ['description', 'details', 'product description'], mrp: ['mrp', 'original price', 'mrp rs', 'list price'], price: ['selling price', 'price', 'sale price', 'selling price rs'], gst: ['gst', 'gst rate', 'tax'], material: ['material fabric', 'material', 'fabric'], color: ['colour', 'color'], returnable: ['returnable yes no', 'returnable', 'returnable yes no '], care: ['care instructions', 'care'], pack: ['pack size weight', 'pack size', 'weight', 'pack'], stock: ['stock', 'quantity', 'qty'], img1: ['image 1', 'image1', 'photo 1', 'main image'], img2: ['image 2', 'image2', 'photo 2'], img3: ['image 3', 'image3', 'photo 3'] };
  function mapHeaders(headerRow, t) {
    const map = {}; headerRow.forEach((h, i) => { const n = norm(h); if (!n) return; let key = null;
      for (const [k, al] of Object.entries(ALIASES)) if (al.map(norm).includes(n)) { key = k; break; }
      if (!key && /^stock /.test(n)) { const raw = String(h).replace(/^\s*stock\s*[-:–]?\s*/i, '').trim(); key = 'stock:' + (/^free/i.test(raw) ? 'Free Size' : raw.toUpperCase() === raw ? raw : raw); }
      if (!key) { const sp = (t.specs || []).find((s) => norm(s) === n); if (sp) key = 'spec:' + sp; }
      if (key && !(key in map)) map[key] = i; });
    return map;
  }
  const num = (v) => { const s = String(v == null ? '' : v).replace(/[₹,\s]/g, '').replace(/^rs\.?/i, ''); if (s === '') return NaN; return Number(s); };
  const yn = (v) => { const s = norm(v); return s === '' ? true : ['yes', 'y', 'true', '1', 'haan', 'ha'].includes(s) ? true : ['no', 'n', 'false', '0', 'nahi', 'na'].includes(s) ? false : null; };
  function parseSheets(sheets, csvType) {
    const out = []; const byName = new Map(TYPES.map((t) => [norm(t.name), t]));
    sheets.forEach((sh) => { let t = byName.get(norm(sh.name)); if (!t && sh.name === 'CSV') t = TYPES.find((x) => x.id === csvType) || TYPES[0]; if (!t) return;
      const hi = sh.rows.findIndex((r) => r.some((c) => ['title', 'product title', 'product name'].includes(norm(c)))); if (hi < 0) { out.push({ type: t, name: sh.name, rows: [], headError: 'Could not find the heading row (a column called Title).' }); return; }
      const map = mapHeaders(sh.rows[hi], t), rows = [];
      sh.rows.slice(hi + 1).forEach((r, k) => { const get = (key) => (key in map ? String(r[map[key]] ?? '').trim() : ''); if (!r.some((c) => String(c || '').trim() !== '')) return; if (/^example/i.test(get('title'))) return;
        const stocks = {}; Object.keys(map).filter((k2) => k2.startsWith('stock:')).forEach((k2) => { const v = get(k2); if (v !== '') stocks[k2.slice(6)] = v; });
        const specs = {}; Object.keys(map).filter((k2) => k2.startsWith('spec:')).forEach((k2) => { const v = get(k2); if (v) specs[k2.slice(5)] = v; });
        rows.push({ n: hi + 2 + k, raw: { code: get('code'), title: get('title'), brand: get('brand'), category: get('category'), description: get('description'), mrp: get('mrp'), price: get('price'), gst: get('gst'), material: get('material'), color: get('color'), returnable: get('returnable'), care: get('care'), pack: get('pack'), stock: get('stock'), stocks, specs, img: [get('img1'), get('img2'), get('img3')] } }); });
      out.push({ type: t, name: sh.name, rows, missing: ['title', 'category', 'mrp', 'price', 'img1'].filter((k) => !(k in map)) }); });
    return out;
  }
  function validate(parsed, ctx) {
    const res = []; let total = 0;
    parsed.forEach((sh) => { if (sh.headError) { res.push({ sheet: sh.name, n: 0, title: '(whole sheet)', errors: [sh.headError], ok: false }); return; }
      if (sh.missing.length) res.push({ sheet: sh.name, n: 0, title: '(whole sheet)', errors: ['Missing columns: ' + sh.missing.join(', ') + '. Download a fresh template.'], ok: false });
      sh.rows.forEach(({ n, raw }) => { total++; const err = [], warn = [], t = sh.type, p = { sheet: sh.name, n, title: raw.title, type: t };
        if (total > MAX_ROWS) err.push(`Only ${MAX_ROWS} products can be uploaded at a time - upload this one in the next file.`);
        if (raw.title.length < 3 || raw.title.length > 200) err.push('Title must be 3 to 200 characters.');
        const cat = ctx.catMap.get(norm(raw.category)); if (!raw.category) err.push('Category is required.'); else if (!cat) err.push(`Category "${raw.category}" is not in the list.`);
        let brand = null; if (raw.brand) { brand = ctx.brandMap.get(norm(raw.brand)) || null; if (!brand) warn.push(`Brand "${raw.brand}" is not registered; it will be shown in the details only.`); }
        const mrp = num(raw.mrp), price = num(raw.price); if (!(mrp > 0)) err.push('MRP must be a number above 0.'); if (!(price > 0)) err.push('Selling Price must be a number above 0.'); if (mrp > 0 && price > 0 && price > mrp) err.push('Selling Price cannot be more than MRP.');
        let gst = raw.gst === '' ? 5 : num(raw.gst); if (!(gst >= 0 && gst <= 28)) { err.push('GST % must be between 0 and 28.'); gst = 5; }
        if (raw.description.length > 8000) err.push('Description is too long (max 8000 characters).'); if (raw.color.length > 40) err.push('Colour is too long (max 40).'); if (raw.material.length > 200) err.push('Material is too long.');
        const ret = yn(raw.returnable); if (ret === null) err.push('Returnable must be Yes or No.');
        const variants = [];
        if (t.sizes) { Object.entries(raw.stocks).forEach(([size, v]) => { const q = num(v); if (!(Number.isInteger(q) && q >= 0)) err.push(`Stock for size ${size} must be a whole number (0 or more).`); else { if (size.length > 20) err.push('Size name too long: ' + size); variants.push({ size, color: raw.color || null, stock: q }); } }); if (!variants.length) err.push('Enter stock for at least one size (leave other sizes blank).'); else if (variants.every((v) => v.stock === 0)) warn.push('All sizes have 0 stock.'); }
        else { const q = num(raw.stock); if (!(Number.isInteger(q) && q >= 0)) err.push('Stock must be a whole number (0 or more).'); else variants.push({ size: raw.pack || null, color: raw.color || null, stock: q }); if (raw.pack.length > 20) err.push('Pack size / weight is too long (max 20 characters).'); }
        const names = raw.img.filter(Boolean); if (!raw.img[0]) err.push('Image 1 (main photo) is required.');
        const files = []; names.forEach((nm) => { if (/^https?:\/\//i.test(nm)) { err.push('Photo links are not supported - type the file name and add the photo file below.'); return; } const f = ctx.files.get(nm.split(/[\\/]/).pop().trim().toLowerCase()); if (!f) err.push(`Photo "${nm}" was not added yet.`); else files.push(f); });
        const specs = Object.assign({}, raw.specs); if (raw.brand && !brand) specs.Brand = raw.brand;
        Object.assign(p, { errors: err, warnings: warn, ok: !err.length, data: { title: raw.title, category_id: cat && cat.id, brand_id: brand && brand.id, description: raw.description || null, base_price: price, original_price: mrp, tax_rate: gst, material: raw.material || null, care_instructions: raw.care || null, is_returnable: ret !== false, specifications: specs, code: raw.code, variants, files } }); res.push(p); }); });
    return res;
  }
  async function context() {
    const [cats, brands] = await Promise.all([getCats(), getBrands()]), labels = catLabels(cats), catMap = new Map(), count = {};
    labels.forEach((c) => { count[norm(c.name)] = (count[norm(c.name)] || 0) + 1; }); labels.forEach((c) => { catMap.set(norm(c.label), c); if (count[norm(c.name)] === 1) catMap.set(norm(c.name), c); catMap.set(norm(c.slug), c); });
    return { catMap, brandMap: new Map(brands.map((b) => [norm(b.name), b])), files: BK.files };
  }

  /* ---------- photos ---------- */
  const sniffImg = async (f) => { const b = new Uint8Array(await f.slice(0, 12).arrayBuffer()), h = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(''); if (h.startsWith('89504e470d0a1a0a')) return 'png'; if (h.startsWith('ffd8ff')) return 'jpg'; if (h.startsWith('52494646') && h.slice(16, 24) === '57454250') return 'webp'; return null; };
  const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
  async function prepImage(file) {
    const t = await sniffImg(file); if (!t) throw new Error(file.name + ' is not a valid JPG / PNG / WebP photo'); if (file.size > 20 * 1048576) throw new Error(file.name + ' is larger than 20 MB');
    let bmp; try { bmp = await createImageBitmap(file); } catch (e) { if (file.size <= 5 * 1048576) return { blob: file, ext: t }; throw new Error(file.name + ' could not be read'); }
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)); if (scale === 1 && file.size <= 1.5 * 1048576) { if (bmp.close) bmp.close(); return { blob: file, ext: t }; }
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale)); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
    let blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88)); if (blob && blob.size > 4.8 * 1048576) blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.7)); if (!blob) throw new Error(file.name + ' could not be converted'); return { blob, ext: 'jpg' };
  }

  /* ---------- creating the products ---------- */
  async function createOne(r, submit) {
    const d = r.data, pre = S.seller.id.replace(/-/g, '').slice(0, 4).toUpperCase(), base = (d.code ? d.code.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) : '') || rnd(6);
    const { data: prod, error } = await window.sb.from('products').insert({ seller_id: S.seller.id, category_id: d.category_id, brand_id: d.brand_id, title: d.title, slug: slugify(d.title) + '-' + Math.random().toString(36).slice(2, 8), description: d.description, base_price: d.base_price, original_price: d.original_price, tax_rate: d.tax_rate, material: d.material, care_instructions: d.care_instructions, is_returnable: d.is_returnable, specifications: d.specifications, approval_status: 'draft' }).select('id').single();
    if (error) throw error; const pid = prod.id, uploaded = [];
    const undo = async () => { if (uploaded.length) await window.sb.storage.from('product-images').remove(uploaded).catch(() => {}); await window.sb.from('products').delete().eq('id', pid); };
    try {
      for (let i = 0; i < d.files.length; i++) { const { blob, ext } = await prepImage(d.files[i]); const path = `${S.user.id}/${pid}/${uuid()}.${ext}`; const up = await window.sb.storage.from('product-images').upload(path, blob, { contentType: MIME[ext], upsert: false }); if (up.error) throw up.error; uploaded.push(path); const ins = await window.sb.from('product_images').insert({ product_id: pid, storage_path: path, alt_text: d.title, sort_order: i, is_primary: i === 0 }); if (ins.error) throw ins.error; }
      for (let attempt = 0; attempt < 3; attempt++) { const suffix = attempt ? '-' + rnd(4) : ''; const rows = d.variants.map((v) => ({ product_id: pid, sku: `${pre}-${base}-${sizeToken(v.size)}${suffix}`.slice(0, 60), size: v.size, color: v.color, price_override: null, stock_quantity: v.stock, is_active: true })); const { error: ve } = await window.sb.from('product_variants').insert(rows); if (!ve) break; if (ve.code !== '23505' || attempt === 2) throw ve; }
      if (submit) { const { error: se } = await window.sb.from('products').update({ approval_status: 'pending_review' }).eq('id', pid); if (se) throw se; }
    } catch (e) { await undo(); throw e; }
    return pid;
  }
  async function runUpload(submit) {
    const todo = BK.results.filter((r) => r.ok && !r.done); if (!todo.length) return; BK.running = true; BK.submit = submit; draw();
    let i = 0, active = 0; const next = async () => { while (i < todo.length) { const r = todo[i++]; r.state = 'working'; paint(); try { await createOne(r, submit); r.done = true; r.state = 'done'; } catch (e) { r.state = 'failed'; r.fail = errMsg(e, 'Could not create this product'); } paint(); } };
    await Promise.all([next(), next()]); BK.running = false; BK.finished = true; draw(); window.Data && Data.bump && Data.bump();
    const ok = todo.filter((r) => r.done).length; toast(`${ok} product${ok === 1 ? '' : 's'} uploaded${todo.length - ok ? ', ' + (todo.length - ok) + ' failed' : ''}`, todo.length - ok ? 'error' : 'success');
  }

  /* ---------- page ---------- */
  const stateOf = (r) => (r.state === 'done' ? '<span class="bk-s ok">✓ Uploaded</span>' : r.state === 'working' ? '<span class="bk-s">Uploading…</span>' : r.state === 'failed' ? `<span class="bk-s bad">Failed: ${esc(r.fail)}</span>` : r.ok ? '<span class="bk-s ok">Ready</span>' + (r.warnings.length ? `<div class="small muted">${r.warnings.map(esc).join('<br>')}</div>` : '') : `<span class="bk-s bad">${r.errors.map(esc).join('<br>')}</span>`);
  function rowsHtml() { const list = BK.onlyErr ? BK.results.filter((r) => !r.ok || r.state === 'failed') : BK.results; return list.length ? `<div class="bk-tbl"><table><thead><tr><th>Row</th><th>Sheet</th><th>Product</th><th>Result</th></tr></thead><tbody>${list.slice(0, 300).map((r) => `<tr><td>${r.n || '-'}</td><td>${esc(r.sheet)}</td><td>${esc(r.title)}</td><td>${stateOf(r)}</td></tr>`).join('')}</tbody></table></div>${list.length > 300 ? `<p class="small muted">Showing the first 300 of ${list.length} rows.</p>` : ''}` : '<p class="muted">Nothing to show.</p>'; }
  function paint() { const el = $('#bk-rows'); if (el) el.innerHTML = rowsHtml(); const done = BK.results.filter((r) => r.ok && (r.done || r.state === 'failed')).length, tot = BK.results.filter((r) => r.ok).length, bar = $('#bk-bar'); if (bar) { bar.style.width = (tot ? Math.round(done / tot * 100) : 0) + '%'; const t = $('#bk-bt'); if (t) t.textContent = `${done} of ${tot} done`; } }
  function draw() {
    const el = $('#bk'); if (!el) return; const ready = BK.results.filter((r) => r.ok && !r.done).length, bad = BK.results.filter((r) => !r.ok).length, done = BK.results.filter((r) => r.done).length, failed = BK.results.filter((r) => r.state === 'failed').length;
    el.innerHTML = `<div class="row between wrap mb"><h2>Bulk upload</h2><a class="btn sm" href="#/seller/products">My products</a></div>
      <p class="small muted mb">List many products at once from an Excel / Google Sheets file. Choose the product types, download the template, fill one row per product, add your photos, check, and upload.</p>
      <section class="card mb"><h3 class="bk-h"><span>1</span> What do you want to list?</h3><div class="bk-types">${TYPES.map((t) => `<label class="bk-type ${BK.sel.has(t.id) ? 'on' : ''}"><input type="checkbox" data-bkt="${t.id}" ${BK.sel.has(t.id) ? 'checked' : ''}><b>${esc(t.name)}</b><small>${t.sizes ? 'Sizes: ' + esc(t.sizes.join(', ')) : 'Pack size + stock'}</small></label>`).join('')}</div>
        <div class="row wrap mt"><button class="btn p" data-act="bkTemplate" ${BK.sel.size ? '' : 'disabled'}>Download Excel template (${BK.sel.size} selected)</button>${BK.sel.size === 1 ? '<button class="btn" data-act="bkCsv">Download CSV template</button>' : ''}</div></section>
      <section class="card mb"><h3 class="bk-h"><span>2</span> Upload your filled sheet</h3><p class="small muted">Excel (.xlsx) from Excel, Google Sheets or LibreOffice. A CSV file also works for one product type.</p>
        <div class="row wrap"><label class="btn p" style="cursor:pointer">Choose sheet file<input type="file" data-bksheet accept=".xlsx,.csv,.txt,.xls" hidden></label><span class="small">${BK.sheetName ? '📄 ' + esc(BK.sheetName) : 'No file chosen'}</span>
        <label class="small row" style="gap:6px">If it is a CSV, the type is: <select data-bkcsv>${TYPES.map((t) => `<option value="${t.id}" ${BK.csvType === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label></div></section>
      <section class="card mb"><h3 class="bk-h"><span>3</span> Add the product photos</h3><p class="small muted">Select all photos together. They are matched with the file names you typed in the Image 1 / 2 / 3 columns (capital or small letters do not matter).</p>
        <div class="row wrap"><label class="btn p" style="cursor:pointer">Choose photos<input type="file" data-bkimg accept="image/jpeg,image/png,image/webp" multiple hidden></label><label class="btn" style="cursor:pointer">Choose a whole folder<input type="file" data-bkimg webkitdirectory hidden></label><span class="small">${BK.files.size} photo${BK.files.size === 1 ? '' : 's'} added</span>${BK.files.size ? '<button class="linkbtn" data-act="bkClearImg">Clear</button>' : ''}</div></section>
      ${BK.results.length ? `<section class="card mb"><h3 class="bk-h"><span>4</span> Check and upload</h3>
        <div class="row wrap mb"><span class="bk-chip ok">${ready + done} ready</span><span class="bk-chip ${bad ? 'bad' : ''}">${bad} need fixing</span>${done ? `<span class="bk-chip ok">${done} uploaded</span>` : ''}${failed ? `<span class="bk-chip bad">${failed} failed</span>` : ''}<label class="chk" style="margin:0 0 0 auto"><input type="checkbox" data-bkerr ${BK.onlyErr ? 'checked' : ''}> Show only problems</label></div>
        ${BK.running || BK.finished ? '<div class="bk-prog"><i id="bk-bar" style="width:0"></i></div><p class="small muted" id="bk-bt"></p>' : ''}
        <div id="bk-rows">${rowsHtml()}</div>
        ${bad ? '<div class="row wrap mt"><button class="btn sm" data-act="bkReport">Download problem list (CSV)</button><span class="small muted">Fix the sheet, then choose it again - you do not need to add the photos again.</span></div>' : ''}
        ${ready && !BK.running ? `<div class="mt"><label class="chk"><input type="radio" name="bksub" data-bksub="0" ${BK.submit ? '' : 'checked'}> Save as drafts (I will review and send them later)</label><label class="chk"><input type="radio" name="bksub" data-bksub="1" ${BK.submit ? 'checked' : ''}> Send for review right after upload</label><button class="btn p mt" data-act="bkGo">Upload ${ready} product${ready === 1 ? '' : 's'}</button><p class="small muted">Rows with problems are skipped. Do not close this page while uploading.</p></div>` : ''}
        ${BK.finished ? '<a class="btn p mt" href="#/seller/products">Go to My products</a>' : ''}</section>` : ''}`;
    if (BK.running || BK.finished) paint();
  }
  async function loadSheet(file) { BK.sheetName = file.name; BK.parsedFile = file; await reparse(); }
  async function reparse() {
    if (!BK.parsedFile) return; try { const sheets = await XlsxLite.read(BK.parsedFile); BK.parsed = parseSheets(sheets, BK.csvType); if (!BK.parsed.some((s) => s.rows.length || s.headError)) { BK.results = []; draw(); return toast('No products found in this file. Use the template and fill at least one row.', 'error'); } }
    catch (e) { BK.results = []; draw(); return toast(e.message || 'Could not read this file', 'error'); }
    BK.finished = false; revalidate();
  }
  async function revalidate() { if (!BK.parsed) return; const keep = new Map(BK.results.filter((r) => r.done).map((r) => [r.sheet + '#' + r.n, r])); BK.results = validate(BK.parsed, await context()); BK.results.forEach((r) => { const k = keep.get(r.sheet + '#' + r.n); if (k) { r.done = true; r.state = 'done'; } }); draw(); }

  Object.assign(A, {
    bkTemplate: async (b) => { btnBusy(b, true, 'Preparing…'); try { await downloadTemplate([...BK.sel]); } catch (e) { toast(errMsg(e, 'Could not create the template'), 'error'); } btnBusy(b, false); },
    bkCsv: async () => { const t = TYPES.find((x) => x.id === [...BK.sel][0]), sh = sheetFor(t, 1); save(new Blob([XlsxLite.toCsv([sh.rows[0].map((c) => c.v), sh.rows[1].map((c) => (c.v === undefined || c.v === null ? '' : c.v))])], { type: 'text/csv' }), 'bulk-template-' + t.id + '.csv'); BK.csvType = t.id; toast('CSV template downloaded. Categories: type the category name exactly as on your website.'); },
    bkClearImg: () => { BK.files.clear(); revalidate(); },
    bkGo: () => runUpload(BK.submit),
    bkReport: () => { const rows = [['Row', 'Sheet', 'Product', 'Problems']].concat(BK.results.filter((r) => !r.ok || r.state === 'failed').map((r) => [r.n, r.sheet, r.title, (r.state === 'failed' ? r.fail : r.errors.join(' | '))])); save(new Blob([XlsxLite.toCsv(rows)], { type: 'text/csv' }), 'bulk-upload-problems.csv'); },
  });
  document.addEventListener('change', async (e) => { const t = e.target; if (!BK || !$('#bk') || !t.dataset) return;
    if (t.dataset.bkt) { t.checked ? BK.sel.add(t.dataset.bkt) : BK.sel.delete(t.dataset.bkt); draw(); }
    else if (t.dataset.bksheet !== undefined) { const f = t.files[0]; t.value = ''; if (f) { if (f.size > 15 * 1048576) return toast('Sheet is larger than 15 MB', 'error'); await loadSheet(f); } }
    else if (t.dataset.bkcsv !== undefined) { BK.csvType = t.value; if (BK.parsedFile && /\.(csv|txt)$/i.test(BK.parsedFile.name)) await reparse(); }
    else if (t.dataset.bkimg !== undefined) { const fs = Array.from(t.files).filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name) || /^image\//.test(f.type)); t.value = ''; fs.forEach((f) => BK.files.set(f.name.toLowerCase(), f)); toast(`${fs.length} photo${fs.length === 1 ? '' : 's'} added`); await revalidate(); }
    else if (t.dataset.bkerr !== undefined) { BK.onlyErr = t.checked; draw(); }
    else if (t.dataset.bksub !== undefined) { BK.submit = t.dataset.bksub === '1'; }
  });
  window.BulkKit = { TYPES, sheetFor, helpSheet, parseSheets, validate, state: () => BK };
  const reg = () => { if (!window.SellerKit) return; window.SellerKit.sellerRoute('/seller/bulk', 'bulk', async () => { BK = BK && BK.running ? BK : { sel: new Set(['shirt']), files: new Map(), results: [], csvType: 'shirt', submit: false }; return { html: '<div id="bk"></div>', mount: draw }; }); };
  reg();
})();
