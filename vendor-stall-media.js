/* Tonninyira vendor "My stall": the vendor manages what customers see.
 * Adds an Orders | My stall switch to vendor-dashboard.html. My stall lets the
 * vendor change the logo, add up to 2 videos (max 5 min each) and 12 stall
 * photos, and add, edit or remove products with up to 8 photos each. Each
 * product photo can be its own version of the product (an "option") with a
 * name, its own price and its own Sold out switch. Every
 * change saves straight to the vendor's own row (vendors_self_update); the
 * guard_vendor_media trigger enforces the same limits server-side.
 * Media goes through window.TNMedia (media-uploader.js). The stall's location
 * pin (delivery-pin.js) prices delivery at UGX 1,000 per km; a stall without
 * one cannot take orders, so the dashboard asks for it until it is set.
 */
(function(){
  'use strict';
  const MAX = { photos: 12, videos: 2, productPhotos: 8, products: 40 };
  const c = () => { try{ if(typeof supabaseClient!=='undefined'&&supabaseClient) return supabaseClient }catch(_){} return window.supabaseClient; };
  const esc = v => String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const ugx = n => 'UGX ' + Math.round(Number(n||0)).toLocaleString('en-US');
  let vendor = null, jobs = {}, editing = null, msgTimer = null, booted = false;

  function styles(){
    if(document.getElementById('tn-stall-style')) return;
    const s = document.createElement('style'); s.id = 'tn-stall-style';
    s.textContent = `
      #tnStallTabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:5px;border-radius:16px;background:var(--card);margin:12px 0 14px}
      #tnStallTabs button{min-height:44px;border:0;border-radius:12px;background:transparent;color:var(--muted);font:inherit;font-weight:800;font-size:.9rem;cursor:pointer}
      #tnStallTabs button.on{background:var(--gold);color:var(--ink)}
      #dashView.tn-stall-mode > *:not(.top-bar):not(#tnStallTabs):not(#tnStallPane){display:none!important}
      #dashView:not(.tn-stall-mode) > #tnStallPane{display:none}
      #tnStallPane{display:grid;gap:18px}
      .tns-card{background:var(--card);border-radius:20px;padding:16px}
      .tns-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:10px}
      .tns-eye{font-size:.7rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
      .tns-note{font-size:.76rem;color:var(--muted);line-height:1.45}
      .tns-bar{height:10px;border-radius:99px;background:#3A2E26;overflow:hidden;margin:10px 0}
      .tns-bar i{display:block;height:100%;background:var(--gold);border-radius:99px;transition:width .3s}
      .tns-checks{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.78rem}
      .tns-ok{color:#9FE0B0}.tns-todo{color:#FFB48A}
      .tns-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .tns-tile{position:relative;aspect-ratio:1;border-radius:14px;overflow:hidden;background:var(--card2)}
      .tns-tile img{width:100%;height:100%;object-fit:cover;display:block}
      .tns-x{position:absolute;top:5px;right:5px;width:32px;height:32px;border-radius:50%;border:0;background:rgba(20,14,11,.82);color:var(--sand);font-size:15px;cursor:pointer}
      .tns-cover{position:absolute;left:5px;bottom:5px;padding:4px 8px;border-radius:99px;border:0;background:rgba(20,14,11,.82);color:var(--sand);font:inherit;font-size:.66rem;font-weight:800;cursor:pointer}
      .tns-cover.is{background:var(--gold);color:var(--ink);cursor:default}
      .tns-add{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:2px dashed #5A4838;border-radius:14px;background:transparent;color:var(--gold);font:inherit;font-weight:800;font-size:.74rem;cursor:pointer;min-height:44px}
      .tns-add[disabled]{opacity:.45;cursor:not-allowed}
      .tns-vid{display:flex;gap:12px;align-items:center;padding:10px;border-radius:16px;background:var(--card2);margin-bottom:8px}
      .tns-vid .pv{width:112px;height:72px;border-radius:12px;background:#3A2C22 center/cover;position:relative;flex-shrink:0}
      .tns-vid .pv span{position:absolute;right:5px;bottom:5px;padding:2px 6px;border-radius:6px;background:rgba(20,14,11,.85);font-size:.7rem;font-weight:700}
      .tns-job{padding:12px;border-radius:16px;background:var(--card2);border:1px solid #5A4838;margin-bottom:8px;font-size:.8rem}
      .tns-job .tns-bar{height:8px;margin:8px 0 6px}
      .tns-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #3A2E26}
      .tns-thumb{width:56px;height:56px;border-radius:12px;background:#3A2C22 center/cover;flex-shrink:0}
      .tns-link{background:none;border:0;color:var(--gold);font:inherit;font-weight:800;font-size:.8rem;cursor:pointer;min-height:44px;padding:0 4px}
      .tns-edit{padding:14px;border-radius:16px;background:var(--card2);margin:8px 0;display:grid;gap:8px}
      .tns-edit label{font-size:.72rem;color:var(--muted);font-weight:700}
      .tns-edit input,.tns-edit textarea{width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid #4A3B30;background:var(--ink);color:var(--sand);font:inherit;font-size:.9rem}
      .tns-pphotos{display:grid;gap:8px}
      .tns-opt{display:grid;grid-template-columns:64px minmax(0,1fr) 44px;gap:8px;align-items:start;padding:8px;border-radius:14px;background:var(--ink)}
      .tns-opt .tns-tile{width:64px;height:64px;aspect-ratio:auto}
      .tns-opt .f{display:grid;gap:6px;min-width:0}
      .tns-edit .tns-opt input{padding:9px 10px;font-size:.84rem}
      .tns-opt .sold{display:flex;align-items:center;gap:6px;font-size:.74rem;color:var(--muted);font-weight:700;min-height:32px}
      .tns-opt .sold input{width:18px;height:18px;padding:0;accent-color:var(--gold)}
      .tns-opt .tns-x{position:static;width:44px;height:44px}
      .tns-btns{display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-top:4px}
      .tns-primary{min-height:48px;border:0;border-radius:14px;background:var(--gold);color:var(--ink);font:inherit;font-weight:800;cursor:pointer}
      .tns-ghost{min-height:48px;border:1px solid #4A3B30;border-radius:14px;background:transparent;color:var(--muted);font:inherit;font-weight:700;cursor:pointer}
      .tns-danger{background:none;border:0;color:#FF9C8A;font:inherit;font-weight:700;font-size:.78rem;cursor:pointer;min-height:44px;justify-self:start}
      #tnsMsg{position:fixed;left:12px;right:12px;bottom:16px;max-width:520px;margin:0 auto;padding:12px 14px;border-radius:14px;background:#2A1F19;border:1px solid #5A4838;font-size:.84rem;z-index:1000;display:none}
      #tnsMsg.show{display:block}#tnsMsg.err{border-color:#E23F25;color:#FFC2B8}
      .tns-logo{display:flex;align-items:center;gap:12px}
      .tns-loc{border:1px solid #5A4838}.tns-loc.need{border-color:#E23F25;background:#2E1A15}
      #tnsPinBanner{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:16px;background:#2E1A15;border:1px solid #E23F25;margin:0 0 12px;font-size:.84rem;line-height:1.4}
      #tnsPinBanner button{min-height:44px;padding:0 14px;border:0;border-radius:12px;background:var(--gold);color:var(--ink);font:inherit;font-weight:800;cursor:pointer;flex-shrink:0}
      #dashView.tn-stall-mode #tnsPinBanner{display:none}
      .tns-logo .lg{width:64px;height:64px;border-radius:16px;background:var(--red) center/cover;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.2rem;color:#fff;flex-shrink:0}
    `;
    document.head.appendChild(s);
  }

  function say(text, err){
    let m = document.getElementById('tnsMsg');
    if(!m){ m = document.createElement('div'); m.id = 'tnsMsg'; m.setAttribute('role','status'); document.body.appendChild(m); }
    m.textContent = text; m.className = 'show' + (err ? ' err' : '');
    clearTimeout(msgTimer); msgTimer = setTimeout(() => m.className = '', err ? 7000 : 3000);
  }

  const gallery = () => Array.isArray(vendor?.gallery) ? vendor.gallery : [];
  const items = () => Array.isArray(vendor?.items) ? vendor.items : [];
  const photos = () => gallery().filter(g => g.type !== 'video');
  const videos = () => gallery().filter(g => g.type === 'video');

  async function load(){
    const s = (await c().auth.getSession())?.data?.session; if(!s) return false;
    const { data, error } = await c().from('vendors').select('tonninyira_id,business_name,owner_name,logo_url,gallery,items,latitude,longitude').eq('auth_user_id', s.user.id).maybeSingle();
    if(error || !data) return false;
    vendor = data; return true;
  }

  async function save(patch, okText){
    const { data, error } = await c().from('vendors').update(patch).eq('tonninyira_id', vendor.tonninyira_id).select('tonninyira_id,business_name,owner_name,logo_url,gallery,items,latitude,longitude').maybeSingle();
    if(error || !data){ say('Not saved: ' + (error?.message || 'please try again.'), true); return false; }
    vendor = data; render(); banner(); if(okText) say(okText); return true;
  }

  function pick(accept, multiple){
    return new Promise(resolve => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = !!multiple;
      i.onchange = () => resolve([...(i.files || [])]); i.click();
    });
  }
  function job(id, label, pct){ if(pct == null) delete jobs[id]; else jobs[id] = { label, pct }; renderJobs(); }
  function renderJobs(){
    ['videos','photos','logo','product'].forEach(k => {
      const box = document.getElementById('tnsJobs-' + k); if(!box) return;
      box.innerHTML = Object.entries(jobs).filter(([id]) => id.startsWith(k)).map(([, j]) =>
        `<div class="tns-job"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(j.label)}</b><b style="color:var(--gold)">${Math.round(j.pct * 100)}%</b></div><div class="tns-bar"><i style="width:${Math.round(j.pct * 100)}%"></i></div></div>`).join('');
    });
  }

  async function uploadPhoto(file, key, label){
    job(key, `${label}: preparing`, 0);
    const img = await TNMedia.prepareImage(file);
    const url = await TNMedia.upload(img.blob, { kind: 'photo', ext: img.ext, onProgress: p => job(key, `${label}: uploading`, p) });
    job(key); return url;
  }

  async function addPhotos(){
    const room = MAX.photos - photos().length; if(room <= 0) return say(`You already have ${MAX.photos} stall photos. Remove one to add another.`, true);
    const files = (await pick('image/*', true)).slice(0, room);
    const added = [];
    for(const [n, f] of files.entries()){
      try{ added.push({ url: await uploadPhoto(f, 'photos' + n, `Photo ${n + 1} of ${files.length}`), type: 'image', caption: '' }); }
      catch(e){ job('photos' + n); say(e.message || 'A photo could not be uploaded.', true); }
    }
    if(added.length) await save({ gallery: [...gallery(), ...added] }, added.length === 1 ? 'Photo added to your stall.' : `${added.length} photos added to your stall.`);
  }

  async function addVideo(){
    if(videos().length >= MAX.videos) return say(`You already have ${MAX.videos} videos. Remove one to add another.`, true);
    const [file] = await pick('video/*', false); if(!file) return;
    const key = 'videos' + Date.now();
    try{
      job(key, 'Checking video', 0);
      const v = await TNMedia.prepareVideo(file, p => job(key, 'Preparing video — keep this page open', p));
      let poster = null;
      if(v.poster) poster = await TNMedia.upload(v.poster, { kind: 'poster', ext: 'jpg' });
      const url = await TNMedia.upload(v.blob, { kind: 'video', ext: v.ext, onProgress: p => job(key, 'Uploading video', p) });
      job(key);
      const caption = (file.name || '').replace(/\.[^.]+$/, '').slice(0, 60);
      await save({ gallery: [...gallery(), { url, type: 'video', poster, duration: Math.round(v.duration), caption }] }, 'Video added to your stall.');
    }catch(e){ job(key); say(e.message || 'The video could not be uploaded.', true); }
  }

  async function changeLogo(){
    const [f] = await pick('image/*', false); if(!f) return;
    try{
      const img = await TNMedia.prepareImage(f, 600);
      job('logo', 'Logo: uploading', 0);
      const url = await TNMedia.upload(img.blob, { kind: 'logo', ext: img.ext, onProgress: p => job('logo', 'Logo: uploading', p) });
      job('logo'); const old = vendor.logo_url;
      if(await save({ logo_url: url }, 'Logo updated.')) TNMedia.remove(old);
    }catch(e){ job('logo'); say(e.message || 'The logo could not be uploaded.', true); }
  }

  async function removeMedia(url){
    const g = gallery(); const it = g.find(x => x.url === url); if(!it) return;
    if(!confirm(it.type === 'video' ? 'Remove this video from your stall?' : 'Remove this photo from your stall?')) return;
    if(await save({ gallery: g.filter(x => x.url !== url) }, 'Removed.')){ TNMedia.remove(it.url); if(it.poster) TNMedia.remove(it.poster); }
  }
  async function makeCover(url){
    const g = gallery(); const i = g.findIndex(x => x.url === url); if(i < 0) return;
    const [it] = g.splice(i, 1); await save({ gallery: [it, ...g] }, 'Cover photo set.');
  }

  /* ---- stall location ---- */
  const hasPin = () => vendor && vendor.latitude != null && vendor.longitude != null;
  function setPin(){
    if(typeof tnPinSheet !== 'function') return say('The map could not load. Refresh and try again.', true);
    tnPinSheet({ eyebrow: 'Stall location', title: vendor.business_name || 'Your stall',
      note: 'Stand at your stall and tap "Use my location", or drag the pin onto your stall. Riders and delivery prices use this spot.',
      start: hasPin() ? { lat: vendor.latitude, lng: vendor.longitude } : null, saveLabel: 'Save stall location',
      onSave: async p => (await save({ latitude: p.lat, longitude: p.lng }, 'Stall location saved. Customers can order now.')) ? true : false });
  }
  function banner(){
    const dash = document.getElementById('dashView'); if(!dash) return;
    let b = document.getElementById('tnsPinBanner');
    if(hasPin()){ b?.remove(); return; }
    if(!b){
      b = document.createElement('div'); b.id = 'tnsPinBanner'; b.setAttribute('role', 'alert');
      b.innerHTML = '<span><b>Set your stall location.</b> Customers cannot order from you until you do.</span><button type="button">Set location</button>';
      b.querySelector('button').onclick = () => { setTab(true); setTimeout(setPin, 50); };
      document.getElementById('tnStallTabs')?.after(b);
    }
  }

  /* ---- products ---- */
  /* Options are kept in the draft by photo URL, so removing a photo also drops
     its option and reordering never mixes names and prices up. */
  const newOptId = () => 'o' + Math.random().toString(36).slice(2, 9);
  function openEditor(index){
    const src = index == null ? null : items()[index];
    const opts = {};
    (src?.options || []).forEach(o => { if(o && o.photo) opts[o.photo] = { id: o.id, label: o.label || '', price: o.price ? String(o.price) : '', sold_out: !!o.sold_out }; });
    editing = { index, draft: src ? { ...src, photos: [...(src.photos || [])], opts } : { name: '', desc: '', price: '', photos: [], opts } };
    render(); document.getElementById('tnsEditor')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function readOpts(){
    if(!editing) return;
    document.querySelectorAll('#tnsPPhotos .tns-opt').forEach(row => {
      const u = row.dataset.url, o = editing.draft.opts[u] || (editing.draft.opts[u] = { label: '', price: '', sold_out: false });
      o.label = row.querySelector('[data-opt=label]').value.trim().slice(0, 60);
      o.price = row.querySelector('[data-opt=price]').value.replace(/[^\d]/g, '');
      o.sold_out = row.querySelector('[data-opt=sold]').checked;
    });
  }
  /* A photo becomes an option once the vendor names it, prices it or marks it
     sold out; untouched photos stay plain pictures of the product. */
  function optionsFor(d){
    return d.photos.map(u => ({ u, o: d.opts[u] })).filter(({ o }) => o && (o.label || Number(o.price) > 0 || o.sold_out))
      .map(({ u, o }) => { o.id = o.id || newOptId(); const x = { id: o.id, photo: u }; if(o.label) x.label = o.label; if(Number(o.price) > 0) x.price = Number(o.price); if(o.sold_out) x.sold_out = true; return x; });
  }
  async function addProductPhoto(){
    if(editing.draft.photos.length >= MAX.productPhotos) return say(`Up to ${MAX.productPhotos} photos per product.`, true);
    const files = (await pick('image/*', true)).slice(0, MAX.productPhotos - editing.draft.photos.length);
    for(const [n, f] of files.entries()){
      try{ editing.draft.photos.push(await uploadPhoto(f, 'product' + n, `Product photo ${n + 1} of ${files.length}`)); renderEditorPhotos(); }
      catch(e){ job('product' + n); say(e.message || 'A photo could not be uploaded.', true); }
    }
  }
  function readDraft(){
    const f = document.getElementById('tnsEditor'); if(!f) return;
    editing.draft.name = f.querySelector('[name=name]').value.trim();
    editing.draft.desc = f.querySelector('[name=desc]').value.trim();
    editing.draft.price = f.querySelector('[name=price]').value.replace(/[^\d]/g, '');
    readOpts();
  }
  async function saveProduct(){
    readDraft(); const d = editing.draft;
    if(!d.name) return say('Give the product a name.', true);
    if(!(Number(d.price) > 0)) return say('Enter the price in UGX.', true);
    const opts = optionsFor(d);
    const next = [...items()]; const clean = { name: d.name, desc: d.desc, price: Number(d.price), ...(d.photos.length ? { photos: d.photos } : {}), ...(opts.length ? { options: opts } : {}) };
    const before = editing.index == null ? null : next[editing.index];
    if(editing.index == null){ if(next.length >= MAX.products) return say(`Up to ${MAX.products} products.`, true); next.push(clean); } else next[editing.index] = { ...next[editing.index], ...clean, ...(d.photos.length ? {} : { photos: undefined }), ...(opts.length ? {} : { options: undefined }) };
    const saved = next.map(x => { const y = { ...x }; if(!y.photos || !y.photos.length) delete y.photos; if(!y.options || !y.options.length) delete y.options; return y; });
    editing = null;
    if(await save({ items: saved }, 'Product saved.') && before?.photos) before.photos.filter(u => !clean.photos || !clean.photos.includes(u)).forEach(u => TNMedia.remove(u));
  }
  /* Sold out hides the Add to basket button on the storefront and the
     database refuses new orders for it until it is back in stock. */
  async function toggleSoldOut(i){
    const it = items()[i]; if(!it) return;
    const next = items().map((x, j) => { if(j !== i) return x; const y = { ...x }; if(y.sold_out) delete y.sold_out; else y.sold_out = true; return y; });
    await save({ items: next }, it.sold_out ? `${it.name} is back in stock.` : `${it.name} is marked sold out.`);
  }
  async function deleteProduct(){
    const it = items()[editing.index]; if(!it || !confirm(`Delete “${it.name}” from your stall?`)) return;
    const idx = editing.index; editing = null;
    if(await save({ items: items().filter((_, i) => i !== idx) }, 'Product deleted.')) (it.photos || []).forEach(u => TNMedia.remove(u));
  }
  function renderEditorPhotos(){
    const box = document.getElementById('tnsPPhotos'); if(!box || !editing) return;
    readOpts();
    const ph = editing.draft.photos, opts = editing.draft.opts;
    box.innerHTML = ph.map((u, i) => { const o = opts[u] || {}; return `<div class="tns-opt" data-url="${esc(u)}">
        <div class="tns-tile"><img src="${esc(u)}" alt="Product photo ${i + 1}" loading="lazy"></div>
        <div class="f"><input data-opt="label" maxlength="60" placeholder="Name, e.g. Brown, large" aria-label="Name for photo ${i + 1}" value="${esc(o.label || '')}" autocomplete="off">
          <input data-opt="price" inputmode="numeric" placeholder="Own price (optional)" aria-label="Price for photo ${i + 1} in UGX" value="${esc(o.price || '')}" autocomplete="off">
          <label class="sold"><input type="checkbox" data-opt="sold" ${o.sold_out ? 'checked' : ''}> This one is sold out</label></div>
        <button type="button" class="tns-x" data-pp-remove="${i}" aria-label="Remove photo ${i + 1}">✕</button></div>`; }).join('')
      + (ph.length < MAX.productPhotos ? `<button type="button" class="tns-add" data-act="pp-add" style="min-height:52px">＋ Add photo</button>` : '');
  }

  /* ---- render ---- */
  function render(){
    const pane = document.getElementById('tnStallPane'); if(!pane || !vendor) return;
    if(editing) readDraft();
    const ph = photos(), vd = videos(), it = items();
    const withPhotos = it.filter(x => (x.photos || []).length).length;
    const score = [!!vendor.logo_url, ph.length >= 3, vd.length >= 1, it.length > 0 && withPhotos === it.length].filter(Boolean).length;
    const initials = esc((vendor.business_name || 'S').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
    pane.innerHTML = `
      <div class="tns-card">
        <div style="font-weight:800;font-size:1rem">Customers buy what they can see</div>
        <div class="tns-bar"><i style="width:${score * 25}%"></i></div>
        <div class="tns-checks">
          <span class="${vendor.logo_url ? 'tns-ok' : 'tns-todo'}">${vendor.logo_url ? '✓ Logo added' : '• Add your logo'}</span>
          <span class="${ph.length >= 3 ? 'tns-ok' : 'tns-todo'}">Stall photos ${ph.length} / ${MAX.photos}</span>
          <span class="${vd.length ? 'tns-ok' : 'tns-todo'}">Videos ${vd.length} / ${MAX.videos}</span>
          <span class="${it.length && withPhotos === it.length ? 'tns-ok' : 'tns-todo'}">${withPhotos} of ${it.length} products have photos</span>
        </div>
      </div>

      <div class="tns-card tns-loc${hasPin() ? '' : ' need'}">
        <div class="tns-h"><span class="tns-eye">Stall location</span><span class="tns-note">for delivery prices</span></div>
        <div class="tns-logo"><div style="flex:1;min-width:0">${hasPin()
          ? `<div style="font-weight:800">✓ Location set</div><div class="tns-note">Delivery is UGX 1,000 per km from here to the customer.</div>`
          : `<div style="font-weight:800;color:#FFB0A5">Not set: customers cannot order yet</div><div class="tns-note">Set it once, standing at your stall.</div>`}</div>
        <button type="button" class="tns-link" data-act="pin">${hasPin() ? 'Change' : 'Set location'}</button></div>
      </div>

      <div class="tns-card">
        <div class="tns-h"><span class="tns-eye">Logo</span></div>
        <div class="tns-logo"><div class="lg" style="${vendor.logo_url ? `background-image:url('${esc(vendor.logo_url)}')` : ''}">${vendor.logo_url ? '' : initials}</div>
        <div style="flex:1"><div style="font-weight:800">${esc(vendor.business_name)}</div><div class="tns-note">Shown on your stall card and to riders.</div></div>
        <button type="button" class="tns-link" data-act="logo">${vendor.logo_url ? 'Change' : 'Add logo'}</button></div>
        <div id="tnsJobs-logo"></div>
      </div>

      <div class="tns-card">
        <div class="tns-h"><span class="tns-eye">Videos</span><span class="tns-note">up to ${MAX.videos} · max 5 min each</span></div>
        <div id="tnsJobs-videos"></div>
        ${vd.map(v => `<div class="tns-vid"><div class="pv" style="${v.poster ? `background-image:url('${esc(v.poster)}')` : ''}"><span>${TNMedia.fmt(v.duration)}</span></div>
          <div style="flex:1;min-width:0"><div style="font-weight:800;overflow-wrap:break-word">${esc(v.caption || 'Stall video')}</div><div class="tns-note">Live on your stall</div></div>
          <button type="button" class="tns-x" style="position:static;flex-shrink:0;width:44px;height:44px" data-remove="${esc(v.url)}" aria-label="Remove video">✕</button></div>`).join('')}
        <button type="button" class="tns-add" data-act="video" style="width:100%;min-height:56px" ${vd.length >= MAX.videos ? 'disabled' : ''}>＋ Add a video (up to 5 minutes)</button>
        <div class="tns-note" style="margin-top:8px">Long videos are shrunk on your phone before upload so they load fast for customers. Keep the page open while it works.</div>
      </div>

      <div class="tns-card">
        <div class="tns-h"><span class="tns-eye">Stall photos</span><span class="tns-note">${ph.length} of ${MAX.photos}</span></div>
        <div id="tnsJobs-photos"></div>
        <div class="tns-grid">
          ${ph.map((p, i) => `<div class="tns-tile"><img src="${esc(p.url)}" alt="${esc(p.caption || 'Stall photo ' + (i + 1))}" loading="lazy">
            <button type="button" class="tns-x" data-remove="${esc(p.url)}" aria-label="Remove photo ${i + 1}">✕</button>
            ${i === 0 ? '<span class="tns-cover is">Cover</span>' : `<button type="button" class="tns-cover" data-cover="${esc(p.url)}">Make cover</button>`}</div>`).join('')}
          ${ph.length < MAX.photos ? `<button type="button" class="tns-add" data-act="photos" style="aspect-ratio:1">＋<span>Add photos</span></button>` : ''}
        </div>
      </div>

      <div class="tns-card">
        <div class="tns-h"><span class="tns-eye">Products</span><span class="tns-note">up to ${MAX.productPhotos} photos each</span></div>
        <div id="tnsJobs-product"></div>
        ${it.map((x, i) => editing && editing.index === i ? editorHTML() : `<div class="tns-row">
          <div class="tns-thumb" style="${(x.photos || [])[0] ? `background-image:url('${esc(x.photos[0])}')` : ''}"></div>
          <div style="flex:1;min-width:0"><div style="font-weight:800;overflow-wrap:break-word">${esc(x.name)}</div>
          <div class="tns-note">${priceText(x)} · ${(x.options || []).length ? x.options.length + (x.options.length === 1 ? ' option · ' : ' options · ') : ''}${(x.photos || []).length ? (x.photos.length + (x.photos.length === 1 ? ' photo' : ' photos')) : '<span class="tns-todo">no photo yet</span>'}${x.sold_out ? ' · <b style="color:#FFB0A5">SOLD OUT</b>' : ''}</div></div>
          <div style="display:grid;gap:4px;justify-items:end"><button type="button" class="tns-link" data-edit="${i}">${(x.photos || []).length ? 'Edit' : 'Add photo'}</button>
          <button type="button" class="tns-link" data-soldout="${i}" aria-pressed="${!!x.sold_out}">${x.sold_out ? 'Back in stock' : 'Mark sold out'}</button></div></div>`).join('')}
        ${editing && editing.index == null ? editorHTML() : `<button type="button" class="tns-add" data-act="new-product" style="width:100%;min-height:52px;margin-top:10px">＋ Add a product</button>`}
      </div>
      <p class="tns-note" style="text-align:center">Photos are resized on your phone to save your data.</p>`;
    renderJobs(); renderEditorPhotos();
    if(editing){ const f = document.getElementById('tnsEditor'); f.querySelector('[name=name]').value = editing.draft.name || ''; f.querySelector('[name=desc]').value = editing.draft.desc || ''; f.querySelector('[name=price]').value = editing.draft.price || ''; }
  }
  function priceText(x){
    const ps = [Number(x.price), ...(x.options || []).map(o => Number(o.price) || Number(x.price))].filter(n => n > 0);
    const lo = Math.min(...ps), hi = Math.max(...ps);
    return lo === hi ? ugx(lo) : `${ugx(lo)} – ${ugx(hi)}`;
  }
  function editorHTML(){
    return `<div class="tns-edit" id="tnsEditor">
      <label for="tnsPName">Product name</label><input id="tnsPName" name="name" maxlength="60" autocomplete="off">
      <label for="tnsPDesc">Short description</label><input id="tnsPDesc" name="desc" maxlength="120" autocomplete="off">
      <label for="tnsPPrice">Price (UGX)</label><input id="tnsPPrice" name="price" inputmode="numeric" autocomplete="off">
      <label>Photos (up to ${MAX.productPhotos})</label>
      <div class="tns-note">Is each photo a different version (colour, size, design)? Give it a name and, if it costs more or less, its own price (blank = the product price). Leave both blank for plain photos of the same product.</div>
      <div class="tns-pphotos" id="tnsPPhotos"></div>
      <div class="tns-btns"><button type="button" class="tns-primary" data-act="save-product">Save product</button><button type="button" class="tns-ghost" data-act="cancel-product">Cancel</button></div>
      ${editing.index != null ? '<button type="button" class="tns-danger" data-act="delete-product">Delete this product</button>' : ''}
    </div>`;
  }

  function onClick(e){
    const b = e.target.closest('button'); if(!b || !b.closest('#tnStallPane')) return;
    const a = b.dataset.act;
    if(a === 'pin') setPin(); else if(a === 'photos') addPhotos(); else if(a === 'video') addVideo(); else if(a === 'logo') changeLogo();
    else if(a === 'new-product') openEditor(null); else if(a === 'save-product') saveProduct();
    else if(a === 'cancel-product'){ editing = null; render(); } else if(a === 'delete-product') deleteProduct();
    else if(a === 'pp-add'){ readDraft(); addProductPhoto(); }
    else if(b.dataset.ppRemove != null){ readDraft(); editing.draft.photos.splice(Number(b.dataset.ppRemove), 1); renderEditorPhotos(); }
    else if(b.dataset.remove) removeMedia(b.dataset.remove);
    else if(b.dataset.cover) makeCover(b.dataset.cover);
    else if(b.dataset.edit != null) openEditor(Number(b.dataset.edit));
    else if(b.dataset.soldout != null) toggleSoldOut(Number(b.dataset.soldout));
  }

  function setTab(stall){
    const dash = document.getElementById('dashView'); if(!dash) return;
    dash.classList.toggle('tn-stall-mode', stall);
    document.querySelectorAll('#tnStallTabs button').forEach((b, i) => b.classList.toggle('on', stall ? i === 1 : i === 0));
    if(stall && !vendor) load().then(ok => ok ? render() : (document.getElementById('tnStallPane').innerHTML = '<div class="tns-card tns-note">Your stall could not be loaded. Sign in again and retry.</div>'));
    try{ history.replaceState(null, '', stall ? '#stall' : location.pathname + location.search); }catch(_){}
  }

  function boot(){
    const dash = document.getElementById('dashView');
    if(booted || !dash || dash.classList.contains('hidden') || !window.TNMedia) return;
    booted = true; styles();
    const tabs = document.createElement('div'); tabs.id = 'tnStallTabs'; tabs.setAttribute('role', 'tablist');
    tabs.innerHTML = '<button type="button" role="tab">Orders</button><button type="button" role="tab">My stall</button>';
    const top = dash.querySelector('.top-bar'); top ? top.after(tabs) : dash.prepend(tabs);
    const pane = document.createElement('div'); pane.id = 'tnStallPane'; pane.innerHTML = '<div class="tns-card tns-note">Loading your stall…</div>'; dash.appendChild(pane);
    tabs.children[0].onclick = () => setTab(false); tabs.children[1].onclick = () => setTab(true);
    pane.addEventListener('click', onClick);
    setTab(location.hash === '#stall');
    (vendor ? Promise.resolve(true) : load().then(ok => { if(ok) render(); return ok; })).then(ok => { if(ok) banner(); });
  }
  const iv = setInterval(() => { boot(); if(booted) clearInterval(iv); }, 500);
  window.tnStallMedia = { reload: () => load().then(render) };
})();
