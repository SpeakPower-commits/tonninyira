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
    .tn-flow-google{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;color:#1f1f1f;border:0;border-radius:11px;padding:12px;font:inherit;font-weight:700;cursor:pointer}
    .tn-flow-or{display:flex;align-items:center;gap:10px;margin:14px 0 2px;color:var(--muted);font-size:.66rem;font-weight:700}
    .tn-flow-or::before,.tn-flow-or::after{content:"";height:1px;background:rgba(243,232,216,.14);flex:1}
    .tn-flow-alt{text-align:center;font-size:.74rem;color:var(--muted);margin-top:13px;line-height:1.6}
    .tn-flow-alt button{border:0;background:none;font:inherit;font-weight:800;color:var(--gold);cursor:pointer;padding:0;text-decoration:underline}
    .tn-flow-err{color:#ffb0a5}
  `;document.head.appendChild(s)}
  function modal(){styles();let m=document.getElementById('tn-public-flow');if(!m){m=document.createElement('div');m.id='tn-public-flow';m.className='tn-flow';document.body.appendChild(m)}return m}
  function close(){document.getElementById('tn-public-flow')?.remove()}
  function say(msg,bad){const s=document.getElementById('tnFlowStatus');if(!s)return;s.className='tn-flow-status'+(bad?' tn-flow-err':'');s.textContent=msg}

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
      <div class="tn-flow-or">OR</div>
      <div id="tnFlowFields"></div>
      <div id="tnFlowStatus" class="tn-flow-status"></div>
    </div>`;
    m.querySelector('#tnFlowClose').onclick=close;
    m.querySelector('#tnFlowGoogle').onclick=withGoogle;
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

  async function withGoogle(){
    const c=client();
    if(!c?.auth?.signInWithOAuth){say('Google sign-in is not available right now.',true);return}
    say('Opening Google…');
    const r=await c.auth.signInWithOAuth({provider:'google',options:{redirectTo:AUTH_CALLBACK}});
    /* Only reached when the redirect could not start -- most often because
       the Google provider has not been enabled on the Supabase project. */
    if(r.error)say(r.error.message||'Could not start Google sign-in.',true);
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
