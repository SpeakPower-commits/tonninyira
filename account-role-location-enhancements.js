/*
 * Tonninyira account + role + location experience.
 * Keeps the original marketplace structure, but makes identity the front door.
 * Auth: Supabase passwordless email or SMS OTP.
 * Roles: customer is activated immediately; vendor/rider is a role request
 * followed by the existing registration/approval workflow.
 */
(function(){
  'use strict';

  const STYLE_ID='tn-account-location-styles';
  const MODAL_ID='tn-account-modal';
  const STORAGE='tonninyira_location_v1';
  const client=()=> (typeof supabaseClient!=='undefined') ? supabaseClient : null;
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

  function styles(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style'); s.id=STYLE_ID;
    s.textContent=`
      .tn-account-card{margin:0 16px 12px;background:var(--card);border:1px solid rgba(243,232,216,.08);border-radius:16px;padding:16px}
      .tn-account-kicker{font-size:.66rem;font-weight:800;letter-spacing:1.4px;color:var(--gold)}
      .tn-account-title{font-family:'Alfa Slab One',cursive;font-size:1.15rem;margin:5px 0;color:var(--sand)}
      .tn-account-copy{font-size:.78rem;line-height:1.45;color:var(--muted);margin:4px 0 10px}
      .tn-role-grid{display:grid;grid-template-columns:1fr;gap:9px;margin-top:10px}
      .tn-role{background:var(--card2);border:1px solid rgba(243,232,216,.08);border-radius:13px;padding:13px;text-align:left;cursor:pointer;color:var(--sand)}
      .tn-role strong{display:block;font-size:.9rem}.tn-role span{display:block;font-size:.73rem;color:var(--muted);margin-top:3px;line-height:1.35}
      .tn-auth-tabs{display:flex;gap:8px;margin:12px 0}.tn-auth-tab{flex:1;border:1px solid rgba(243,232,216,.1);border-radius:10px;background:var(--card2);color:var(--muted);padding:10px;font-weight:800;cursor:pointer}.tn-auth-tab.active{background:var(--gold);color:var(--ink);border-color:var(--gold)}
      .tn-auth-input{width:100%;padding:12px;border-radius:11px;border:1px solid rgba(243,232,216,.12);background:var(--ink);color:var(--sand);font:inherit;margin-top:6px}
      .tn-auth-help{font-size:.72rem;line-height:1.4;color:var(--muted);margin-top:8px}
      .tn-otp{letter-spacing:6px;text-align:center;font-weight:800;font-size:1.1rem}
      .tn-location-card{margin:0 16px 12px;background:var(--card);border:1px solid rgba(76,154,91,.22);border-radius:16px;padding:14px}
      .tn-location-status{font-size:.78rem;line-height:1.45;color:var(--muted);margin-top:5px}
      .tn-location-actions{display:flex;gap:8px;margin-top:10px}.tn-location-actions button{flex:1}
      .tn-location-map{height:260px;border-radius:14px;overflow:hidden;margin-top:12px;background:var(--card2);display:none}.tn-location-map.active{display:block}
      .tn-small-btn{border:1px solid rgba(243,232,216,.12);border-radius:10px;background:transparent;color:var(--sand);padding:10px;font-weight:800;cursor:pointer}
      .tn-ledger{margin:10px 16px;background:var(--card);border-radius:14px;padding:14px;border:1px solid rgba(245,180,0,.18)}
      .tn-ledger-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.tn-ledger-item{background:var(--card2);border-radius:10px;padding:10px}.tn-ledger-label{font-size:.68rem;color:var(--muted)}.tn-ledger-value{font-weight:800;margin-top:3px}
    `; document.head.appendChild(s);
  }

  function modal(){
    let m=document.getElementById(MODAL_ID); if(m) return m;
    m=document.createElement('div'); m.id=MODAL_ID;
    m.style.cssText='position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.74);display:grid;place-items:end center;';
    document.body.appendChild(m); return m;
  }
  function closeModal(){ document.getElementById(MODAL_ID)?.remove(); }

  async function session(){
    try{return (await client()?.auth?.getSession())?.data?.session||null}catch(_){return null}
  }
  async function saveProfile(displayName, phone){
    const c=client(), s=await session(); if(!c||!s) return false;
    const row={id:s.user.id,role:'customer',display_name:displayName||s.user.email||phone||'Tonninyira customer',phone:phone||s.user.phone||null};
    const res=await c.from('profiles').upsert(row,{onConflict:'id'}); return !res.error;
  }

  function renderRoleChoice(){
    const m=modal(); styles();
    m.innerHTML=`<div style="width:min(520px,100%);max-height:92vh;overflow:auto;background:var(--ink);border-radius:22px 22px 0 0;padding:18px 16px 22px;">
      <div style="display:flex;justify-content:space-between;align-items:center"><div><div class="tn-account-kicker">ONE TONNINYIRA ACCOUNT</div><h2 class="tn-account-title">What are you here to do?</h2></div><button class="close-x" id="tnRoleClose">×</button></div>
      <p class="tn-account-copy">Start with your phone or email. Then choose how you want to use Tonninyira. You can apply to sell or deliver later from the same account.</p>
      <div class="tn-role-grid">
        <button class="tn-role" data-role="customer"><strong>🛍 I want to buy</strong><span>Shop food, groceries, clothes and other everyday things.</span></button>
        <button class="tn-role" data-role="vendor"><strong>🏪 I want to sell</strong><span>Register my stall, list products and track what I earn.</span></button>
        <button class="tn-role" data-role="rider"><strong>🏍 I want to deliver</strong><span>Apply as a rider, receive deliveries and track my earnings.</span></button>
      </div></div>`;
    m.querySelector('#tnRoleClose').onclick=closeModal;
    m.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>openAuth(b.dataset.role));
  }

  function openAuth(role){
    const m=modal(); styles(); m.innerHTML=`<div style="width:min(520px,100%);background:var(--ink);border-radius:22px 22px 0 0;padding:18px 16px 22px;">
      <div style="display:flex;justify-content:space-between;align-items:center"><div><div class="tn-account-kicker">TONNINYIRA ACCOUNT</div><h2 class="tn-account-title">${role==='customer'?'Create or sign in':'Start your '+role+' journey'}</h2></div><button class="close-x" id="tnAuthClose">×</button></div>
      <p class="tn-account-copy">Use the contact method you already have. No password is required.</p>
      <div class="tn-auth-tabs"><button class="tn-auth-tab active" data-method="phone">Phone</button><button class="tn-auth-tab" data-method="email">Email</button></div>
      <div id="tnAuthFields"></div><div id="tnAuthMessage" class="tn-auth-help"></div>
    </div>`;
    m.querySelector('#tnAuthClose').onclick=closeModal;
    m.querySelectorAll('.tn-auth-tab').forEach(t=>t.onclick=()=>{m.querySelectorAll('.tn-auth-tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');renderAuthFields(t.dataset.method,role)});
    renderAuthFields('phone',role);
  }

  function renderAuthFields(method,role){
    const box=document.querySelector('#tnAuthFields'); if(!box) return;
    box.innerHTML=method==='phone'
      ? `<label style="font-size:.76rem;font-weight:800">Uganda phone number</label><input class="tn-auth-input" id="tnLoginContact" type="tel" inputmode="tel" placeholder="0772 123 456" autocomplete="tel"><button class="btn-primary" id="tnSendOtp">Send code by SMS</button>`
      : `<label style="font-size:.76rem;font-weight:800">Email address</label><input class="tn-auth-input" id="tnLoginContact" type="email" inputmode="email" placeholder="you@example.com" autocomplete="email"><button class="btn-primary" id="tnSendOtp">Send secure email link</button>`;
    document.querySelector('#tnSendOtp')?.addEventListener('click',()=>sendOtp(method,role));
  }

  function ugPhone(raw){
    const s=String(raw||'').replace(/[\s()-]/g,'');
    if(/^0\d{9}$/.test(s)) return '+256'+s.slice(1);
    if(/^256\d{9}$/.test(s)) return '+'+s;
    if(/^\+256\d{9}$/.test(s)) return s;
    return null;
  }

  async function sendOtp(method,role){
    const c=client(), m=document.getElementById(MODAL_ID), msg=document.querySelector('#tnAuthMessage');
    const input=document.querySelector('#tnLoginContact'); let value=input?.value.trim();
    if(method==='phone') value=ugPhone(value);
    if(method==='phone'&&!value){msg.textContent='Enter a valid Ugandan mobile number.';return}
    if(method==='email'&&!/^\S+@\S+\.\S+$/.test(value)){msg.textContent='Enter a valid email address.';return}
    if(!c?.auth?.signInWithOtp){msg.textContent='Account sign-in is unavailable right now.';return}
    const btn=document.querySelector('#tnSendOtp'); btn.disabled=true; btn.textContent=method==='phone'?'Sending code…':'Sending link…';
    const res=method==='phone'
      ? await c.auth.signInWithOtp({phone:value,options:{shouldCreateUser:true}})
      : await c.auth.signInWithOtp({email:value,options:{shouldCreateUser:true,emailRedirectTo:location.href.split('#')[0]}});
    if(res.error){btn.disabled=false;btn.textContent=method==='phone'?'Send code by SMS':'Send secure email link';msg.textContent=res.error.message;return}
    if(method==='email'){ msg.textContent='Check your email, open the secure link, then return here.'; return; }
    m.querySelector('#tnAuthFields').innerHTML=`<label style="font-size:.76rem;font-weight:800">6-digit code</label><input class="tn-auth-input tn-otp" id="tnOtp" inputmode="numeric" maxlength="6" placeholder="123456"><button class="btn-primary" id="tnVerifyOtp">Verify and continue</button><button class="tn-small-btn" id="tnBackOtp" style="width:100%;margin-top:8px">Change phone number</button>`;
    m.querySelector('#tnVerifyOtp').onclick=()=>verifyPhone(value,role);
    m.querySelector('#tnBackOtp').onclick=()=>renderAuthFields('phone',role);
  }

  async function verifyPhone(phone,role){
    const c=client(), msg=document.querySelector('#tnAuthMessage'), otp=document.querySelector('#tnOtp')?.value.trim();
    if(!/^\d{6}$/.test(otp)){msg.textContent='Enter the 6-digit code.';return}
    const res=await c.auth.verifyOtp({phone,token:otp,type:'sms'});
    if(res.error){msg.textContent=res.error.message;return}
    await afterAuth(role,phone);
  }

  async function afterAuth(role,contact){
    const s=await session(); if(!s) return;
    let display=contact;
    const existing=(await client().from('profiles').select('display_name,phone,role').eq('id',s.user.id).maybeSingle()).data;
    if(existing?.display_name) display=existing.display_name;
    await saveProfile(display, s.user.phone||contact);
    try{localStorage.setItem('tonninyira_auth_role_intent',role)}catch(_){ }
    if(role==='customer'){closeModal(); refreshAccountUI(); return;}
    const req=await client().from('role_requests').upsert({user_id:s.user.id,requested_role:role,status:'pending'},{onConflict:'user_id,requested_role'});
    if(req.error){document.querySelector('#tnAuthMessage').textContent=req.error.message;return;}
    closeModal();
    if(role==='vendor') location.href='register.html?as=vendor';
    if(role==='rider') location.href='register.html?as=rider';
  }

  async function signOut(){
    const c=client(); if(!c?.auth?.signOut)return;
    await c.auth.signOut(); localStorage.removeItem('tonninyira_customer'); refreshAccountUI();
  }

  async function currentProfile(){
    const s=await session(); if(!s) return null;
    const p=(await client().from('profiles').select('display_name,phone,role').eq('id',s.user.id).maybeSingle()).data;
    return {session:s,profile:p};
  }

  async function accountCard(){
    styles(); const found=await currentProfile(); const card=document.createElement('section'); card.className='tn-account-card';
    if(!found){card.innerHTML=`<div class="tn-account-kicker">MY ACCOUNT</div><div class="tn-account-title">Sign in to Tonninyira</div><p class="tn-account-copy">One secure account for buying, selling or delivering. Your phone number is enough.</p><button class="btn-primary" id="tnStartAccount">Create account / Sign in</button>`; card.querySelector('#tnStartAccount').onclick=renderRoleChoice; return card;}
    const name=found.profile?.display_name||found.session.user.email||found.session.user.phone||'Tonninyira user'; const role=found.profile?.role||'customer';
    card.innerHTML=`<div class="tn-account-kicker">MY ACCOUNT</div><div class="tn-account-title">Hello, ${esc(name)}</div><p class="tn-account-copy">Signed in as <strong>${esc(role)}</strong>. This same account can connect your shopping, selling or delivery activity.</p><button class="btn-secondary" id="tnChangeRole">Add or change my Tonninyira role</button><button class="btn-secondary" id="tnSignOut">Sign out</button>`;
    card.querySelector('#tnChangeRole').onclick=renderRoleChoice; card.querySelector('#tnSignOut').onclick=signOut; return card;
  }

  async function injectAccount(){
    if(typeof AppState==='undefined'||AppState.view!=='profile') return;
    const main=document.getElementById('mainArea'); if(!main||main.querySelector('[data-tn-account]')) return;
    const card=await accountCard(); card.dataset.tnAccount='1'; main.prepend(card);
    const loc=locationCard(); if(loc) card.insertAdjacentElement('afterend',loc);
    injectLedger(main);
  }

  function locationCard(){
    const s=JSON.parse(localStorage.getItem(STORAGE)||'null');
    const el=document.createElement('section'); el.className='tn-location-card'; el.id='tnLocationCard';
    el.innerHTML=`<div class="tn-account-kicker">DELIVERY LOCATION</div><div class="tn-account-title" style="font-size:1rem">Where should we deliver?</div><div class="tn-location-status" id="tnLocStatus">${s?`Saved location: ${esc(s.label||'GPS location')}`:'No exact location saved yet.'}</div><div class="tn-location-actions"><button class="btn-primary" id="tnUseGps" style="margin-top:0">📍 Use my location</button><button class="tn-small-btn" id="tnOpenMap">Choose on map</button></div><div class="tn-location-map" id="tnMap"></div>`;
    el.querySelector('#tnUseGps').onclick=()=>captureGps(el); el.querySelector('#tnOpenMap').onclick=()=>openMap(el); return el;
  }

  function saveLocation(lat,lng,label,accuracy){
    const row={lat,lng,label:label||'Pinned delivery location',accuracy:accuracy||null,savedAt:new Date().toISOString()}; localStorage.setItem(STORAGE,JSON.stringify(row)); return row;
  }
  function captureGps(el){
    const status=el.querySelector('#tnLocStatus'), btn=el.querySelector('#tnUseGps');
    if(!navigator.geolocation){status.textContent='GPS is not supported on this device.';return}
    btn.disabled=true; btn.textContent='📍 Locating…';
    navigator.geolocation.getCurrentPosition(pos=>{const x=saveLocation(pos.coords.latitude,pos.coords.longitude,'Current phone location',pos.coords.accuracy); if(typeof AppState!=='undefined') AppState.customerLocation={lat:x.lat,lng:x.lng}; status.innerHTML=`Location saved. Accuracy about ${Math.round(x.accuracy||0)} m. <a href="https://www.google.com/maps?q=${x.lat},${x.lng}" target="_blank" rel="noopener">Check it on Google Maps</a>`; btn.disabled=false;btn.textContent='📍 Location saved ✓'; if(typeof updateCartUI==='function')updateCartUI()},e=>{status.textContent="We couldn't get your GPS location. Allow location access or choose the point on the map.";btn.disabled=false;btn.textContent='📍 Use my location'},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
  }

  async function loadLeaflet(){
    if(window.L) return true;
    if(!document.querySelector('link[data-tn-leaflet]')){const l=document.createElement('link');l.rel='stylesheet';l.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';l.dataset.tnLeaflet='1';document.head.appendChild(l)}
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s)}); return !!window.L;
  }

  async function openMap(el){
    const box=el.querySelector('#tnMap'); box.classList.add('active'); box.innerHTML='<div style="padding:50px 14px;text-align:center;color:var(--muted)">Loading map…</div>';
    try{await loadLeaflet()}catch(_){box.innerHTML='<div style="padding:30px 14px;color:var(--muted)">Map could not load. Use your phone location instead.</div>';return}
    const saved=JSON.parse(localStorage.getItem(STORAGE)||'null'); const center=saved?[saved.lat,saved.lng]:[0.3476,32.5825];
    box.innerHTML=''; const map=L.map(box).setView(center,saved?16:12); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);
    const marker=L.marker(center,{draggable:true}).addTo(map); marker.bindPopup('Drag this pin to your delivery point').openPopup();
    const finish=async()=>{const p=marker.getLatLng(); const x=saveLocation(p.lat,p.lng,'Pinned delivery location',null); if(typeof AppState!=='undefined')AppState.customerLocation={lat:x.lat,lng:x.lng}; el.querySelector('#tnLocStatus').innerHTML=`Location saved. <a href="https://www.google.com/maps?q=${x.lat},${x.lng}" target="_blank" rel="noopener">Check it on Google Maps</a>`; if(typeof updateCartUI==='function')updateCartUI()};
    const saveBtn=document.createElement('button'); saveBtn.className='btn-primary';saveBtn.style.marginTop='8px';saveBtn.textContent='Save this delivery point';saveBtn.onclick=finish;box.insertAdjacentElement('afterend',saveBtn);
  }

  async function injectLedger(main){
    if(main.querySelector('[data-tn-ledger]')) return;
    const found=await currentProfile(); if(!found) return;
    const role=found.profile?.role;
    if(role!=='vendor'&&role!=='rider') return;
    const {data,error}=await client().from('my_settlement_summary').select('*').order('created_at',{ascending:false}).limit(20); if(error) return;
    let gross=0,fee=0,net=0;
    (data||[]).forEach(r=>{if(role==='vendor'){gross+=Number(r.gross_amount||0);fee+=Number(r.platform_fee||0);net+=Number(r.vendor_amount||0)}else{gross+=Number(r.rider_gross||0);fee+=Number(r.rider_platform_fee||0);net+=Number(r.rider_amount||0)}});
    const box=document.createElement('section');box.className='tn-ledger';box.dataset.tnLedger='1'; box.innerHTML=`<div class="tn-account-kicker">YOUR EARNINGS</div><div class="tn-account-title" style="font-size:1rem">${role==='vendor'?'STALL':'RIDER'} SETTLEMENT</div><p class="tn-account-copy">Every completed order shows the gross amount, Tonninyira's 5% service cut and your current net amount.</p><div class="tn-ledger-grid"><div class="tn-ledger-item"><div class="tn-ledger-label">Gross</div><div class="tn-ledger-value">UGX ${Math.round(gross).toLocaleString()}</div></div><div class="tn-ledger-item"><div class="tn-ledger-label">Tonninyira 5%</div><div class="tn-ledger-value">UGX ${Math.round(fee).toLocaleString()}</div></div><div class="tn-ledger-item"><div class="tn-ledger-label">Your amount</div><div class="tn-ledger-value">UGX ${Math.round(net).toLocaleString()}</div></div><div class="tn-ledger-item"><div class="tn-ledger-label">Orders counted</div><div class="tn-ledger-value">${(data||[]).length}</div></div></div>`; main.appendChild(box);
  }

  async function refreshAccountUI(){
    if(typeof AppState==='undefined'||AppState.view!=='profile')return;
    const main=document.getElementById('mainArea'); if(!main)return;
    main.querySelector('[data-tn-account]')?.remove();main.querySelector('#tnLocationCard')?.remove();main.querySelector('[data-tn-ledger]')?.remove();
    await injectAccount();
  }

  function boot(){styles(); if(typeof window.renderMain==='function'){const orig=window.renderMain;window.renderMain=function(...a){const r=orig.apply(this,a);setTimeout(injectAccount,0);return r;}} setTimeout(injectAccount,250); window.addEventListener('hashchange',()=>setTimeout(injectAccount,200));}
  boot();
  window.tnAccountRefresh=refreshAccountUI;
})();