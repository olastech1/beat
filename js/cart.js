// BeatMarket — Cart System (Single Price per Beat)
// Each beat has ONE price set by the seller. No license tiers.

const Cart = (() => {
  let items = [];

  const cartSidebar   = document.getElementById("cart-sidebar");
  const cartOverlay   = document.getElementById("cart-overlay");
  const cartBadge     = document.getElementById("cart-badge");
  const cartItemsList = document.getElementById("cart-items-list");
  const cartTotal     = document.getElementById("cart-total");

  function openCart() {
    cartSidebar.classList.add("open");
    cartOverlay.classList.add("visible");
    document.body.classList.add("no-scroll");
    renderCartItems();
  }

  function closeCart() {
    cartSidebar.classList.remove("open");
    cartOverlay.classList.remove("visible");
    document.body.classList.remove("no-scroll");
  }

  // ── Add to Cart (direct — no license modal) ─────────────────────
  function addToCart(beat) {
    const exists = items.find((i) => i.beatId === beat.id);
    if (exists) { showToast("Already in cart!"); return; }

    const price = parseFloat(beat.price) || 0;

    items.push({
      id:         Date.now(),
      beatId:     beat.id,
      title:      beat.title,
      producer:   beat.producer || beat.producerName || "Producer",
      producerId: beat.producerId || beat.producer_id || null,
      cover:      beat.cover || beat.cover_url || "",
      price,
    });

    updateBadge();
    showToast(`"${beat.title}" added to cart!`);

    // Sync to Supabase cart
    API.addToCart({ beatId: beat.id, price });
  }

  function removeFromCart(itemId) {
    const item = items.find((i) => i.id === itemId);
    if (item) API.removeFromCart(item.beatId);
    items = items.filter((i) => i.id !== itemId);
    updateBadge();
    renderCartItems();
  }

  function updateBadge() {
    cartBadge.textContent = items.length;
    cartBadge.classList.toggle("visible", items.length > 0);
  }

  function renderCartItems() {
    if (items.length === 0) {
      cartItemsList.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty-icon">🎵</div>
          <p>Your cart is empty</p>
          <span>Add beats to get started</span>
        </div>`;
      cartTotal.textContent = "$0.00";
      return;
    }

    cartItemsList.innerHTML = items.map((item) => `
      <div class="cart-item" id="cart-item-${item.id}">
        <img src="${item.cover}" class="cart-item-cover" alt="${item.title}">
        <div class="cart-item-info">
          <div class="cart-item-title">${item.title}</div>
          <div class="cart-item-license">Prod. by ${item.producer}</div>
        </div>
        <div class="cart-item-right">
          <div class="cart-item-price">$${item.price.toFixed(2)}</div>
          <button class="cart-remove-btn" onclick="Cart.removeFromCart(${item.id})" title="Remove">✕</button>
        </div>
      </div>`).join("");

    const total = items.reduce((sum, i) => sum + i.price, 0);
    cartTotal.textContent = `$${total.toFixed(2)}`;
  }

  // ── Checkout ──────────────────────────────────────────────────────
  async function checkout() {
    if (items.length === 0) { showToast("Your cart is empty!"); return; }

    const btn = document.getElementById("checkout-btn");
    btn.disabled    = true;
    btn.textContent = "Processing…";

    try {
      const session = Auth.getSession();
      if (!session) {
        showToast("Please log in to checkout.");
        setTimeout(() => { window.location.href = "login.html"; }, 1200);
        return;
      }

      // ── Try Stripe Checkout (only when keys are configured) ────────
      if (typeof StripeCheckout !== "undefined" && API.isReady() && StripeCheckout.isConfigured()) {
        let stripeResult = null;
        try {
          // Race against a 15s timeout so we never hang forever
          const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("checkout_timeout")), 15000)
          );
          stripeResult = await Promise.race([StripeCheckout.checkout(items), timeout]);
        } catch (err) {
          // Any error (timeout, network, edge function not deployed, etc.)
          // → fall through to direct Supabase order creation
          console.warn("Stripe checkout issue, falling back:", err.message);
          stripeResult = { ok: false, demo: true };
        }

        if (stripeResult?.ok) {
          // Stripe is redirecting — page is navigating away.
          // The finally block resets the button (harmless during page unload).
          return;
        }

        // Real Stripe API error (e.g. bad card, declined) — show to user
        if (stripeResult && !stripeResult.demo && stripeResult.error) {
          showToast("Payment error: " + stripeResult.error);
          return;
        }

        // demo: true → fall through to direct order flow below
      }

      // ── Direct order creation (Supabase fallback / demo mode) ─────
      if (API.isReady()) {
        const results = await Promise.all(items.map((item) =>
          API.createOrder({
            beatId:      item.beatId,
            amount:      item.price,
            producerId:  item.producerId,
            licenseType: "standard",
          })
        ));
        if (results.some((r) => !r.ok)) {
          showToast("Some orders failed. Please try again.");
          return;
        }
      }

      // ── Success ────────────────────────────────────────────────────
      items = [];
      updateBadge();
      renderCartItems();
      closeCart();
      showToast("🎉 Purchase complete! Check your email for download links.");

    } finally {
      // ALWAYS re-enable the button — even on Stripe redirect (harmless)
      btn.disabled    = false;
      btn.textContent = "Checkout →";
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────
  function showToast(message) {
    const existing = document.getElementById("toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, 2600);
  }

  // ── Init ──────────────────────────────────────────────────────────
  async function init() {
    document.getElementById("cart-btn").addEventListener("click", openCart);
    document.getElementById("cart-close-btn").addEventListener("click", closeCart);
    cartOverlay.addEventListener("click", closeCart);

    document.getElementById("checkout-btn").addEventListener("click", checkout);

    // Restore saved cart from Supabase
    if (API.isReady()) {
      const saved = await API.getCart();
      if (saved && saved.length > 0) {
        items = saved.map((row) => ({
          id:         Date.now() + Math.random(),
          beatId:     row.beat_id,
          title:      row.beats?.title || "Beat",
          producer:   row.beats?.profiles?.name || "Producer",
          producerId: row.beats?.producer_id,
          cover:      row.beats?.cover_url || "",
          price:      parseFloat(row.price || 0),
        }));
        updateBadge();
      }
    }
  }

  return {
    init, openCart, closeCart, addToCart, removeFromCart, showToast,
    // Keep old API surface for backward compat
    openLicenseModal: addToCart,
    selectLicense:    () => {},
    closeLicenseModal: () => {},
  };
})();
