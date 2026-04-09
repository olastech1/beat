// ─────────────────────────────────────────────────────────────────
//  BeatMarket — Stripe Frontend Integration
//  Handles redirect to Stripe Checkout and payment return URL
// ─────────────────────────────────────────────────────────────────

const StripeCheckout = (() => {

  // ── Load Stripe.js lazily ─────────────────────────────────────
  let _stripe = null;
  async function getStripe() {
    if (_stripe) return _stripe;
    if (!window.Stripe) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://js.stripe.com/v3/";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    // pk_test_ key — replace with your real publishable key
    const pk = window._stripePublishableKey || "pk_test_YOUR_PUBLISHABLE_KEY";
    _stripe = window.Stripe(pk);
    return _stripe;
  }

  // ── Create Stripe Checkout Session via Edge Function ──────────
  async function createCheckoutSession(cartItems, session) {
    const lineItems = cartItems.map((item) => ({
      name:      item.title,
      amount:    Math.round(item.price * 100), // cents
      currency:  "usd",
      quantity:  1,
      metadata: {
        beat_id:      item.beatId,
        license_id:   item.licenseId   || "",
        license_type: item.licenseType || "",
        producer_id:  item.producerId  || "",
      },
    }));

    const { data: sbSession } = await supabase.auth.getSession();
    const token = sbSession?.session?.access_token;

    const res = await fetch(
      `${supabase.supabaseUrl}/functions/v1/create-checkout`,
      {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token || supabase.supabaseKey}`,
          "apikey":        supabase.supabaseKey,
        },
        body: JSON.stringify({
          items: lineItems,
          customer_email: session?.email || undefined,
          success_url: `${window.location.origin}/buyer.html?payment=success`,
          cancel_url:  `${window.location.origin}${window.location.pathname}?payment=cancelled`,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json(); // { session_id, url }
  }

  // ── Redirect to Stripe Checkout ───────────────────────────────
  async function checkout(cartItems) {
    const session = Auth.getSession();

    if (!API.isReady()) {
      // Demo mode: simulate checkout
      return { ok: false, demo: true, message: "Stripe not configured — running in demo mode." };
    }

    try {
      const { url, session_id } = await createCheckoutSession(cartItems, session);

      if (url) {
        window.location.href = url;
        return { ok: true };
      }

      // Fallback: use Stripe.js redirect
      const stripe = await getStripe();
      const { error } = await stripe.redirectToCheckout({ sessionId: session_id });
      if (error) throw new Error(error.message);
      return { ok: true };
    } catch (err) {
      console.error("Stripe checkout error:", err);
      return { ok: false, error: err.message };
    }
  }

  // ── Handle payment return URL params ─────────────────────────
  function handleReturnParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      // Clean URL
      history.replaceState({}, "", window.location.pathname);
      return "success";
    }
    if (params.get("payment") === "cancelled") {
      history.replaceState({}, "", window.location.pathname);
      return "cancelled";
    }
    return null;
  }

  return { checkout, handleReturnParams };
})();
