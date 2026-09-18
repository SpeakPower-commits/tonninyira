/* Tonninyira Flutterwave Mobile Money checkout bridge.
 * Browser talks only to Supabase Edge Functions. Flutterwave secret stays server-side.
 */
(function(){
  'use strict';
  const URL = 'https://alxzmjgepftohwpqibmn.supabase.co';
  const client = () => window.supabaseClient;
  const phoneUg = raw => {
    const s = String(raw || '').replace(/[\s()-]/g,'');
    if(/^0\d{9}$/.test(s)) return '+256' + s.slice(1);
    if(/^256\d{9}$/.test(s)) return '+' + s;
    if(/^\+256\d{9}$/.test(s)) return s;
    return null;
  };
  const safe = v => String(v ?? '').replace(/[&<>\"']/g, '');
  const fmt = n => Number(n||0).toLocaleString('en-UG');
  const db = () => client();

  function getCustomerName(session){
    return session?.user?.user_metadata?.display_name || session?.user?.user_metadata?.name || session?.user?.phone || 'Tonninyira Customer';
  }

  function overlay(){
    let el = document.getElementById('tn-flw-payment');
    if(el) return el;
    el = document.createElement('div');
    el.id='tn-flw-payment';
    el.style.cssText='position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.78);display:grid;place-items:center;padding:16px;';
    document.body.appendChild(el);
    return el;
  }
  function close(){ document.getElementById('tn-flw-payment')?.remove(); }

  async function start(method){
    const c=db();
    if(!c?.auth?.getSession){ alert('Secure account service is unavailable.'); return; }
    const {data:{session}={}} = await c.auth.getSession();
    if(!session){
      alert('Please sign in before paying.');
      if(typeof window.authStart==='function') window.authStart();
      return;
    }
    const s = typeof AppState!=='undefined' ? AppState : null;
    if(!s?.cart?.length) return;
    const subtotal = typeof window.cartSubtotal==='function' ? window.cartSubtotal() : s.cart.reduce((x,i)=>x+Number(i.price||0)*Number(i.qty||0),0);
    const delivery = typeof window.computeDeliveryFee==='function' ? Number(window.computeDeliveryFee()||0) : 0;
    const total = subtotal + delivery;
    const area = document.getElementById('areaSelect')?.value || '';
    const saved = (()=>{ try{return JSON.parse(localStorage.getItem('tonninyira_customer')||'null')}catch(_){return null} })();
    const defaultPhone = session.user.phone || saved?.phone || '';
    const network = method==='Airtel Money' ? 'AIRTEL' : 'MTN';

    const el=overlay();
    el.innerHTML=`<div style="width:min(470px,100%);background:var(--ink);color:var(--sand);border-radius:20px;padding:20px;box-shadow:0 20px 70px rgba(0,0,0,.45)">
      <div style="display:flex;justify-content:space-between;gap:12px"><div><div style="font-size:.66rem;font-weight:900;letter-spacing:1.5px;color:var(--gold)">MOBILE MONEY</div><h2 class="display" style="font-size:1.3rem;margin:5px 0">Pay UGX ${fmt(total)}</h2></div><button id="tnFlwClose" class="close-x" aria-label="Close">×</button></div>
      <p style="font-size:.79rem;color:var(--muted);line-height:1.5;margin:7px 0 14px">${network==='MTN'?'MTN':'Airtel'} Mobile Money. Enter the number that will approve this payment.</p>
      <label style="font-size:.75rem;font-weight:800">Mobile Money number</label>
      <input id="tnFlwPhone" class="tn-flow-input" inputmode="tel" autocomplete="tel" value="${safe(defaultPhone)}" placeholder="0772 123 456" style="margin-top:6px">
      <div id="tnFlwError" style="min-height:22px;color:#ff9d9d;font-size:.76rem;margin-top:7px"></div>
      <button id="tnFlwPay" class="btn-primary" style="width:100%;margin-top:6px">Continue to ${network==='MTN'?'MTN':'Airtel'} Mobile Money</button>
      <button id="tnFlwCancel" class="btn-secondary" style="width:100%;margin-top:8px">Cancel</button>
    </div>`;
    el.querySelector('#tnFlwClose').onclick=close;
    el.querySelector('#tnFlwCancel').onclick=close;
    el.querySelector('#tnFlwPay').onclick=async()=>{
      const errorEl=el.querySelector('#tnFlwError');
      const phone=phoneUg(el.querySelector('#tnFlwPhone').value);
      if(!phone){errorEl.textContent='Enter a valid Uganda mobile number.';return;}
      const button=el.querySelector('#tnFlwPay');
      button.disabled=true; button.textContent='Starting payment…'; errorEl.textContent='';
      try{
        const orderGroupId='TN-'+Math.random().toString(36).slice(2,9).toUpperCase();
        const byVendor={};
        s.cart.forEach(item=>{(byVendor[item.vendorId] ||= {vendorName:item.vendorName,items:[]}).items.push(item)});
        const rows=Object.entries(byVendor).map(([vendorId,g])=>({
          order_id:orderGroupId,vendor_id:vendorId,vendor_name:g.vendorName,
          items:g.items.map(i=>({id:i.itemId,name:i.name,price:Number(i.price),qty:Number(i.qty)})),
          item_subtotal:g.items.reduce((sum,i)=>sum+Number(i.price||0)*Number(i.qty||0),0),
          subtotal:g.items.reduce((sum,i)=>sum+Number(i.price||0)*Number(i.qty||0),0),
          total:g.items.reduce((sum,i)=>sum+Number(i.price||0)*Number(i.qty||0),0),
          delivery_fee: delivery,
          delivery_area: area, customer_area: area,
          payment_method:'Flutterwave Mobile Money', payment_status:'pending', status:'new',
          user_id:session.user.id, user_email:session.user.email||null,
          customer_name:getCustomerName(session), customer_phone:phone,
          customer_lat:s.customerLocation?.lat||null, customer_lng:s.customerLocation?.lng||null
        }));
        const insert=await c.from('orders').insert(rows).select('id,order_id');
        if(insert.error) throw insert.error;
        const startRes=await c.functions.invoke('create-flutterwave-payment',{body:{order_group_id:orderGroupId,network,phone_number:phone,email:session.user.email||null}});
        if(startRes.error) throw new Error(startRes.error.message||'Could not start payment');
        if(!startRes.data?.payment_url) throw new Error(startRes.data?.message||'Flutterwave did not return a payment link');
        sessionStorage.setItem('tn_pending_payment',JSON.stringify({order_group_id:orderGroupId,tx_ref:startRes.data.tx_ref,total,created_at:Date.now()}));
        window.location.href=startRes.data.payment_url;
      }catch(err){
        button.disabled=false;button.textContent='Try Mobile Money payment again';
        errorEl.textContent=safe(err?.message||'Payment could not be started.');
      }
    };
  }

  function patchCheckout(){
    const old = window.completeOrder;
    if(typeof old!=='function'||old.__tnFlutterwavePatched) return;
    const wrapped=function(method){
      if(method==='MTN MoMo'){ start('MTN Money'); return; }
      if(method==='Airtel Money'){ start('Airtel Money'); return; }
      return old.apply(this,arguments);
    };
    wrapped.__tnFlutterwavePatched=true;
    window.completeOrder=wrapped;
  }
  window.tnStartFlutterwavePayment=start;
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(patchCheckout,50)); else setTimeout(patchCheckout,50);
  setTimeout(patchCheckout,500);setTimeout(patchCheckout,1500);
})();