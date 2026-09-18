(function(){
  'use strict';
  const client = window.supabaseClient;
  if (!client) return;

  const money = n => 'UGX ' + Math.round(Number(n || 0)).toLocaleString();
  const esc = s => String(s == null ? '' : s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));

  async function getPartner(){
    const { data: { user } = {} } = await client.auth.getUser();
    if (!user) return null;
    const { data: profile } = await client.from('profiles').select('role,display_name,phone').eq('id', user.id).maybeSingle();
    const role = profile && (profile.role === 'vendor' || profile.role === 'rider') ? profile.role : null;
    if (!role) return null;
    return { user, profile, role };
  }

  async function getBalance(partner){
    let gross = 0;
    if (partner.role === 'vendor') {
      const { data: vendor } = await client.from('vendors').select('tonninyira_id,business_name,phone,approval_status').eq('auth_user_id', partner.user.id).maybeSingle();
      if (!vendor || vendor.approval_status !== 'approved') return { gross: 0, committed: 0, available: 0, partnerName: vendor?.business_name || partner.profile.display_name || 'Vendor' };
      const { data: settlements } = await client.from('platform_settlements').select('vendor_amount').eq('vendor_id', vendor.tonninyira_id);
      gross = (settlements || []).reduce((s,r)=>s + Number(r.vendor_amount || 0), 0);
      return await withPayouts(gross, vendor.business_name || partner.profile.display_name || 'Vendor', vendor.phone || partner.profile.phone);
    }
    const { data: rider } = await client.from('riders').select('tonninyira_id,full_name,phone,approval_status').eq('auth_user_id', partner.user.id).maybeSingle();
    if (!rider || rider.approval_status !== 'approved') return { gross: 0, committed: 0, available: 0, partnerName: rider?.full_name || partner.profile.display_name || 'Rider' };
    const { data: settlements } = await client.from('platform_settlements').select('rider_amount').eq('rider_tid', rider.tonninyira_id);
    gross = (settlements || []).reduce((s,r)=>s + Number(r.rider_amount || 0), 0);
    return await withPayouts(gross, rider.full_name || partner.profile.display_name || 'Rider', rider.phone || partner.profile.phone);
  }

  async function withPayouts(gross, partnerName, phone){
    const { data: payouts } = await client.from('partner_payouts').select('amount,status,method,requested_at,reference').in('status',['requested','approved','processing','paid']).order('requested_at',{ascending:false});
    const committed = (payouts || []).reduce((s,r)=>s + Number(r.amount || 0), 0);
    return { gross, committed, available: Math.max(gross - committed, 0), partnerName, phone, payouts: payouts || [] };
  }

  function style(){
    if(document.getElementById('tn-wallet-style')) return;
    const st=document.createElement('style'); st.id='tn-wallet-style'; st.textContent=`
      .tn-wallet-card{background:var(--card,#2a1f19);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:18px;margin:18px 0;color:var(--sand,#f3e8d8);box-shadow:0 10px 30px rgba(0,0,0,.12)}
      .tn-wallet-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0}.tn-wallet-metric{background:rgba(255,255,255,.05);padding:12px;border-radius:12px}.tn-wallet-metric small{display:block;opacity:.7;margin-bottom:4px}.tn-wallet-metric strong{font-size:1.08rem}
      .tn-wallet-actions{display:flex;gap:10px;flex-wrap:wrap}.tn-wallet-btn{border:0;border-radius:12px;padding:11px 14px;font-weight:800;cursor:pointer;background:var(--gold,#f5b400);color:#1c1410}.tn-wallet-btn.secondary{background:transparent;color:inherit;border:1px solid currentColor}
      .tn-wallet-form{display:grid;gap:10px;margin-top:12px}.tn-wallet-form input,.tn-wallet-form select{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.12);color:inherit}.tn-wallet-note{font-size:.84rem;opacity:.72;line-height:1.45}.tn-wallet-history{margin-top:14px}.tn-wallet-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08);font-size:.9rem}
      .tn-signout{display:block;width:100%;margin-top:12px;border:1px solid rgba(255,255,255,.16);background:transparent;color:inherit;border-radius:12px;padding:12px;font-weight:800;cursor:pointer}
    `; document.head.appendChild(st);
  }

  function mountSignOut(){
    style();
    const host = document.querySelector('#profileView') || document.querySelector('[data-view="profile"]') || document.body;
    if(document.getElementById('tn-signout-btn')) return;
    const b=document.createElement('button'); b.id='tn-signout-btn'; b.className='tn-signout'; b.textContent='Sign out';
    b.onclick=async()=>{ b.disabled=true; b.textContent='Signing out…'; const {error}=await client.auth.signOut({scope:'local'}); if(error){b.disabled=false;b.textContent='Sign out';alert(error.message);return;} window.location.href='index.html'; };
    host.appendChild(b);
  }

  async function mountWallet(){
    const partner=await getPartner();
    if(!partner) { mountSignOut(); return; }
    style();
    const data=await getBalance(partner);
    let box=document.getElementById('tn-wallet-card');
    if(!box){ box=document.createElement('section'); box.id='tn-wallet-card'; box.className='tn-wallet-card'; const main=document.querySelector('main')||document.body; main.prepend(box); }
    const history=(data.payouts||[]).slice(0,5).map(p=>`<div class="tn-wallet-row"><span>${esc(p.method==='mobile_money'?'Mobile Money':'Bank')} · ${esc(p.status)}</span><strong>${money(p.amount)}</strong></div>`).join('') || '<div class="tn-wallet-note">No payout requests yet.</div>';
    box.innerHTML=`<h2 style="margin:0 0 6px">Wallet & payouts</h2><div class="tn-wallet-note">${esc(data.partnerName)} · Available money can be requested to Mobile Money or a bank account.</div><div class="tn-wallet-grid"><div class="tn-wallet-metric"><small>Total earned</small><strong>${money(data.gross)}</strong></div><div class="tn-wallet-metric"><small>Already requested/paid</small><strong>${money(data.committed)}</strong></div><div class="tn-wallet-metric"><small>Available</small><strong>${money(data.available)}</strong></div></div><div class="tn-wallet-actions"><button class="tn-wallet-btn" id="tn-withdraw-open">Withdraw money</button><button class="tn-wallet-btn secondary" id="tn-wallet-refresh">Refresh</button></div><div id="tn-withdraw-panel" hidden><form class="tn-wallet-form" id="tn-withdraw-form"><select id="tn-payout-method"><option value="mobile_money">Mobile Money</option><option value="bank">Bank account</option></select><input id="tn-payout-amount" type="number" min="1000" step="100" max="${Math.floor(data.available)}" placeholder="Amount in UGX" required><input id="tn-payout-provider" placeholder="Provider e.g. MTN / Airtel"><input id="tn-payout-name" placeholder="Account name" value="${esc(data.partnerName)}" required><input id="tn-payout-number" placeholder="Mobile Money number or bank account number" value="${esc(data.phone||'')}" required><input id="tn-bank-name" placeholder="Bank name (for bank payouts)" hidden><button class="tn-wallet-btn" type="submit">Request payout</button><div class="tn-wallet-note">Payout requests are recorded securely. Actual money transfer requires Tonninyira's connected payment/banking provider and approval process.</div></form></div><div class="tn-wallet-history"><strong>Recent payouts</strong>${history}</div>`;
    const panel=box.querySelector('#tn-withdraw-panel');
    box.querySelector('#tn-withdraw-open').onclick=()=>panel.hidden=!panel.hidden;
    box.querySelector('#tn-wallet-refresh').onclick=()=>mountWallet();
    const method=box.querySelector('#tn-payout-method');
    const bank=box.querySelector('#tn-bank-name');
    method.onchange=()=>{bank.hidden=method.value!=='bank';bank.required=method.value==='bank';};
    box.querySelector('#tn-withdraw-form').onsubmit=async(e)=>{
      e.preventDefault();
      const btn=e.currentTarget.querySelector('button[type=submit]'); btn.disabled=true; btn.textContent='Submitting…';
      const {data:result,error}=await client.rpc('request_partner_payout',{p_partner_type:partner.role,p_amount:Number(box.querySelector('#tn-payout-amount').value),p_method:method.value,p_provider:box.querySelector('#tn-payout-provider').value,p_account_name:box.querySelector('#tn-payout-name').value,p_account_number:box.querySelector('#tn-payout-number').value,p_bank_name:box.querySelector('#tn-bank-name').value||null});
      btn.disabled=false;btn.textContent='Request payout';
      if(error){ alert(error.message); return; }
      alert('Payout request submitted. Reference: ' + (result?.reference || 'pending'));
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
