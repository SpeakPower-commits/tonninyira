/* Tonninyira location pin: one full-screen sheet used by customers (delivery
 * pin at checkout) and stalls (stall location in My stall).
 *   tnPinSheet({ title, note, start:{lat,lng}|null, saveLabel, onSave({lat,lng}) })
 * A free OpenStreetMap map (Leaflet, loaded only when the sheet opens), a
 * draggable pin, and "Use my location". The map is optional: if it cannot
 * load (no data), "Use my location" still works.
 */
(function(){
  'use strict';
  const KAMPALA = { lat: 0.3136, lng: 32.5811 };
  const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  const inUganda = p => p && p.lat >= -1.6 && p.lat <= 4.3 && p.lng >= 29.5 && p.lng <= 35.1;
  let loading = null;

  function loadLeaflet(){
    if(window.L) return Promise.resolve(window.L);
    if(loading) return loading;
    loading = new Promise((resolve, reject) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.min.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = LEAFLET + 'leaflet.min.js'; s.async = true;
      s.onload = () => window.L ? resolve(window.L) : reject(new Error('Map unavailable'));
      s.onerror = () => { loading = null; reject(new Error('Map unavailable')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function styles(){
    if(document.getElementById('tn-pin-style')) return;
    const s = document.createElement('style'); s.id = 'tn-pin-style';
    s.textContent = `
      #tnPin{position:fixed;inset:0;z-index:10070;background:var(--ink,#1A120E);color:var(--sand,#F3E8D8);display:flex;flex-direction:column;font-family:'Work Sans',sans-serif}
      #tnPin .tp-top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px}
      #tnPin .tp-eye{font-size:.66rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gold,#F5B400)}
      #tnPin .tp-h{font-weight:800;font-size:1.02rem;margin-top:2px;overflow-wrap:break-word}
      #tnPin .tp-x{width:44px;height:44px;border-radius:50%;border:0;background:#2A1F19;color:inherit;font-size:17px;cursor:pointer;flex-shrink:0}
      #tnPin .tp-map{flex:1;min-height:0;background:#2A1F19;position:relative}
      #tnPin .tp-map .tp-fallback{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:24px;font-size:.86rem;color:var(--muted,#B9A894)}
      #tnPin .tp-foot{padding:12px 16px calc(14px + env(safe-area-inset-bottom));display:grid;gap:8px}
      #tnPin .tp-note{font-size:.78rem;color:var(--muted,#B9A894);line-height:1.45}
      #tnPin .tp-msg{font-size:.78rem;min-height:1.1em;color:#FFB0A5}
      #tnPin .tp-gps{min-height:48px;border:1px solid var(--gold,#F5B400);border-radius:14px;background:transparent;color:var(--gold,#F5B400);font:inherit;font-weight:800;cursor:pointer}
      #tnPin .tp-save{min-height:52px;border:0;border-radius:14px;background:var(--gold,#F5B400);color:var(--ink,#1A120E);font:inherit;font-weight:800;font-size:1rem;cursor:pointer}
      #tnPin .tp-save:disabled{opacity:.5;cursor:not-allowed}
      .tp-marker{width:34px;height:44px;margin:-44px 0 0 -17px}
      .tp-marker svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}
    `;
    document.head.appendChild(s);
  }
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const PIN = '<svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 1C8.2 1 1 8 1 16.7 1 28.5 17 43 17 43s16-14.5 16-26.3C33 8 25.8 1 17 1z" fill="#E23F25" stroke="#fff" stroke-width="2"/><circle cx="17" cy="16.5" r="6" fill="#fff"/></svg>';

  function open(opts){
    opts = opts || {};
    styles(); document.getElementById('tnPin')?.remove();
    let pos = inUganda(opts.start) ? { lat: +opts.start.lat, lng: +opts.start.lng } : null;
    let map = null, marker = null;
    const el = document.createElement('div'); el.id = 'tnPin'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', opts.title || 'Set location');
    el.innerHTML = `<div class="tp-top"><div style="min-width:0"><div class="tp-eye">${esc(opts.eyebrow || 'Location')}</div><div class="tp-h">${esc(opts.title || 'Set the pin')}</div></div><button type="button" class="tp-x" aria-label="Close">✕</button></div>
      <div class="tp-map"><div class="tp-fallback">Loading the map…</div></div>
      <div class="tp-foot"><div class="tp-note">${esc(opts.note || 'Drag the map or the pin to the exact spot.')}</div><div class="tp-msg" role="status"></div>
        <button type="button" class="tp-gps">Use my location</button>
        <button type="button" class="tp-save" ${pos ? '' : 'disabled'}>${esc(opts.saveLabel || 'Save this spot')}</button></div>`;
    document.body.appendChild(el); document.documentElement.style.overflow = 'hidden';
    const msg = t => el.querySelector('.tp-msg').textContent = t || '';
    const close = () => { el.remove(); document.documentElement.style.overflow = ''; if(map) map.remove(); };
    const setPos = (p, pan) => {
      pos = { lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 };
      el.querySelector('.tp-save').disabled = !inUganda(pos);
      msg(inUganda(pos) ? '' : 'That spot is outside Uganda. Move the pin.');
      if(marker) marker.setLatLng(pos); if(map && pan) map.setView(pos, Math.max(map.getZoom(), 16));
    };
    el.querySelector('.tp-x').onclick = close;
    el.querySelector('.tp-gps').onclick = () => {
      const b = el.querySelector('.tp-gps');
      if(!navigator.geolocation){ msg('This phone cannot share its location. Drag the pin instead.'); return; }
      b.textContent = 'Finding you…'; b.disabled = true;
      navigator.geolocation.getCurrentPosition(p => {
        b.textContent = 'Use my location'; b.disabled = false;
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude }, true);
        if(!map) msg(inUganda(pos) ? 'Location found. Tap save.' : 'That spot is outside Uganda.');
      }, () => { b.textContent = 'Use my location'; b.disabled = false; msg("Couldn't get your location. Allow location for this site, or drag the pin."); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
    };
    el.querySelector('.tp-save').onclick = async () => {
      if(!inUganda(pos)) return;
      const b = el.querySelector('.tp-save'); b.disabled = true;
      try{ const r = await opts.onSave?.(pos); if(r === false){ b.disabled = false; return; } close(); }
      catch(e){ b.disabled = false; msg(e?.message || 'Could not save. Try again.'); }
    };
    loadLeaflet().then(L => {
      if(!el.isConnected) return;
      const box = el.querySelector('.tp-map'); box.innerHTML = '';
      map = L.map(box, { zoomControl: true, attributionControl: true }).setView(pos || KAMPALA, pos ? 17 : 13);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      marker = L.marker(pos || map.getCenter(), { draggable: true, icon: L.divIcon({ className: 'tp-marker', html: PIN, iconSize: [34, 44], iconAnchor: [17, 44] }) }).addTo(map);
      marker.on('dragend', () => setPos(marker.getLatLng()));
      map.on('click', e => setPos(e.latlng));
      map.on('moveend', () => { if(!pos) { marker.setLatLng(map.getCenter()); } });
      if(!pos) msg('Tap "Use my location" or drag the pin to the spot.');
    }).catch(() => {
      const fb = el.querySelector('.tp-fallback'); if(fb) fb.textContent = 'The map could not load. Tap "Use my location" while you are at the spot.';
    });
    return { close };
  }
  window.tnPinSheet = open;
})();
