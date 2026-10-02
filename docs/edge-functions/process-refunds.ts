import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* Tonninyira refund worker.
 * Refunds are queued in public.order_refunds by the database (a stall
 * declines, does not confirm within 15 minutes, lacks an item, or support
 * decides a refund). pg_cron calls this function every 2 minutes with the
 * x-tn-cron token kept in public.tn_internal_config. It takes no input: it
 * only works through the queue, so calling it can never create a refund.
 *  1. claim pending rows (tn_claim_refunds, skip-locked);
 *  2. find the Flutterwave charge that paid the order;
 *  3. POST /refunds with a fixed idempotency key per refund row, so a retry
 *     can never refund twice;
 *  4. follow up refunds still in progress (GET /refunds/{id}); the
 *     flutterwave-webhook also updates them on refund.* events.
 * No charge on record (e.g. paid outside Flutterwave) -> status "manual" for
 * support to pay by hand in the Command Center.
 */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const FLW_LIVE = Deno.env.get("FLW_ENV") === "live";
const FLW_BASE = FLW_LIVE ? "https://f4bexperience.flutterwave.com" : "https://developersandbox-api.flutterwave.com";
const FLW_IDP = "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";

function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
function serviceKey() { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || ""; }
async function rest(path: string, init: RequestInit = {}) {
  const key = serviceKey(); if (!key) throw new Error("Supabase service key unavailable");
  const h = new Headers(init.headers); h.set("apikey", key); h.set("Authorization", `Bearer ${key}`); h.set("Content-Type", "application/json");
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: h });
}
async function flwToken() {
  const cid = Deno.env.get("FLW_CLIENT_ID") || "", cs = Deno.env.get("FLW_CLIENT_SECRET") || "";
  if (!cid || !cs) throw new Error("Flutterwave Client ID or Client Secret is missing");
  const r = await fetch(FLW_IDP, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cid, client_secret: cs, grant_type: "client_credentials" }) });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d?.access_token) throw new Error(d?.error_description || d?.message || "Flutterwave authentication failed");
  return d.access_token as string;
}
const DONE = ["succeeded", "completed"], FAILED = ["failed", "cancelled"];

async function patchRefund(id: number, patch: Record<string, unknown>) {
  await rest(`order_refunds?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
}
async function notifySent(r: any) {
  await rest("notifications", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
    user_id: r.customer_id, order_id: r.order_id, kind: "refund", title: "Refund sent",
    body: `UGX ${Number(r.amount).toLocaleString("en-US")} for order ${r.order_id} has been returned to your Mobile Money.` }) });
}

async function sendRefund(token: string, r: any) {
  const q = await rest(`payment_transactions?provider=eq.flutterwave&status=eq.successful&metadata->>order_group_id=eq.${encodeURIComponent(r.order_id)}&select=provider_transaction_id,amount&order=id.desc&limit=1`);
  const pt: any = q.ok ? (await q.json())[0] : null;
  const chargeId = pt?.provider_transaction_id;
  if (!chargeId) { await patchRefund(r.id, { status: "manual", failed_reason: "No Flutterwave charge found for this order. Pay the customer by hand and mark it paid." }); return "manual"; }
  const res = await fetch(`${FLW_BASE}/refunds`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Trace-Id": crypto.randomUUID(), "X-Idempotency-Key": `tonninyira-refund-${String(r.id).padStart(8, "0")}` },
    body: JSON.stringify({ amount: Math.round(Number(r.amount)), reason: "requested_by_customer", charge_id: chargeId, meta: { tonninyira_refund_id: String(r.id), order_id: r.order_id } }),
  });
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok || out?.status !== "success") {
    console.error("refund failed", r.id, res.status, JSON.stringify(out));
    await patchRefund(r.id, { status: "failed", failed_reason: String(out?.message || out?.error?.message || `Flutterwave error ${res.status}`).slice(0, 300), provider_response: out });
    return "failed";
  }
  const st = String(out?.data?.status || "").toLowerCase();
  const status = DONE.includes(st) ? "refunded" : FAILED.includes(st) ? "failed" : "processing";
  await patchRefund(r.id, { status, provider_reference: out?.data?.id || null, provider_response: out, failed_reason: status === "failed" ? "Flutterwave declined the refund" : null });
  if (status === "refunded") await notifySent(r);
  return status;
}

async function followUp(token: string) {
  const since = new Date(Date.now() - 2 * 60e3).toISOString();
  const q = await rest(`order_refunds?status=eq.processing&provider_reference=not.is.null&updated_at=lt.${since}&select=id,order_id,customer_id,amount,provider_reference&limit=20`);
  const rows: any[] = q.ok ? await q.json() : [];
  let changed = 0;
  for (const r of rows) {
    const res = await fetch(`${FLW_BASE}/refunds/${encodeURIComponent(r.provider_reference)}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Trace-Id": crypto.randomUUID() } });
    const out: any = await res.json().catch(() => ({}));
    if (!res.ok || out?.status !== "success") { await patchRefund(r.id, {}); continue; }
    const st = String(out?.data?.status || "").toLowerCase();
    if (DONE.includes(st)) { await patchRefund(r.id, { status: "refunded", provider_response: out }); await notifySent(r); changed++; }
    else if (FAILED.includes(st)) { await patchRefund(r.id, { status: "failed", failed_reason: "Flutterwave could not complete the refund", provider_response: out }); changed++; }
    else await patchRefund(r.id, {});
  }
  return changed;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  try {
    const cfg = await rest("tn_internal_config?key=eq.refund_cron_token&select=value&limit=1");
    const expected = cfg.ok ? (await cfg.json())[0]?.value : null;
    if (!expected || req.headers.get("x-tn-cron") !== expected) return json({ error: "Forbidden" }, 403);
    const claim = await rest("rpc/tn_claim_refunds", { method: "POST", body: JSON.stringify({ p_limit: 10 }) });
    const rows: any[] = claim.ok ? await claim.json() : [];
    const pending = await rest("order_refunds?status=eq.processing&provider_reference=not.is.null&select=id&limit=1");
    const hasFollowUps = pending.ok && (await pending.json()).length > 0;
    if (!rows.length && !hasFollowUps) return json({ ok: true, sent: 0 });
    let token: string;
    try { token = await flwToken(); }
    catch (e) {
      // Put claimed rows back so they go out once the keys are fixed.
      for (const r of rows) await patchRefund(r.id, { status: "pending" });
      return json({ ok: false, error: (e as Error).message }, 503);
    }
    const results: Record<string, number> = {};
    for (const r of rows) { const s = await sendRefund(token, r); results[s] = (results[s] || 0) + 1; }
    const followed = await followUp(token);
    return json({ ok: true, sent: rows.length, results, followed });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
