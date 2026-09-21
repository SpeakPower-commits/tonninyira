/* Unifies the legacy partner dashboards with the Supabase account session.
 * Keeps their existing dashboard/order UI but replaces phone+PIN login with
 * phone OTP verification and adds the auditable 5% earnings breakdown. */
(function(){
  'use strict';
  const c=()=>typeof supabaseClient!=='undefined'?supabaseClient:null;
  const isVendor=location.pathname.toLowerCase().includes('vendor-dashboard');
  const isRider=location.pathname.toLowerCase().includes('rider-dashboard');
  if(!isVendor&&!isRider)return;
  if(isRider && !document.querySelector('script[data-tn-rider-realtime]')){
    const s=document.createElement('script');s.src='rider-realtime-alerts.js';s.dataset.tnRiderRealtime='1';document.head.appendChild(s);
  }
  const session=async()=>{try{return (await c()?.auth?.getSession())?.data?.session||null}catch(_){return null}};
  const phone=v=>{const s=String(v||'').replace(/[\s()-]/g,'');if(/^0\d{9}$/.test(s))return '+256'+s.slice(1);if(/^256\d{9}$/.test(s))return '+'+s;if(/^\+256\d{9}$/.test(s))return s;return null};
  /* Partners used to sign in with an SMS code. That could never succeed: no SMS
     provider is configured, so no code arrived -- and shouldCreateUser would have
     minted an empty account rather than finding the partner's. Email or phone plus
     the account password, same as the storefront. */
  const RESET_URL=location.origin+location.pathname.replace(/[^/]*$/,'')+'auth-callback.html';
  function say(text,ok){const m=document.getElementById('ptaMsg');if(!m)return;m.textContent=text;m.style.color=ok?'var(--gold)':'';m.classList.remove('hidden')}
  function ui(){
    const lv=document.getElementById('loginView');if(!lv)return;
    const role=isVendor?'vendor':'rider';
    lv.innerHTML=`<h3>${isVendor?'STALL':'RIDER'} ACCOUNT</h3><div class="card">
      <p class="helper" style="margin-top:0">Sign in with the same Tonninyira account you registered with. No SMS code needed.</p>
      <label>Email or phone number</label><input type="text" id="ptaId" autocomplete="username" placeholder="you@example.com or 0772 123 456">
      <label>Password</label><input type="password" id="ptaPass" autocomplete="current-password">
      <button class="btn-primary" id="ptaSignIn">Sign in</button>
      <button class="btn-secondary" id="ptaReset" type="button">Forgot password?</button>
      <p class="helper" style="margin-bottom:0">Not registered yet? <a href="register.html?as=${role}" style="color:var(--gold)">Apply to join</a> &mdash; you create your account first, then submit your details.</p>
      <div id="ptaMsg" class="error-text hidden"></div></div>`;
    document.getElementById('ptaSignIn').onclick=signIn;
    document.getElementById('ptaReset').onclick=reset;
    lv.querySelectorAll('#ptaId,#ptaPass').forEach(i=>i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();signIn()}}));
  }
  async function signIn(){
    const b=document.getElementById('ptaSignIn');
    const id=document.getElementById('ptaId').value.trim(),pass=document.getElementById('ptaPass').value;
    if(!id||!pass){say('Enter your email or phone number and your password.');return}
    b.disabled=true;b.textContent='Signing in…';
    const p=phone(id);
    let r;
    try{r=p?await c().auth.signInWithPassword({phone:p,password:pass})
          :await c().auth.signInWithPassword({email:id,password:pass})}
    catch(e){r={error:{message:'Could not reach Tonninyira. Check your connection and try again.'}}}
    if(r.error){b.disabled=false;b.textContent='Sign in';say(r.error.message);return}
    await enter();
  }
  async function reset(){
    const id=document.getElementById('ptaId').value.trim();
    if(!id.includes('@')){say('Type the email address on your account in the first box, then tap Forgot password?');return}
    const b=document.getElementById('ptaReset');b.disabled=true;b.textContent='Sending…';
    const r=await c().auth.resetPasswordForEmail(id,{redirectTo:RESET_URL});
    b.disabled=false;b.textContent='Forgot password?';
    say(r.error?r.error.message:'Reset link sent. Open it from your email, set a new password, then come back and sign in.',!r.error);
  }
  /* Signed in as a Tonninyira account -- now find the partner record it owns. */
  async function partnerRow(userId){
    const table=isVendor?'vendors':'riders';
    const fields=isVendor?'tonninyira_id,business_name,approval_status,email,phone':'tonninyira_id,full_name,approval_status,email,phone';
    try{return (await c().from(table).select(fields).eq('auth_user_id',userId).maybeSingle()).data||null}catch(_){return null}
  }
  async function enter(){
    const s=await session();if(!s)return;
    const row=await partnerRow(s.user.id);
    if(!row){say(`This account has no ${isVendor?'stall':'rider'} profile yet. Apply to join, or ask an admin to link an existing ${isVendor?'stall':'rider'} to ${s.user.email||'this account'}.`);const b=document.getElementById('ptaSignIn');if(b){b.disabled=false;b.textContent='Sign in'}return}
    if(row.approval_status&&row.approval_status!=='approved'){say(`Your ${isVendor?'stall':'rider'} profile is ${row.approval_status}. You will be able to sign in once an admin approves it.`);const b=document.getElementById('ptaSignIn');if(b){b.disabled=false;b.textContent='Sign in'}return}
    const legacy=isVendor?{tonninyira_id:row.tonninyira_id,business_name:row.business_name}:{tonninyira_id:row.tonninyira_id,full_name:row.full_name};
    localStorage.setItem(isVendor?'tonninyira_vendor_session':'tonninyira_rider_session',JSON.stringify(legacy));
    location.reload();
  }
  const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  function row(label,value){return `<div style="display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)"><span class="helper" style="margin:0">${esc(label)}</span><span style="font-weight:800;text-align:right;word-break:break-word">${esc(value)}</span></div>`}
  async function account(){
    const s=await session();if(!s)return;
    const dash=document.getElementById('dashView');
    if(!dash||document.getElementById('ptaAccount'))return;
    const r=await partnerRow(s.user.id);
    const box=document.createElement('section');box.id='ptaAccount';box.className='card';
    const phone=r?.phone||'';
    const phoneLine=phone?row('Phone',phone)
      :`<div style="padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)"><span class="helper" style="margin:0">Phone</span><div style="color:#ffb0b0;font-weight:800;margin-top:3px">Not on file</div><p class="helper" style="margin:4px 0 0">${isVendor?'Customers cannot reach you about an order without it.':'Dispatch cannot assign you a delivery without it.'} Ask an admin to add it.</p></div>`;
    box.innerHTML=`<h3 style="margin-top:0">${isVendor?'YOUR STALL':'YOUR RIDER ACCOUNT'}</h3>
      <p class="helper" style="margin-top:0">${isVendor
        ? 'Your orders, your earnings, and what customers see when they find your stall.'
        : 'Your deliveries, your earnings, and how dispatch reaches you.'}</p>
      <div style="margin-top:8px">
        ${row(isVendor?'Business name':'Name', (isVendor?r?.business_name:r?.full_name)||'Not set')}
        ${row('Tonninyira ID', r?.tonninyira_id||'Not issued')}
        ${row('Email', s.user.email||'Not set')}
        ${phoneLine}
        ${row('Status', r?.approval_status||'unknown')}
      </div>`;
    dash.insertBefore(box, dash.firstChild);
  }
  async function earnings(){const s=await session();if(!s||(!isVendor&&!isRider))return;const {data,error}=await c().from('my_settlement_summary').select('*').order('created_at',{ascending:false}).limit(100);if(error)return;let gross=0,fee=0,net=0;for(const r of(data||[])){if(isVendor){gross+=Number(r.gross_amount||0);fee+=Number(r.platform_fee||0);net+=Number(r.vendor_amount||0)}else{gross+=Number(r.rider_gross||0);fee+=Number(r.rider_platform_fee||0);net+=Number(r.rider_amount||0)}}const dash=document.getElementById('dashView');if(!dash||document.getElementById('ptaEarnings'))return;const box=document.createElement('section');box.id='ptaEarnings';box.className='card';box.innerHTML=`<h3 style="margin-top:0">YOUR EARNINGS</h3><p class="helper">Tonninyira keeps a 5% service cut. Your net amount is shown separately from the gross amount.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><div style="background:var(--card);padding:10px;border-radius:10px"><div class="helper">Gross</div><strong>UGX ${Math.round(gross).toLocaleString()}</strong></div><div style="background:var(--card);padding:10px;border-radius:10px"><div class="helper">Tonninyira 5%</div><strong>UGX ${Math.round(fee).toLocaleString()}</strong></div><div style="background:var(--card);padding:10px;border-radius:10px"><div class="helper">Your net</div><strong>UGX ${Math.round(net).toLocaleString()}</strong></div><div style="background:var(--card);padding:10px;border-radius:10px"><div class="helper">Settlements</div><strong>${(data||[]).length}</strong></div></div>`;dash.insertBefore(box,dash.querySelector('#ordersList'));}
  async function patch(){const s=await session();if(s){if(document.getElementById('loginView')){document.getElementById('loginView').style.display='none';document.getElementById('dashView')?.classList.remove('hidden')}setTimeout(account,250);setTimeout(earnings,300);return}ui()}
  document.addEventListener('DOMContentLoaded',patch); setTimeout(patch,250);
})();