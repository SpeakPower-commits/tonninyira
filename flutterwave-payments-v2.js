/* Final browser-side payment bridge for Flutterwave sandbox v4. */
(function(){
  'use strict';
  const client=()=>window.supabaseClient;
  const phoneUg=v=>{const s=String(v||'').replace(/[\s()-]/g,'');if(/^0\d{9}$/.test(s))return '+256'+s.slice(1);if(/^256\d{9}$/.test(s))return '+'+s;if(/^\+256\d{9}$/.test(s))return s;return null};
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Number(n||0).toLocaleString('en-UG');
  function popup(){let e=document.getElementById('tn-flw-payment-v2');if(e)return e;e=document.createElement('div');e.id='tn-flw-payment-v2';e.style.cssText='position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.78);display:grid;place-items:center;padding:16px';document.body.appendChild(e);return e}
  function close(){document.getElementById('tn-flw-payment-v2')?.remove()}
  async function pay(network){
    const c=client();
    if(!c?.auth?.getSession){alert('Secure payment service is unavailable.');return}
    const {data:{session}={}}=await c.auth.getSession();
    if(!session){alert('Sign in before paying.');return}
    const s=typeof AppState!=='undefined'?AppState:null;if(!s?.cart?.length)return;
    const phoneSaved=session.user.phone||(()=>{try{return JSON.parse(localStorage.getItem('tonninyira_customer')||'{}').phone||''}catch(_){return ''}})();
    const subtotal=typeof cartSubtotal==='function'?Number(cartSubtotal()):s.cart.reduce((x,i)=>x+Number(i.price||0)*Number(i.qty||0),0);
    const delivery=typeof computeDeliveryFee==='function'?Number(computeDeliveryFee()):0;const total=subtotal+delivery;const area=document.getElementById('areaSelect')?.value||'';
    const e=popup();
    e.innerHTML=`<div style="width:min(470px,100%);background:var(--ink);color:var(--sand);border-radius:20px;padding:20px"><div style="display:flex;justify-content:space-between"><div><div style="font-size:.66rem;font-weight:900;color:var(--gold);letter-spacing:1.5px">PAY WITH ${network}</div><h2 class="display" style="font-size:1.3rem;margin:5px 0">UGX ${fmt(total)}</h2></div><button id="tnfvClose" class="close-x">×</button></div><label style="font-size:.75rem;font-weight:800">Mobile Money number</label><input id="tnfvPhone" class="tn-flow-input" inputmode="tel" value="${esc(phoneSaved)}" placeholder="0772 123 456" style="margin-top:6px"><div id="tnfvMsg" style="min-height:22px;color:#ffb0b0;font-size:.76rem;margin-top:7px"></div><button id="tnfvPay" class="btn-primary" style="width:100%;margin-top:6px">Continue to ${network}</button><button id="tnfvCancel" class="btn-secondary" style="width:100%;margin-top:8px">Cancel</button></div>`;
    e.querySelector('#tnfvClose').onclick=close;e.querySelector('#tnfvCancel').onclick=close;
    e.querySelector('#tnfvPay').onclick=async()=>{
      const msg=e.querySelector('#tnfvMsg'),phone=phoneUg(e.querySelector('#tnfvPhone').value);if(!phone){msg.textContent='Enter a valid Uganda mobile number.';return}
      const b=e.querySelector('#tnfvPay');b.disabled=true;b.textContent='Starting payment…';msg.textContent='';
      try{
        const group='TN-'+Math.random().toString(36).slice(2,9).toUpperCase();const vendors={};
        s.cart.forEach(i=>(vendors[i.vendorId]??={vendorName:i.vendorName,items:[]}).items.push(i));
        const rows=Object.entries(vendors).map(([vendorId,g])=>({
          order_id:group,vendor_id:vendorId,vendor_name:g.vendorName,
          items:g.items.map(i=>({id:i.itemId,name:i.name,price:Number(i.price),qty:Number(i.qty)})),
          item_subtotal:g.items.reduce((x,i)=>x+Number(i.price||0)*Number(i.qty||0),0),
          subtotal:g.items.reduce((x,i)=>x+Number(i.price||0)*Number(i.qty||0),0),
          total:g.items.reduce((x,i)=>x+Number(i.price||0)*Number(i.qty||0),0),
          delivery_fee:delivery,delivery_area:area,customer_area:area,
          payment_method:'Flutterwave Mobile Money',payment_status:'pending',status:'new',
          user_id:session.user.id,user_email:session.user.email||null,
          customer_name:session.user.user_metadata?.name||session.user.user_metadata?.full_name||session.user.phone||'Tonninyira Customer',customer_phone:phone,
          customer_lat:s.customerLocation?.lat||null,customer_lng:s.customerLocation?.lng||null
        }));
        const ins=await c.from('orders').insert(rows);if(ins.error)throw ins.error;
        const r=await c.functions.invoke('create-flutterwave-payment',{body:{order_group_id:group,network,phone_number:phone,email:session.user.email||null,fullname:session.user.user_metadata?.name||session.user.user_metadata?.full_name||'Tonninyira Customer'}});
        if(r.error)throw new Error(r.error.message||'Payment service error');
        if(r.data?.status==='paid'){close();alert('This order is already paid.');return}
        if(!r.data?.tx_ref)throw new Error(r.data?.message||'No Flutterwave transaction reference returned');
        sessionStorage.setItem('tn_pending_payment',JSON.stringify({order_group_id:group,tx_ref:r.data.tx_ref,charge_id:r.data.charge_id||null,total,created_at:Date.now()}));
        if(r.data?.payment_url){location.href=r.data.payment_url;return}
        close();
        const notice=document.createElement('div');notice.id='tn-flw-notice';notice.style.cssText='position:fixed;inset:0;z-index:10060;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:16px';
        notice.innerHTML=`<div style="width:min(460px,100%);background:var(--ink);color:var(--sand);border-radius:20px;padding:22px"><div style="font-size:.66rem;font-weight:900;color:var(--gold);letter-spacing:1.5px">PAYMENT REQUEST SENT</div><h2 class="display" style="font-size:1.25rem;margin:6px 0 10px">Check your phone</h2><p style="color:var(--muted);font-size:.84rem;line-height:1.5">${esc(r.data.payment_instruction||'Approve the mobile-money payment on your phone.')} </p><button id="tnFlwDone" class="btn-primary" style="width:100%">I’ve Approved the Payment</button></div>`;
        document.body.appendChild(notice);notice.querySelector('#tnFlwDone').onclick=()=>location.href=`payment-return-fixed.html?tx_ref=${encodeURIComponent(r.data.tx_ref)}`;
      }catch(err){b.disabled=false;b.textContent=`Try ${network} again`;msg.textContent=String(err?.message||'Could not start payment')}
    };
  }
  function patch(){const old=window.completeOrder;if(typeof old!=='function'||old.__tnFinalPaymentPatch)return;const w=function(method){if(method==='MTN MoMo')return pay('MTN');if(method==='Airtel Money')return pay('AIRTEL');return old.apply(this,arguments)};w.__tnFinalPaymentPatch=true;window.completeOrder=w}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(patch,120));else setTimeout(patch,120);setTimeout(patch,700);setTimeout(patch,1800);
})();