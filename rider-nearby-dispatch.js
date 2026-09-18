/* Tonninyira automatic rider dispatch
 * 1) Publishes rider GPS location to Supabase every few seconds.
 * 2) Reads private delivery offers for the signed-in rider.
 * 3) Lets the rider accept an offer; the database RPC atomically claims the order group.
 */
(function(){
  'use strict';
  if (!location.pathname.toLowerCase().includes('rider-dashboard')) return;
  if (typeof supabaseClient === 'undefined' || !supabaseClient?.auth) return;

  let watchId = null;
  let rider = null;
  let offerChannel = null;
  const seenOffers = new Set();

  function styles(){
    if(document.getElementById('tnNearbyDispatchStyles')) return;
    const s=document.createElement('style');
    s.id='tnNearbyDispatchStyles';
    s.textContent=`
      #tnDispatchStatus{margin-top:12px;padding:10px 12px;border-radius:12px;background:var(--card);font-size:.76rem;color:var(--muted);line-height:1.4}
      #tnDispatchStatus strong{color:var(--sand)}
      #tnNearbyOffers{margin-top:12px;display:grid;gap:10px}
      .tn-offer{background:var(--card2);border:1px solid rgba(245,180,0,.35);border-left:4px solid var(--gold);border-radius:14px;padding:14px}
      .tn-offer-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
      .tn-offer-title{font-weight:800;color:var(--gold)}
      .tn-offer-distance{font-weight:800;font-size:.72rem;color:var(--green);white-space:nowrap}
      .tn-offer-body{font-size:.8rem;color:var(--sand);margin-top:5px;line-height:1.45}
      .tn-offer-meta{font-size:.7rem;color:var(--muted);margin-top:7px}
      .tn-offer-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:11px}
      .tn-offer-btn{padding:11px;border:0;border-radius:10px;font-weight:800;cursor:pointer}
      .tn-offer-accept{background:var(--green);color:var(--sand)}
      .tn-offer-dismiss{background:var(--card);color:var(--muted);border:1px solid rgba(243,232,216,.1)}
      .tn-offer-note{font-size:.7rem;color:var(--muted);margin-top:8px}
    `;
    document.head.appendChild(s);
  }

  function ensureUI(){
    const dash=document.getElementById('dashView');
    const list=document.getElementById('deliveriesList');
    if(!dash||!list) return null;
    let status=document.getElementById('tnDispatchStatus');
    if(!status){
      status=document.createElement('div');
      status.id='tnDispatchStatus';
      list.parentNode.insertBefore(status,list);
    }
    let offers=document.getElementById('tnNearbyOffers');
    if(!offers){
      offers=document.createElement('div');
      offers.id='tnNearbyOffers';
      list.parentNode.insertBefore(offers,list);
    }
    return {status,offers};
  }

  function status(text, ok){
    const ui=ensureUI();
    if(!ui) return;
    ui.status.innerHTML=`<strong>Nearby dispatch:</strong> ${text}`;
    ui.status.style.border='1px solid '+(ok?'rgba(76,154,91,.35)':'rgba(245,180,0,.25)');
  }

  function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;')}
  function distanceLabel(km){
    const n=Number(km||0);
    if(n<1) return Math.round(n*1000)+' m away';
    return n.toFixed(1)+' km away';
  }

  function renderOffer(offer){
    const ui=ensureUI();
    if(!ui||!offer?.id||seenOffers.has(offer.id)||offer.status!=='offered') return;
    seenOffers.add(offer.id);
    const card=document.createElement('div');
    card.className='tn-offer';
    card.dataset.offerId=String(offer.id);
    card.innerHTML=`
      <div class="tn-offer-top"><div class="tn-offer-title">🚴 Nearby delivery offer</div><div class="tn-offer-distance">${esc(distanceLabel(offer.distance_km))}</div></div>
      <div class="tn-offer-body">Order <strong>${esc(offer.order_id)}</strong> is available for pickup and delivery.</div>
      <div class="tn-offer-meta">Offer expires if another rider accepts it first.</div>
      <div class="tn-offer-actions"><button class="tn-offer-btn tn-offer-accept" type="button">Accept delivery</button><button class="tn-offer-btn tn-offer-dismiss" type="button">Not now</button></div>`;
    const accept=card.querySelector('.tn-offer-accept');
    const dismiss=card.querySelector('.tn-offer-dismiss');
    accept.onclick=async()=>{
      accept.disabled=true; dismiss.disabled=true; accept.textContent='Accepting…';
      const {data,error}=await supabaseClient.rpc('accept_delivery_offer',{p_offer_id:offer.id});
      if(error){
        accept.disabled=false; dismiss.disabled=false; accept.textContent='Accept delivery';
        alert(error.message||'This delivery is no longer available.');
        card.remove();
        return;
      }
      card.remove();
      status('Delivery accepted. It has been added to your deliveries.',true);
      try{ window.loadDeliveries?.(); }catch(_){ }
    };
    dismiss.onclick=async()=>{
      dismiss.disabled=true;
      const {error}=await supabaseClient.from('delivery_offers').update({status:'declined',responded_at:new Date().toISOString()}).eq('id',offer.id);
      if(!error) card.remove(); else dismiss.disabled=false;
    };
    ui.offers.prepend(card);
  }

  async function loadOffers(){
    const {data,error}=await supabaseClient.from('delivery_offers').select('id,order_id,rider_tid,distance_km,status,created_at').eq('rider_auth_user_id',rider.auth_user_id).eq('status','offered').order('created_at',{ascending:false}).limit(10);
    if(error) return;
    (data||[]).reverse().forEach(renderOffer);
  }

  async function startRealtime(){
    try{ await supabaseClient.realtime.setAuth((await supabaseClient.auth.getSession()).data.session.access_token); }catch(_){ }
    const topic=`rider-dispatch:${rider.auth_user_id}`;
    if(offerChannel){try{await supabaseClient.removeChannel(offerChannel)}catch(_){}}
    offerChannel=supabaseClient.channel(topic,{config:{private:true}})
      .on('broadcast',{event:'INSERT'},payload=>{
        const offer=payload?.payload;
        if(offer?.id) renderOffer(offer);
      })
      .subscribe((st,err)=>{
        if(st==='SUBSCRIBED') status('Live and listening for nearby deliveries.',true);
        else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT') status('Live dispatch connection unavailable. Your dashboard will still retry.',false);
        if(err) console.log('[Tonninyira] dispatch realtime:',err);
      });
  }

  function beginLocation(){
    if(!navigator.geolocation){ status('Your browser does not support location tracking.',false); return; }
    status('Requesting location permission…',false);
    watchId=navigator.geolocation.watchPosition(async pos=>{
      try{
        const lat=Number(pos.coords.latitude), lng=Number(pos.coords.longitude);
        const accuracy=Number(pos.coords.accuracy||0);
        const {error}=await supabaseClient.from('rider_locations').upsert({rider_tid:rider.tonninyira_id,auth_user_id:rider.auth_user_id,latitude:lat,longitude:lng,accuracy_m:accuracy,updated_at:new Date().toISOString()},{onConflict:'rider_tid'});
        if(error){ status('Location could not be saved yet. '+error.message,false); return; }
        status('Live location is on. You will receive nearby delivery offers automatically.',true);
      }catch(e){status('Location update failed.',false)}
    },err=>{
      if(err.code===1) status('Location permission was denied. Enable location access for automatic delivery offers.',false);
      else status('Could not read your current location. Keeping dispatch ready to retry.',false);
    },{enableHighAccuracy:true,maximumAge:15000,timeout:15000});
  }

  async function start(){
    styles();
    const session=(await supabaseClient.auth.getSession()).data.session;
    if(!session?.user?.id) return;
    const {data,error}=await supabaseClient.from('riders').select('tonninyira_id,full_name,approval_status,auth_user_id').eq('auth_user_id',session.user.id).maybeSingle();
    if(error||!data){status('Rider account could not be verified.',false);return;}
    if(data.approval_status&&data.approval_status!=='approved'){status('Your rider account is awaiting approval.',false);return;}
    rider=data;
    await loadOffers();
    await startRealtime();
    beginLocation();
  }

  function boot(){
    if(!document.getElementById('dashView')) return;
    start().catch(e=>console.log('[Tonninyira] nearby dispatch boot failed:',e));
  }
  document.addEventListener('DOMContentLoaded',boot);
  setTimeout(boot,1200);
})();