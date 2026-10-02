(function(){
  'use strict';
  const client = window.supabaseClient;
  if (!client) return;

  const money = n => 'UGX ' + Math.round(Number(n || 0)).toLocaleString();
  const esc = s => String(s == null ? '' : s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));

  async function getPartner(){
    const { data: { user } = {} } = await client.auth.getUser();
    if (!user) return null;
    const { data: profile } = await client.from('profiles').select('role,display_name,phone,phone_verified').eq('id', user.id).maybeSingle();
    const role = profile && (profile.role === 'vendor' || profile.role === 'rider') ? profile.role : null;
    if (!role) return null;
    return { user, profile, role };
  }

  /* Balances come from the database (my_partner_balance), never from adding
     up rows in the browser. Only money that is paid, delivered and released
     counts as available: a stall's share waits 12 hours after delivery (or
     until the customer taps "Got it, all good") and stays frozen while a
     complaint is open; a rider's share is released on delivery. */
  async function getBalance(partner){
    let partnerName = partner.profile.display_name || (partner.role === 'vendor' ? 'Vendor' : 'Rider');
    if (partner.role === 'vendor') {
      const { data: vendor } = await client.from('vendors').select('business_name').eq('auth_user_id', partner.user.id).maybeSingle();
      partnerName = vendor?.business_name || partnerName;
    } else {
      const { data: rider } = await client.from('riders').select('full_name').eq('auth_user_id', partner.user.id).maybeSingle();
      partnerName = rider?.full_name || partnerName;
    }
    const { data: bal, error } = await client.rpc('my_partner_balance', { p_partner_type: partner.role });
    const ok = !error && bal && bal.ok;
    const { data: payouts } = await client.from('partner_payouts').select('amount,status,method,requested_at,reference,failed_reason').order('requested_at',{ascending:false}).limit(5);
    return {
      ok, partnerName,
      available: ok ? Number(bal.available || 0) : 0,
      held: ok ? Number(bal.held || 0) : 0,
      frozen: ok ? Number(bal.frozen || 0) : 0,
      committed: ok ? Number(bal.committed || 0) : 0,
      nextReleaseAt: ok ? bal.next_release_at : null,
      phone: partner.profile.phone, phoneVerified: !!partner.profile.phone_verified,
      payouts: payouts || []
    };
  }

  function style(){
    if(document.getElementById('tn-wallet-style')) return;
    const st=document.createElement('style'); st.id='tn-wallet-style'; st.textContent=`
      .tn-wallet-card{background:var(--card,#2a1f19);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:18px;margin:18px 0;color:var(--sand,#f3e8d8);box-shadow:0 10px 30px rgba(0,0,0,.12)}
      .tn-wallet-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0}.tn-wallet-metric{background:rgba(255,255,255,.05);padding:12px;border-radius:12px}.tn-wallet-metric small{display:block;opacity:.7;margin-bottom:4px}.tn-wallet-metric strong{font-size:1.08rem}.tn-wallet-main{background:rgba(245,180,0,.14);border:1px solid rgba(245,180,0,.4)}.tn-wallet-frozen{background:rgba(226,63,37,.12);border:1px solid rgba(226,63,37,.4)}
      .tn-wallet-actions{display:flex;gap:10px;flex-wrap:wrap}.tn-wallet-btn{border:0;border-radius:12px;padding:11px 14px;font-weight:800;cursor:pointer;background:var(--gold,#f5b400);color:#1c1410}.tn-wallet-btn.secondary{background:transparent;color:inherit;border:1px solid currentColor}
      .tn-wallet-form{display:grid;gap:10px;margin-top:12px}.tn-wallet-form input,.tn-wallet-form select{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.12);color:inherit}.tn-wallet-note{font-size:.84rem;opacity:.72;line-height:1.45}.tn-wallet-history{margin-top:14px}.tn-wallet-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08);font-size:.9rem}
      .tn-signout{display:block;width:100%;margin-top:12px;border:1px solid rgba(255,255,255,.16);background:transparent;color:inherit;border-radius:12px;padding:12px;font-weight:800;cursor:pointer}
    `; document.head.appendChild(st);
  }

  /* This used to run precisely when getPartner() returned null -- which is the
     case for every signed-out visitor -- and then fell back to document.body
     because the storefront has no #profileView, pinning a Sign out button to
     the home page for people who were never signed in. It now requires a live
     session, and a real host: on the storefront account-session-ui.js owns
     sign-out, inside the account panel, which only opens once you are in. */
  async function mountSignOut(){
    const host = document.querySelector('#profileView') || document.querySelector('[data-view="profile"]');
    if(!host) return;
    let signedIn=false;
    try{ signedIn = !!(await client.auth.getSession())?.data?.session; }catch(_){ return }
    if(!signedIn){ document.getElementById('tn-signout-btn')?.remove(); return }
    style();
    if(document.getElementById('tn-signout-btn')) return;
    const b=document.createElement('button'); b.id='tn-signout-btn'; b.className='tn-signout'; b.textContent='Sign out';
    b.onclick=async()=>{ b.disabled=true; b.textContent='Signing out…'; const {error}=await client.auth.signOut({scope:'global'}); if(error){b.disabled=false;b.textContent='Sign out';alert(error.message);return;} window.location.href='index.html'; };
    host.appendChild(b);
  }

  async function functionError(res, fallback){
    if(!res.error) return null;
    try{
      if(res.error.context && typeof res.error.context.json === 'function'){
        const body = await res.error.context.json();
        if(body?.error) return body.error;
      }
    }catch(_){}
    return res.error.message || fallback;
  }

  /* Same OTP round-trip index.html's tnAddPhone() already uses for customers
     -- send-phone-otp/verify-phone-otp write profiles.phone/phone_verified
     via the service-role key regardless of who calls them, so reusing them
     here needs no new backend work, just the same two prompts. */
  async function verifyPhoneFlow(){
    const raw = window.prompt('Your Mobile Money phone number (e.g. 0772 123 456):');
    if(raw === null) return false;
    const t = String(raw).replace(/[\s()-]/g,'');
    const e164 = /^0\d{9}$/.test(t) ? '+256'+t.slice(1)
               : /^256\d{9}$/.test(t) ? '+'+t
               : /^\+256\d{9}$/.test(t) ? t : null;
    if(!e164){ alert('Enter a valid Uganda phone number.'); return false; }
    const sendRes = await client.functions.invoke('send-phone-otp', { body: { phone: e164 } });
    if(sendRes.error){ alert('Could not send the code: ' + (await functionError(sendRes, 'network error'))); return false; }
    const code = window.prompt('Enter the 6-digit code sent to ' + e164 + ':');
    if(code === null) return false;
    const cleanCode = String(code).replace(/\s+/g,'');
    if(!/^\d{6}$/.test(cleanCode)){ alert('Enter the 6-digit code.'); return false; }
    const verifyRes = await client.functions.invoke('verify-phone-otp', { body: { code: cleanCode } });
    if(verifyRes.error){ alert('Could not verify the code: ' + (await functionError(verifyRes, 'network error'))); return false; }
    return true;
  }

  async function mountWallet(){
    const partner=await getPartner();
    if(!partner) { mountSignOut(); return; }
    style();
    const data=await getBalance(partner);
    let box=document.getElementById('tn-wallet-card');
    if(!box){ box=document.createElement('section'); box.id='tn-wallet-card'; box.className='tn-wallet-card'; const main=document.querySelector('main')||document.body; main.prepend(box); }
    const statusLabel=s=>({requested:'Requested',approved:'Approved',processing:'Sending…',paid:'Paid',failed:'Failed',rejected:'Rejected',cancelled:'Cancelled'}[s]||s);
    const history=(data.payouts||[]).slice(0,5).map(p=>`<div class="tn-wallet-row"><span>${esc(p.method==='mobile_money'?'Mobile Money':'Bank')} · ${esc(statusLabel(p.status))}${p.status==='failed'&&p.failed_reason?' — '+esc(p.failed_reason):''}</span><strong>${money(p.amount)}</strong></div>`).join('') || '<div class="tn-wallet-note">No payout requests yet.</div>';
    const phoneRow = data.phoneVerified
      ? `<input id="tn-payout-number" value="${esc(data.phone)}" readonly>`
      : `<div class="tn-wallet-note">Verify your phone number to receive Mobile Money payouts.</div><button type="button" class="tn-wallet-btn secondary" id="tn-verify-phone-btn" style="width:100%">Verify my phone</button>`;
    const when=iso=>{ try{ return new Date(iso).toLocaleString([], {weekday:'short', hour:'numeric', minute:'2-digit'}); }catch(_){ return ''; } };
    const holdNote = partner.role==='vendor'
      ? `Money from an order is held until it is delivered, then released 12 hours later, or straight away when the customer taps <b>Got it, all good</b>.${data.nextReleaseAt?` Next release: <b>${esc(when(data.nextReleaseAt))}</b>.`:''}`
      : 'Delivery money is held until you mark the order delivered, then it is yours to withdraw.';
    box.innerHTML=`<h2 style="margin:0 0 6px">Wallet & payouts</h2><div class="tn-wallet-note">${esc(data.partnerName)} · ${holdNote}</div><div class="tn-wallet-grid"><div class="tn-wallet-metric tn-wallet-main"><small>Available to withdraw</small><strong>${money(data.available)}</strong></div><div class="tn-wallet-metric"><small>On hold</small><strong>${money(data.held)}</strong></div>${data.frozen>0?`<div class="tn-wallet-metric tn-wallet-frozen"><small>Under review (customer complaint)</small><strong>${money(data.frozen)}</strong></div>`:''}<div class="tn-wallet-metric"><small>Already requested / paid</small><strong>${money(data.committed)}</strong></div></div><div class="tn-wallet-actions"><button class="tn-wallet-btn" id="tn-withdraw-open" ${data.available<1000?'disabled style="opacity:.5;cursor:not-allowed" title="Nothing released to withdraw yet"':''}>Withdraw money</button><button class="tn-wallet-btn secondary" id="tn-wallet-refresh">Refresh</button></div><div id="tn-withdraw-panel" hidden><form class="tn-wallet-form" id="tn-withdraw-form"><select id="tn-payout-method"><option value="mobile_money">Mobile Money</option><option value="bank">Bank account (manual)</option></select><input id="tn-payout-amount" type="number" min="1000" step="100" max="${Math.floor(data.available)}" placeholder="Amount in UGX" required><input id="tn-payout-provider" placeholder="Network: MTN or Airtel"><input id="tn-payout-name" placeholder="Account name" value="${esc(data.partnerName)}"><div id="tn-payout-mm-slot">${phoneRow}</div><input id="tn-bank-name" placeholder="Bank name" hidden><input id="tn-payout-bank-number" placeholder="Bank account number" hidden><button class="tn-wallet-btn" type="submit">Request payout</button><div class="tn-wallet-note">Bank payouts are recorded securely and paid out manually.</div></form></div><div class="tn-wallet-history"><strong>Recent payouts</strong>${history}</div>`;
    const panel=box.querySelector('#tn-withdraw-panel');
    box.querySelector('#tn-withdraw-open').onclick=()=>panel.hidden=!panel.hidden;
    box.querySelector('#tn-wallet-refresh').onclick=()=>mountWallet();
    box.querySelector('#tn-verify-phone-btn')?.addEventListener('click', async ()=>{ if(await verifyPhoneFlow()) mountWallet(); });
    const method=box.querySelector('#tn-payout-method');
    const bank=box.querySelector('#tn-bank-name');
    const bankNumber=box.querySelector('#tn-payout-bank-number');
    const nameField=box.querySelector('#tn-payout-name');
    const mmSlot=box.querySelector('#tn-payout-mm-slot');
    const provider=box.querySelector('#tn-payout-provider');
    const syncMethod=()=>{
      const isBank=method.value==='bank';
      bank.hidden=!isBank; bank.required=isBank;
      bankNumber.hidden=!isBank; bankNumber.required=isBank;
      mmSlot.hidden=isBank;
      provider.hidden=isBank;
      nameField.readOnly=!isBank; nameField.required=isBank;
      if(!isBank) nameField.value=data.partnerName;
    };
    method.onchange=syncMethod; syncMethod();
    box.querySelector('#tn-withdraw-form').onsubmit=async(e)=>{
      e.preventDefault();
      if(method.value==='mobile_money' && !data.phoneVerified){ alert('Verify your phone first.'); return; }
      const btn=e.currentTarget.querySelector('button[type=submit]'); btn.disabled=true; btn.textContent='Submitting…';
      const res=await client.functions.invoke('disburse-partner-payout',{body:{
        partner_type:partner.role,
        amount:Number(box.querySelector('#tn-payout-amount').value),
        method:method.value,
        provider:provider.value,
        account_name:nameField.value,
        account_number:method.value==='mobile_money'?data.phone:bankNumber.value,
        bank_name:bank.value||null,
      }});
      btn.disabled=false;btn.textContent='Request payout';
      if(res.error){ alert(await functionError(res, 'Could not submit the request')); return; }
      const result=res.data;
      if(result?.disbursement==='initiated') alert('Sent! It should arrive in your Mobile Money shortly. Reference: '+(result.reference||'pending'));
      else if(result?.disbursement==='failed') alert('The transfer could not be completed: '+(result.failed_reason||'unknown error')+'. Your balance has been released -- you can try again.');
      else alert('Payout request submitted. Reference: ' + (result?.reference || 'pending'));
      mountWallet();
    };
    mountSignOut();
  }

  async function start(){
    try{ await mountWallet(); }catch(e){ console.warn('Tonninyira wallet unavailable',e); mountSignOut(); }
    client.auth.onAuthStateChange((event)=>{ if(event==='SIGNED_IN' || event==='SIGNED_OUT' || event==='USER_UPDATED') setTimeout(()=>mountWallet(),0); });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
