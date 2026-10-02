/* Tonninyira full-screen stall viewer: "buy what you see".
 * tnOpenViewer(vendorId, 'g', index)  -> the stall's photos and videos
 * tnOpenViewer(vendorId, 'i', itemId) -> one product's photos, with price and Add to basket.
 *   When the stall made photos into options (own name, price, Sold out), each
 *   slide shows that option and "Add this one" adds exactly that version.
 * Swipe (scroll-snap), arrow buttons, keyboard, and the phone's Back button all
 * work. A video is only fetched when the customer taps play, so browsing a
 * stall costs almost no data and does not eat the free plan's viewing allowance.
 * Uses index.html globals: findVendor, addToCart, tnItemOptions, tnOptionPrice, esc, safeUrl, fmt.
 */
(function(){
  'use strict';
  let el = null, lastFocus = null, pushed = false;
  const E = s => (typeof esc === 'function' ? esc(s) : String(s ?? ''));
  const U = s => (typeof safeUrl === 'function' ? safeUrl(s) : '');
  const money = n => 'UGX ' + (typeof fmt === 'function' ? fmt(Number(n || 0)) : Number(n || 0).toLocaleString('en-US'));
  const dur = s => { s = Math.round(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function styles(){
    if(document.getElementById('tn-viewer-style')) return;
    const s = document.createElement('style'); s.id = 'tn-viewer-style';
    s.textContent = `
      #tnViewer{position:fixed;inset:0;z-index:10040;background:#0E0A08;color:var(--sand);display:flex;flex-direction:column;font-family:'Work Sans',sans-serif}
      #tnViewer .tv-top{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;gap:10px}
      #tnViewer .tv-count{font-size:.8rem;font-weight:700;color:var(--muted)}
      #tnViewer .tv-btn{width:44px;height:44px;border-radius:50%;border:0;background:#2A1F19;color:var(--sand);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
      #tnViewer .tv-track{flex:1;min-height:0;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior:contain}
      #tnViewer .tv-track::-webkit-scrollbar{display:none}
      #tnViewer .tv-slide{flex:0 0 100%;scroll-snap-align:center;display:flex;align-items:center;justify-content:center;position:relative}
      #tnViewer .tv-slide img,#tnViewer .tv-slide video{max-width:100%;max-height:100%;object-fit:contain;display:block}
      #tnViewer .tv-play{position:absolute;inset:0;margin:auto;width:76px;height:76px;border-radius:50%;border:0;background:var(--gold);color:var(--ink);display:flex;align-items:center;justify-content:center;cursor:pointer}
      #tnViewer .tv-dur{position:absolute;left:50%;top:calc(50% + 52px);transform:translateX(-50%);font-size:.8rem;font-weight:700;background:rgba(20,14,11,.85);padding:3px 9px;border-radius:99px}
      #tnViewer .tv-nav{position:absolute;top:50%;margin-top:-22px}
      #tnViewer .tv-prev{left:10px}#tnViewer .tv-next{right:10px}
      #tnViewer .tv-thumbs{display:flex;gap:8px;padding:10px 14px 4px;overflow-x:auto;scrollbar-width:none}
      #tnViewer .tv-thumb{width:56px;height:56px;flex-shrink:0;border-radius:10px;border:2px solid transparent;padding:0;background:#3A2C22 center/cover;cursor:pointer}
      #tnViewer .tv-thumb.on{border-color:var(--gold)}
      #tnViewer .tv-foot{padding:10px 16px calc(16px + env(safe-area-inset-bottom));display:grid;gap:10px}
      #tnViewer .tv-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
      #tnViewer .tv-name{font-weight:800;font-size:1.05rem;overflow-wrap:break-word}
      #tnViewer .tv-sub{font-size:.78rem;color:var(--muted);margin-top:2px;overflow-wrap:break-word}
      #tnViewer .tv-price{font-family:'Alfa Slab One',serif;font-weight:400;font-synthesis:none;color:var(--gold);font-size:1.3rem;white-space:nowrap}
      #tnViewer .tv-add{min-height:54px;border:0;border-radius:16px;background:var(--gold);color:var(--ink);font:inherit;font-weight:800;font-size:1rem;cursor:pointer}
      #tnViewer .tv-add:disabled{background:#2A1F19;color:var(--muted);cursor:not-allowed}
      #tnViewer .tv-opt{color:var(--gold);font-weight:800;font-size:.86rem;margin-top:3px;overflow-wrap:break-word}
      #tnViewer .tv-ask{min-height:36px;border:0;background:transparent;color:var(--gold);font:inherit;font-weight:700;font-size:.8rem;text-decoration:underline;text-underline-offset:3px;cursor:pointer;margin-top:-4px}
      #tnViewer .tv-thumb{position:relative}
      #tnViewer .tv-thumb.sold::after{content:'';position:absolute;inset:0;border-radius:8px;background:rgba(14,10,8,.6)}
    `;
    document.head.appendChild(s);
  }
  const ICON = {
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    prev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    play: '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
  };

  function close(fromPop){
    if(!el) return;
    el.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
    el.remove(); el = null; document.removeEventListener('keydown', onKey);
    document.documentElement.style.overflow = '';
    if(pushed && !fromPop){ pushed = false; history.back(); } else pushed = false;
    lastFocus?.focus?.();
  }
  function onKey(e){
    if(e.key === 'Escape') close();
    else if(e.key === 'ArrowRight') go(1); else if(e.key === 'ArrowLeft') go(-1);
  }
  function current(){ const t = el.querySelector('.tv-track'); return Math.round(t.scrollLeft / Math.max(1, t.clientWidth)); }
  function go(d, abs){
    const t = el.querySelector('.tv-track'); const n = t.children.length;
    const i = Math.max(0, Math.min(n - 1, abs != null ? abs : current() + d));
    t.scrollTo({ left: i * t.clientWidth, behavior: abs != null && d === 0 ? 'auto' : 'smooth' });
  }
  function sync(slides, footFor){
    const i = current();
    el.querySelector('.tv-count').textContent = `${i + 1} / ${slides.length}`;
    el.querySelectorAll('.tv-thumb').forEach((b, k) => b.classList.toggle('on', k === i));
    el.querySelectorAll('.tv-slide').forEach((s, k) => { if(k !== i) s.querySelector('video')?.pause(); });
    const p = el.querySelector('.tv-prev'), n = el.querySelector('.tv-next');
    if(p) p.style.visibility = i > 0 ? 'visible' : 'hidden';
    if(n) n.style.visibility = i < slides.length - 1 ? 'visible' : 'hidden';
    if(footFor) el.querySelector('.tv-foot').innerHTML = footFor(i);
  }

  function open(vendorId, mode, key){
    const v = typeof findVendor === 'function' ? findVendor(vendorId) : null; if(!v) return;
    let slides = [], start = 0, item = null;
    if(mode === 'i'){
      item = (v.items || []).find(x => String(x.id) === String(key)); if(!item || !(item.photos || []).length) return;
      const opts = typeof tnItemOptions === 'function' ? tnItemOptions(item) : [];
      slides = item.photos.map(url => ({ url, type: 'image', opt: opts.find(o => o.photo === url) || null, caption: (opts.find(o => o.photo === url) || {}).label }));
    }else{
      slides = (v.gallery || []).filter(g => g && g.url); start = Math.max(0, Math.min(slides.length - 1, Number(key) || 0));
      if(!slides.length) return;
    }
    styles(); close(); lastFocus = document.activeElement;
    el = document.createElement('div'); el.id = 'tnViewer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', item ? `Photos of ${item.name}` : `${v.name} photos and videos`);
    const slide = (s, i) => s.type === 'video'
      ? `<div class="tv-slide" data-i="${i}">${s.poster ? `<img src="${U(s.poster)}" alt="">` : ''}<button type="button" class="tv-play" data-play="${i}" aria-label="Play video">${ICON.play}</button>${s.duration ? `<span class="tv-dur">${dur(s.duration)}</span>` : ''}</div>`
      : `<div class="tv-slide"><img src="${U(s.url)}" alt="${E(s.caption || (item ? item.name : v.name))}" loading="${i === start ? 'eager' : 'lazy'}"></div>`;
    const multi = slides.length > 1;
    el.innerHTML = `
      <div class="tv-top"><span class="tv-count"></span><button type="button" class="tv-btn tv-close" aria-label="Close">${ICON.close}</button></div>
      <div style="flex:1;min-height:0;position:relative;display:flex">
        <div class="tv-track" style="flex:1">${slides.map(slide).join('')}</div>
        ${multi ? `<button type="button" class="tv-btn tv-nav tv-prev" aria-label="Previous">${ICON.prev}</button><button type="button" class="tv-btn tv-nav tv-next" aria-label="Next">${ICON.next}</button>` : ''}
      </div>
      ${multi ? `<div class="tv-thumbs">${slides.map((s, i) => `<button type="button" class="tv-thumb${s.opt && s.opt.sold_out ? ' sold' : ''}" data-go="${i}" aria-label="Show ${i + 1}${s.opt && s.opt.label ? ': ' + E(s.opt.label) : ''}" style="background-image:url('${U(s.type === 'video' ? (s.poster || '') : s.url)}')"></button>`).join('')}</div>` : ''}
      <div class="tv-foot"></div>`;
    document.body.appendChild(el); document.documentElement.style.overflow = 'hidden';

    const hasOpts = item && slides.some(s => s.opt);
    const priceOf = opt => typeof tnOptionPrice === 'function' ? tnOptionPrice(item, opt) : Number(item.price);
    const footFor = item
      ? i => { const o = slides[i].opt, sold = !!item.sold_out || !!(o && o.sold_out);
          return `<div class="tv-row"><div style="min-width:0"><div class="tv-name">${E(item.name)}</div>${o && o.label ? `<div class="tv-opt">${E(o.label)}</div>` : ''}<div class="tv-sub">${E(v.name)}${item.desc ? ' · ' + E(item.desc) : ''}</div></div><div class="tv-price">${money(priceOf(o))}</div></div>
               <button type="button" class="tv-add" data-opt="${o ? E(o.id) : ''}" ${sold ? 'disabled' : ''}>${sold ? (o ? 'This one is sold out' : 'Sold out') : hasOpts ? (o ? 'Add this one' : 'Add to basket') : 'Add to basket'}</button>
               ${!sold && hasOpts && o ? `<button type="button" class="tv-ask" data-ask-vendor="${E(vendorId)}" data-ask-item="${E(item.name)}" data-ask-option="${E(o.id)}" data-ask-label="${E(o.label || '')}" data-ask-stall="${E(v.name)}">Ask if this one is available</button>` : ''}`; }
      : i => `<div><div class="tv-name">${E(slides[i].caption || v.name)}</div><div class="tv-sub">${E(v.name)}${slides[i].type === 'video' ? ' · video' : ''}</div></div>`;

    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if(!b) return;
      if(b.classList.contains('tv-close')) close();
      else if(b.classList.contains('tv-prev')) go(-1);
      else if(b.classList.contains('tv-next')) go(1);
      else if(b.dataset.go != null) go(0, Number(b.dataset.go));
      else if(b.dataset.play != null){
        const s = slides[Number(b.dataset.play)], box = b.parentElement;
        box.innerHTML = `<video src="${U(s.url)}" ${s.poster ? `poster="${U(s.poster)}"` : ''} controls autoplay playsinline preload="auto"></video>`;
      }else if(b.classList.contains('tv-add') && item){
        let ok = true; try{ ok = addToCart(vendorId, item.id, b.dataset.opt || undefined) !== false; }catch(_){}
        if(!ok){ b.textContent = 'Not available'; b.disabled = true; return; }
        b.textContent = 'Added to basket ✓'; setTimeout(() => { if(b.isConnected) b.textContent = 'Add another'; }, 1400);
      }
    });
    const track = el.querySelector('.tv-track');
    /* Re-render the footer only when the slide changes, so "Added ✓" stays put. */
    let t, shown = -1;
    const syncFoot = () => { if(!el) return; const i = current(); if(i === shown && item) { sync(slides, null); return; } shown = i; sync(slides, footFor); };
    track.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(syncFoot, 60); }, { passive: true });
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => { go(0, start); syncFoot(); el.querySelector('.tv-close').focus(); });
    try{ history.pushState({ tnViewer: 1 }, ''); pushed = true; }catch(_){}
  }
  window.addEventListener('popstate', () => { if(el) close(true); });
  window.tnOpenViewer = open;
})();
