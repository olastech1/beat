// ─────────────────────────────────────────────────────────────────
//  BeatMarket — Security Module
//  • Login rate limiting (lockout after 5 fails / 15 minutes)
//  • Admin session timeout (60-min inactivity → logout)
//  • DOMPurify helper (sanitize HTML before rendering)
//  • Console self-XSS warning
// ─────────────────────────────────────────────────────────────────

// ══ 1. RATE LIMITING ════════════════════════════════════════════
const RateLimit = (() => {
  const PREFIX  = "bm_rl_";
  const MAX     = 5;
  const WINDOW  = 15 * 60 * 1000; // 15 minutes in ms

  function _get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : { count: 0, locked: false, lockedAt: null };
    } catch { return { count: 0, locked: false, lockedAt: null }; }
  }

  function _save(key, record) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(record)); } catch {}
  }

  // Returns false if not locked, or an error string if locked
  function check(key) {
    const r = _get(key);
    if (!r.locked) return false;
    const elapsed = Date.now() - r.lockedAt;
    if (elapsed >= WINDOW) {
      _save(key, { count: 0, locked: false, lockedAt: null });
      return false;
    }
    const mins = Math.ceil((WINDOW - elapsed) / 60000);
    return `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`;
  }

  // Call after a login attempt. success=true resets the counter.
  // Returns null or a warning string.
  function record(key, success) {
    if (success) {
      _save(key, { count: 0, locked: false, lockedAt: null });
      return null;
    }
    const r = _get(key);
    r.count++;
    if (r.count >= MAX) {
      r.locked  = true;
      r.lockedAt = Date.now();
      _save(key, r);
      return `Too many failed attempts. Account locked for 15 minutes.`;
    }
    _save(key, r);
    const left = MAX - r.count;
    return left <= 2 ? `⚠️ Warning: ${left} attempt${left !== 1 ? "s" : ""} remaining before lockout.` : null;
  }

  // Clear a specific key (used after successful login)
  function clear(key) {
    try { localStorage.removeItem(PREFIX + key); } catch {}
  }

  return { check, record, clear };
})();


// ══ 2. ADMIN SESSION TIMEOUT ════════════════════════════════════
const SessionGuard = (() => {
  const IDLE_MS   = 60 * 60 * 1000; // 60 min idle → logout
  const WARN_MS   = 55 * 60 * 1000; // warn at 55 min
  let   _idleTimer, _warnTimer;

  function _reset() {
    clearTimeout(_idleTimer);
    clearTimeout(_warnTimer);
    const warnEl = document.getElementById("session-warn-banner");
    if (warnEl) warnEl.style.display = "none";

    _warnTimer = setTimeout(() => {
      const el = document.getElementById("session-warn-banner");
      if (el) el.style.display = "flex";
    }, WARN_MS);

    _idleTimer = setTimeout(() => {
      // Force logout
      if (typeof Auth !== "undefined") {
        Auth.logout().then(() => { window.location.href = "admin-login.html?reason=timeout"; });
      } else {
        window.location.href = "admin-login.html?reason=timeout";
      }
    }, IDLE_MS);
  }

  function start() {
    const EVENTS = ["click", "keydown", "mousemove", "touchstart", "scroll"];
    EVENTS.forEach(e => document.addEventListener(e, _reset, { passive: true }));
    _reset(); // start timer immediately

    // Inject warning banner if not present
    if (!document.getElementById("session-warn-banner")) {
      const banner = document.createElement("div");
      banner.id = "session-warn-banner";
      banner.style.cssText = [
        "display:none", "position:fixed", "bottom:80px", "left:50%",
        "transform:translateX(-50%)", "z-index:9999",
        "background:rgba(217,119,6,0.15)", "border:1px solid rgba(217,119,6,0.4)",
        "border-radius:10px", "padding:0.75rem 1.25rem",
        "color:#fbbf24", "font-size:0.82rem", "font-weight:600",
        "display:none", "align-items:center", "gap:0.75rem",
        "backdrop-filter:blur(8px)", "box-shadow:0 4px 20px rgba(0,0,0,0.5)"
      ].join(";");
      banner.innerHTML = `
        ⚠️ Your session will expire soon due to inactivity.
        <button onclick="SessionGuard.extendAndHide()" style="
          background:rgba(217,119,6,0.3);border:1px solid rgba(217,119,6,0.5);
          border-radius:6px;padding:4px 10px;color:#fff;font-size:0.78rem;
          cursor:pointer;font-weight:600">Stay Logged In</button>`;
      document.body.appendChild(banner);
    }
  }

  function extendAndHide() {
    _reset();
  }

  return { start, extendAndHide };
})();


// ══ 3. DOM SANITIZER ════════════════════════════════════════════
const Sanitize = (() => {
  // Uses DOMPurify if loaded, otherwise strips <script> tags as fallback
  function html(dirty) {
    if (typeof DOMPurify !== "undefined") {
      return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: [
          "h1","h2","h3","h4","p","br","hr","ul","ol","li",
          "strong","em","b","i","u","a","blockquote","code","pre",
          "table","thead","tbody","tr","th","td","span","div","small"
        ],
        ALLOWED_ATTR: ["href","target","rel","class","id","style"],
        FORCE_BODY: true,
        ADD_ATTR: ["target"],
      });
    }
    // Fallback: strip script/iframe tags at minimum
    return (dirty || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
      .replace(/on\w+\s*=/gi, "data-removed=")
      .replace(/javascript:/gi, "");
  }

  // Safe text (escapes HTML entities)
  function text(str) {
    const el = document.createElement("div");
    el.textContent = String(str || "");
    return el.innerHTML;
  }

  return { html, text };
})();


// ══ 4. CONSOLE SELF-XSS WARNING ════════════════════════════════
(function consoleWarning() {
  const msg = [
    "%c⛔ STOP! Security Warning",
    "color:#ff4444;font-size:22px;font-weight:900;",
    "\n%cThis browser console is for developers only.\n" +
    "If someone told you to paste code here, it's a SCAM.\n" +
    "Doing so could give attackers full access to your account.",
    "color:#fbbf24;font-size:14px;font-weight:600;line-height:1.8;",
  ];
  console.log(msg[0], msg[1], msg[2], msg[3]);
})();


// ══ 5. URL TAMPER DETECTION ══════════════════════════════════════
// Detect timeout/expired session redirects and show message on login page
(function handleRedirectMessages() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("reason") === "timeout") {
    // Will be picked up by login page script
    sessionStorage.setItem("bm_login_notice", "⏰ Your session expired due to inactivity. Please log in again.");
  }
})();
