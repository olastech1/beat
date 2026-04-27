// js/api.js — BeatMarket frontend API client (Neon backend)
// All data goes through /api/* Vercel Functions

const API = (() => {

  const BASE = ''; // same origin — /api/...

  // ── Session helpers ────────────────────────────────────────────
  function getToken() {
    // JWT stored in localStorage as backup (cookie is primary)
    return localStorage.getItem('bm_token') || null;
  }
  function setToken(t) { if (t) localStorage.setItem('bm_token', t); }
  function clearToken() { localStorage.removeItem('bm_token'); }

  async function apiFetch(path, opts = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...opts.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(BASE + path, { ...opts, headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  // ── Beats ──────────────────────────────────────────────────────
  async function getBeats({ genre, search, featured, limit, producerId } = {}) {
    const p = new URLSearchParams();
    if (genre && genre !== 'All') p.set('genre', genre);
    if (search) p.set('search', search);
    if (featured) p.set('featured', 'true');
    if (limit) p.set('limit', limit);
    if (producerId) p.set('producer_id', producerId);
    try {
      return await apiFetch(`/api/beats?${p}`);
    } catch {
      // Fallback to demo data if API unavailable
      return typeof DEMO_BEATS !== 'undefined' ? DEMO_BEATS : [];
    }
  }

  async function uploadBeat({ title, genre, bpm, key, price, cover_url, audio_url, tags }) {
    return apiFetch('/api/beats', { method: 'POST', body: { title, genre, bpm, key, price, cover_url, audio_url, tags } });
  }

  async function incrementPlays(beatId) {
    try { await apiFetch(`/api/beats?action=plays`, { method: 'POST', body: { beatId } }); }
    catch {}
  }

  // ── Orders ─────────────────────────────────────────────────────
  async function createOrder({ beatId, amount, producerId, licenseType, stripeSessionId }) {
    // Demo beat guard
    const isUUID = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    if (!isUUID(beatId)) return { ok: true }; // demo beat — skip DB
    try {
      await apiFetch('/api/orders', { method: 'POST', body: { beatId, amount, producerId, licenseType, stripeSessionId } });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function getMyOrders() {
    try { return await apiFetch('/api/orders'); }
    catch { return []; }
  }

  async function getSellerOrders() {
    try {
      const data = await apiFetch('/api/seller');
      return data.orders || [];
    } catch { return []; }
  }

  // ── Cart ───────────────────────────────────────────────────────
  async function getCart() {
    try { return await apiFetch('/api/cart'); }
    catch { return []; }
  }

  async function addToCart({ beatId, price }) {
    try { await apiFetch('/api/cart', { method: 'POST', body: { beatId, price } }); }
    catch {}
  }

  async function removeFromCart(beatId) {
    try { await apiFetch('/api/cart', { method: 'DELETE', body: { beatId } }); }
    catch {}
  }

  // ── Profile ────────────────────────────────────────────────────
  async function getProfile() {
    try { return await apiFetch('/api/profile'); }
    catch { return null; }
  }

  async function updateProfile(updates) {
    return apiFetch('/api/profile', { method: 'PUT', body: updates });
  }

  // ── Upload ─────────────────────────────────────────────────────
  async function uploadFile(file, folder = 'uploads') {
    const filename = `${folder}/${Date.now()}-${file.name}`;
    const res = await fetch(`/api/upload?filename=${encodeURIComponent(filename)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: file,
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data.url;
  }

  // ── Admin ──────────────────────────────────────────────────────
  async function getAdminStats() {
    try { return await apiFetch('/api/admin?action=stats'); }
    catch { return { users:0, beats:0, orders:0, revenue:0 }; }
  }

  async function getAdminBeats() {
    try { return await apiFetch('/api/admin?action=beats'); }
    catch { return []; }
  }

  async function approveBeat(id)  { return apiFetch('/api/admin?action=beats', { method: 'PUT', body: { id, status: 'active' } }); }
  async function rejectBeat(id)   { return apiFetch('/api/admin?action=beats', { method: 'PUT', body: { id, status: 'inactive' } }); }
  async function deleteBeat(id)   { return apiFetch('/api/admin?action=beats', { method: 'DELETE', body: { id } }); }

  async function getAdminUsers() {
    try { return await apiFetch('/api/admin?action=users'); }
    catch { return []; }
  }
  async function updateUserStatus(id, status) {
    return apiFetch('/api/admin?action=users', { method: 'PUT', body: { id, status } });
  }

  async function getAdminOrders() {
    try { return await apiFetch('/api/admin?action=orders'); }
    catch { return []; }
  }

  async function getAllPayouts(filter = 'all') {
    try { return await apiFetch(`/api/admin?action=payouts&filter=${filter}`); }
    catch { return []; }
  }

  async function reviewPayout(id, status, note) {
    try {
      const data = await apiFetch('/api/admin?action=payouts', { method: 'PUT', body: { id, status, note } });
      return data;
    } catch (err) { return { ok: false, error: err.message }; }
  }

  async function getPage(slug) {
    try { return await apiFetch(`/api/admin?action=pages&slug=${slug}`); }
    catch { return null; }
  }

  async function savePage(slug, fields) {
    try { return await apiFetch('/api/admin?action=pages', { method: 'POST', body: { slug, ...fields } }); }
    catch (err) { return { ok: false, error: err.message }; }
  }

  async function getSellerStats() {
    try { return await apiFetch('/api/seller'); }
    catch { return { beats:0, revenue:0, sales:0, orders:[] }; }
  }

  // ── Seller beats ───────────────────────────────────────────────
  async function getMyBeats() {
    const session = Auth.getSession();
    if (!session) return [];
    return getBeats({ producerId: session.id });
  }

  // ── Settings ───────────────────────────────────────────────────
  async function saveSetting(key, value) {
    try { await apiFetch('/api/settings', { method: 'POST', body: { key, value } }); }
    catch {}
  }

  async function getSetting(key) {
    try {
      const data = await apiFetch(`/api/settings?key=${key}`);
      return data.value;
    } catch { return null; }
  }

  // isReady — always true with Neon (no Supabase client to check)
  function isReady() { return true; }

  return {
    isReady, getToken, setToken, clearToken,
    getBeats, uploadBeat, incrementPlays,
    createOrder, getMyOrders, getSellerOrders,
    getCart, addToCart, removeFromCart,
    getProfile, updateProfile,
    uploadFile,
    getAdminStats, getAdminBeats, approveBeat, rejectBeat, deleteBeat,
    getAdminUsers, updateUserStatus, getAdminOrders,
    getAllPayouts, reviewPayout,
    getPage, savePage,
    getSellerStats, getMyBeats,
    saveSetting, getSetting,
    // Legacy aliases used in existing code
    getAllOrders: getMyOrders,
    getAllBeats: getBeats,
  };
})();
