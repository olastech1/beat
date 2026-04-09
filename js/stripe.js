// ─────────────────────────────────────────────────────────────────
//  BeatMarket — Stripe Frontend Integration
//  Reads Stripe keys from admin settings (localStorage) and handles
//  redirect to Stripe Checkout and payment return URL.
// ─────────────────────────────────────────────────────────────────

const StripeCheckout = (() => {

  const STRIPE_STORAGE_KEY = "bm_stripe_keys";
  let _cachedKeys = null;

  // Read keys saved by the admin settings panel
  function _getSavedKeys() {
    if (_cachedKeys) return _cachedKeys;
    try {
      const raw = localStorage.getItem(STRIPE_STORAGE_KEY);
      if (raw) {
        _cachedKeys = JSON.parse(raw);
        return _cachedKeys;
      }
    } catch {}
    return {};
  }

  // Load keys from Supabase (for buyers on other devices)
  async function _loadKeysFromSupabase() {
    if (!window.supabase || !window._supabaseReady) return;
    try {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "stripe_keys")
        .single();
      if (data?.value) {
        const keys = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
        if (keys.pk) {
          // Cache and sync to localStorage
          _cachedKeys = keys;
          localStorage.setItem(STRIPE_STORAGE_KEY, JSON.stringify(keys));
          if (keys.pk) window._stripePublishableKey = keys.pk;
        }
      }
    } catch {}
  }

  // Auto-load keys on module init
  const localKeys = _getSavedKeys();
  if (!localKeys.pk) {
    // No local keys — try Supabase in background
    _loadKeysFromSupabase();
  }

  function getPublishableKey() {
    // Priority: 1) global override  2) cached/localStorage  3) placeholder
    return window._stripePublishableKey
      || _getSavedKeys().pk
      || "pk_test_YOUR_PUBLISHABLE_KEY";
  }

  function getSecretKey() {
    return _getSavedKeys().sk || "";
  }

  function isConfigured() {
    const pk = getPublishableKey();
    return pk && !pk.includes("YOUR_PUBLISHABLE_KEY");
  }

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
    _stripe = window.Stripe(getPublishableKey());
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

    const body = {
      items: lineItems,
      customer_email: session?.email || undefined,
      success_url: `${window.location.origin}/buyer.html?payment=success`,
      cancel_url:  `${window.location.origin}${window.location.pathname}?payment=cancelled`,
    };

    // Pass the secret key to the Edge Function if admin set it
    // (fallback for when env var STRIPE_SECRET_KEY is not configured)
    const sk = getSecretKey();
    if (sk) body.stripe_secret_key = sk;

    const res = await fetch(
      `${supabase.supabaseUrl}/functions/v1/create-checkout`,
      {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token || supabase.supabaseKey}`,
          "apikey":        supabase.supabaseKey,
        },
        body: JSON.stringify(body),
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

    // Check if Stripe keys are configured
    if (!isConfigured() || !API.isReady()) {
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

  return { checkout, handleReturnParams, isConfigured, getPublishableKey };
})();
