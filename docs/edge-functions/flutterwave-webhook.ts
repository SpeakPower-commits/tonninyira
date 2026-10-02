import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Sandbox unless FLW_ENV=live is set in Edge Function secrets.
const FLW_BASE = Deno.env.get("FLW_ENV") === "live" ? "https://f4bexperience.flutterwave.com" : "https://developersandbox-api.flutterwave.com";
const FLW_IDP = "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";
const HASH = Deno.env.get("FLW_SECRET_HASH") || "";

function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
function serviceKey() { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || ""; }
async function rest(path: string, init: RequestInit = {}) { const key = serviceKey(); if (!key) throw new Error("Supabase service key unavailable"); const h = new Headers(init.headers); h.set("apikey", key); h.set("Authorization", `Bearer ${key}`); h.set("Content-Type", "application/json"); return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: h }); }
async function flwToken() { const cid = Deno.env.get("FLW_CLIENT_ID") || "", cs = Deno.env.get("FLW_CLIENT_SECRET") || ""; if (!cid || !cs) throw new Error("Flutterwave Client ID or Client Secret is missing"); const r = await fetch(FLW_IDP, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cid, client_secret: cs, grant_type: "client_credentials" }) }); const d:any = await r.json().catch(()=>({})); if(!r.ok || !d?.access_token) throw new Error(d?.error_description || d?.message || "Flutterwave authentication failed"); return d.access_token as string; }
async function signature(body: string) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(HASH), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)); let s=""; new Uint8Array(sig).forEach(b=>s+=String.fromCharCode(b)); return btoa(s); }
async function apply(txRef: string, charge: any) { const q = await rest(`payment_transactions?provider=eq.flutterwave&provider_reference=eq.${encodeURIComponent(txRef)}&select=id,order_id,user_id,amount,currency,metadata,status&limit=1`); if(!q.ok) return; const list:any[] = await q.json(); const pt=list[0]; if(!pt) return; if(pt.status==='successful') return; const group=pt.metadata?.order_group_id; await rest(`payment_transactions?id=eq.${pt.id}`,{method:'PATCH',body:JSON.stringify({status:'successful',raw_status:String(charge?.status||'succeeded'),provider_transaction_id:String(charge?.id||''),verified_at:new Date().toISOString()})}); if(!group)return; await rest(`orders?order_id=eq.${encodeURIComponent(group)}&user_id=eq.${encodeURIComponent(pt.user_id)}`,{method:'PATCH',body:JSON.stringify({payment_status:'paid',payment_provider:'flutterwave',payment_reference:txRef,paid_at:new Date().toISOString()})}); const od=await rest(`orders?order_id=eq.${encodeURIComponent(group)}&user_id=eq.${encodeURIComponent(pt.user_id)}&select=id`); if(od.ok){const orders:any[]=await od.json(); for(const o of orders) await rest('order_events',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({order_id:o.id,event_type:'payment_paid',actor_user_id:null,metadata:{reference:txRef,amount:Number(pt.amount),provider:'flutterwave'}})});} await rest('notifications',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({user_id:pt.user_id,kind:'payment',title:'Payment successful',body:`Your Tonninyira order ${group} is paid and is ready for processing.`,order_id:group})}); }

/* refund.* events: confirm the refund's state with Flutterwave, then update the
   matching order_refunds row (created by process-refunds, which stored the
   Flutterwave refund id in provider_reference). */
async function applyRefund(refundId: string) {
  const q = await rest(`order_refunds?provider_reference=eq.${encodeURIComponent(refundId)}&select=id,status,order_id,customer_id,amount&limit=1`);
  const row: any = q.ok ? (await q.json())[0] : null;
  if (!row || row.status === 'refunded') return;
  const token = await flwToken();
  const r = await fetch(`${FLW_BASE}/refunds/${encodeURIComponent(refundId)}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Trace-Id": crypto.randomUUID() } });
  const out: any = await r.json().catch(() => ({}));
  if (!r.ok || out?.status !== 'success') return;
  const st = String(out?.data?.status || '').toLowerCase();
  if (['succeeded', 'completed'].includes(st)) {
    await rest(`order_refunds?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'refunded', provider_response: out, updated_at: new Date().toISOString() }) });
    await rest('notifications', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: row.customer_id, order_id: row.order_id, kind: 'refund', title: 'Refund sent', body: `UGX ${Number(row.amount).toLocaleString('en-US')} for order ${row.order_id} has been returned to your Mobile Money.` }) });
  } else if (['failed', 'cancelled'].includes(st)) {
    await rest(`order_refunds?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', failed_reason: 'Flutterwave could not complete the refund', provider_response: out, updated_at: new Date().toISOString() }) });
  }
}

Deno.serve(async req=>{ if(req.method!=='POST') return json({ok:true}); if(!HASH) return json({error:'Webhook secret hash is not configured'},503); const raw=await req.text(); const got=req.headers.get('flutterwave-signature')||''; const expected=await signature(raw); if(!got || got!==expected) return json({error:'Invalid webhook signature'},401); let p:any; try{p=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)};
  if(String(p?.type||'').startsWith('refund.')){ const rid=String(p?.data?.id||''); if(rid) await applyRefund(rid); return json({ok:true}); }
  const data=p?.data||{}; const ref=String(data?.reference||data?.tx_ref||''); const chargeId=String(data?.id||''); if(!ref) return json({ok:true}); const token=await flwToken(); let charge:any=data; if(chargeId){const r=await fetch(`${FLW_BASE}/charges/${encodeURIComponent(chargeId)}`,{headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","X-Trace-Id":crypto.randomUUID()}}); const out:any=await r.json().catch(()=>({})); if(!r.ok || out?.status!=='success') return json({ok:true}); charge=out.data||data;} const ptRes=await rest(`payment_transactions?provider=eq.flutterwave&provider_reference=eq.${encodeURIComponent(ref)}&select=id,amount,currency,user_id,status&limit=1`); const pts=ptRes.ok?await ptRes.json():[]; const pt=pts[0]; if(!pt) return json({ok:true}); const good=String(charge?.status||'').toLowerCase()==='succeeded' && String(charge?.reference||charge?.tx_ref||'')===ref && String(charge?.currency||'').toUpperCase()===String(pt.currency||'UGX').toUpperCase() && Number(charge?.amount)>=Number(pt.amount); if(good) await apply(ref,charge); else if(['failed','cancelled'].includes(String(charge?.status||'').toLowerCase())) await rest(`payment_transactions?id=eq.${pt.id}`,{method:'PATCH',body:JSON.stringify({status:'failed',raw_status:String(charge.status),provider_transaction_id:String(charge.id||chargeId),verified_at:new Date().toISOString()})}); return json({ok:true}); });
