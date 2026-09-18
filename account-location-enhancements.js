/*
 * Tonninyira account + location enhancement layer.
 * Keeps the original page structure, but makes the two critical concepts
 * explicit: real account auth vs. delivery details, and GPS vs. typed area.
 */
(function(){
  'use strict';

  const LOCATION_KEY = 'tonninyira_customer_location_v1';
  const STYLE_ID = 'tn-account-location-styles';
  const AUTH_ID = 'tn-account-modal';

  function db(){ return (typeof supabaseClient !== 'undefined') ? supabaseClient : null; }
  function state(){ return (typeof AppState !== 'undefined') ? AppState : null; }
  function getSession(){
    const client=db();
    if(!client?.auth?.getSession) return Promise.resolve(null);
    return client.auth.getSession().then(({data})=>data?.session||null).catch(()=>null);
  }

  function injectStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      .tn-account-card{margin:0 16px 12px;background:var(--card);border:1px solid rgba(243,232,216,.08);border-radius:16px;padding:15px}
      .tn-account-kicker{font-size:.66rem;font-weight:800;letter-spacing:1.4px;color:var(--gold);margin-bottom:5px}
      .tn-account-title{font-size:1rem;font-weight:800;color:var(--sand);margin:0}
      .tn-account-copy{font-size:.78rem;line-height:1.45;color:var(--muted);margin:5px 0 12px}
      .tn-account-actions{display:flex;gap:8px;flex-wrap:wrap}
      .tn-account-actions button{flex:1;min-width:130px}
      .tn-location-status{font-size:.68rem;font-weight:700;color:var(--muted);margin-top:6px;line-height:1.35}
      .tn-location-ok{color:var(--green)}
      .tn-map-link{display:inline-block;margin-top:5px;color:var(--gold);font-weight:800;text-decoration:none}
      .tn-auth-modal{position:fixed;inset:0;z-index:180;background:rgba(0,0,0,.76);display:grid;place-items:center;padding:16px}
      .tn-auth-sheet{width:min(430px,100%);background:var(--card);border:1px solid rgba(243,232,216,.12);border-radius:18px;padding:18px}
      .tn-auth-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .tn-auth-close{border:0;background:none;color:var(--muted);font-size:24px;cursor:pointer;line-height:1}
      .tn-auth-input{width:100%;margin-top:7px;padding:12px;border-radius:10px;border:1px solid rgba(243,232,216,.12);background:var(--ink);color:var(--sand);font:inherit}
      .tn-auth-status{font-size:.76rem;color:var(--muted);min-height:20px;margin-top:9px;line-height:1.4}
    `;
    document.head.appendChild(s);
  }

  function openAuthModal(){
    injectStyles();
    const existing=document.getElementById(AUTH_ID);
    if(existing){ existing.querySelector('#tnAccountEmail')?.focus(); return; }

    const modal=document.createElement('div');
    modal.id=AUTH_ID;
    modal.className='tn-auth-modal';
    modal.innerHTML=`
      <div class="tn-auth-sheet" role="dialog" aria-modal="true" aria-label="Tonninyira account">
        <div class="tn-auth-head">
          <div>
            <div class="tn-account-kicker">TONNINYIRA ACCOUNT</div>
            <h2 class="display" style="font-size:1.25rem;margin:0;color:var(--sand);">Create account or sign in</h2>
          </div>
          <button class="tn-auth-close" id="tnAuthClose" aria-label="Close">×</button>
        </div>
        <p class="tn-account-copy" style="margin-top:8px;">Use your email. We’ll send a secure one-time link. No password to remember.</p>
        <label for="tnAccountEmail" style="display:block;font-size:.76rem;font-weight:800;">Email address</label>
        <input id="tnAccountEmail" class="tn-auth-input" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com">
        <button id="tnAccountSend" class="btn-primary" style="width:100%;margin-top:11px;">Send secure link</button>
        <div id="tnAccountStatus" class="tn-auth-status"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#tnAuthClose').onclick=()=>modal.remove();
    modal.addEventListener('click',e=>{if(e.target===modal) modal.remove();});
    modal.querySelector('#tnAccountEmail').focus();

    modal.querySelector('#tnAccountSend').onclick=async()=>{
      const client=db();
      const email=modal.querySelector('#tnAccountEmail').value.trim();
      const status=modal.querySelector('#tnAccountStatus');
      const btn=modal.querySelector('#tnAccountSend');
      if(!/^\S+@\S+\.\S+$/.test(email)){status.textContent='Enter a valid email address.';return;}
      if(!client?.auth?.signInWithOtp){status.textContent='Account sign-in is not available right now.';return;}
      btn.disabled=true; btn.textContent='Sending…'; status.textContent='';
      try{
        const {error}=await client.auth.signInWithOtp({
          email,
          options:{emailRedirectTo:window.location.href.split('#')[0],shouldCreateUser:true}
        });
        if(error) throw error;
        status.textContent='Check your email and tap the secure link. Your account will be ready when you return.';
      }catch(err){
        status.textContent='Could not send the secure link. Please try again.';
      }finally{
        btn.disabled=false; btn.textContent='Send secure link';
      }
    };
  }

  async function signOut(){
    const client=db();
    if(!client?.auth?.signOut) return;
    const {error}=await client.auth.signOut();
    if(error){ alert('Could not sign you out. Please try again.'); return; }
    document.getElementById(AUTH_ID)?.remove();
    try{ localStorage.removeItem('tonninyira_customer'); }catch(_){ }
    if(typeof window.renderMain==='function') window.renderMain();
  }

  function makeAccountCard(main){
    let card=main.querySelector('#tnAccountCard');
    if(!card){
      card=document.createElement('section');
      card.id='tnAccountCard';
      card.className='tn-account-card';
      const intro=main.querySelector('.tn-profile-intro');
      if(intro) intro.insertAdjacentElement('afterend',card); else main.prepend(card);
    }
    getSession().then(session=>{
      if(!card.isConnected || state()?.view!=='profile') return;
      if(!session){
        card.innerHTML=`
          <div class="tn-account-kicker">ACCOUNT</div>
          <p class="tn-account-title">Keep your Tonninyira account with you</p>
          <p class="tn-account-copy">Sign in or create your account so your orders, reviews and rewards stay linked to you.</p>
          <div class="tn-account-actions"><button id="tnAccountOpen" class="btn-primary">Create account / Sign in</button></div>`;
        card.querySelector('#tnAccountOpen').onclick=openAuthModal;
      }else{
        const email=session.user?.email||'Signed-in account';
        card.innerHTML=`
          <div class="tn-account-kicker">ACCOUNT</div>
          <p class="tn-account-title">You’re signed in</p>
          <p class="tn-account-copy">${String(email).replace(/[&<>\"']/g,'')}</p>
          <div class="tn-account-actions"><button id="tnAccountSignOut" class="btn-secondary">Sign out</button></div>`;
        card.querySelector('#tnAccountSignOut').onclick=signOut;
      }
    });
  }

  function decorateOldSignIn(main){
    const buttons=[...main.querySelectorAll('button')];
    const old=buttons.find(b=>/Sign In/i.test(b.textContent.trim()) && /identityOverlay/.test(b.getAttribute('onclick')||''));
    if(old){
      old.textContent='Add delivery details';
      old.setAttribute('aria-label','Add your name and phone for delivery');
      const copy=document.createElement('div');
      copy.className='tn-copy-note';
      copy.textContent='Your name and phone are used for delivery. This is separate from your secure account.';
      if(!old.parentElement.querySelector('.tn-copy-note')) old.insertAdjacentElement('afterend',copy);
    }
  }

  function enhanceProfile(){
    if(state()?.view!=='profile') return;
    const main=document.getElementById('mainArea');
    if(!main) return;
    injectStyles();
    makeAccountCard(main);
    decorateOldSignIn(main);
  }

  function restoreLocation(){
    const s=state();
    if(!s) return;
    try{
      const saved=JSON.parse(localStorage.getItem(LOCATION_KEY)||'null');
      if(saved && Number.isFinite(Number(saved.lat)) && Number.isFinite(Number(saved.lng))){
        s.customerLocation={lat:Number(saved.lat),lng:Number(saved.lng),accuracy:Number(saved.accuracy)||null,source:saved.source||'gps'};
      }
    }catch(_){ }
  }

  function renderLocationStatus(){
    injectStyles();
    const btn=document.getElementById('gpsBtn');
    if(!btn) return;
    let status=document.getElementById('tnLocationStatus');
    if(!status){
      status=document.createElement('div');
      status.id='tnLocationStatus';
      status.className='tn-location-status';
      const row=btn.closest('.location-row');
      row?.insertAdjacentElement('afterend',status);
    }
    const s=state();
    const loc=s?.customerLocation;
    if(!loc){
      status.textContent='Type your area above, or use your phone location for a more precise delivery estimate.';
      status.classList.remove('tn-location-ok');
      return;
    }
    const acc=Number(loc.accuracy);
    status.classList.add('tn-location-ok');
    status.innerHTML=`✓ Your phone location is saved for this visit${Number.isFinite(acc)&&acc>0?` · accuracy about ${Math.round(acc)} m`:''}.<br><a class="tn-map-link" href="https://www.google.com/maps?q=${encodeURIComponent(loc.lat+','+loc.lng)}" target="_blank" rel="noopener">Open this location in Google Maps ↗</a>`;
  }

  function captureHook(){
    const original=window.captureCustomerLocation;
    if(typeof original!=='function' || original.__tnWrapped) return;
    const wrapped=function(){
      const s=state();
      const btn=document.getElementById('gpsBtn');
      if(!navigator.geolocation){ if(btn) btn.textContent='📍 Location not supported'; return; }
      if(btn) btn.textContent='📍 Getting precise location…';
      navigator.geolocation.getCurrentPosition(pos=>{
        if(s) s.customerLocation={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy,source:'gps'};
        try{localStorage.setItem(LOCATION_KEY,JSON.stringify(s.customerLocation));}catch(_){ }
        if(btn){btn.textContent='📍 Location saved ✓';btn.style.color='var(--green)';}
        renderLocationStatus();
        if(typeof window.updateCartUI==='function') window.updateCartUI();
      },err=>{
        if(typeof original==='function') original();
        renderLocationStatus();
      },{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
    };
    wrapped.__tnWrapped=true;
    window.captureCustomerLocation=wrapped;
  }

  function installAuthListener(){
    const client=db();
    if(!client?.auth?.onAuthStateChange || client.__tnAccountListener) return;
    client.__tnAccountListener=true;
    client.auth.onAuthStateChange(()=>{
      if(state()?.view==='profile') setTimeout(enhanceProfile,0);
    });
  }

  function boot(){
    injectStyles();
    restoreLocation();
    renderLocationStatus();
    captureHook();
    installAuthListener();
    setTimeout(()=>{enhanceProfile();renderLocationStatus();captureHook();},250);
    setTimeout(()=>{enhanceProfile();renderLocationStatus();captureHook();},1000);
    const main=document.getElementById('mainArea');
    if(main){
      new MutationObserver(()=>setTimeout(enhanceProfile,0)).observe(main,{childList:true,subtree:true});
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
