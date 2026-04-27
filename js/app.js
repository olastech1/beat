// BeatMarket — Main App Orchestrator (Supabase-enabled)

const App = (() => {
  let allBeats     = [];   // master list from API/mock
  let currentFilter = "All";
  let searchQuery   = "";
  let searchTimer   = null;

  // ── Loading skeleton helper ───────────────────────────────────────
  function skeletonCards(n = 8) {
    return Array.from({ length: n }, () => `
      <div class="beat-card skeleton">
        <div class="beat-card-art" style="background:var(--bg-secondary);border-radius:var(--radius-lg)"></div>
        <div class="beat-card-body">
          <div style="height:14px;width:70%;background:var(--bg-secondary);border-radius:4px;margin-bottom:6px"></div>
          <div style="height:11px;width:45%;background:var(--bg-secondary);border-radius:4px"></div>
        </div>
      </div>`).join("");
  }

  // ── Render Beat Rows ──────────────────────────────────────────────
  function renderTrendingBeats(beats) {
    const container = document.getElementById("trending-list");
    const trending  = beats.filter((b) => b.trending !== false).slice(0, 8);
    container.innerHTML = trending.map((b, i) => renderBeatRow(b, i + 1)).join("");
    attachBeatRowListeners(container, trending);
  }

  function renderAllBeats(beats) {
    const container = document.getElementById("all-beats-grid");
    const filtered  = filterBeats(beats);
    container.innerHTML = filtered.length === 0
      ? `<div class="no-results"><span>🎵</span><p>No beats found</p></div>`
      : filtered.map((b) => renderBeatCard(b)).join("");
    attachBeatCardListeners(container, filtered);
  }

  function filterBeats(beats) {
    return (beats || allBeats).filter((b) => {
      const genreMatch  = currentFilter === "All" || b.genre === currentFilter;
      const q = searchQuery.toLowerCase();
      const searchMatch = !q ||
        b.title.toLowerCase().includes(q) ||
        (b.producer || "").toLowerCase().includes(q) ||
        b.genre.toLowerCase().includes(q) ||
        (b.tags || []).some((t) => t.toLowerCase().includes(q));
      return genreMatch && searchMatch;
    });
  }

  function renderBeatRow(beat, rank) {
    return `
      <div class="beat-row" data-id="${beat.id}">
        <span class="beat-rank">${rank}</span>
        <img src="${beat.cover}" class="beat-row-cover" alt="${beat.title}">
        <button class="beat-play-btn" data-id="${beat.id}" aria-label="Play ${beat.title}">
          <span class="play-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5v14l11-7z"/></svg>
          </span>
        </button>
        <div class="beat-row-info">
          <div class="beat-row-title">${beat.title}</div>
          <div class="beat-row-meta">Prod. by ${beat.producer} · ${beat.bpm} BPM · ${beat.key || ""}</div>
          <div class="beat-row-tags">
            ${(beat.tags||[]).slice(0, 2).map((t) => `<span class="tag">${t}</span>`).join("")}
            <span class="tag genre-tag">${beat.genre}</span>
          </div>
        </div>
        <div class="beat-row-right">
          <div class="beat-price">$${(beat.price||0).toFixed(2)}</div>
          <div class="beat-stats">
            <span>▶ ${formatNumber(beat.plays||0)}</span>
            <span style="color:#EF4444">❤ ${formatNumber(beat.likes||0)}</span>
          </div>
          <button class="btn-add-cart" data-id="${beat.id}">+ Add</button>
        </div>
      </div>`;
  }

  function renderBeatCard(beat) {
    return `
      <div class="beat-card" data-id="${beat.id}">
        <div class="beat-card-art">
          <img src="${beat.cover}" alt="${beat.title}" loading="lazy">
          <div class="beat-card-overlay">
            <button class="beat-play-btn large" data-id="${beat.id}" aria-label="Play ${beat.title}">
              <span class="play-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M8 5v14l11-7z"/></svg>
              </span>
            </button>
          </div>
          <div class="beat-card-genre">${beat.genre}</div>
        </div>
        <div class="beat-card-body">
          <div class="beat-card-title">${beat.title}</div>
          <div class="beat-card-producer">Prod. by ${beat.producer}</div>
          <div class="beat-card-bpm">${beat.bpm} BPM · ${beat.key || ""}</div>
          <div class="beat-card-footer">
            <span class="beat-price">$${(beat.price||0).toFixed(2)}</span>
            <span style="font-size:0.75rem;color:rgba(239,68,68,0.7);font-weight:600">❤ ${formatNumber(beat.likes||0)}</span>
            <button class="btn-add-cart-card" data-id="${beat.id}">+ Add</button>
          </div>
        </div>
      </div>`;
  }

  function findBeat(id) {
    return allBeats.find((b) => String(b.id) === String(id));
  }

  function attachBeatRowListeners(container, beats) {
    container.querySelectorAll(".beat-play-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const beat = findBeat(btn.dataset.id);
        if (beat) { Player.loadBeat(beat, beats); API.incrementPlays(beat.id); }
      });
    });
    container.querySelectorAll(".btn-add-cart").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const beat = findBeat(btn.dataset.id);
        if (beat) Cart.openLicenseModal(beat);
      });
    });
    container.querySelectorAll(".beat-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (!e.target.closest("button")) {
          const beat = findBeat(row.dataset.id);
          if (beat) { Player.loadBeat(beat, beats); API.incrementPlays(beat.id); }
        }
      });
    });
  }

  function attachBeatCardListeners(container, beats) {
    container.querySelectorAll(".beat-play-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const beat = findBeat(btn.dataset.id);
        if (beat) { Player.loadBeat(beat, beats); API.incrementPlays(beat.id); }
      });
    });
    container.querySelectorAll(".btn-add-cart-card").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const beat = findBeat(btn.dataset.id);
        if (beat) Cart.openLicenseModal(beat);
      });
    });
  }

  // ── Genre Filter ──────────────────────────────────────────────────
  function renderGenreFilters() {
    const GENRES = ["All","Trap","Drill","Lo-Fi","Rage","Afrobeats","R&B"];
    const container = document.getElementById("genre-filters");
    container.innerHTML = GENRES.map((g) =>
      `<button class="genre-pill ${g==="All"?"active":""}" data-genre="${g}">${g}</button>`
    ).join("");

    container.querySelectorAll(".genre-pill").forEach((pill) => {
      pill.addEventListener("click", async () => {
        document.querySelectorAll(".genre-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        currentFilter = pill.dataset.genre;

        // If Supabase, fetch filtered from DB; otherwise filter in memory
        if (API.isReady()) {
          const grid = document.getElementById("all-beats-grid");
          grid.innerHTML = skeletonCards();
          const beats = await API.getBeats({ genre: currentFilter });
          allBeats = beats;
          renderAllBeats(beats);
        } else {
          renderAllBeats();
        }

        document.getElementById("all-beats-section").scrollIntoView({ behavior:"smooth", block:"start" });
      });
    });
  }

  // ── Producers ─────────────────────────────────────────────────────
  async function renderProducers() {
    const container = document.getElementById("producers-grid");
    const producers = await API.getProducers(12);

    if (!producers || producers.length === 0) {
      container.innerHTML = "<p style='color:var(--text-muted)'>No producers found.</p>";
      return;
    }

    container.innerHTML = producers.map((p) => {
      // Supabase profile shape vs. mock shape
      const name     = p.name;
      const handle   = p.handle  || `@${name.toLowerCase().replace(/\s+/g,"")}`;
      const genre    = p.genre   || "Various";
      const avatar   = p.avatar_url || p.avatar || null;
      const followers= p.stats?.followers || 0;
      const beats    = p.stats?.beats || 0;
      const verified = p.verified !== false;

      return `
        <div class="producer-card">
          <div class="producer-avatar-wrap">
            ${avatar
              ? `<img src="${avatar}" class="producer-avatar" alt="${name}">`
              : `<div class="producer-avatar" style="background:linear-gradient(135deg,#7C3AED,#9B59FF);display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:800;color:#fff">${Auth.getInitials(name)}</div>`
            }
            ${verified ? '<span class="verified-badge" title="Verified">✓</span>' : ""}
          </div>
          <div class="producer-name">${name}</div>
          <div class="producer-handle">${handle}</div>
          <div class="producer-genre">${genre}</div>
          <div class="producer-stats">
            <span><strong>${formatNumber(followers)}</strong> followers</span>
            <span><strong>${beats}</strong> beats</span>
          </div>
          <button class="btn-follow">Follow</button>
        </div>`;
    }).join("");

    container.querySelectorAll(".btn-follow").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("following");
        btn.textContent = btn.classList.contains("following") ? "Following ✓" : "Follow";
      });
    });
  }

  // ── Search ────────────────────────────────────────────────────────
  function setupSearch() {
    const searchInput = document.getElementById("search-input");
    const searchClear = document.getElementById("search-clear");

    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim();
      searchClear.classList.toggle("visible", searchQuery.length > 0);

      clearTimeout(searchTimer);
      if (API.isReady()) {
        // Debounce Supabase queries
        searchTimer = setTimeout(async () => {
          const grid = document.getElementById("all-beats-grid");
          grid.innerHTML = skeletonCards();
          const beats = await API.getBeats({ genre: currentFilter, search: searchQuery });
          allBeats = beats;
          renderAllBeats(beats);
          document.getElementById("all-beats-section").scrollIntoView({ behavior:"smooth", block:"start" });
        }, 350);
      } else {
        renderAllBeats();
        if (searchQuery) {
          document.getElementById("all-beats-section").scrollIntoView({ behavior:"smooth", block:"start" });
        }
      }
    });

    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      searchQuery = "";
      searchClear.classList.remove("visible");
      renderAllBeats();
      searchInput.focus();
    });

    document.getElementById("search-form").addEventListener("submit", (e) => e.preventDefault());
  }

  // ── Nav & Scroll ──────────────────────────────────────────────────
  function setupNav() {
    const sections = ["hero","trending","explore","producers"];
    const navLinks = document.querySelectorAll(".nav-link[data-section]");

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          navLinks.forEach((l) => l.classList.remove("active"));
          const link = document.querySelector(`.nav-link[data-section="${entry.target.id}"]`);
          if (link) link.classList.add("active");
        }
      });
    }, { threshold: 0.3 });

    sections.forEach((id) => { const el = document.getElementById(id); if (el) observer.observe(el); });
    navLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const el = document.getElementById(link.dataset.section);
        if (el) el.scrollIntoView({ behavior:"smooth" });
      });
    });

    document.getElementById("navbar") && window.addEventListener("scroll", () => {
      document.getElementById("navbar").classList.toggle("scrolled", window.scrollY > 40);
    });

    const mobileBtn = document.getElementById("mobile-menu-btn");
    const mobileNav = document.getElementById("mobile-nav");
    if (mobileBtn && mobileNav) {
      mobileBtn.addEventListener("click", () => {
        mobileNav.classList.toggle("open");
        mobileBtn.classList.toggle("open");
      });
      // Close mobile nav when a link is clicked
      mobileNav.querySelectorAll("a, button").forEach(el => {
        el.addEventListener("click", () => {
          mobileNav.classList.remove("open");
          mobileBtn.classList.remove("open");
        });
      });
    }

    // Sync mobile nav auth state
    const mobileAuthOut = document.getElementById("mobile-nav-auth-out");
    const mobileAuthIn  = document.getElementById("mobile-nav-auth-in");
    if (mobileAuthOut && mobileAuthIn) {
      const sess = Auth.getSession();
      if (sess) {
        mobileAuthOut.style.display = "none";
        mobileAuthIn.style.display  = "flex";
        mobileAuthIn.style.flexDirection = "column";
        mobileAuthIn.style.gap = "0.25rem";
        const dashLink = document.getElementById("mobile-nav-dashboard");
        if (dashLink) {
          dashLink.href = sess.role === "admin" ? "admin.html" : sess.role === "seller" ? "seller.html" : "index.html";
          dashLink.textContent = "📊 " + (sess.name || "Dashboard");
        }
        const logoutBtn = document.getElementById("mobile-nav-logout");
        if (logoutBtn) {
          logoutBtn.addEventListener("click", async () => {
            await Auth.logout();
            window.location.reload();
          });
        }
      }
    }
  }

  // ── Counter animation ─────────────────────────────────────────────
  function animateCounters() {
    document.querySelectorAll("[data-count]").forEach((el) => {
      const target = parseInt(el.dataset.count);
      let current = 0;
      const step = target / 60;
      const timer = setInterval(() => {
        current += step;
        if (current >= target) { current = target; clearInterval(timer); }
        el.textContent = formatNumber(Math.floor(current));
      }, 16);
    });
  }

  // ── Hero Tags ─────────────────────────────────────────────────────
  function setupHeroTags() {
    document.querySelectorAll(".hero-tag").forEach((tag) => {
      tag.addEventListener("click", () => {
        const genre = tag.dataset.genre;
        document.getElementById("search-input").value = genre;
        searchQuery = genre;
        currentFilter = "All";
        document.querySelectorAll(".genre-pill").forEach((p) => p.classList.toggle("active", p.dataset.genre === "All"));
        renderAllBeats();
        document.getElementById("all-beats-section").scrollIntoView({ behavior:"smooth" });
      });
    });
  }

  // ── Main init ─────────────────────────────────────────────────────
  async function init() {
    // Show skeletons while loading
    document.getElementById("all-beats-grid").innerHTML   = skeletonCards(12);
    document.getElementById("trending-list").innerHTML    = skeletonCards(6);

    // Fetch beats (from Supabase or mock fallback)
    allBeats = await API.getBeats();

    renderTrendingBeats(allBeats);
    renderGenreFilters();
    renderAllBeats(allBeats);
    renderProducers();
    setupSearch();
    setupNav();
    setupHeroTags();
    Player.init();
    Cart.init();

    // ── Auto-add beat from discover ?buybeat=ID ───────────────────────
    const buyBeatId = new URLSearchParams(window.location.search).get('buybeat');
    if (buyBeatId) {
      const beat = allBeats.find(b => String(b.id) === String(buyBeatId));
      if (beat) {
        // Small delay so Cart.init() finishes loading Supabase cart first
        setTimeout(() => {
          Cart.addToCart(beat);
          Cart.openCart();
        }, 600);
      }
      // Clean the URL so refreshing doesn't re-add
      history.replaceState({}, '', window.location.pathname);
    }

    setTimeout(animateCounters, 600);


    // Show Supabase config warning banner if not configured
    if (!API.isReady()) {
      const banner = document.createElement("div");
      banner.id = "sb-banner";
      banner.innerHTML = `
        <div style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;background:linear-gradient(135deg,#D97706,#EA580C);color:#fff;padding:0.65rem 1.25rem;border-radius:var(--radius-pill);font-size:0.8rem;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,0.4);display:flex;align-items:center;gap:0.6rem;max-width:90vw">
          ⚠️ <span>Supabase not configured — running with demo data. <a href="js/supabase.js" style="color:#fff;text-decoration:underline">Add your keys →</a></span>
          <button onclick="this.parentElement.parentElement.remove()" style="margin-left:0.5rem;font-size:1rem;color:#fff;opacity:0.8">✕</button>
        </div>`;
      document.body.appendChild(banner);
    }
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
