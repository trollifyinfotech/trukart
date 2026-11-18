/* payments.js - online payment with Razorpay (browser side).
   The browser never sees a Razorpay SECRET. It only talks to the Supabase Edge Functions payment-init and payment-verify,
   which create the order, check the amount and verify Razorpay's signature on the server. */
(function () {
  const RZP_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
  let loading = null;

  function loadRazorpay() {
    if (window.Razorpay) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = RZP_SRC; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { loading = null; s.remove(); reject(new Error('RAZORPAY_LOAD_FAILED')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  async function call(name, body) {
    const { data: ses } = await window.sb.auth.getSession();
    if (!ses || !ses.session) throw new Error('AUTH_REQUIRED');
    const { data, error } = await window.sb.functions.invoke(name, { body, headers: { Authorization: 'Bearer ' + ses.session.access_token } });
    if (error) {
      let p = null; try { p = error.context && (await error.context.json()); } catch (e) { /* no body */ }
      if (p && p.error) { const e = new Error(p.error); e.details = p.details || null; e.order_id = p.order_id || null; throw e; }
      if (error.name === 'FunctionsFetchError') throw new Error('Failed to fetch');
      if (error.name === 'FunctionsHttpError' && error.context && error.context.status === 404) throw new Error('FUNCTION_NOT_DEPLOYED');
      throw error;
    }
    return data;
  }

  /* Opens Razorpay Checkout for a NEW order  {address_id, items, coupon, key}  or for an existing unpaid order  {order_id}.
     Resolves with { status: 'paid' | 'dismissed' | 'unconfirmed', order_id }.  Throws if the order could not be created. */
  async function start(payload) {
    await loadRazorpay();                                  // load the payment window BEFORE an order is created
    const init = await call('payment-init', payload);
    if (init.already_paid) return { status: 'paid', order_id: init.order_id };

    return new Promise((resolve) => {
      let settled = false, paying = false;
      const done = (r) => { if (!settled) { settled = true; resolve(r); } };
      const color = (getComputedStyle(document.documentElement).getPropertyValue('--p') || '').trim() || '#AA336A';
      const rz = new window.Razorpay({
        key: init.key_id, amount: init.amount, currency: init.currency, order_id: init.razorpay_order_id,
        name: (S.settings && S.settings.brand_name) || 'Veloura', description: 'Order ' + init.order_number,
        prefill: init.prefill || {}, theme: { color },
        modal: { confirm_close: true, ondismiss: () => { if (!paying) done({ status: 'dismissed', order_id: init.order_id }); } },
        handler: async (resp) => {
          paying = true;
          try {
            await call('payment-verify', { razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature });
            done({ status: 'paid', order_id: init.order_id });
          } catch (e) {
            // Money may have been taken. Do NOT claim success; the Razorpay webhook will confirm it, or "Pay now" re-checks it.
            console.warn('[payment-verify]', e);
            done({ status: 'unconfirmed', order_id: init.order_id });
          }
        },
      });
      rz.on('payment.failed', (r) => { const d = r && r.error && r.error.description; toast((d ? d + ' ' : '') + 'Payment failed. You can try again.', 'error'); });
      rz.open();
    });
  }

  window.Pay = { start };
})();
