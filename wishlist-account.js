/* Tonninyira customer wishlist.
 * Uses the existing public.wishlists table and its owner-only RLS policies.
 * Guests can browse, but saving/accessing a personal wishlist requires the
 * same Supabase Auth session used by Orders and Support.
 */
(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  function client(){
    try{if(typeof supabaseClient!=='undefined'&&supabaseClient)return supabaseClient}catch(_){}
    return window.supabaseClient||window.tnSessionClient||null;
  }
  async function session(){
    const c=client();
    if(!c?.auth?.getSession)return null;
    try{
      let r=await c.auth.getSession();
      if(r?.data?.session)return r.data.session;
      if(c.auth.refreshSession){r=await c.auth.refreshSession();if(r?.data?.session)return r.data.session;}
    }catch(_){ }
    return null;
  }
  function openAuth(){
    if(typeof window.authStart==='function') return window.authStart();
    if(typeof window.tnOpenAccount==='function') return window.tnOpenAccount();
    document.querySelector('#tnHeaderAccount,#tn-account-session-button')?.click();
  }
  function slug(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'stall';}
  function locateVendorContext(btn){
    const card=btn?.closest?.('.stall-card');
    const candidates=[btn,card,card?.querySelector('[data-vendor-id],[data-vendor]')].filter(Boolean);
    for(const el of candidates){
      const d=el.dataset||{};
      const id=d.vendorId||d.vendor||d.vendor_id||d.stallId||d.stall;
      if(id) return {vendorId:String(id),card};
    }
    const name=card?.querySelector('.stall-name')?.textContent?.trim()||'';
    return {vendorId:slug(name),card};
  }
  function vendorName(card,btn){return card?.querySelector('.stall-name')?.textContent?.trim()||btn?.getAttribute('aria-label')?.replace(/^save\s+/i,'')||'Saved stall'}
  async function saveStall(btn){
    const c=client(),s=await session();
    if(!s){openAuth();return;}
    const {vendorId,card}=locateVendorContext(btn),name=vendorName(card,btn);
    btn.disabled=true;
    try{
      const q=await c.from('wishlists').select('id').eq('user_id',s.user.id).eq('vendor_id',vendorId).eq('item_id','stall').maybeSingle();
      if(q.error) throw q.error;
      if(q.data){
        const d=await c.from('wishlists').delete().eq('id',q.data.id);
        if(d.error) throw d.error;
        btn.classList.remove('active');btn.setAttribute('aria-pressed','false');btn.setAttribute('aria-label','Save '+name);
        btn.title='Save to wishlist';
      }else{
        const ins=await c.from('wishlists').insert({user_id:s.user.id,vendor_id:vendorId,item_id:'stall',item_name:name});
        if(ins.error) throw ins.error;
        btn.classList.add('active');btn.setAttribute('aria-pressed','true');btn.setAttribute('aria-label','Remove '+name+' from wishlist');
        btn.title='Saved to wishlist';
      }
    }catch(err){
      console.error('Tonninyira wishlist error',err);
      alert('We could not update your wishlist. Please try again.');
    }finally{btn.disabled=false;}
  }
  async function hydrateButtons(){
    const c=client(),s=await session();
    if(!c||!s)return;
    const rows=await c.from('wishlists').select('vendor_id,item_id').eq('user_id',s.user.id).eq('item_id','stall');
    if(rows.error)return;
    const ids=new Set((rows.data||[]).map(x=>String(x.vendor_id)));
    document.querySelectorAll('.fav-btn').forEach(btn=>{
      const {vendorId}=locateVendorContext(btn);
      const active=ids.has(vendorId);
      btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',active?'true':'false');
    });
  }
  async function openWishlist(){
    const c=client(),s=await session();
    if(!s){openAuth();return;}
    let modal=document.getElementById('tn-wishlist-panel');
    if(modal)modal.remove();
    modal=document.createElement('div');modal.id='tn-wishlist-panel';modal.style.cssText='position:fixed;inset:0;z-index:10040;background:rgba(0,0,0,.78);display:flex;align-items:flex-end;justify-content:center';
    const sheet=document.createElement('div');sheet.style.cssText='width:min(560px,100%);max-height:88vh;overflow:auto;background:var(--ink);color:var(--sand);border:1px solid rgba(255,255,255,.08);border-radius:22px 22px 0 0;padding:18px 16px 28px';
    sheet.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:.66rem;color:var(--gold);font-weight:900;letter-spacing:1.4px">MY TONNINYIRA</div><h2 class="display" style="font-size:1.25rem;margin:5px 0">My wishlist</h2></div><button class="close-x" id="tnWishlistClose">×</button></div><p style="color:var(--muted);font-size:.8rem;line-height:1.45">Stalls you save here stay with your account, so they are available when you sign in again.</p><div id="tnWishlistBody"></div>';
    modal.appendChild(sheet);document.body.appendChild(modal);sheet.querySelector('#tnWishlistClose').onclick=()=>modal.remove();
    const body=sheet.querySelector('#tnWishlistBody');body.innerHTML='<div style="padding:30px;text-align:center;color:var(--muted)">Loading your saved stalls…</div>';
    const r=await c.from('wishlists').select('id,vendor_id,item_id,item_name,created_at').eq('user_id',s.user.id).eq('item_id','stall').order('created_at',{ascending:false});
    if(r.error){body.innerHTML='<div style="padding:30px;text-align:center;color:var(--red)">Could not load your wishlist.</div>';return;}
    const items=r.data||[];
    if(!items.length){body.innerHTML='<div style="padding:40px 20px;text-align:center;color:var(--muted)"><div style="font-size:2rem">♡</div><p style="font-weight:800;color:var(--sand)">Nothing saved yet</p><p>Tap the heart on a stall to keep it here.</p></div>';return;}
    body.innerHTML=items.map(x=>`<div data-wid="${esc(x.id)}" data-vendor-id="${esc(x.vendor_id)}" style="display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.07)"><div style="width:44px;height:44px;border-radius:12px;background:var(--card2);display:grid;place-items:center;color:var(--gold);font-size:1.3rem">♥</div><div style="flex:1"><div style="font-weight:900">${esc(x.item_name)}</div><div style="font-size:.72rem;color:var(--muted);margin-top:2px">Saved stall</div></div><button class="btn-secondary tnWishlistRemove" style="width:auto;margin:0;padding:8px 11px">Remove</button></div>`).join('');
    body.querySelectorAll('.tnWishlistRemove').forEach(b=>b.onclick=async()=>{
      const row=b.closest('[data-wid]');b.disabled=true;
      const d=await c.from('wishlists').delete().eq('id',row.dataset.wid).eq('user_id',s.user.id);
      if(d.error){b.disabled=false;alert('Could not remove this saved stall.');return;}
      row.remove();
      await hydrateButtons();
      if(!body.children.length)body.innerHTML='<div style="padding:40px 20px;text-align:center;color:var(--muted)"><div style="font-size:2rem">♡</div><p style="font-weight:800;color:var(--sand)">Your wishlist is empty</p></div>';
    });
  }
  function addAccountWishlistButton(){
    const panel=document.getElementById('tn-account-panel');
    if(!panel||panel.querySelector('#tnAcctWishlist'))return false;
    const orders=panel.querySelector('#tnAcctOrders')?.parentElement;
    if(!orders)return false;
    const b=document.createElement('button');b.className='btn-secondary';b.id='tnAcctWishlist';b.textContent='My wishlist';b.onclick=()=>{document.getElementById('tn-account-panel')?.remove();openWishlist()};
    orders.insertBefore(b,orders.firstChild);return true;
  }
  function bind(){
    document.addEventListener('click',ev=>{const btn=ev.target?.closest?.('.fav-btn');if(btn){ev.preventDefault();ev.stopImmediatePropagation();saveStall(btn)}},true);
    const mo=new MutationObserver(()=>{hydrateButtons();addAccountWishlistButton()});
    mo.observe(document.body,{childList:true,subtree:true});
    hydrateButtons();addAccountWishlistButton();setTimeout(addAccountWishlistButton,700);setTimeout(addAccountWishlistButton,1800);
  }
  window.tnOpenWishlist=openWishlist;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
