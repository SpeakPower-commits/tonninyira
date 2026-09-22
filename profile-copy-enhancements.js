/*
 * Tonninyira: copy + profile coherence enhancement layer.
 *
 * This deliberately decorates the original UI. It does not replace the
 * existing Eats / Shop, cart, orders, profile, vendor or rider structure.
 */
(function(){
  'use strict';

  const STYLE_ID = 'tn-profile-copy-styles';
  const SUPPORT_ID = 'tn-support-modal';

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function injectStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .tn-copy-note{font-size:.78rem;line-height:1.45;color:var(--muted);margin:3px 0 0}
      .tn-profile-intro{margin:0 16px 12px;background:var(--card);border:1px solid rgba(243,232,216,.08);border-radius:16px;padding:15px}
      .tn-profile-kicker{font-size:.66rem;font-weight:800;letter-spacing:1.4px;color:var(--gold);margin-bottom:5px}
      .tn-profile-title{font-family:'Alfa Slab One',cursive;font-size:1.15rem;color:var(--sand);margin:0}
      .tn-section-label{margin:16px 16px 7px;font-size:.68rem;font-weight:800;letter-spacing:1.4px;color:var(--gold)}
      .tn-action-card{background:var(--card);border:1px solid rgba(243,232,216,.07);border-radius:14px;padding:12px;margin:8px 16px}
      .tn-action-title{font-weight:800;color:var(--sand);font-size:.9rem}
      .tn-action-sub{font-size:.76rem;color:var(--muted);line-height:1.4;margin-top:3px}
      .tn-profile-list{margin-top:4px}
      .tn-support-modal{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.72);display:grid;place-items:end center;padding:0}
      .tn-support-sheet{width:min(520px,100%);max-height:82vh;background:var(--card);border-radius:20px 20px 0 0;border:1px solid rgba(243,232,216,.1);overflow:hidden;display:flex;flex-direction:column}
      .tn-support-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(243,232,216,.08)}
      .tn-support-messages{padding:14px 16px;overflow:auto;min-height:140px;max-height:48vh}
      .tn-msg{margin-bottom:9px;display:flex}
      .tn-msg.me{justify-content:flex-end}
      .tn-msg-bubble{max-width:82%;padding:9px 11px;border-radius:12px;background:var(--card2);font-size:.8rem;line-height:1.4;color:var(--sand)}
      .tn-msg.me .tn-msg-bubble{background:var(--red)}
      .tn-support-compose{display:flex;gap:8px;padding:12px 16px;border-top:1px solid rgba(243,232,216,.08)}
      .tn-support-compose input{flex:1;border:1px solid rgba(243,232,216,.12);background:var(--ink);color:var(--sand);border-radius:10px;padding:11px;font:inherit;font-size:.82rem}
      .tn-support-compose button{border:0;border-radius:10px;background:var(--gold);color:var(--ink);font-weight:800;padding:0 14px;cursor:pointer}
      .tn-profile-divider{height:1px;background:rgba(243,232,216,.07);margin:15px 16px}
    `;
    document.head.appendChild(style);
  }

  function currentView(){
    return (typeof AppState !== 'undefined') ? AppState.view : null;
  }

  function findProfileContainer(){
    if(currentView() !== 'profile') return null;
    return document.getElementById('mainArea');
  }

  function setText(selector, text){
    document.querySelectorAll(selector).forEach(el=>{ if(el.textContent.trim()) el.textContent=text; });
  }

  function enhanceGeneralCopy(){
    /* index.html's TN_I18N owns these two fields' copy (chrome.searchPlaceholder,
       chrome.areaPlaceholder/areaAriaLabel) so a language switch sticks -- this
       runs once at boot, before any switch, so it must read through TN_I18N
       rather than hardcode English, or it would silently undo a returning
       visitor's already-persisted language choice on every page load. */
    const I = window.TN_I18N;
    const search = document.getElementById('searchInput');
    if(search){
      const label = I ? I.t('chrome.searchPlaceholder') : 'Find food, groceries, clothes or a stall';
      search.placeholder = label;
      search.setAttribute('aria-label', label);
    }
    const area = document.getElementById('areaSelect');
    if(area){
      area.placeholder = I ? I.t('chrome.areaPlaceholder') : 'Enter your area';
      area.setAttribute('aria-label', I ? I.t('chrome.areaAriaLabel') : 'Enter your delivery area');
    }
    /* Matches the hand-drawn pin SVG index.html now uses for this button
       (TN_PIN in its inline script) -- textContent here would have wiped
       that icon back to the platform's 📍 emoji glyph on every pass. */
    const gps = document.getElementById('gpsBtn');
    if(gps && !gps.querySelector('svg')) gps.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>Use My Location';

    document.querySelectorAll('.cat-tab').forEach(btn=>{
      const value = btn.textContent.trim().toLowerCase();
      if(value.includes('eats')) btn.setAttribute('aria-label','Eats — food and things to eat');
      if(value.includes('shop')) btn.setAttribute('aria-label','Shop — clothes, groceries and useful things');
    });
  }

  function addIntro(main){
    if(main.querySelector('.tn-profile-intro')) return;
    const id = (typeof getCustomerIdentity === 'function') ? getCustomerIdentity() : null;
    const name = id?.name ? ` ${esc(id.name)}` : '';
    const intro = document.createElement('div');
    intro.className='tn-profile-intro';
    intro.innerHTML = `
      <div class="tn-profile-kicker">MY TONNINYIRA</div>
      <p class="tn-profile-title">${name ? 'Hello,'+name : 'Welcome to Tonninyira'}</p>
      <p class="tn-copy-note">Your orders, saved stalls, rewards and help are all here. Use the part that applies to you.</p>
    `;
    main.prepend(intro);
  }

  function labelCustomerActions(main){
    const buttons = [...main.querySelectorAll('button, a')];
    const orders = buttons.find(el=>/View My Orders/i.test(el.textContent));
    if(orders){
      orders.textContent='My Orders';
      orders.setAttribute('aria-label','See my orders and delivery status');
      if(!orders.parentElement.querySelector('.tn-copy-note')){
        const n=document.createElement('div'); n.className='tn-copy-note'; n.textContent='See what you bought, order status and past deliveries.'; orders.insertAdjacentElement('afterend',n);
      }
    }
    const fav = buttons.find(el=>/My Favorite Stalls/i.test(el.textContent));
    if(fav){
      fav.textContent='Saved Stalls';
      fav.setAttribute('aria-label','See stalls I saved');
      if(!fav.parentElement.querySelector('.tn-copy-note')){
        const n=document.createElement('div'); n.className='tn-copy-note'; n.textContent='Keep your favourite mamas, shops and stalls close.'; fav.insertAdjacentElement('afterend',n);
      }
    }
    const switcher = buttons.find(el=>/Switch Account/i.test(el.textContent));
    if(switcher){
      switcher.textContent='Change my details';
      switcher.setAttribute('aria-label','Change my name and phone details');
    }
  }

  function labelPartnerActions(main){
    const links=[...main.querySelectorAll('a')];
    const vendor=links.find(el=>/Manage My Stall/i.test(el.textContent));
    const rider=links.find(el=>/View My Deliveries/i.test(el.textContent));
    const joinVendor=links.find(el=>/Become a Vendor/i.test(el.textContent));
    const joinRider=links.find(el=>/Become a Rider/i.test(el.textContent));

    if(vendor) vendor.textContent='I sell here — Manage my stall';
    if(rider) rider.textContent='I deliver — My deliveries';
    if(joinVendor) joinVendor.textContent='Start selling on Tonninyira';
    if(joinRider) joinRider.textContent='Become a Tonninyira rider';

    const existingPartnerText = main.querySelector('[data-tn-partner-heading]');
    if(!existingPartnerText){
      const anchor = vendor || joinVendor || rider || joinRider;
      if(anchor){
        const heading=document.createElement('div');
        heading.className='tn-section-label';
        heading.dataset.tnPartnerHeading='1';
        heading.textContent='SELL OR DELIVER';
        anchor.closest('div')?.parentElement?.insertBefore(heading, anchor.closest('div').parentElement.firstChild);
      }
    }
  }

  function addSectionLabels(main){
    if(!main.querySelector('[data-tn-customer-heading]')){
      const intro=main.querySelector('.tn-profile-intro');
      const next=buttonsBlockAfterIntro(main);
      if(next){
        const h=document.createElement('div'); h.className='tn-section-label'; h.dataset.tnCustomerHeading='1'; h.textContent='FOR YOU';
        next.parentElement?.insertBefore(h,next);
      }
    }
  }

  function buttonsBlockAfterIntro(main){
    const intro=main.querySelector('.tn-profile-intro');
    if(!intro) return null;
    let node=intro.nextElementSibling;
    while(node && !node.querySelector?.('button,a')) node=node.nextElementSibling;
    return node;
  }

  /* Assigning textContent replaces the text node even when the string is
     identical, and every replacement is a childList record the observer below
     picks up -- which called this function again. Measured on the deployed
     build: 8,400 mutations in three seconds on the profile view, roughly 700
     re-decorations a second. The page was not frozen, but the text node under
     a finger was being swapped between touchstart and touchend, so the browser
     declined to synthesise the click and the card only looked tappable.
     Guarded twice: once per block, and once per string. */
  function setTextOnce(el, next){ if(el && el.textContent !== next) el.textContent = next; }

  function decorateExistingRewards(main){
    const reward=main.querySelector('[data-tn-enhancements]');
    if(!reward || reward.dataset.tnDecorated==='1') return;
    reward.dataset.tnDecorated='1';
    const cards=[...reward.children];
    const first=cards[0];
    if(first){
      const title=first.querySelector('div');
      setTextOnce(title,'MY REWARDS');
      const sub=first.querySelector('div[style*="muted"]');
      setTextOnce(sub,'Earn points from completed orders. Your rewards grow as you keep shopping.');
    }
  }

  async function loadSupportMessages(conversationId, session, container){
    const client = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;
    if(!client || !conversationId || !container) return;
    const {data,error}=await client.from('support_messages').select('body,created_at,sender_user_id').eq('conversation_id',conversationId).order('created_at');
    if(error){
      container.innerHTML=`<div style="color:#ffb0b0;font-size:.78rem;padding:16px 0;text-align:center;line-height:1.5">Could not load your messages.<br>${esc(error.message)}</div>`;
      return;
    }
    container.innerHTML = (data||[]).map(m=>`<div class="tn-msg ${m.sender_user_id===session.user.id?'me':''}"><div class="tn-msg-bubble">${esc(m.body)}</div></div>`).join('') || '<div style="color:var(--muted);font-size:.8rem;padding:16px 0;text-align:center;">No messages yet. Tell us what you need help with.</div>';
    container.scrollTop=container.scrollHeight;
  }

  async function openSupportChat(){
    const client = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;
    if(!client?.auth?.getSession){ alert('Support is not available right now.'); return; }
    const {data}=await client.auth.getSession();
    const session=data?.session;
    if(!session){
      /* This used to hunt for any element with "Sign In" in its onclick and
         click it, which reached the legacy name-and-phone sheet. Go to the
         one funnel instead. */
      if(typeof window.authStart==='function'){ window.authStart(); return; }
      if(typeof window.tnAuthEntry==='function'){ window.tnAuthEntry(); return; }
      alert('Please sign in first.');
      return;
    }

    /* A chat that fails quietly is indistinguishable from a dead button, which
       is what cost a day here. Every failure below names itself. */
    let convo=null, why='';
    try{
      const found=await client.from('support_conversations').select('id,status').eq('customer_id',session.user.id).eq('status','open').order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if(found.error) why=found.error.message;
      convo=found.data;
      if(!convo){
        const created=await client.from('support_conversations').insert({customer_id:session.user.id,status:'open'}).select('id,status').single();
        if(created.error) why=created.error.message;
        convo=created.data;
      }
    }catch(e){ why=e?.message||'Could not reach Tonninyira.'; }
    if(!convo){
      alert('Could not open support right now.'+(why?'\n\n'+why:'\n\nPlease check your connection and try again.'));
      return;
    }

    /* enhanceProfile() injects these, but it returns early when it cannot find
       the old profile container -- which is now always, since the account page
       was rebuilt. Without this the sheet opened as unstyled markup. */
    injectStyles();
    document.getElementById(SUPPORT_ID)?.remove();
    const modal=document.createElement('div'); modal.id=SUPPORT_ID; modal.className='tn-support-modal';
    modal.innerHTML=`<div class="tn-support-sheet" role="dialog" aria-label="Tonninyira Support">
      <div class="tn-support-head"><div><div style="font-weight:800;color:var(--sand);">Tonninyira Support</div><div style="font-size:.7rem;color:var(--green);font-weight:700;margin-top:2px;">Private chat</div></div><button id="tnSupportClose" aria-label="Close support" style="border:0;background:none;color:var(--muted);font-size:24px;cursor:pointer;">×</button></div>
      <div id="tnSupportMessages" class="tn-support-messages"></div>
      <div class="tn-support-compose"><input id="tnSupportInput" placeholder="Type your message…" maxlength="1000"><button id="tnSupportSend">Send</button></div>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#tnSupportClose').onclick=()=>modal.remove();
    modal.addEventListener('click',e=>{ if(e.target===modal) modal.remove(); });
    const messages=modal.querySelector('#tnSupportMessages');
    await loadSupportMessages(convo.id,session,messages);

    const send=async()=>{
      const input=modal.querySelector('#tnSupportInput'); const body=input.value.trim();
      if(!body) return;
      const button=modal.querySelector('#tnSupportSend'); button.disabled=true;
      const result=await client.from('support_messages').insert({conversation_id:convo.id,sender_user_id:session.user.id,body});
      button.disabled=false;
      if(result.error){ alert('Could not send your message.\n\n'+result.error.message); return; }
      input.value=''; await loadSupportMessages(convo.id,session,messages);
    };
    modal.querySelector('#tnSupportSend').onclick=send;
    modal.querySelector('#tnSupportInput').addEventListener('keydown',e=>{if(e.key==='Enter') send();});

    if(client.channel){
      const channel=client.channel(`support:${convo.id}`);
      channel.on('postgres_changes',{event:'INSERT',schema:'public',table:'support_messages',filter:`conversation_id=eq.${convo.id}`},()=>loadSupportMessages(convo.id,session,messages)).subscribe();
      modal.addEventListener('remove',()=>client.removeChannel(channel),{once:true});
    }
  }

  /* Published unconditionally, at module top level. This once sat inside a
     function that returned early when the old #tnSupportBtn was absent, so
     after the account page was rebuilt the global was never assigned and the
     Help card silently did nothing. The chat's entry point must not depend on
     any element the design might remove. */
  window.tnOpenSupport = openSupportChat;

  let enhancing = false;
  function enhanceProfile(){
    /* renderAccountPage() in index.html owns the profile view now. These
       decorators were written for the markup it replaced, and every element
       they inject fires the MutationObserver below, which calls this again --
       a loop that re-renders the view continuously and makes taps miss, because
       the element under the finger is rebuilt between press and release. */
    if(document.getElementById('tnAccountPage')) return;
    if(enhancing) return;
    const main=findProfileContainer();
    if(!main) return;
    enhancing = true;
    try{
    injectStyles();
    addIntro(main);
    labelCustomerActions(main);
    decorateExistingRewards(main);
    labelPartnerActions(main);
    addSectionLabels(main);
    } finally { enhancing = false; }
  }

  function observe(){
    const main=document.getElementById('mainArea');
    if(!main) return;
    const observer=new MutationObserver(()=>{
      if(enhancing) return;                       /* our own edits, not the app's */
      setTimeout(enhanceProfile,0);
    });
    observer.observe(main,{childList:true,subtree:true});
  }

  function boot(){
    injectStyles();
    enhanceGeneralCopy();
    setTimeout(enhanceProfile,200);
    setTimeout(enhanceProfile,900);
    observe();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
