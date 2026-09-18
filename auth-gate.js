/*
 * Tonninyira account gate.
 * The marketplace is NOT the entry point. A visitor must authenticate first,
 * then choose how they use Tonninyira. Vendor/rider access is approval-based.
 */
(function(){
  'use strict';

  const STYLE_ID='tn-auth-gate-styles';
  const GATE_ID='tn-auth-gate';
  let gate=null;
  let pendingPhone='';
  let pendingMode='phone';

  function db(){ return (typeof supabaseClient!=='undefined') ? supabaseClient : null; }
  function safe(v){ return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function phoneUg(phone){
    const raw=String(phone||'').trim().replace(/[\s()-]/g,'');
    if(/^07\d{8}$/.test(raw)) return '+256'+raw.slice(1);
    if(/^7\d{8}$/.test(raw)) return '+256'+raw;
    if(/^2567\d{8}$/.test(raw)) return '+'+raw;
    if(/^\+2567\d{8}$/.test(raw)) return raw;
    return raw;
  }

  function injectStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style'); s.id=STYLE_ID;
    s.textContent=`
      body.tn-locked>header,body.tn-locked>main,body.tn-locked>#marketBanner,body.tn-locked>#catTabs,body.tn-locked>#subcatRow,body.tn-locked>#popularWrap,body.tn-locked>.bottom-nav{visibility:hidden;}
      .tn-gate{position:fixed;inset:0;z-index:300;background:var(--ink);color:var(--sand);overflow:auto;padding:24px 16px 40px;}
      .tn-gate-inner{width:min(440px,100%);min-height:100%;margin:0 auto;display:flex;flex-direction:column;justify-content:center;}
      .tn-gate-brand{text-align:center;margin-bottom:22px;}
      .tn-gate-brand .name{font-family:'Alfa Slab One',cursive;font-size:2rem;color:var(--sand);}
      .tn-gate-brand .tag{color:var(--gold);font-size:.7rem;font-weight:800;letter-spacing:1.5px;margin-top:7px;}
      .tn-gate-card{background:var(--card);border:1px solid rgba(243,232,216,.09);border-radius:18px;padding:18px;box-shadow:0 18px 60px rgba(0,0,0,.25);}
      .tn-gate-kicker{font-size:.68rem;font-weight:800;letter-spacing:1.4px;color:var(--gold);margin-bottom:6px;}
      .tn-gate-title{font-family:'Alfa Slab One',cursive;font-size:1.35rem;margin:0;color:var(--sand);line-height:1.15;}
      .tn-gate-copy{font-size:.8rem;color:var(--muted);line-height:1.5;margin:7px 0 15px;}
      .tn-gate-input{width:100%;padding:13px;border-radius:11px;border:1px solid rgba(243,232,216,.13);background:var(--ink);color:var(--sand);font:inherit;}
      .tn-gate-input:focus{outline:none;border-color:var(--gold);}
      .tn-gate-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px;}
      .tn-gate-actions button{flex:1;min-width:130px;}
      .tn-gate-status{font-size:.76rem;line-height:1.45;color:var(--muted);min-height:21px;margin-top:9px;}
      .tn-gate-otp{letter-spacing:5px;text-align:center;font-weight:800;font-size:1.2rem;}
      .tn-role-grid{display:grid;grid-template-columns:1fr;gap:9px;margin-top:13px;}
      .tn-role{width:100%;text-align:left;border:1px solid rgba(243,232,216,.1);background:var(--card2);color:var(--sand);border-radius:14px;padding:14px;cursor:pointer;}
      .tn-role:hover{border-color:var(--gold);}
      .tn-role-title{font-size:.92rem;font-weight:800;}
      .tn-role-copy{font-size:.74rem;color:var(--muted);line-height:1.4;margin-top:3px;}
      .tn-role-note{font-size:.7rem;color:var(--muted);line-height:1.4;margin-top:13px;}
      .tn-gate-link{border:0;background:none;color:var(--gold);text-decoration:underline;font:inherit;font-weight:700;cursor:pointer;padding:0;}
      .tn-gate-divider{height:1px;background:rgba(243,232,216,.08);margin:15px 0;}
    `; document.head.appendChild(s);
  }

  function createGate(){
    if(gate) return gate;
    injectStyles(); document.body.classList.add('tn-locked');
    gate=document.createElement('div'); gate.id=GATE_ID; gate.className='tn-gate';
    document.body.appendChild(gate); return gate;
  }

  function clearGate(){
    document.body.classList.remove('tn-locked');
    gate?.remove(); gate=null;
  }

  async function getSession(){
    const client=db(); if(!client?.auth?.getSession) return null;
    try{const {data}=await client.auth.getSession(); return data?.session||null;}catch(_){return null;}
  }

  async function getProfile(userId){
    const client=db(); if(!client||!userId) return null;
    const {data}=await client.from('profiles').select('id,role,display_name,phone').eq('id',userId).maybeSingle();
    return data||null;
  }

  async function saveProfileBasics(user, name, phone){
    const client=db(); if(!client) return;
    const values={id:user.id,display_name:name||user.phone||user.email||'Tonninyira User',phone:phone||user.phone||null};
    const {error}=await client.from('profiles').update({display_name:values.display_name,phone:values.phone}).eq('id',user.id);
    if(error) throw error;
    try{localStorage.setItem('tonninyira_customer',JSON.stringify({name:values.display_name,phone:values.phone||''}));}catch(_){ }
  }

  function renderStart(message){
    createGate();
    gate.innerHTML=`<div class="tn-gate-inner"><div class="tn-gate-brand"><div class="name">Tonninyira</div><div class="tag">LOCAL VENDORS · REAL PRICES · YOUR DOOR</div></div><div class="tn-gate-card"><div class="tn-gate-kicker">WELCOME</div><h1 class="tn-gate-title">Sign in to Tonninyira</h1><p class="tn-gate-copy">Create an account or sign in with your phone. No password to remember. After you verify, Tonninyira will ask how you want to use the platform.</p><label style="display:block;font-size:.76rem;font-weight:800;margin-bottom:5px;">Phone number</label><input id="tnPhone" class="tn-gate-input" type="tel" inputmode="tel" autocomplete="tel" placeholder="0772 123 456"><div class="tn-gate-actions"><button id="tnSendPhone" class="btn-primary">Send SMS code</button></div><div class="tn-gate-divider"></div><button id="tnUseEmail" class="tn-gate-link">Use email instead</button><div id="tnGateStatus" class="tn-gate-status">${safe(message||'')}</div></div></div>`;
    gate.querySelector('#tnSendPhone').onclick=sendPhoneOtp;
    gate.querySelector('#tnUseEmail').onclick=renderEmailStart;
  }

  function renderEmailStart(){
    createGate();
    gate.innerHTML=`<div class="tn-gate-inner"><div class="tn-gate-brand"><div class="name">Tonninyira</div><div class="tag">LOCAL VENDORS · REAL PRICES · YOUR DOOR</div></div><div class="tn-gate-card"><div class="tn-gate-kicker">WELCOME</div><h1 class="tn-gate-title">Sign in with email</h1><p class="tn-gate-copy">We’ll send a secure one-time link. No password to remember.</p><label style="display:block;font-size:.76rem;font-weight:800;margin-bottom:5px;">Email address</label><input id="tnEmail" class="tn-gate-input" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com"><div class="tn-gate-actions"><button id="tnSendEmail" class="btn-primary">Send secure link</button></div><div class="tn-gate-divider"></div><button id="tnUsePhone" class="tn-gate-link">Use phone instead</button><div id="tnGateStatus" class="tn-gate-status"></div></div></div>`;
    gate.querySelector('#tnSendEmail').onclick=sendEmailOtp;
    gate.querySelector('#tnUsePhone').onclick=()=>renderStart();
  }

  async function sendPhoneOtp(){
    const client=db(); const input=document.getElementById('tnPhone'); const status=document.getElementById('tnGateStatus'); const btn=document.getElementById('tnSendPhone');
    const phone=phoneUg(input?.value);
    if(!/^\+2567\d{8}$/.test(phone)){status.textContent='Enter a Ugandan mobile number, for example 0772 123 456.';return;}
    if(!client?.auth?.signInWithOtp){status.textContent='Phone sign-in is not configured on Tonninyira yet.';return;}
    pendingPhone=phone; pendingMode='phone'; btn.disabled=true; btn.textContent='Sending…';
    try{const {error}=await client.auth.signInWithOtp({phone}); if(error) throw error; renderOtp(phone);}catch(e){status.textContent='Could not send the SMS code. Please try again.';}finally{ }
  }

  async function sendEmailOtp(){
    const client=db(); const input=document.getElementById('tnEmail'); const status=document.getElementById('tnGateStatus'); const btn=document.getElementById('tnSendEmail');
    const email=String(input?.value||'').trim();
    if(!/^\S+@\S+\.\S+$/.test(email)){status.textContent='Enter a valid email address.';return;}
    if(!client?.auth?.signInWithOtp){status.textContent='Email sign-in is not available right now.';return;}
    pendingPhone=email; pendingMode='email'; btn.disabled=true; btn.textContent='Sending…';
    try{const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.href.split('#')[0],shouldCreateUser:true}});if(error)throw error;status.textContent='Check your email and follow the secure link to continue.';}catch(e){status.textContent='Could not send the email link. Please try again.';}finally{btn.disabled=false;btn.textContent='Send secure link';}
  }

  function renderOtp(identifier){
    createGate(); gate.innerHTML=`<div class="tn-gate-inner"><div class="tn-gate-brand"><div class="name">Tonninyira</div><div class="tag">LOCAL VENDORS · REAL PRICES · YOUR DOOR</div></div><div class="tn-gate-card"><div class="tn-gate-kicker">VERIFY YOUR NUMBER</div><h1 class="tn-gate-title">Enter the SMS code</h1><p class="tn-gate-copy">We sent a 6-digit code to <strong>${safe(identifier)}</strong>.</p><label style="display:block;font-size:.76rem;font-weight:800;margin-bottom:5px;">6-digit code</label><input id="tnOtp" class="tn-gate-input tn-gate-otp" type="tel" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456"><div class="tn-gate-actions"><button id="tnVerify" class="btn-primary">Verify & continue</button></div><div class="tn-gate-divider"></div><button id="tnBackAuth" class="tn-gate-link">Use a different number</button><div id="tnGateStatus" class="tn-gate-status"></div></div></div>`;
    gate.querySelector('#tnVerify').onclick=()=>verifyPhoneOtp(identifier);
    gate.querySelector('#tnBackAuth').onclick=()=>renderStart();
    gate.querySelector('#tnOtp').focus();
  }

  async function verifyPhoneOtp(phone){
    const client=db(); const token=document.getElementById('tnOtp')?.value.trim(); const status=document.getElementById('tnGateStatus'); const btn=document.getElementById('tnVerify');
    if(!/^\d{6}$/.test(token)){status.textContent='Enter the 6-digit code from the SMS.';return;}
    btn.disabled=true; btn.textContent='Verifying…';
    try{const {data,error}=await client.auth.verifyOtp({phone,token,type:'sms'});if(error)throw error;await afterAuth(data?.session||await getSession());}catch(e){status.textContent='That code could not be verified. Please check it and try again.';btn.disabled=false;btn.textContent='Verify & continue';}
  }

  async function afterAuth(session){
    if(!session?.user){renderStart('Please sign in to continue.');return;}
    const profile=await getProfile(session.user.id);
    if(profile?.phone || session.user.phone){
      try{await saveProfileBasics(session.user,profile?.display_name||'',profile?.phone||session.user.phone||'');}catch(_){ }
    }
    renderRoleChoice(session.user,profile||{role:'customer'});
  }

  async function chooseRole(role){
    const client=db(); const session=await getSession();
    if(!client||!session){renderStart('Your session expired. Please sign in again.');return;}
    const user=session.user;
    const status=document.getElementById('tnGateStatus'); if(status) status.textContent='Saving your choice…';
    try{
      if(role==='customer'){
        const {error}=await client.from('profiles').update({role:'customer'}).eq('id',user.id);
        if(error) throw error;
        clearGate();
        if(typeof window.renderMain==='function') window.renderMain();
        return;
      }
      const {error}=await client.from('role_requests').insert({user_id:user.id,requested_role:role,status:'pending'});
      if(error && !/duplicate|unique/i.test(error.message||'')) throw error;
      renderPendingRole(role);
    }catch(e){status.textContent='We could not save that choice. Please try again.';}
  }

  function renderRoleChoice(user,profile){
    createGate();
    const current=profile?.role||'customer';
    gate.innerHTML=`<div class="tn-gate-inner"><div class="tn-gate-brand"><div class="name">Tonninyira</div><div class="tag">LOCAL VENDORS · REAL PRICES · YOUR DOOR</div></div><div class="tn-gate-card"><div class="tn-gate-kicker">ACCOUNT READY</div><h1 class="tn-gate-title">How will you use Tonninyira?</h1><p class="tn-gate-copy">Choose what you are here to do. Customer access starts immediately. Selling and delivering require Tonninyira approval.</p><div class="tn-role-grid"><button class="tn-role" data-role="customer"><div class="tn-role-title">🛍 I’m buying</div><div class="tn-role-copy">Browse Eats and Shop, place orders, save stalls and track deliveries.</div></button><button class="tn-role" data-role="vendor"><div class="tn-role-title">🏪 I’m selling</div><div class="tn-role-copy">Register or manage my stall, receive customer orders and see my earnings.</div></button><button class="tn-role" data-role="rider"><div class="tn-role-title">🏍 I’m delivering</div><div class="tn-role-copy">Register or manage my rider account, accept deliveries and see my earnings.</div></button></div><div class="tn-role-note">${current!=='customer'?`Current account role: <strong>${safe(current)}</strong>.`:'Your account can request more than one platform role later.'}</div><div id="tnGateStatus" class="tn-gate-status"></div></div></div>`;
    gate.querySelectorAll('[data-role]').forEach(btn=>btn.onclick=()=>chooseRole(btn.dataset.role));
  }

  function renderPendingRole(role){
    createGate();
    const label=role==='vendor'?'selling':'delivering';
    gate.innerHTML=`<div class="tn-gate-inner"><div class="tn-gate-brand"><div class="name">Tonninyira</div><div class="tag">LOCAL VENDORS · REAL PRICES · YOUR DOOR</div></div><div class="tn-gate-card"><div class="tn-gate-kicker">APPLICATION STARTED</div><h1 class="tn-gate-title">You want to start ${label}</h1><p class="tn-gate-copy">Your account is verified. The next step is to complete the ${role} registration so Tonninyira can review and approve it.</p><div class="tn-gate-actions"><a href="register.html?as=${role}" class="btn-primary" style="display:block;text-align:center;text-decoration:none;">Continue ${role} registration</a></div><div class="tn-gate-divider"></div><button id="tnShopInstead" class="tn-gate-link">Continue as a customer</button></div></div>`;
    gate.querySelector('#tnShopInstead').onclick=()=>chooseRole('customer');
  }

  async function route(){
    injectStyles();
    const session=await getSession();
    if(session){ await afterAuth(session); } else renderStart();
  }

  function listen(){
    const client=db(); if(!client?.auth?.onAuthStateChange) return;
    client.auth.onAuthStateChange((event,session)=>{ if(event==='SIGNED_OUT') renderStart(); else if(session && (event==='SIGNED_IN'||event==='TOKEN_REFRESHED')) setTimeout(()=>afterAuth(session),0); });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{route();listen();}); else {route();listen();}
})();