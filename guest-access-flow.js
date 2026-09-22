/* Tonninyira public browsing + account-gated transactions.
 * Guests can browse the whole marketplace.
 * Transaction = authenticated account first, then role choice if needed.
 * The shared Account button is owned by account-session-ui.js; this file must not create another one.
 *
 * Authentication is password-based, not SMS. A one-time code on every login
 * was a cost on every session and the slowest part of getting in; none of
 * Glovo, Jumia, Jiji or Amazon asks for one. Email is required so a
 * forgotten password always has a way home, and sign-in accepts the email
 * OR the phone number, whichever the person remembers.
 */
(function(){
  'use strict';
  const client=()=>typeof supabaseClient!=='undefined'?supabaseClient:null;
  const session=async()=>{try{return (await client()?.auth?.getSession())?.data?.session||null}catch(_){return null}};
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const phoneUg=raw=>{const s=String(raw||'').replace(/[\s()-]/g,'');if(/^0\d{9}$/.test(s))return '+256'+s.slice(1);if(/^256\d{9}$/.test(s))return '+'+s;if(/^\+256\d{9}$/.test(s))return s;return null};
  /* Derived from wherever the app is actually served rather than pinned to
     one host. This was hardcoded to the GitHub Pages URL; with the app
     moving to Cloudflare Pages a pinned origin sends the email sign-in link
     to the wrong site, which surfaces much later as "email sign-in is
     broken" with no obvious cause. Phone OTP never touched this path.
     NOTE: whichever domain serves the app must also be added to the
     Supabase Auth redirect allowlist, or the link is rejected on arrival. */
  const APP_URL=location.origin+location.pathname.replace(/[^/]*$/,'');
  const AUTH_CALLBACK=APP_URL+'auth-callback.html';
  let pendingTransaction=null;
  /* Held so the profile row still records the number even when attaching it
     to the auth user fails -- see attachPhone(). */
  let pendingPhone=null;
  function styles(){if(document.getElementById('tn-guest-flow-styles'))return;const s=document.createElement('style');s.id='tn-guest-flow-styles';s.textContent=`
    .tn-flow{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.76);display:grid;place-items:end center;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
    .tn-flow-sheet{width:min(520px,100%);background:var(--ink);border-radius:22px 22px 0 0;padding:18px 16px 24px;max-height:92vh;overflow:auto}
    .tn-flow-sheet h2{font-family:'Work Sans',sans-serif!important;font-weight:800;letter-spacing:-.01em;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
    .tn-flow-grid{display:grid;gap:9px;margin-top:12px}.tn-flow-role{border:1px solid rgba(243,232,216,.16);background:var(--card2);color:var(--sand);border-radius:14px;padding:14px;text-align:left;cursor:pointer;-webkit-font-smoothing:antialiased}.tn-flow-role strong{display:block;font-size:.9rem;font-weight:800}.tn-flow-role span{display:block;font-size:.73rem;color:var(--muted);line-height:1.4;margin-top:3px}
    .tn-flow-tabs{display:flex;gap:8px;margin:12px 0}.tn-flow-tab{flex:1;padding:10px;border-radius:10px;border:1px solid rgba(243,232,216,.16);background:var(--card2);color:var(--muted);font-weight:800;cursor:pointer;-webkit-font-smoothing:antialiased}.tn-flow-tab.active{background:var(--gold);color:var(--ink);border-color:var(--gold)}
    .tn-flow-input{width:100%;padding:13px;border-radius:11px;border:1px solid rgba(243,232,216,.16);background:var(--card);color:var(--sand);font:inherit;-webkit-font-smoothing:antialiased}.tn-flow-status{font-size:.76rem;line-height:1.45;color:var(--muted);min-height:20px;margin-top:8px}
    .tn-flow-label{display:block;font-size:.72rem;font-weight:800;margin:11px 0 5px}.tn-flow-label span{font-weight:500;color:var(--muted)}
    .tn-flow-google{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;color:#1f1f1f;border:0;border-radius:11px;padding:12px;font:inherit;font-weight:700;cursor:pointer}.tn-flow-oauth{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:8px}.tn-flow-oauth button{display:flex;align-items:center;justify-content:center;gap:7px;background:rgba(255,255,255,.06);color:var(--sand);border:1px solid rgba(255,255,255,.16);border-radius:11px;padding:10px;font:inherit;font-size:.82rem;font-weight:700;cursor:pointer}.tn-flow-oauth button:hover{background:rgba(255,255,255,.11)}.tn-flow-oauth button:disabled{opacity:.55;cursor:default}
    .tn-flow-or{display:flex;align-items:center;gap:10px;margin:14px 0 2px;color:var(--muted);font-size:.66rem;font-weight:700}
    .tn-flow-or::before,.tn-flow-or::after{content:"";height:1px;background:rgba(243,232,216,.14);flex:1}
    .tn-flow-alt{text-align:center;font-size:.74rem;color:var(--muted);margin-top:13px;line-height:1.6}
    .tn-flow-alt button{border:0;background:none;font:inherit;font-weight:800;color:var(--gold);cursor:pointer;padding:0;text-decoration:underline}
    .tn-flow-err{color:#ffb0a5}
  `;document.head.appendChild(s)}
  function modal(){styles();let m=document.getElementById('tn-public-flow');if(!m){m=document.createElement('div');m.id='tn-public-flow';m.className='tn-flow';document.body.appendChild(m)}return m}
  function close(){document.getElementById('tn-public-flow')?.remove()}
  function say(msg,bad){const s=document.getElementById('tnFlowStatus');if(!s)return;s.className='tn-flow-status'+(bad?' tn-flow-err':'');s.textContent=msg}

  /* Supabase retired the `linkedin` provider in favour of `linkedin_oidc`, and
     projects carry one or the other depending on when they were set up. The
     handler tries the modern id and falls back once, so neither has to be
     guessed here. */
  const MARK={
    linkedin_oidc:'<svg width="16" height="16" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/></svg>',
    github:'<svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true"><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z"/></svg>',
    facebook:'<svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.12 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z"/></svg>',
    twitter:'<svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true"><path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41z"/></svg>'
  };
  const PROVIDERS=[
    {id:'linkedin_oidc', label:'LinkedIn', alt:'linkedin'},
    {id:'github',        label:'GitHub'},
    {id:'facebook',      label:'Facebook'},
    {id:'twitter',       label:'X'}
  ];
  const GOOGLE_SVG='<svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">'+
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>'+
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>'+
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>'+
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  /* mode: 'signin' (default) or 'signup'. account-session-ui.js calls this
     with no argument when a signed-out person taps Account. */
  function authStart(mode){
    const m=modal(); const signup=mode==='signup';
    m.innerHTML=`<div class="tn-flow-sheet">
      <div style="display:flex;justify-content:space-between"><div>
        <div style="font-size:.66rem;font-weight:800;letter-spacing:1.4px;color:var(--gold)">TONNINYIRA ACCOUNT</div>
        <h2 style="font-size:1.25rem;margin:5px 0">${signup?'Create your account':'Welcome back'}</h2>
      </div><button class="close-x" id="tnFlowClose">×</button></div>
      <p style="font-size:.8rem;color:var(--muted);line-height:1.5">Browse freely. An account is only needed to buy, sell, deliver or save a wishlist.</p>
      <div class="tn-flow-tabs">
        <button class="tn-flow-tab${signup?'':' active'}" data-mode="signin">Sign in</button>
        <button class="tn-flow-tab${signup?' active':''}" data-mode="signup">Create account</button>
      </div>
      <button class="tn-flow-google" id="tnFlowGoogle">${GOOGLE_SVG}<span>Continue with Google</span></button>
      <div class="tn-flow-oauth">${PROVIDERS.map(p=>`<button type="button" data-provider="${p.id}">${MARK[p.id]}<span>${p.label}</span></button>`).join('')}</div>
      <div class="tn-flow-or">OR</div>
      <div id="tnFlowFields"></div>
      <div id="tnFlowStatus" class="tn-flow-status"></div>
    </div>`;
    m.querySelector('#tnFlowClose').onclick=close;
    m.querySelector('#tnFlowGoogle').onclick=()=>withProvider('google','Google');
    m.querySelectorAll('.tn-flow-oauth button').forEach(b=>{
      const p=PROVIDERS.find(x=>x.id===b.dataset.provider);
      b.onclick=()=>withProvider(p.id,p.label,p.alt);
    });
    m.querySelectorAll('.tn-flow-tab').forEach(t=>t.onclick=()=>authStart(t.dataset.mode));
    fields(signup?'signup':'signin');
  }

  function fields(mode){
    const f=document.getElementById('tnFlowFields');
    if(mode==='signup'){
      f.innerHTML=`<label class="tn-flow-label" for="tnName">Your name</label>
        <input class="tn-flow-input" id="tnName" autocomplete="name" placeholder="Nakato Grace">
        <label class="tn-flow-label" for="tnEmail">Email <span>— so you can reset your password</span></label>
        <input class="tn-flow-input" id="tnEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com">
        <label class="tn-flow-label" for="tnPhone">Phone <span>— for delivery, and to sign in</span></label>
        <input class="tn-flow-input" id="tnPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0772 123 456">
        <label class="tn-flow-label" for="tnPass">Password <span>— at least 8 characters</span></label>
        <input class="tn-flow-input" id="tnPass" type="password" autocomplete="new-password">
        <label class="tn-flow-label" for="tnPass2">Confirm password <span>— type it again</span></label>
        <input class="tn-flow-input" id="tnPass2" type="password" autocomplete="new-password">
        <label style="display:flex;align-items:center;gap:7px;margin-top:9px;font-size:.76rem;cursor:pointer">
          <input type="checkbox" id="tnShowPass" style="width:auto;margin:0"> Show password</label>
        <p class="tn-flow-legal" style="font-size:.72rem;color:var(--muted);margin:10px 0 0;line-height:1.4">
          By continuing you agree to our <a href="terms.html" target="_blank" rel="noopener" style="color:var(--gold)">Terms &amp; Conditions</a>.
        </p>
        <button class="btn-primary" id="tnFlowGo" style="width:100%;margin-top:14px">Create account</button>`;
      f.querySelector('#tnFlowGo').onclick=doSignUp;
      /* A confirm field without this makes phone typing worse, not better:
         two masked fields double the chance of a typo you cannot see. */
      f.querySelector('#tnShowPass').onchange=e=>{
        const t=e.target.checked?'text':'password';
        f.querySelector('#tnPass').type=t;f.querySelector('#tnPass2').type=t;
      };
    }else{
      f.innerHTML=`<label class="tn-flow-label" for="tnId">Email or phone number</label>
        <input class="tn-flow-input" id="tnId" autocomplete="username" placeholder="you@example.com  or  0772 123 456">
        <label class="tn-flow-label" for="tnPass">Password</label>
        <input class="tn-flow-input" id="tnPass" type="password" autocomplete="current-password">
        <button class="btn-primary" id="tnFlowGo" style="width:100%;margin-top:14px">Sign in</button>
        <div class="tn-flow-alt"><button id="tnFlowForgot">Forgot password?</button></div>`;
      f.querySelector('#tnFlowGo').onclick=doSignIn;
      f.querySelector('#tnFlowForgot').onclick=doReset;
    }
  }

  const notEnabled=e=>/not enabled|unsupported provider|provider is not/i.test(String(e?.message||''));

  async function withProvider(id,label,alt){
    const c=client();
    if(!c?.auth?.signInWithOAuth){say(label+' sign-in is not available right now.',true);return}
    say('Opening '+label+'…');
    let r=await c.auth.signInWithOAuth({provider:id,options:{redirectTo:AUTH_CALLBACK}});
    /* Only the older provider id is configured on this project. */
    if(r.error&&alt&&notEnabled(r.error)) r=await c.auth.signInWithOAuth({provider:alt,options:{redirectTo:AUTH_CALLBACK}});
    if(!r.error)return;
    /* Reached only when the redirect could not start. Naming the provider
       matters: with five of them, Supabase's own wording does not say which
       one is missing its credentials. */
    say(notEnabled(r.error)
      ? label+' sign-in is not switched on for Tonninyira yet. Use your email and password, or another provider.'
      : 'Could not start '+label+' sign-in: '+(r.error.message||'unknown error'), true);
  }

  /* Attaching the phone to the auth user is what makes
     signInWithPassword({phone,password}) possible later. It is deliberately
     best-effort: if the project requires phone confirmation this call fails,
     and failing it must not cost someone their new account. The number is
     stored on the profile either way, so delivery still has it -- only the
     phone-as-login convenience is lost. */
  async function attachPhone(phone){
    if(!phone)return false;
    try{const r=await client().auth.updateUser({phone});return !r.error}catch(_){return false}
  }

  /* The single rule for a password being chosen. auth-callback.html applies
     the same one when a recovery link lands, so sign-up and reset cannot
     drift apart on length or on the wording of the mismatch. */
  function passwordProblem(pass,confirm){
    if(!pass||pass.length<8)return 'Use a password of at least 8 characters.';
    if(pass!==confirm)return 'The two passwords do not match. Check both and try again.';
    return null;
  }
  window.tnPasswordProblem=passwordProblem;

  async function doSignUp(){
    const c=client();if(!c?.auth?.signUp){say('Account creation is not available right now.',true);return}
    const name=document.getElementById('tnName').value.trim();
    const email=document.getElementById('tnEmail').value.trim();
    const phoneRaw=document.getElementById('tnPhone').value.trim();
    const pass=document.getElementById('tnPass').value;
    const pass2=document.getElementById('tnPass2').value;
    if(!name){say('Add your name — vendors and riders see it on your orders.',true);return}
    if(!/^\S+@\S+\.\S+$/.test(email)){say('That email does not look right. It is how you get back in if you forget your password.',true);return}
    const phone=phoneRaw?phoneUg(phoneRaw):null;
    if(phoneRaw&&!phone){say('Use a Uganda number like 0772 123 456.',true);return}
    const bad=passwordProblem(pass,pass2);
    if(bad){say(bad,true);return}

    const btn=document.getElementById('tnFlowGo');btn.disabled=true;btn.textContent='Creating account…';say('');
    const r=await c.auth.signUp({email,password:pass,options:{data:{display_name:name},emailRedirectTo:AUTH_CALLBACK}});
    if(r.error){btn.disabled=false;btn.textContent='Create account';say(r.error.message,true);return}
    pendingPhone=phone;
    /* No session means the project requires email confirmation first. */
    if(!r.data?.session){btn.disabled=false;btn.textContent='Create account';
      say('Account created. Check your email and follow the link to finish, then sign in.');return}
    await attachPhone(phone);
    await afterAuth();
  }

  async function doSignIn(){
    const c=client();if(!c?.auth?.signInWithPassword){say('Sign-in is not available right now.',true);return}
    const id=document.getElementById('tnId').value.trim();
    const pass=document.getElementById('tnPass').value;
    if(!id){say('Enter your email or phone number.',true);return}
    if(!pass){say('Enter your password.',true);return}
    const phone=phoneUg(id);
    const btn=document.getElementById('tnFlowGo');btn.disabled=true;btn.textContent='Signing in…';say('');
    const r=phone?await c.auth.signInWithPassword({phone,password:pass})
                 :await c.auth.signInWithPassword({email:id,password:pass});
    if(r.error){
      btn.disabled=false;btn.textContent='Sign in';
      say(/invalid/i.test(r.error.message||'')
        ? 'That email or phone and password do not match. Try again, or use “Forgot password?”.'
        : r.error.message, true);
      return;
    }
    await afterAuth();
  }

  async function doReset(){
    const c=client();const id=document.getElementById('tnId').value.trim();
    if(!/^\S+@\S+\.\S+$/.test(id)){say('Type your email address above, then tap “Forgot password?” again.',true);return}
    const r=await c.auth.resetPasswordForEmail(id,{redirectTo:AUTH_CALLBACK});
    say(r.error?r.error.message:'Check your email for a link to set a new password.',!!r.error);
  }

  async function afterAuth(){const s=await session();if(!s){authStart();return}const c=client();let p=(await c.from('profiles').select('id,role,display_name,phone').eq('id',s.user.id).maybeSingle()).data;if(!p){const name=s.user.user_metadata?.display_name||s.user.user_metadata?.full_name||s.user.phone||s.user.email||'Tonninyira User';const insert=await c.from('profiles').insert({id:s.user.id,role:'customer',display_name:name,phone:s.user.phone||pendingPhone||null});pendingPhone=null;if(insert.error){const m=document.getElementById('tn-public-flow');if(m)say('Account created, but profile setup failed. Please try again.',true);return}p={role:'customer'}}else if(pendingPhone&&!p.phone){await c.from('profiles').update({phone:pendingPhone}).eq('id',s.user.id);pendingPhone=null}if(p.role==='admin'||p.role==='staff'){pendingTransaction=null;close();location.href='./admin-control-tower.html';return}roleChoice()}
  function roleChoice(){const m=modal();m.innerHTML=`<div class="tn-flow-sheet"><div style="display:flex;justify-content:space-between"><div><div style="font-size:.66rem;font-weight:800;letter-spacing:1.4px;color:var(--gold)">ACCOUNT VERIFIED</div><h2 style="font-size:1.25rem;margin:5px 0">How will you use Tonninyira?</h2></div><button class="close-x" id="tnFlowClose">×</button></div><p style="font-size:.8rem;color:var(--muted);line-height:1.5">Choose your main role. You can request another role later.</p><div class="tn-flow-grid"><button class="tn-flow-role" data-role="customer"><strong>🛍 I’m buying</strong><span>Place orders, save stalls, review orders and track deliveries.</span></button><button class="tn-flow-role" data-role="vendor"><strong>🏪 I’m selling</strong><span>Apply to register a stall, receive orders and track earnings.</span></button><button class="tn-flow-role" data-role="rider"><strong>🏍 I’m delivering</strong><span>Apply as a rider, accept delivery jobs and track earnings.</span></button></div><div id="tnFlowStatus" class="tn-flow-status"></div></div>`;m.querySelector('#tnFlowClose').onclick=close;m.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>chooseRole(b.dataset.role))}
  async function chooseRole(role){const c=client(),s=await session(),status=document.getElementById('tnFlowStatus');if(!c||!s){authStart();return}if(role==='customer'){const r=await c.from('profiles').update({role:'customer'}).eq('id',s.user.id);if(r.error){status.textContent='Could not save your account role.';return}const a=pendingTransaction;pendingTransaction=null;close();if(a)await a();return}const r=await c.from('role_requests').upsert({user_id:s.user.id,requested_role:role,status:'pending'},{onConflict:'user_id,requested_role'});if(r.error&&!/duplicate|unique/i.test(r.error.message||'')){status.textContent='Could not start that application.';return}close();location.href=role==='vendor'?'register.html?as=vendor':'register.html?as=rider'}
  async function requireAuth(action){const s=await session();if(s){pendingTransaction=action;const p=await client().from('profiles').select('role').eq('id',s.user.id).maybeSingle();if(p.data&&(p.data.role==='admin'||p.data.role==='staff')){close();location.href='./admin-control-tower.html';return}if(!p.data||p.data.role==='customer')roleChoice();else action();return}pendingTransaction=action;authStart()}
  function wrapTransactions(){const original=window.completeOrder;if(typeof original==='function'&&!original.__tnPublicWrapped){const w=function(method){requireAuth(()=>original(method))};w.__tnPublicWrapped=true;window.completeOrder=w}}
  function boot(){styles();wrapTransactions()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(boot,500);setTimeout(boot,1500);
  window.authStart=authStart;
  window.tnOpenPublicAccount=authStart;
  window.tnStartSignUp=()=>authStart('signup');
})();
