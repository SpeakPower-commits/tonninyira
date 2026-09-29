/* Tonninyira rider inbox on the storefront.
 * A rider who is signed in anywhere in the app -- not only on the rider
 * dashboard -- sees delivery offers as they arrive:
 *   1) the rider block on the account page lists open offers (Accept / Not now)
 *      and the rider's active deliveries;
 *   2) a banner, and a phone notification when allowed, announces each new offer.
 * Data comes from the rider_inbox() RPC, because riders cannot read unassigned
 * orders directly; accepting goes through accept_delivery_offer(), which claims
 * the order atomically.
 */
(function(){
  'use strict';
  const POLL_MS = 20000;
  const SEEN_KEY = 'tn_rider_seen_offers';
  const c = () => { try{ if(typeof supabaseClient!=='undefined'&&supabaseClient) return supabaseClient }catch(_){} return window.supabaseClient||null; };
  const esc = v => String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const ugx = n => 'UGX '+Math.round(Number(n||0)).toLocaleString('en-US');
  let inbox = null, isRider = null, timer = null, busy = false;
  const announced = new Set();

  function seen(){ try{ return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY)||'[]')) }catch(_){ return new Set() } }
  function markSeen(ids){ try{ const s=seen(); ids.forEach(i=>s.add(i)); sessionStorage.setItem(SEEN_KEY,JSON.stringify([...s].slice(-50))) }catch(_){} }

  function styles(){
    if(document.getElementById('tn-rider-inbox-style')) return;
    const s=document.createElement('style'); s.id='tn-rider-inbox-style';
    s.textContent=`
      .tn-ri{margin:-2px 0 10px;display:grid;gap:9px}
      .tn-ri-card{background:#1F1916;border:1px solid #332A24;border-left:4px solid var(--gold);border-radius:18px;padding:14px 15px;color:var(--sand)}
      .tn-ri-card.is-active{border-left-color:#4FB477}
      .tn-ri-eyebrow{font-size:.62rem;font-weight:900;letter-spacing:.13em;color:var(--gold)}
      .tn-ri-card.is-active .tn-ri-eyebrow{color:#4FB477}
      .tn-ri-title{font-weight:800;font-size:.92rem;margin-top:4px;line-height:1.35;overflow-wrap:break-word}
      .tn-ri-meta{font-size:.74rem;color:#A99684;margin-top:4px;line-height:1.45}
      .tn-ri-actions{display:grid;grid-template-columns:1.4fr 1fr;gap:8px;margin-top:11px}
      .tn-ri-btn{min-height:42px;padding:10px;border-radius:12px;font:inherit;font-size:.8rem;font-weight:800;cursor:pointer;border:0;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center}
      .tn-ri-accept{background:#4FB477;color:#10160F}
      .tn-ri-later{background:transparent;color:#A99684;border:1px solid #3A302A}
      .tn-ri-open{background:transparent;color:var(--gold);border:1px solid rgba(245,180,0,.4);margin-top:10px}
      .tn-ri-empty{font-size:.74rem;color:#A99684;padding:2px 4px 0;line-height:1.45}
      .tn-ri-allow{background:none;border:0;padding:0;color:var(--gold);font:inherit;font-weight:800;cursor:pointer;text-decoration:underline}
      #tn-ri-toast{position:fixed;left:12px;right:12px;top:12px;z-index:10050;max-width:480px;margin:0 auto;background:#1F1916;color:var(--sand);border:1px solid rgba(245,180,0,.55);border-radius:16px;padding:13px 14px;box-shadow:0 12px 32px rgba(0,0,0,.45);display:flex;gap:10px;align-items:center}
      #tn-ri-toast .tn-ri-tt{flex:1;min-width:0;font-size:.8rem;line-height:1.4}
      #tn-ri-toast b{color:var(--gold)}
      #tn-ri-toast button{flex:none;min-height:38px;border-radius:10px;border:0;padding:0 12px;font:inherit;font-weight:800;font-size:.76rem;cursor:pointer}
    `;
    document.head.appendChild(s);
  }

  function route(o){ return `${esc(o.pickup||'the stall')}${o.pickup_area?` (${esc(o.pickup_area)})`:''} → ${esc(o.drop_area||'customer')}`; }
  function where(o){ return o.distance_km==null ? 'Open to all riders' : (Number(o.distance_km)<1 ? Math.round(o.distance_km*1000)+' m from you' : Number(o.distance_km).toFixed(1)+' km from you'); }

  function render(){
    const slot=document.getElementById('tnRiderInbox');
    if(!slot||!inbox?.rider) return;
    const offers=inbox.offers||[], active=inbox.active||[];
    const canAsk='Notification' in window && Notification.permission==='default';
    let html='';
    offers.forEach(o=>{
      html+=`<div class="tn-ri-card" data-offer="${Number(o.id)}">
        <div class="tn-ri-eyebrow">NEW DELIVERY REQUEST · ${esc(where(o))}</div>
        <div class="tn-ri-title">${route(o)}</div>
        <div class="tn-ri-meta">Order ${esc(o.order_id)} · already paid${o.earn?` · you earn ${ugx(o.earn)}`:''}</div>
        <div class="tn-ri-actions"><button class="tn-ri-btn tn-ri-accept" type="button" data-act="accept">Accept delivery</button><button class="tn-ri-btn tn-ri-later" type="button" data-act="later">Not now</button></div>
      </div>`;
    });
    active.forEach(o=>{
      html+=`<div class="tn-ri-card is-active">
        <div class="tn-ri-eyebrow">YOUR DELIVERY · ${esc(String(o.status||'').replace(/_/g,' ').toUpperCase())}</div>
        <div class="tn-ri-title">${route(o)}</div>
        <div class="tn-ri-meta">Order ${esc(o.order_id)} · already paid, nothing to collect</div>
        <a class="tn-ri-btn tn-ri-open" href="rider-dashboard.html">Open delivery details</a>
      </div>`;
    });
    if(!offers.length&&!active.length) html=`<div class="tn-ri-empty">No delivery requests right now. New ones appear here automatically.</div>`;
    if(canAsk) html+=`<div class="tn-ri-empty">Get an alert on this phone when a delivery comes in: <button class="tn-ri-allow" type="button" data-act="allow">Turn on alerts</button></div>`;
    slot.innerHTML=`<div class="tn-ri">${html}</div>`;
    slot.dataset.filled='1';
    markSeen(offers.map(o=>o.id));
    document.getElementById('tn-ri-toast')?.remove();
  }

  async function act(e){
    const btn=e.target.closest('button[data-act]'); if(!btn) return;
    const card=btn.closest('[data-offer]'); const id=card?Number(card.dataset.offer):null;
    if(btn.dataset.act==='allow'){ try{ await Notification.requestPermission() }catch(_){} render(); return; }
    if(!id) return;
    card.querySelectorAll('button').forEach(b=>b.disabled=true);
    if(btn.dataset.act==='accept'){
      btn.textContent='Accepting…';
      const {error}=await c().rpc('accept_delivery_offer',{p_offer_id:id});
      if(error) alert(error.message||'This delivery is no longer available.');
    }else{
      await c().from('delivery_offers').update({status:'declined',responded_at:new Date().toISOString()}).eq('id',id);
    }
    await refresh();
  }

  function announce(fresh){
    const o=fresh[0], more=fresh.length>1?` (+${fresh.length-1} more)`:'';
    const text=`Pick up from ${o.pickup||'a stall'}, deliver to ${o.drop_area||'a customer'}${more}.`;
    try{
      if('Notification' in window && Notification.permission==='granted' && navigator.serviceWorker?.ready)
        navigator.serviceWorker.ready.then(reg=>reg.showNotification('New delivery request',{body:text,tag:'tn-offer-'+o.id,icon:'icon-192.png',badge:'favicon-32.png'})).catch(()=>{});
    }catch(_){}
    if(document.getElementById('tnRiderInbox')) return; // cards already visible on the account page
    styles();
    document.getElementById('tn-ri-toast')?.remove();
    const t=document.createElement('div'); t.id='tn-ri-toast'; t.setAttribute('role','alert');
    t.innerHTML=`<div class="tn-ri-tt"><b>🚴 New delivery request</b><br>${esc(text)}</div><button type="button" style="background:#4FB477;color:#10160F">View</button><button type="button" aria-label="Dismiss" style="background:transparent;color:#A99684">✕</button>`;
    const [view,close]=t.querySelectorAll('button');
    view.onclick=()=>{ t.remove(); if(typeof window.goView==='function') window.goView('profile'); else location.href='./'; };
    close.onclick=()=>{ t.remove(); markSeen(fresh.map(x=>x.id)); };
    document.body.appendChild(t);
  }

  async function refresh(){
    const client=c(); if(!client?.rpc||busy) return;
    busy=true;
    try{
      const s=(await client.auth.getSession())?.data?.session;
      if(!s){ isRider=false; inbox=null; return; }
      const {data,error}=await client.rpc('rider_inbox');
      if(error) return;
      inbox=data; isRider=!!data?.rider;
      if(!isRider) return;
      styles();
      const old=seen(); const fresh=(data.offers||[]).filter(o=>!old.has(o.id)&&!announced.has(o.id));
      render();
      if(fresh.length){ fresh.forEach(o=>announced.add(o.id)); announce(fresh); }
    }catch(_){}finally{ busy=false; }
  }

  function schedule(){
    clearInterval(timer);
    timer=setInterval(()=>{ if(isRider!==false&&!document.hidden) refresh(); },POLL_MS);
  }

  function watchSlot(){
    /* The account page is re-rendered on every visit and language change; fill
       the rider slot as soon as it appears. The dataset flag stops our own
       writes from re-triggering this. */
    let queued=false;
    new MutationObserver(()=>{
      if(queued) return; queued=true;
      requestAnimationFrame(()=>{
        queued=false;
        const slot=document.getElementById('tnRiderInbox');
        if(slot&&!slot.dataset.filled){ if(inbox?.rider) render(); refresh(); }
      });
    }).observe(document.body,{childList:true,subtree:true});
  }

  function boot(){
    document.addEventListener('click',e=>{ if(e.target.closest('#tnRiderInbox button[data-act]')) act(e); });
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&isRider!==false) refresh(); });
    try{ c()?.auth?.onAuthStateChange?.(()=>{ isRider=null; refresh(); }); }catch(_){}
    watchSlot(); refresh(); schedule();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,800)); else setTimeout(boot,800);
  window.tnRiderInboxRefresh=refresh;
})();
