// payment-verify: called by the browser right after Razorpay Checkout succeeds.
// It checks Razorpay's signature AND asks Razorpay's server for the payment, then marks the order paid.
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.  Turn OFF "Verify JWT" (user is verified in code).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
const basic = "Basic " + btoa(KEY_ID + ":" + KEY_SECRET);

async function rzp(path: string, init?: RequestInit) {
  const r = await fetch("https://api.razorpay.com/v1" + path, { ...init, headers: { Authorization: basic, "Content-Type": "application/json" } });
  const t = await r.text();
  let d: any = {};
  try { d = JSON.parse(t); } catch { /* not json */ }
  if (!r.ok) throw new Error("RAZORPAY_" + r.status + ": " + (d?.error?.description || t.slice(0, 200)));
  return d;
}
async function hmacHex(secret: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!KEY_ID || !KEY_SECRET) return json({ error: "RAZORPAY_NOT_CONFIGURED" }, 500);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "AUTH_REQUIRED" }, 401);
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_REQUIRED" }, 401);

  let b: any;
  try { b = await req.json(); } catch { return json({ error: "BAD_REQUEST" }, 400); }
  const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = b || {};
  if (!oid || !pid || !sig) return json({ error: "BAD_REQUEST" }, 400);

  // 1) the payment must belong to an order of THIS user
  const { data: pay } = await admin.from("payments").select("id, order_id, status, orders!inner(user_id)").eq("provider_order_id", oid).maybeSingle();
  if (!pay || (pay as any).orders.user_id !== u.user.id) return json({ error: "PAYMENT_NOT_FOUND" }, 404);
  if (pay.status === "paid") return json({ ok: true, order_id: pay.order_id, already_processed: true });

  // 2) signature must match (proves the data came from Razorpay Checkout for our key)
  const expected = await hmacHex(KEY_SECRET, oid + "|" + pid);
  if (!safeEq(expected, String(sig))) return json({ error: "SIGNATURE_INVALID" }, 400);

  try {
    // 3) confirm with Razorpay's server: right order, and money actually received
    let p = await rzp("/payments/" + pid);
    if (p.order_id !== oid) return json({ error: "PAYMENT_ORDER_MISMATCH" }, 400);
    if (p.status === "authorized") p = await rzp("/payments/" + pid + "/capture", { method: "POST", body: JSON.stringify({ amount: p.amount, currency: p.currency }) });
    if (p.status !== "captured") return json({ error: "PAYMENT_NOT_CAPTURED", status: p.status }, 409);

    // 4) mark paid (the database compares the amount with the order total)
    const { data, error } = await admin.rpc("mark_payment_paid", { p_provider_order_id: oid, p_provider_payment_id: pid, p_amount_paise: p.amount });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, order_id: data.order_id, already_processed: !!data.already_processed, late_payment: !!data.late_payment });
  } catch (e) {
    console.error("payment-verify error", String(e));
    // not lost: the Razorpay webhook will also confirm this payment
    return json({ error: "VERIFY_FAILED" }, 502);
  }
});
