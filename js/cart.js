// BeatMarket — Cart & License Modal System (Supabase-enabled)

const Cart = (() => {
  let items        = [];
  let selectedBeat = null;

  const cartSidebar         = document.getElementById("cart-sidebar");
  const cartOverlay         = document.getElementById("cart-overlay");
  const cartBadge           = document.getElementById("cart-badge");
  const cartItemsList       = document.getElementById("cart-items-list");
  const cartTotal           = document.getElementById("cart-total");
  const licenseModal        = document.getElementById("license-modal");
  const licenseModalOverlay = document.getElementById("license-modal-overlay");

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

  // ── License Modal ─────────────────────────────────────────────────
  async function openLicenseModal(beat) {
    selectedBeat = beat;

    document.getElementById("license-beat-title").textContent    = beat.title;
    document.getElementById("license-beat-producer").textContent  = `Prod. by ${beat.producer}`;
    document.getElementById("license-beat-cover").src             = beat.cover;

    document.getElementById("license-cards").innerHTML =
      `<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading licenses…</div>`;

    licenseModal.classList.add("visible");
    licenseModalOverlay.classList.add("visible");
    document.body.classList.add("no-scroll");

    const licenses = await API.getLicenses(beat.id);
    renderLicenseCards(beat, licenses);
  }

  function closeLicenseModal() {
    licenseModal.classList.remove("visible");
    licenseModalOverlay.classList.remove("visible");
    document.body.classList.remove("no-scroll");
    selectedBeat = null;
  }

  // ── License Cards ─────────────────────────────────────────────────
  const LICENSE_META = {
    mp3:       { icon: "🎵", color: "#7C3AED", popular: false },
    wav:       { icon: "🎧", color: "#10B981", popular: true  },
    unlimited: { icon: "♾️", color: "#F59E0B", popular: false },
    exclusive: { icon: "👑", color: "#EF4444", popular: false },
  };

  function renderLicenseCards(beat, licenses) {
    const container = document.getElementById("license-cards");
    if (!licenses || licenses.length === 0) {
      const p = beat.price || 29.99;
      licenses = [
        { id:"l_mp3",  type:"mp3",       label:"Basic MP3",        price:p,     features:["MP3 Lease","50K streams","Non-exclusive"] },
        { id:"l_wav",  type:"wav",       label:"Premium WAV",      price:p*2,   features:["WAV + MP3","500K streams","Non-exclusive"] },
        { id:"l_unl",  type:"unlimited", label:"Unlimited Use",    price:p*4,   features:["WAV + MP3","Unlimited streams","Non-exclusive"] },
        { id:"l_exc",  type:"exclusive", label:"Exclusive Rights",  price:p*12, features:["Exclusive","WAV + Stems","Beat removed"] },
      ];
    }

    container.innerHTML = licenses.map((lic) => {
      const meta  = LICENSE_META[lic.type] || { icon:"🎵", color:"#7C3AED", popular:false };
      const feats = lic.features || [];
      const price = parseFloat(lic.price).toFixed(2);
      return `
        <div class="license-card ${meta.popular ? "popular" : ""}" data-license-id="${lic.id}" style="--lic-color: ${meta.color}">
          ${meta.popular ? '<div class="license-badge">Most Popular</div>' : ""}
          <div class="license-icon">${meta.icon}</div>
          <h3 class="license-name">${lic.label}</h3>
          <div class="license-price">$${price}</div>
          <ul class="license-features">
            ${feats.map((f) => `<li><span class="check">✓</span>${f}</li>`).join("")}
          </ul>
          <button class="btn-license-select"
            onclick="Cart.selectLicense('${lic.id}', '${lic.type}', '${lic.label}', ${price})">
            Add to Cart
          </button>
        </div>`;
    }).join("");
  }

  // ── Cart Management ───────────────────────────────────────────────
  async function selectLicense(licenseId, licenseType, licenseName, price) {
    if (!selectedBeat) return;
    const beat = selectedBeat;
    closeLicenseModal();

    const exists = items.find((i) => i.beatId === beat.id && i.licenseId === licenseId);
    if (exists) { showToast("Already in cart!"); return; }

    items.push({
      id:          Date.now(),
      beatId:      beat.id,
      licenseId,
      licenseType,
      title:       beat.title,
      producer:    beat.producer,
      producerId:  beat.producerId || null,
      cover:       beat.cover,
      licenseName,
      price:       parseFloat(price),
    });

    updateBadge();
    showToast(`"${beat.title}" added to cart!`);
    API.addToCart({ beatId: beat.id, licenseId, licenseType, price: parseFloat(price) });
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
          <div class="cart-item-license">${item.licenseName}</div>
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

    const session = Auth.getSession();
    if (!session) {
      showToast("Please log in to checkout.");
      setTimeout(() => { window.location.href = "login.html"; }, 1200);
      btn.disabled = false; btn.textContent = "Checkout →"; return;
    }

    // ── Try Stripe Checkout (production) ──
    if (typeof StripeCheckout !== "undefined" && API.isReady()) {
      try {
        const result = await StripeCheckout.checkout(items);
        if (result.ok) {
          // Stripe redirect happening — don't touch the UI
          return;
        }
        if (result.demo) {
          // Demo mode — fall through to direct order flow below
          console.info("Stripe not configured, using demo checkout");
        } else {
          showToast("Payment error: " + (result.error || "Please try again."));
          btn.disabled = false; btn.textContent = "Checkout →";
          return;
        }
      } catch (err) {
        showToast("Payment error: " + err.message);
        btn.disabled = false; btn.textContent = "Checkout →";
        return;
      }
    }

    // ── Demo / fallback: create orders directly ──
    if (API.isReady()) {
      const results = await Promise.all(items.map((item) =>
        API.createOrder({ beatId:item.beatId, licenseId:item.licenseId,
          licenseType:item.licenseType, amount:item.price, producerId:item.producerId })
      ));
      if (results.some((r) => !r.ok)) {
        showToast("Some orders failed. Please try again.");
        btn.disabled = false; btn.textContent = "Checkout →"; return;
      }
    }

    items = [];
    updateBadge();
    renderCartItems();
    closeCart();
    showToast("🎉 Purchase complete! Check your email for download links.");
    btn.disabled   = false;
    btn.textContent = "Checkout →";
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
    licenseModalOverlay.addEventListener("click", closeLicenseModal);
    document.getElementById("license-close-btn").addEventListener("click", closeLicenseModal);
    document.getElementById("checkout-btn").addEventListener("click", checkout);

    // Restore saved cart from Supabase
    if (API.isReady()) {
      const saved = await API.getCart();
      if (saved && saved.length > 0) {
        items = saved.map((row) => ({
          id:          Date.now() + Math.random(),
          beatId:      row.beat_id,
          licenseId:   row.license_id,
          licenseType: row.license_type,
          title:       row.beats?.title || "Beat",
          producer:    row.beats?.profiles?.name || "Producer",
          producerId:  row.beats?.producer_id,
          cover:       row.beats?.cover_url || "",
          licenseName: row.license_type,
          price:       parseFloat(row.price || 0),
        }));
        updateBadge();
      }
    }
  }

  return {
    init, openCart, closeCart, openLicenseModal, closeLicenseModal,
    selectLicense, removeFromCart, showToast,
  };
})();
