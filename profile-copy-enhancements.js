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
      .tn-support-modal{position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.72);display:grid;place-items:end center;padding:0}
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
    const search = document.getElementById('searchInput');
    if(search){
      search.placeholder = 'Find food, groceries, clothes or a stall';
      search.setAttribute('aria-label','Find food, groceries, clothes or a stall');
    }
    const area = document.getElementById('areaSelect');
    if(area){
      area.placeholder = 'Enter your area';
      area.setAttribute('aria-label','Enter your delivery area');
    }
    const gps = document.getElementById('gpsBtn');
    if(gps) gps.textContent = '📍 Use my location';

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

  function decorateExistingRewards(main){
    const reward=main.querySelector('[data-tn-enhancements]');
    if(!reward) return;
    const cards=[...reward.children];
    const first=cards[0];
    if(first){
      const title=first.querySelector('div');
      if(title) title.textContent='MY REWARDS';
      const sub=first.querySelector('div[style*="muted"]');
      if(sub) sub.textContent='Earn points from completed orders. Your rewards grow as you keep shopping.';
    }
    const second=cards[1];
    if(second){
      const title=second.querySelector('div');
      if(title) title.textContent='NEED HELP?';
      const status=second.querySelector('#tnSupportStatus');
      if(status) status.textContent='Talk privately to Tonninyira Support about an order, delivery or account problem.';
      const button=second.querySelector('#tnSupportBtn');
      if(button) button.textContent='Chat with Support';
    }
  }

  async function loadSupportMessages(conversationId, session, container){
    const client = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;
    if(!client || !conversationId || !container) return;
    const {data,error}=await client.from('support_messages').select('body,created_at,sender_user_id').eq('conversation_id',conversationId).order('created_at');
    if(error) return;
    container.innerHTML = (data||[]).map(m=>`<div class="tn-msg ${m.sender_user_id===session.user.id?'me':''}"><div class="tn-msg-bubble">${esc(m.body)}</div></div>`).join('') || '<div style="color:var(--muted);font-size:.8rem;padding:16px 0;text-align:center;">No messages yet. Tell us what you need help with.</div>';
    container.scrollTop=container.scrollHeight;
  }

  async function openSupportChat(){
    const client = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;
    if(!client?.auth?.getSession){ alert('Support is not available right now.'); return; }
    const {data}=await client.auth.getSession();
    const session=data?.session;
    if(!session){
      const authButton=document.querySelector('[onclick*="Sign In"]');
      if(authButton) authButton.click();
      else alert('Please sign in first.');
      return;
    }

    const found=await client.from('support_conversations').select('id,status').eq('customer_id',session.user.id).eq('status','open').order('updated_at',{ascending:false}).limit(1).maybeSingle();
    let convo=found.data;
    if(!convo){
      const created=await client.from('support_conversations').insert({customer_id:session.user.id,status:'open'}).select('id,status').single();
      convo=created.data;
    }
    if(!convo){ alert('Could not open support right now.'); return; }

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
      if(result.error){ alert('Could not send your message. Please try again.'); return; }
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

  function upgradeSupportButton(main){
    const old=main.querySelector('#tnSupportBtn');
    if(!old || old.dataset.tnSupportUpgrade) return;
    old.dataset.tnSupportUpgrade='1';
    const fresh=old.cloneNode(true);
    old.replaceWith(fresh);
    fresh.addEventListener('click',openSupportChat);
  }

  function enhanceProfile(){
    const main=findProfileContainer();
    if(!main) return;
    injectStyles();
    addIntro(main);
    labelCustomerActions(main);
    decorateExistingRewards(main);
    upgradeSupportButton(main);
    labelPartnerActions(main);
    addSectionLabels(main);
  }

  function observe(){
    const main=document.getElementById('mainArea');
    if(!main) return;
    const observer=new MutationObserver(()=>setTimeout(enhanceProfile,0));
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
