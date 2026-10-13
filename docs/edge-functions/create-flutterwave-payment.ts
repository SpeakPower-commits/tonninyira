import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Sandbox unless FLW_ENV=live is set in Edge Function secrets.
const FLW_LIVE = Deno.env.get("FLW_ENV") === "live";
const FLW_BASE = FLW_LIVE ? "https://f4bexperience.flutterwave.com" : "https://developersandbox-api.flutterwave.com";
const FLW_IDP = "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";
const APP_RETURN = Deno.env.get("APP_RETURN_URL") || "https://speakpower-commits.github.io/tonninyira/payment-return-fixed.html";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } }); }
function serviceKey() { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || ""; }
function bearer(req: Request) { return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim(); }
async function rest(path: string, init: RequestInit = {}) { const key = serviceKey(); if (!key) throw new Error("Supabase service key unavailable"); const h = new Headers(init.headers); h.set("apikey", key); h.set("Authorization", `Bearer ${key}`); h.set("Content-Type", "application/json"); return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: h }); }
async function flwToken() { const cid = Deno.env.get("FLW_CLIENT_ID") || "", cs = Deno.env.get("FLW_CLIENT_SECRET") || ""; if (!cid || !cs) throw new Error("Flutterwave Client ID or Client Secret is missing"); const r = await fetch(FLW_IDP, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cid, client_secret: cs, grant_type: "client_credentials" }) }); const d:any = await r.json().catch(()=>({})); if(!r.ok || !d?.access_token) throw new Error(d?.error_description || d?.message || "Flutterwave authentication failed"); return d.access_token as string; }
async function flw(path: string, token: string, body: unknown) { const headers: Record<string,string> = { Authorization:`Bearer ${token}`, "Content-Type":"application/json", "X-Trace-Id":crypto.randomUUID(), "X-Idempotency-Key":crypto.randomUUID() }; if(!FLW_LIVE && path === "/charges") headers["X-Scenario-Key"] = "scenario:auth_redirect"; return fetch(`${FLW_BASE}${path}`, { method:"POST", headers, body:JSON.stringify(body) }); }
// Flutterwave v4 validates name parts as 2-50 letters (plus , . ' -), so clean before sending.
function flwName(full: string) {
  const parts = String(full || "").replace(/[^A-Za-z ,.'-]/g, " ").split(/\s+/).filter((p) => /[A-Za-z]{2,}/.test(p));
  return { first: (parts[0] || "Tonninyira").slice(0, 50), last: (parts.slice(1).join(" ") || "Customer").slice(0, 50) };
}
async function flwFail(step: string, res: Response, body: any) { console.error(`flutterwave ${step} failed`, res.status, JSON.stringify(body)); }
// v4 answers 409 when the email already has a customer; reuse that customer instead of failing.
async function flwCustomer(token: string, email: string, fullName: string, phone: string): Promise<string | null> {
  const cr = await flw("/customers", token, { email, name: flwName(fullName), phone: { country_code: "256", number: phone } });
  const cd: any = await cr.json().catch(() => ({}));
  if (cr.ok && cd?.status === "success" && cd?.data?.id) return cd.data.id;
  if (cr.status === 409 || /exist/i.test(String(cd?.message || ""))) {
    const sr = await flw("/customers/search", token, { email });
    const sd: any = await sr.json().catch(() => ({}));
    const found = (Array.isArray(sd?.data) ? sd.data : []).find((c: any) => String(c?.email || "").toLowerCase() === email.toLowerCase());
    if (found?.id) return found.id;
    await flwFail("customer search", sr, sd);
  }
  await flwFail("customer create", cr, cd);
  throw Object.assign(new Error(cd?.message || "Flutterwave could not create the customer"), { status: 400 });
}
async function handle(req: Request): Promise<Response> {
  if(req.method!=="POST") return json({error:"POST required"},405);
  const auth=bearer(req); if(!auth) return json({error:"Authentication required"},401);
  let b:any; try{b=await req.json()}catch{return json({error:"Invalid JSON"},400)}
  const group=String(b?.order_group_id||"").trim(); const network=String(b?.network||"").toUpperCase(); const raw=String(b?.phone_number||"").trim(); const phone=raw.replace(/^\+?256/,"").replace(/^0/,"");
  if(!group||!["MTN","AIRTEL"].includes(network)||!/^7\d{8}$/.test(phone)) return json({error:"order_group_id, MTN/AIRTEL network and a valid Uganda mobile number are required"},400);
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||""; const ur=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:anon,Authorization:`Bearer ${auth}`}}); const user:any=await ur.json().catch(()=>null); if(!ur.ok||!user?.id)return json({error:"Authentication required"},401);
  const or=await rest(`orders?order_id=eq.${encodeURIComponent(group)}&user_id=eq.${encodeURIComponent(user.id)}&select=id,item_subtotal,delivery_fee,payment_status,payment_reference,status&order=id.asc`); if(!or.ok)return json({error:"Could not load the order"},500); const orders:any[]=await or.json(); if(!orders.length)return json({error:"Order not found for this account"},404); if(orders.some(o=>String(o.payment_status||"").toLowerCase()==="paid"))return json({status:"paid",order_group_id:group},200); if(orders.some(o=>String(o.status||"").toLowerCase()==="cancelled"))return json({error:"This order has expired. Please place it again."},409);
  // One delivery fee per rider route (the database puts each route's fee on
  // its first pickup row and 0 on the rest), so the customer pays their sum.
  const subtotal=orders.reduce((s,o)=>s+Number(o.item_subtotal||0),0); const delivery=orders.reduce((s,o)=>s+Number(o.delivery_fee||0),0); const amount=Math.round(subtotal+delivery); if(amount<=0)return json({error:"Order amount must be greater than zero"},400);
  const token=await flwToken(); const email=String(b?.email||user.email||`customer-${String(user.id).slice(0,8)}@tonninyira.app`); const name=String(b?.fullname||b?.full_name||user.user_metadata?.name||"Tonninyira Customer");
  let customerId: string | null; try { customerId = await flwCustomer(token, email, name, phone); } catch (e) { return json({ error: (e as Error).message }, 400); } if (!customerId) return json({ error: "Flutterwave did not return a customer ID" }, 502);
  const mr=await flw("/payment-methods",token,{type:"mobile_money",mobile_money:{country_code:"256",network,phone_number:phone}}); const md:any=await mr.json().catch(()=>({})); if(!mr.ok||md?.status!=="success"){ await flwFail("payment-method", mr, md); return json({error:md?.message||"Flutterwave could not create the mobile-money payment method"},400); } const methodId=md?.data?.id; if(!methodId)return json({error:"Flutterwave did not return a payment method ID"},502);
  const reference=`TN${crypto.randomUUID().replaceAll("-","").slice(0,30)}`; const chr=await flw("/charges",token,{reference,currency:"UGX",customer_id:customerId,payment_method_id:methodId,amount,redirect_url:`${APP_RETURN}?tx_ref=${encodeURIComponent(reference)}`,meta:{order_group_id:group,user_id:user.id,network}}); const chd:any=await chr.json().catch(()=>({})); if(!chr.ok||chd?.status!=="success"){ await flwFail("charge", chr, chd); return json({error:chd?.message||"Flutterwave could not start the payment"},400); }
  const charge=chd?.data||{}; const paymentUrl=charge?.next_action?.redirect_url?.url||null; const instruction=charge?.next_action?.payment_instruction?.note||null;
  const patch=await rest(`orders?order_id=eq.${encodeURIComponent(group)}&user_id=eq.${encodeURIComponent(user.id)}`,{method:"PATCH",body:JSON.stringify({payment_provider:"flutterwave",payment_reference:reference,payment_status:"processing",payment_method:`Flutterwave ${network} Mobile Money`})}); if(!patch.ok)return json({error:"Could not save payment state"},500);
  const ins=await rest("payment_transactions",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({order_id:orders[0].id,user_id:user.id,provider:"flutterwave",provider_reference:reference,provider_transaction_id:charge?.id||null,amount,currency:"UGX",status:"pending",raw_status:String(charge?.status||"pending"),network,phone_number:phone,metadata:{order_group_id:group,network,phone_number:phone,customer_id:customerId,payment_method_id:methodId,charge_id:charge?.id||null,payment_url:paymentUrl,payment_instruction:instruction,environment:FLW_LIVE?"live":"sandbox"}})}); if(!ins.ok)return json({error:"Could not record the payment attempt"},500);
  return json({status:"pending",tx_ref:reference,charge_id:charge?.id||null,payment_url:paymentUrl,payment_instruction:instruction,amount,currency:"UGX",order_group_id:group},200);
}

Deno.serve(async (req) => {
  // Browsers send a CORS preflight before the authenticated POST.
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try { return await handle(req); }
  catch (err) { console.error(err); return json({ error: (err as Error)?.message || "Payment service error" }, (err as any)?.status || 500); }
});
