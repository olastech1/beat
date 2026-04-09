// ─────────────────────────────────────────────────────────────────
//  BeatMarket — Auth Module
//
//  When Supabase IS configured (js/supabase.js has real keys):
//    → uses Supabase Auth (email/password, sessions, profiles table)
//
//  When Supabase is NOT yet configured (placeholder keys):
//    → falls back to localStorage-based mock auth (original behaviour)
//    → all existing demo accounts still work
// ─────────────────────────────────────────────────────────────────

const Auth = (() => {

  // ════════════════════════════════════════════════════════════
  //  MOCK / FALLBACK (localStorage)
  //  Used when Supabase keys haven't been added yet
  // ════════════════════════════════════════════════════════════
  const USERS_KEY   = "bm_users";
  const SESSION_KEY = "bm_session";

  const SEED_USERS = [
    // Only admin retained for emergency local fallback.
    // All real users are managed via Supabase Auth.
    { id:"u_admin", role:"admin", name:"Admin", email:"admin@beatmarket.com", password:"admin123", avatar:null, status:"active", createdAt:"2025-01-01T00:00:00Z" },
  ];

  function _getUsers() {
    const s = localStorage.getItem(USERS_KEY);
    if (!s) { localStorage.setItem(USERS_KEY, JSON.stringify(SEED_USERS)); return [...SEED_USERS]; }
    return JSON.parse(s);
  }
  function _saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
  function _hash(pw) {
    let h = 0;
    for (let i = 0; i < pw.length; i++) h = (Math.imul(31, h) + pw.charCodeAt(i)) | 0;
    return "hashed_" + Math.abs(h).toString(36);
  }
  function _setLocalSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id:user.id, role:user.role, name:user.name, email:user.email, avatar:user.avatar, handle:user.handle||null }));
  }

  // ════════════════════════════════════════════════════════════
  //  SUPABASE AUTH
  // ════════════════════════════════════════════════════════════

  // Build the callback URL for email verification / password reset
  function _getCallbackUrl() {
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      return window.location.origin + "/oauth-callback.html";
    }
    return "http://192.168.1.93:8080/oauth-callback.html";
  }

  // Register a new user via Supabase Auth
  async function _sbRegister({ role, name, email, password, handle, genre }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role, handle: handle || null, genre: genre || null },
        emailRedirectTo: _getCallbackUrl(),
      },
    });
    if (error) return { ok: false, error: error.message };

    // Profile row is auto-created by the DB trigger (handle_new_user)
    // For sellers, update extra fields
    if (role === "seller" && data.user) {
      await supabase.from("profiles").update({ handle, genre, role: "seller" }).eq("id", data.user.id);
    }
    return { ok: true, user: data.user };
  }

  // Sign in via Supabase Auth
  async function _sbLogin(email, password, expectedRole) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };

    const user = data.user;

    // Fetch profile with a 5s timeout — fall back to user_metadata if DB is slow
    let profile = null;
    try {
      const profilePromise = supabase
        .from("profiles")
        .select("id, role, name, status, avatar_url, handle")
        .eq("id", user.id)
        .single();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 5000)
      );

      const result = await Promise.race([profilePromise, timeoutPromise]);
      profile = result.data || null;
    } catch (_) {
      // Timed out or errored — build profile from user_metadata as fallback
      const m = user.user_metadata || {};
      profile = {
        id:         user.id,
        role:       m.role || "buyer",
        name:       m.name || email.split("@")[0],
        status:     "active",
        avatar_url: null,
        handle:     null,
      };
    }

    if (!profile) {
      // Last resort: build minimal profile
      profile = { id: user.id, role: "buyer", name: email.split("@")[0], status: "active" };
    }

    // Check role
    if (expectedRole && profile.role !== expectedRole) {
      await supabase.auth.signOut();
      return { ok: false, error: `This account is not registered as a ${expectedRole}.` };
    }
    if (profile.status === "banned") {
      await supabase.auth.signOut();
      return { ok: false, error: "This account has been suspended." };
    }

    // Store session in localStorage so getSession() works synchronously
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id:     user.id,
      role:   profile.role,
      name:   profile.name,
      email:  user.email,
      avatar: profile.avatar_url || null,
      handle: profile.handle || null,
    }));

    return { ok: true, user, profile };
  }

  // Get current Supabase session + profile
  async function _sbGetSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    // Try profile fetch with timeout
    let profile = null;
    try {
      const profilePromise = supabase
        .from("profiles")
        .select("id, role, name, status, avatar_url, handle")
        .eq("id", session.user.id)
        .single();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 5000)
      );

      const result = await Promise.race([profilePromise, timeoutPromise]);
      profile = result.data || null;
    } catch (_) {
      // Fall back to cached localStorage session
      const cached = localStorage.getItem(SESSION_KEY);
      if (cached) return JSON.parse(cached);
    }

    if (!profile) return null;

    const sess = {
      id:     session.user.id,
      email:  session.user.email,
      role:   profile.role,
      name:   profile.name,
      avatar: profile.avatar_url,
      handle: profile.handle,
    };

    // Keep localStorage in sync
    localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
    return sess;
  }


  // ════════════════════════════════════════════════════════════
  //  UNIFIED PUBLIC API
  //  Each function checks `window._supabaseReady` and routes
  //  to either Supabase or the localStorage fallback.
  // ════════════════════════════════════════════════════════════

  async function register({ role, name, email, password, handle, genre }) {
    if (window._supabaseReady) return _sbRegister({ role, name, email, password, handle, genre });

    // localStorage fallback
    const users = _getUsers();
    if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, error: "An account with this email already exists." };
    }
    if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };

    const newUser = { id:"u_"+Date.now(), role, name, email:email.toLowerCase(),
      password:_hash(password), avatar:null, status:"active", createdAt:new Date().toISOString(),
      ...(role==="seller"?{handle:handle||"@"+name.toLowerCase().replace(/\s+/g,""),genre:genre||"Trap",bio:"",stats:{revenue:0,sales:0,followers:0,beats:0}}:{}),
      ...(role==="buyer"?{purchases:[]}:{}) };
    users.push(newUser);
    _saveUsers(users);
    _setLocalSession(newUser);
    return { ok: true, user: newUser };
  }

  async function login(email, password, expectedRole) {
    if (window._supabaseReady) return _sbLogin(email, password, expectedRole);

    // localStorage fallback
    const users = _getUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return { ok: false, error: "No account found with this email." };
    const pwMatch = user.password === password || user.password === _hash(password);
    if (!pwMatch) return { ok: false, error: "Incorrect password." };
    if (expectedRole && user.role !== expectedRole) {
      return { ok: false, error: `This account is not a ${expectedRole} account.` };
    }
    if (user.status === "banned") return { ok: false, error: "This account has been suspended." };
    _setLocalSession(user);
    return { ok: true, user };
  }

  async function logout() {
    if (window._supabaseReady) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem(SESSION_KEY);
  }

  // Returns session synchronously from cache (localStorage) or null
  // For Supabase, use getSessionAsync() instead
  function getSession() {
    const s = localStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s) : null;
  }

  // Async version: refreshes from Supabase if configured
  async function getSessionAsync() {
    if (window._supabaseReady) return _sbGetSession();
    return getSession();
  }

  // Sync role guard — redirects if wrong role
  function requireRole(...roles) {
    const session = getSession();
    if (!session || !roles.includes(session.role)) {
      // Admin pages go to dedicated admin login
      const dest = roles.includes("admin") && !roles.includes("buyer") ? "admin-login.html" : "login.html";
      window.location.href = dest;
      return null;
    }
    return session;
  }

  // ── Supabase auth state listener ─────────────────────────────
  // When running with Supabase, sync session to localStorage cache
  // so the rest of the app can use getSession() synchronously
  if (window._supabaseReady) {
    // Fix: clear stale non-UUID sessions from pre-Supabase era
    const _stale = localStorage.getItem(SESSION_KEY);
    if (_stale) {
      try {
        const _parsed = JSON.parse(_stale);
        // Non-UUID IDs (e.g. 'u_admin', 'u_1234567') cause Supabase FK errors
        const _isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(_parsed?.id || "");
        if (!_isUUID) { localStorage.removeItem(SESSION_KEY); }
      } catch { localStorage.removeItem(SESSION_KEY); }
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        // Try to get profile with a short timeout — never block on this
        let profile = null;
        try {
          const result = await Promise.race([
            supabase.from("profiles").select("id,role,name,status,avatar_url,handle").eq("id", session.user.id).single(),
            new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 4000))
          ]);
          profile = result.data || null;
        } catch (_) { /* timed out — use metadata fallback */ }

        const m = session.user.user_metadata || {};
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          id:     session.user.id,
          email:  session.user.email,
          role:   profile?.role   || m.role   || "buyer",
          name:   profile?.name   || m.name   || session.user.email.split("@")[0],
          avatar: profile?.avatar_url || null,
          handle: profile?.handle || null,
        }));
      } else if (event === "SIGNED_OUT") {
        localStorage.removeItem(SESSION_KEY);
      }
    });
  }

  // ── Admin helpers ────────────────────────────────────────────
  function getAllUsers() { return _getUsers(); }
  function updateUserStatus(userId, status) {
    const users = _getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx !== -1) { users[idx].status = status; _saveUsers(users); }
  }

  // ── Utilities ─────────────────────────────────────────────────
  function getInitials(name) {
    return (name || "U").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0,2);
  }
  function getRoleBadge(role) {
    const map = { admin:{label:"Admin",color:"#D97706"}, seller:{label:"Seller",color:"#7C3AED"}, buyer:{label:"Buyer",color:"#10B981"} };
    return map[role] || { label:role, color:"#6B7280" };
  }

  return { register, login, logout, getSession, getSessionAsync, requireRole, getAllUsers, updateUserStatus, getInitials, getRoleBadge };
})();
