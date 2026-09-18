/* Tonninyira account/session UI: one account button, reliable auth entry and sign-out. */
(function(){
  'use strict';
  const c=()=>{
    try{if(typeof supabaseClient!=='undefined'&&supabaseClient)return supabaseClient}catch(_){}
    return window.supabaseClient||window.tnSessionClient||null;
  };
  const esc=v=>String(v??'').replace(/[&<>\"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[x]));
  function style(){
    if(document.getElementById('tn-account-ui-style'))return;
    const s=document.createElement('style');s.id='tn-account-ui-style';s.textContent=`
      .tn-acct-btn{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(245,180,0,.42);background:rgba(245,180,0,.09);color:var(--gold);border-radius:12px;padding:9px 12px;font-family:'Work Sans',sans-serif;font-size:.76rem;font-weight:800;cursor:pointer;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
      .tn-acct-panel{position:fixed;inset:0;z-index:10020;background:rgba(0,0,0,.72);display:grid;place-items:end center;padding:0;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
      .tn-acct-sheet{width:min(520px,100%);max-height:88vh;overflow:auto;background:var(--ink);color:var(--sand);border-radius:22px 22px 0 0;padding:20px 16px 28px;border:1px solid rgba(255,255,255,.08)}
      .tn-acct-sheet h2{font-family:'Work Sans',sans-serif!important;font-weight:800;letter-spacing:-.01em;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
      .tn-acct-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07)}
      .tn-acct-value{font-weight:800;text-align:right;word-break:break-word}
      .tn-acct-danger{width:100%;padding:13px 14px;border-radius:12px;border:1px solid rgba(255,100,100,.3);background:rgba(255,80,80,.08);color:#ffb0b0;font-weight:800;cursor:pointer;margin-top:16px}
    `;document.head.appendChild(s);
  }
  async function session(){
    const client=c();if(!client?.auth?.getSession)return null;
    try{
      let r=await client.auth.getSession();
      if(r?.data?.session)return r.data.session;
      if(client.auth.refreshSession){r=await client.auth.refreshSession();if(r?.data?.session)return r.data.session;}
      return null;
    }catch(_){return null}
  }
  async function profile(userId){try{return (await c().from('profiles').select('display_name,role,phone').eq('id',userId).maybeSingle()).data||null}catch(_){return null}}
  function close(){document.getElementById('tn-account-panel')?.remove()}
  async function open(){
    style();const s=await session();
    if(!s){if(typeof window.authStart==='function'){window.authStart();return;}location.href='./';return}
    const p=await profile(s.user.id);
    const admin=p?.role==='admin'||p?.role==='staff';
    const el=document.createElement('div');el.id='tn-account-panel';el.className='tn-acct-panel';document.body.appendChild(el);
    const identifier=s.user.phone||s.user.email||'Verified account';
    el.innerHTML=`<div class="tn-acct-sheet"><div style="display:flex;justify-content:space-between"><div><div style="font-size:.66rem;color:var(--gold);font-weight:900;letter-spacing:1.5px">MY TONNINYIRA ACCOUNT</div><h2 style="font-size:1.3rem;margin:5px 0">Account</h2></div><button class="close-x" id="tnAcctClose">×</button></div>
      <div class="tn-acct-line"><span>Signed in as</span><span class="tn-acct-value">${esc(identifier)}</span></div>
      <div class="tn-acct-line"><span>Name</span><span class="tn-acct-value">${esc(p?.display_name||'Not set')}</span></div>
      <div class="tn-acct-line"><span>Phone</span><span class="tn-acct-value">${esc(p?.phone||s.user.phone||'Not set')}</span></div>
      <div class="tn-acct-line"><span>Role</span><span class="tn-acct-value">${esc(p?.role||'customer')}</span></div>
      <div style="display:grid;gap:9px;margin-top:16px"><button class="btn-secondary" id="tnAcctWishlist">My wishlist</button><button class="btn-secondary" id="tnAcctOrders">My orders</button><button class="btn-secondary" id="tnAcctProfile">Open profile</button>${admin?'<button class="btn-secondary" id="tnAcctAdmin">Admin workspace</button>':''}</div>
      <button class="tn-acct-danger" id="tnAcctSignOut">Sign out</button>
      <div id="tnAcctMsg" style="min-height:20px;color:var(--muted);font-size:.76rem;margin-top:8px"></div>
    </div>`;
    el.querySelector('#tnAcctClose').onclick=close;
    el.querySelector('#tnAcctWishlist').onclick=()=>{close();if(typeof window.tnOpenWishlist==='function')window.tnOpenWishlist()};
    el.querySelector('#tnAcctOrders').onclick=()=>{close();if(typeof window.goView==='function')window.goView('orders')};
    el.querySelector('#tnAcctProfile').onclick=()=>{close();if(typeof window.goView==='function')window.goView('profile')};
    el.querySelector('#tnAcctAdmin')?.addEventListener('click',()=>{close();location.href='./admin-control-tower.html'});
    el.querySelector('#tnAcctSignOut').onclick=async()=>{const b=el.querySelector('#tnAcctSignOut');const msg=el.querySelector('#tnAcctMsg');b.disabled=true;b.textContent='Signing out…';const r=await c().auth.signOut({scope:'local'});if(r.error){b.disabled=false;b.textContent='Sign out';msg.textContent=r.error.message;return}try{localStorage.removeItem('tonninyira_customer');sessionStorage.removeItem('tn_pending_payment')}catch(_){}close();location.reload()};
  }
  function boot(){
    style();
    const row=document.querySelector('.brand-row');
    if(!row||document.getElementById('tn-account-session-button'))return;
    const b=document.createElement('button');b.id='tn-account-session-button';b.className='tn-acct-btn';b.textContent='Account';b.onclick=open;
    row.appendChild(b);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(boot,500);setTimeout(boot,1600);
  window.tnOpenAccount=open;
})();
