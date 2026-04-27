// js/auth.js — BeatMarket Auth (Neon/JWT backend)
// Talks to /api/auth/* Vercel Functions. JWT stored in HttpOnly cookie + localStorage fallback.

const Auth = (() => {

  const SESSION_KEY = 'bm_session';
  const TOKEN_KEY   = 'bm_token';

  function _save(user, token) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    if (token) localStorage.setItem(TOKEN_KEY, token);
  }
  function _clear() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }

  async function _post(path, body) {
    const res  = await fetch(path, {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'include',
      body:        JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, ...data };
  }

  // ── Public API ─────────────────────────────────────────────────

  async function register({ role, name, email, password, handle, genre }) {
    const res = await _post('/api/auth?action=register', { name, email, password, role, handle, genre });
    if (res.ok && res.user) _save(res.user, res.token);
    return res;
  }

  async function login(email, password, expectedRole) {
    const res = await _post('/api/auth?action=login', { email, password, expectedRole });
    if (res.ok && res.user) _save(res.user, res.token);
    return res;
  }

  async function logout() {
    await fetch('/api/auth?action=logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    _clear();
  }

  async function resetPassword(email) {
    return _post('/api/auth?action=reset-password', { email });
  }

  async function updatePassword(email, token, password) {
    return _post('/api/auth?action=update-password', { email, token, password });
  }

  // Sync — reads localStorage cache
  function getSession() {
    const s = localStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s) : null;
  }

  // Async — refreshes from server if needed
  async function getSessionAsync() {
    try {
      const res  = await fetch('/api/auth?action=me', { credentials: 'include' });
      const data = await res.json();
      if (data.ok && data.user) { _save(data.user); return data.user; }
    } catch {}
    return getSession();
  }

  // Sync role guard — redirects if wrong role
  function requireRole(...roles) {
    const s = getSession();
    if (!s || !roles.includes(s.role)) {
      const dest = roles.includes('admin') && !roles.includes('buyer')
        ? 'admin-login.html' : 'login.html';
      window.location.href = dest;
      return null;
    }
    return s;
  }

  // Utilities
  function getInitials(name) {
    return (name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
  function getRoleBadge(role) {
    const map = {
      admin:  { label: 'Admin',  color: '#D97706' },
      seller: { label: 'Seller', color: '#7C3AED' },
      buyer:  { label: 'Buyer',  color: '#10B981' },
    };
    return map[role] || { label: role, color: '#6B7280' };
  }

  // Stubs for backward compat with old Supabase-era code
  function getAllUsers() { return []; }
  function updateUserStatus() {}

  return { register, login, logout, resetPassword, updatePassword, getSession, getSessionAsync, requireRole,
           getInitials, getRoleBadge, getAllUsers, updateUserStatus };
})();
