// payment-init: creates the order (status "pending payment") and a Razorpay order, returns what the browser needs to open Razorpay Checkout.
// Secrets needed (Supabase > Edge Functions > Secrets): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
// Turn OFF "Verify JWT" for this function; the user is verified inside the code below.
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
  const r = await fetch("https://api.razorpay.com/v1" + path, {
    ...init,
    headers: { Authorization: basic, "Content-Type": "application/json" },
  });
  const t = await r.text();
  let d: any = {};
  try { d = JSON.parse(t); } catch { /* not json */ }
  if (!r.ok) throw new Error("RAZORPAY_" + r.status + ": " + (d?.error?.description || t.slice(0, 200)));
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!KEY_ID || !KEY_SECRET) return json({ error: "RAZORPAY_NOT_CONFIGURED" }, 500);

  // ---- who is calling? ----
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "AUTH_REQUIRED" }, 401);
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_REQUIRED" }, 401);
  const user = u.user;
  if (!user.email_confirmed_at) return json({ error: "EMAIL_UNVERIFIED" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "BAD_REQUEST" }, 400); }

  let orderId: string;
  try {
    if (body.order_id) {
      // retry payment of an existing unpaid order (must belong to this user)
      const { error } = await admin.rpc("prepare_payment_retry", { p_order: body.order_id, p_user: user.id });
      if (error) return json({ error: error.message }, 400);
      orderId = body.order_id;
    } else {
      // new order: the database recalculates prices, stock, coupon and total itself
      const { data, error } = await admin.rpc("place_order", {
        p_user: user.id,
        p_address_id: body.address_id,
        p_items: body.items,
        p_coupon: body.coupon || null,
        p_method: "online",
        p_key: body.key,
      });
      if (error) return json({ error: error.message, details: error.details || null }, 400);
      orderId = data.order_id;
    }
  } catch (e) {
    return json({ error: "SERVER_ERROR", details: String(e) }, 500);
  }

  const { data: order } = await admin.from("orders").select("id, order_number, total_amount, order_status, payment_status, payment_method, shipping_address_snapshot").eq("id", orderId).single();
  const { data: pay } = await admin.from("payments").select("*").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).single();
  if (!order || !pay) return json({ error: "ORDER_NOT_FOUND" }, 404);
  if (pay.status === "paid" || order.payment_status === "paid") return json({ already_paid: true, order_id: orderId, order_number: order.order_number });
  if (order.order_status === "cancelled") return json({ error: "ORDER_CANCELLED", order_id: orderId }, 409);

  const amountPaise = Math.round(Number(pay.amount) * 100);
  try {
    let rzpOrderId: string | null = pay.provider_order_id;

    if (rzpOrderId) {
      // Reuse the same Razorpay order (avoids paying twice on two different Razorpay orders).
      try {
        const existing = await rzp("/orders/" + rzpOrderId);
        if (existing.status === "paid") {
          const list = await rzp("/orders/" + rzpOrderId + "/payments");
          const ok = (list.items || []).find((p: any) => p.status === "captured");
          if (ok) {
            await admin.rpc("mark_payment_paid", { p_provider_order_id: rzpOrderId, p_provider_payment_id: ok.id, p_amount_paise: ok.amount });
            return json({ already_paid: true, order_id: orderId, order_number: order.order_number });
          }
        }
      } catch { rzpOrderId = null; }
    }

    if (!rzpOrderId) {
      const created = await rzp("/orders", {
        method: "POST",
        body: JSON.stringify({
          amount: amountPaise,
          currency: "INR",
          receipt: String(order.order_number).slice(0, 40),
          notes: { order_id: orderId, order_number: order.order_number },
        }),
      });
      rzpOrderId = created.id as string;
      const { error } = await admin.rpc("attach_provider_order", { p_payment: pay.id, p_provider_order_id: rzpOrderId });
      if (error) throw new Error("ATTACH_FAILED: " + error.message);
    }

    const a = order.shipping_address_snapshot || {};
    return json({
      key_id: KEY_ID,
      razorpay_order_id: rzpOrderId,
      amount: amountPaise,
      currency: "INR",
      order_id: orderId,
      order_number: order.order_number,
      prefill: { name: a.full_name || "", email: user.email || "", contact: a.phone || "" },
    });
  } catch (e) {
    console.error("payment-init gateway error", String(e));
    // the order exists and stays unpaid; the buyer can press "Pay now" on the order page, or it auto-cancels after the payment window
    return json({ error: "PAYMENT_GATEWAY_ERROR", order_id: orderId }, 502);
  }
});
