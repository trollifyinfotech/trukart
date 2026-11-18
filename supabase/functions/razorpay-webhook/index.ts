// razorpay-webhook: Razorpay calls this by itself (even if the buyer closes the browser after paying).
// Secret: RAZORPAY_WEBHOOK_SECRET (the secret you type when creating the webhook in the Razorpay Dashboard).
// Turn OFF "Verify JWT" for this function (Razorpay does not send a Supabase token; the signature is checked instead).
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";

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
const ok = (m = "ok") => new Response(m, { status: 200 });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!SECRET) return new Response("webhook secret not configured", { status: 500 });

  const raw = await req.text();                       // signature is over the RAW body
  const sig = req.headers.get("x-razorpay-signature") || "";
  if (!safeEq(await hmacHex(SECRET, raw), sig)) return new Response("invalid signature", { status: 400 });

  let ev: any;
  try { ev = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const eventId = req.headers.get("x-razorpay-event-id") || "";
  const type: string = ev.event || "";

  if (eventId) {
    const { data: seen } = await admin.from("payment_events").select("event_id").eq("event_id", eventId).maybeSingle();
    if (seen) return ok("duplicate");
  }

  const pay = ev?.payload?.payment?.entity;
  try {
    if ((type === "payment.captured" || type === "order.paid") && pay?.order_id && pay?.id) {
      const { error } = await admin.rpc("mark_payment_paid", { p_provider_order_id: pay.order_id, p_provider_payment_id: pay.id, p_amount_paise: pay.amount });
      if (error) {
        // not one of our orders (the Razorpay account may be shared) -> ignore; amount mismatch -> log loudly, do not retry forever
        if (/PAYMENT_NOT_FOUND/.test(error.message)) { /* ignore */ }
        else if (/AMOUNT_MISMATCH/.test(error.message)) console.error("AMOUNT_MISMATCH for", pay.order_id, pay.id);
        else return new Response("db error", { status: 500 });   // Razorpay will retry
      }
    } else if (type === "payment.failed" && pay?.order_id) {
      await admin.rpc("mark_payment_failed", { p_provider_order_id: pay.order_id });
    }
  } catch (e) {
    console.error("webhook error", String(e));
    return new Response("error", { status: 500 });
  }

  if (eventId) await admin.from("payment_events").insert({ event_id: eventId, event_type: type }).then(() => {}, () => {});
  return ok();
});
