// ─────────────────────────────────────────────────────────────────
//  BeatMarket — API Module
//  All data access goes through here. Uses the global `supabase`
//  client from js/supabase.js. Falls back to mock data when
//  Supabase is not yet configured (SUPABASE_URL is placeholder).
// ─────────────────────────────────────────────────────────────────

const API = (() => {

  // ── Helper: check if Supabase is configured ──────────────────
  function isReady() {
    return window._supabaseReady === true;
  }

  // ── Helper: get storage public URL ───────────────────────────
  function storageUrl(bucket, path) {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return `${supabase.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  }

  // ── Helper: map DB beat row to app-compatible object ─────────
  function mapBeat(row) {
    return {
      id:       row.id,
      title:    row.title,
      producer: row.profiles?.name || "Unknown",
      producerId: row.producer_id,
      genre:    row.genre,
      bpm:      row.bpm,
      key:      row.key,
      price:    parseFloat(row.price),
      cover:    row.cover_url || "assets/covers/default.jpg",
      audio:    row.audio_url || null,
      tags:     row.tags || [],
      plays:    row.plays || 0,
      likes:    row.likes_count || row.likes || 0,
      status:   row.status,
      featured: row.featured || false,
    };
  }

  // ── Cache helpers ──────────────────────────────────────────
  const CACHE_TTL = 90_000; // 90 seconds

  function _cacheKey(tag, params) {
    try { return 'bm_' + tag + '_' + JSON.stringify(params); }
    catch { return 'bm_' + tag; }
  }

  function _getCached(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      return (Date.now() - ts < CACHE_TTL) ? data : null;
    } catch { return null; }
  }

  function _setCache(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); }
    catch {} // ignore QuotaExceededError
  }

  function clearBeatsCache() {
    Object.keys(localStorage)
      .filter(k => k.startsWith('bm_beats_'))
      .forEach(k => localStorage.removeItem(k));
  }

  // ════════════════════════════════════════════════════════════
  //  BEATS
  // ════════════════════════════════════════════════════════════

  // Internal fetch (no cache)
  async function _fetchBeats({ genre, search, producerId, limit = 40, featured } = {}) {
    let query = supabase
      .from("beats")
      .select("*, profiles(name, avatar_url, handle)")
      .eq("status", "active")
      .order("plays", { ascending: false })
      .limit(limit);

    if (genre && genre !== "All")   query = query.eq("genre", genre);
    if (producerId)                  query = query.eq("producer_id", producerId);
    if (featured)                    query = query.eq("featured", true);
    if (search) {
      query = query.or(`title.ilike.%${search}%,genre.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) { console.error("getBeats:", error); return []; }
    return (data || []).map(mapBeat);
  }

  // Public: stale-while-revalidate — instant on return visits
  async function getBeats(options = {}) {
    // Not connected to Supabase — use demo data
    if (!isReady()) return _applyFilters(typeof BEATS !== "undefined" ? BEATS : [], options);

    const key = _cacheKey('beats', options);
    const cached = _getCached(key);

    // Only use cache if it actually has data — never serve empty results
    if (cached && cached.length > 0) {
      // Return stale instantly, refresh in background
      _fetchBeats(options).then(fresh => {
        if (fresh.length) _setCache(key, fresh);
        // else cache stays valid (Supabase might be temporarily empty)
      });
      return cached;
    }

    // Fetch live from Supabase
    const fresh = await _fetchBeats(options);

    // If Supabase returned beats, cache and return them
    if (fresh.length) {
      _setCache(key, fresh);
      return fresh;
    }

    // Supabase has no active beats yet — show demo data so site isn't empty
    console.info('BeatMarket: No active beats in DB, showing demo catalog.');
    const demo = typeof BEATS !== "undefined" ? BEATS : [];
    return _applyFilters(demo, options);
  }

  // Apply genre/search filters to demo data (mirrors Supabase filters)
  function _applyFilters(beats, { genre, search, featured, limit = 40 } = {}) {
    let results = beats.filter(b => b.status === 'active');
    if (genre && genre !== 'All') results = results.filter(b => b.genre === genre);
    if (featured) results = results.filter(b => b.featured);
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.genre.toLowerCase().includes(q) ||
        b.producer.toLowerCase().includes(q)
      );
    }
    return results.slice(0, limit);
  }

  async function getBeat(id) {
    if (!isReady()) {
      return typeof BEATS !== "undefined" ? BEATS.find((b) => b.id === id) : null;
    }
    const { data, error } = await supabase
      .from("beats")
      .select("*, profiles(name, avatar_url, handle)")
      .eq("id", id)
      .single();
    if (error) { console.error("getBeat:", error); return null; }
    return mapBeat(data);
  }

  async function incrementPlays(beatId) {
    if (!isReady()) return;
    await supabase.rpc("increment_plays", { beat_id: beatId });
  }

  // ── Seller: get own beats ────────────────────────────────────
  async function getMyBeats() {
    if (!isReady()) return typeof BEATS !== "undefined" ? BEATS.slice(0, 5) : [];
    const session = await Auth.getSession();
    if (!session) return [];

    const { data, error } = await supabase
      .from("beats")
      .select("*")
      .eq("producer_id", session.id)
      .order("created_at", { ascending: false });

    if (error) { console.error("getMyBeats:", error); return []; }
    return (data || []).map(mapBeat);
  }

  // ── Upload a beat (cover art + audio + metadata) ─────────────
  async function uploadBeat({ title, genre, bpm, key, price, tags, description, coverFile, audioFile }) {
    if (!isReady()) {
      return { ok: false, error: "Supabase not configured. Add your keys to js/supabase.js." };
    }
    const session = await Auth.getSession();
    if (!session) return { ok: false, error: "Not authenticated." };

    const slug = `${session.id}/${Date.now()}`;

    // Upload cover art
    let cover_url = null;
    if (coverFile) {
      const ext = coverFile.name.split(".").pop();
      const { data: coverData, error: coverErr } = await supabase.storage
        .from("covers")
        .upload(`${slug}.${ext}`, coverFile, { upsert: true });
      if (coverErr) return { ok: false, error: "Cover upload failed: " + coverErr.message };
      cover_url = storageUrl("covers", coverData.path);
    }

    // Upload audio file
    let audio_url = null;
    if (audioFile) {
      const ext = audioFile.name.split(".").pop();
      const { data: audioData, error: audioErr } = await supabase.storage
        .from("audio")
        .upload(`${slug}.${ext}`, audioFile, { upsert: true });
      if (audioErr) return { ok: false, error: "Audio upload failed: " + audioErr.message };
      audio_url = storageUrl("audio", audioData.path);
    }

    // Insert beat row
    const { data: beat, error: beatErr } = await supabase
      .from("beats")
      .insert({
        producer_id: session.id,
        title,
        genre,
        bpm: parseInt(bpm) || null,
        key,
        price: parseFloat(price) || 0,
        tags: Array.isArray(tags) ? tags : (tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : []),
        description,
        cover_url,
        audio_url,
        status: "active",
      })
      .select()
      .single();

    if (beatErr) return { ok: false, error: beatErr.message };

    // Create default license tiers
    await supabase.from("licenses").insert([
      { beat_id: beat.id, type: "mp3",       label: "Basic MP3",       price: parseFloat(price),           features: ["MP3 Lease","50K streams","Non-exclusive"] },
      { beat_id: beat.id, type: "wav",       label: "Premium WAV",     price: parseFloat(price) * 2,       features: ["WAV + MP3","500K streams","Non-exclusive"] },
      { beat_id: beat.id, type: "unlimited", label: "Unlimited Use",   price: parseFloat(price) * 4,       features: ["WAV + MP3","Unlimited streams","Non-exclusive"] },
      { beat_id: beat.id, type: "exclusive", label: "Exclusive Rights", price: parseFloat(price) * 12,     features: ["Exclusive","WAV + Stems","Beat removed from store"] },
    ]);

    return { ok: true, beat };
  }

  // ── Admin: get all beats (any status) ───────────────────────
  async function getAllBeats(search) {
    if (!isReady()) return typeof BEATS !== "undefined" ? BEATS : [];
    let query = supabase
      .from("beats")
      .select("*, profiles(name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (search) query = query.ilike("title", `%${search}%`);
    const { data, error } = await query;
    if (error) { console.error("getAllBeats:", error); return []; }
    return (data || []).map(mapBeat);
  }

  async function updateBeatStatus(beatId, status) {
    if (!isReady()) return;
    await supabase.from("beats").update({ status }).eq("id", beatId);
  }

  // ════════════════════════════════════════════════════════════
  //  LICENSES
  // ════════════════════════════════════════════════════════════

  async function getLicenses(beatId) {
    if (!isReady()) {
      // Return mock licenses based on beat price
      const beat = typeof BEATS !== "undefined" ? BEATS.find((b) => b.id == beatId) : null;
      const p = beat ? beat.price : 29.99;
      return [
        { id: "l1", type: "mp3",       label: "Basic MP3",       price: p,        features: ["MP3 Lease","50K streams","Non-exclusive"] },
        { id: "l2", type: "wav",       label: "Premium WAV",     price: p*2,      features: ["WAV + MP3","500K streams","Non-exclusive"] },
        { id: "l3", type: "unlimited", label: "Unlimited Use",   price: p*4,      features: ["WAV + MP3","Unlimited streams","Non-exclusive"] },
        { id: "l4", type: "exclusive", label: "Exclusive Rights", price: p*12,    features: ["Exclusive","WAV + Stems","Beat removed"] },
      ];
    }
    const { data, error } = await supabase
      .from("licenses")
      .select("*")
      .eq("beat_id", beatId)
      .order("price");
    if (error) { console.error("getLicenses:", error); return []; }
    return data || [];
  }

  // ════════════════════════════════════════════════════════════
  //  ORDERS
  // ════════════════════════════════════════════════════════════

  async function createOrder({ beatId, licenseId, licenseType, amount, producerId }) {
    if (!isReady()) {
      console.log("Mock order created:", { beatId, licenseType, amount });
      return { ok: true };
    }
    const session = await Auth.getSession();
    if (!session) return { ok: false, error: "Not logged in." };

    const { error } = await supabase.from("orders").insert({
      buyer_id: session.id,
      beat_id: beatId,
      license_id: licenseId || null,
      producer_id: producerId,
      amount,
      license_type: licenseType,
      status: "completed",
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function getMyOrders() {
    if (!isReady()) return [];
    const session = await Auth.getSession();
    if (!session) return [];
    const { data, error } = await supabase
      .from("orders")
      .select("*, beats(title, cover_url)")
      .eq("buyer_id", session.id)
      .order("created_at", { ascending: false });
    if (error) { console.error("getMyOrders:", error); return []; }
    return data || [];
  }

  async function getSellerOrders() {
    if (!isReady()) return [];
    const session = await Auth.getSession();
    if (!session) return [];
    const { data, error } = await supabase
      .from("orders")
      .select("*, beats(title), profiles!buyer_id(name)")
      .eq("producer_id", session.id)
      .order("created_at", { ascending: false });
    if (error) { console.error("getSellerOrders:", error); return []; }
    return data || [];
  }

  async function getAllOrders() {
    if (!isReady()) return [];
    const { data, error } = await supabase
      .from("orders")
      .select("*, beats(title), profiles!buyer_id(name), profiles!producer_id(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { console.error("getAllOrders:", error); return []; }
    return data || [];
  }

  // ════════════════════════════════════════════════════════════
  //  CART
  // ════════════════════════════════════════════════════════════

  async function getCart() {
    if (!isReady()) return null; // handled by cart.js localStorage
    const session = await Auth.getSession();
    if (!session) return null;

    const { data, error } = await supabase
      .from("cart_items")
      .select("*, beats(title, cover_url, price, producer_id, profiles(name))")
      .eq("user_id", session.id);
    if (error) { console.error("getCart:", error); return null; }
    return data || [];
  }

  async function addToCart({ beatId, licenseId, licenseType, price }) {
    if (!isReady()) return { ok: false }; // cart.js uses its own localStorage
    const session = await Auth.getSession();
    if (!session) return { ok: false, error: "Not logged in." };

    const { error } = await supabase.from("cart_items").upsert({
      user_id: session.id,
      beat_id: beatId,
      license_id: licenseId || null,
      license_type: licenseType,
      price,
    }, { onConflict: "user_id,beat_id" });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function removeFromCart(beatId) {
    if (!isReady()) return;
    const session = await Auth.getSession();
    if (!session) return;
    await supabase.from("cart_items").delete()
      .eq("user_id", session.id)
      .eq("beat_id", beatId);
  }

  // ════════════════════════════════════════════════════════════
  //  PRODUCERS / PROFILES
  // ════════════════════════════════════════════════════════════

  async function getProducers(limit = 12) {
    if (!isReady()) return typeof PRODUCERS !== "undefined" ? PRODUCERS : [];
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "seller")
      .eq("status", "active")
      .limit(limit);
    if (error) { console.error("getProducers:", error); return []; }
    return data || [];
  }

  async function getAllUsers() {
    if (!isReady()) return typeof Auth !== "undefined" ? Auth.getAllUsers() : [];
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { console.error("getAllUsers:", error); return []; }
    return data || [];
  }

  async function updateUserStatus(userId, status) {
    if (!isReady()) { Auth.updateUserStatus(userId, status); return; }
    await supabase.from("profiles").update({ status }).eq("id", userId);
  }

  // ════════════════════════════════════════════════════════════
  //  STATS
  // ════════════════════════════════════════════════════════════

  async function getSellerStats() {
    if (!isReady()) {
      return { revenue: 18420, sales: 312, beats: 87, followers: 42100 };
    }
    const session = await Auth.getSession();
    if (!session) return {};

    const [ordersRes, beatsRes] = await Promise.all([
      supabase.from("orders").select("amount").eq("producer_id", session.id),
      supabase.from("beats").select("id", { count: "exact" }).eq("producer_id", session.id).eq("status", "active"),
    ]);

    const revenue = (ordersRes.data || []).reduce((sum, r) => sum + parseFloat(r.amount), 0);
    return {
      revenue: revenue.toFixed(2),
      sales: ordersRes.data?.length || 0,
      beats: beatsRes.count || 0,
    };
  }

  async function getAdminStats() {
    if (!isReady()) {
      return { users: 3, sellers: 1, beats: 20, orders: 8, revenue: 48000 };
    }
    const [usersRes, beatsRes, ordersRes] = await Promise.all([
      supabase.from("profiles").select("id, role", { count: "exact" }),
      supabase.from("beats").select("id", { count: "exact" }).eq("status", "active"),
      supabase.from("orders").select("amount"),
    ]);

    const revenue = (ordersRes.data || []).reduce((sum, r) => sum + parseFloat(r.amount), 0);
    const sellers = (usersRes.data || []).filter((u) => u.role === "seller").length;

    return {
      users:   usersRes.count || 0,
      sellers,
      beats:   beatsRes.count || 0,
      orders:  ordersRes.data?.length || 0,
      revenue: revenue.toFixed(2),
    };
  }

  // ════════════════════════════════════════════════════════════
  //  PAYOUT REQUESTS
  // ════════════════════════════════════════════════════════════

  async function requestPayout({ amount, method, paymentDetails }) {
    if (!isReady()) return { ok: false, error: "Supabase not configured." };
    const session = await Auth.getSession();
    if (!session) return { ok: false, error: "Not logged in." };
    const { error } = await supabase.from("payout_requests").insert({
      seller_id:       session.id,
      amount:          parseFloat(amount),
      method:          method || "paypal",
      payment_details: paymentDetails || "",
      status:          "pending",
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function getMyPayouts() {
    if (!isReady()) return [];
    const session = await Auth.getSession();
    if (!session) return [];
    const { data, error } = await supabase
      .from("payout_requests")
      .select("*")
      .eq("seller_id", session.id)
      .order("requested_at", { ascending: false });
    if (error) { console.error("getMyPayouts:", error); return []; }
    return data || [];
  }

  async function cancelPayout(id) {
    if (!isReady()) return;
    const session = await Auth.getSession();
    if (!session) return;
    await supabase.from("payout_requests")
      .update({ status: "cancelled" })
      .eq("id", id).eq("seller_id", session.id).eq("status", "pending");
  }

  async function getAllPayouts(statusFilter) {
    if (!isReady()) return [];
    let query = supabase
      .from("payout_requests")
      .select("*, profiles!seller_id(name, handle, email)")
      .order("requested_at", { ascending: false })
      .limit(200);
    if (statusFilter && statusFilter !== "all") query = query.eq("status", statusFilter);
    const { data, error } = await query;
    if (error) { console.error("getAllPayouts:", error); return []; }
    return data || [];
  }

  async function reviewPayout(id, status, note) {
    if (!isReady()) return { ok: false, error: "Supabase not configured." };
    const session = await Auth.getSession();
    if (!session) return { ok: false, error: "Not logged in." };
    const { error } = await supabase.from("payout_requests").update({
      status,
      note:        note || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: session.id,
    }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }


  // ════════════════════════════════════════════════════════════
  //  SITE PAGES (admin-editable content)
  // ════════════════════════════════════════════════════════════

  async function getPage(slug) {
    if (!isReady()) return null;
    const { data, error } = await supabase
      .from("site_pages")
      .select("*")
      .eq("slug", slug)
      .single();
    if (error) return null;
    return data;
  }

  async function savePage({ slug, title, subtitle, tag, content, copyright }) {
    if (!isReady()) return { ok: false, error: "Supabase not configured" };
    const payload = { slug, title, subtitle, tag, content, updated_at: new Date().toISOString() };
    if (copyright !== undefined) payload.copyright = copyright;

    const { error } = await supabase
      .from("site_pages")
      .upsert(payload, { onConflict: "slug" });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function getAllPages() {
    if (!isReady()) return [];
    const { data, error } = await supabase
      .from("site_pages")
      .select("slug, title, updated_at")
      .order("slug");
    if (error) return [];
    return data || [];
  }

  // ── Email notifications (calls Edge Function) ────────────────
  async function sendEmail(to, type, data) {
    if (!isReady()) return { ok: false, error: "Supabase not ready" };
    try {
      const { data: fnData, error } = await supabase.functions.invoke("send-email", {
        body: { type, to, data },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: fnData };
    } catch (err) {
      console.warn("sendEmail failed:", err);
      return { ok: false, error: err.message };
    }
  }

  // ════════════════════════════════════════════════════════════
  //  LIKES
  // ════════════════════════════════════════════════════════════

  async function toggleLike(beatId) {
    if (!isReady()) {
      const likes = JSON.parse(localStorage.getItem('bm_likes') || '{}');
      const wasLiked = !!likes[beatId];
      if (wasLiked) delete likes[beatId]; else likes[beatId] = true;
      localStorage.setItem('bm_likes', JSON.stringify(likes));
      return { liked: !wasLiked, likes_count: 0 };
    }
    const { data, error } = await supabase.rpc('toggle_like', { p_beat_id: beatId });
    if (error) { console.error('toggleLike:', error); return null; }
    const likes = JSON.parse(localStorage.getItem('bm_likes') || '{}');
    if (data.liked) likes[beatId] = true; else delete likes[beatId];
    localStorage.setItem('bm_likes', JSON.stringify(likes));
    return data;
  }

  async function getLikedBeats() {
    if (!isReady()) {
      const likes = JSON.parse(localStorage.getItem('bm_likes') || '{}');
      const demo = typeof BEATS !== 'undefined' ? BEATS : [];
      return demo.filter(b => !!likes[b.id]).map(b => ({ ...b, liked: true }));
    }
    const session = Auth.getSession();
    if (!session) return [];
    const { data, error } = await supabase
      .from('likes')
      .select('beat_id, created_at, beats(*, profiles(name, avatar_url, handle))')
      .eq('user_id', session.id)
      .order('created_at', { ascending: false });
    if (error) { console.error('getLikedBeats:', error); return []; }
    return (data || []).map(row => ({ ...mapBeat(row.beats), liked: true, likedAt: row.created_at }));
  }

  async function getLikeStatuses(beatIds) {
    if (!isReady() || !beatIds.length) {
      const likes = JSON.parse(localStorage.getItem('bm_likes') || '{}');
      const result = {};
      beatIds.forEach(id => { result[id] = !!likes[id]; });
      return result;
    }
    const session = Auth.getSession();
    if (!session) return {};
    const { data, error } = await supabase
      .from('likes')
      .select('beat_id')
      .eq('user_id', session.id)
      .in('beat_id', beatIds);
    if (error) { console.error('getLikeStatuses:', error); return {}; }
    const result = {};
    beatIds.forEach(id => { result[id] = false; });
    (data || []).forEach(row => { result[row.beat_id] = true; });
    return result;
  }

  // ════════════════════════════════════════════════════════════
  //  FOLLOWS
  // ════════════════════════════════════════════════════════════

  async function toggleFollow(producerId) {
    if (!isReady()) {
      const follows = JSON.parse(localStorage.getItem('bm_followed') || '{}');
      const wasFollowing = !!follows[producerId];
      if (wasFollowing) delete follows[producerId]; else follows[producerId] = true;
      localStorage.setItem('bm_followed', JSON.stringify(follows));
      return { following: !wasFollowing, followers_count: 0 };
    }
    const { data, error } = await supabase.rpc('toggle_follow', { p_producer_id: producerId });
    if (error) { console.error('toggleFollow:', error); return null; }
    const follows = JSON.parse(localStorage.getItem('bm_followed') || '{}');
    if (data.following) follows[producerId] = true; else delete follows[producerId];
    localStorage.setItem('bm_followed', JSON.stringify(follows));
    return data;
  }

  async function getFollowedProducers() {
    if (!isReady()) {
      const follows = JSON.parse(localStorage.getItem('bm_followed') || '{}');
      const demo = typeof PRODUCERS !== 'undefined' ? PRODUCERS : [];
      return demo.filter(p => !!follows[p.id] || !!follows[p.name]);
    }
    const session = Auth.getSession();
    if (!session) return [];
    const { data, error } = await supabase
      .from('follows')
      .select('producer_id, created_at, profiles!producer_id(id, name, handle, avatar_url, genre, role)')
      .eq('follower_id', session.id)
      .order('created_at', { ascending: false });
    if (error) { console.error('getFollowedProducers:', error); return []; }
    return (data || []).map(row => ({
      id: row.producer_id,
      name: row.profiles?.name || 'Producer',
      handle: row.profiles?.handle || '',
      avatar_url: row.profiles?.avatar_url || null,
      genre: row.profiles?.genre || 'Various',
      followedAt: row.created_at,
    }));
  }

  async function getFollowStatuses(producerIds) {
    if (!isReady() || !producerIds.length) {
      const follows = JSON.parse(localStorage.getItem('bm_followed') || '{}');
      const result = {};
      producerIds.forEach(id => { result[id] = !!follows[id]; });
      return result;
    }
    const session = Auth.getSession();
    if (!session) return {};
    const { data, error } = await supabase
      .from('follows')
      .select('producer_id')
      .eq('follower_id', session.id)
      .in('producer_id', producerIds);
    if (error) { console.error('getFollowStatuses:', error); return {}; }
    const result = {};
    producerIds.forEach(id => { result[id] = false; });
    (data || []).forEach(row => { result[row.producer_id] = true; });
    return result;
  }

  // ════════════════════════════════════════════════════════════
  //  USER PROFILE STATS
  // ════════════════════════════════════════════════════════════

  async function getUserProfileStats() {
    const session = Auth.getSession();
    if (!session) return { likedCount: 0, followingCount: 0, beatsOwned: 0, totalSpent: 0 };

    if (!isReady()) {
      const likes = JSON.parse(localStorage.getItem('bm_likes') || '{}');
      const follows = JSON.parse(localStorage.getItem('bm_followed') || '{}');
      return {
        likedCount: Object.keys(likes).length,
        followingCount: Object.keys(follows).length,
        beatsOwned: 0,
        totalSpent: 0,
      };
    }

    const [likesRes, followsRes, ordersRes] = await Promise.all([
      supabase.from('likes').select('id', { count: 'exact' }).eq('user_id', session.id),
      supabase.from('follows').select('id', { count: 'exact' }).eq('follower_id', session.id),
      supabase.from('orders').select('amount').eq('buyer_id', session.id).eq('status', 'completed'),
    ]);

    const totalSpent = (ordersRes.data || []).reduce((s, o) => s + parseFloat(o.amount || 0), 0);

    return {
      likedCount: likesRes.count || 0,
      followingCount: followsRes.count || 0,
      beatsOwned: ordersRes.data?.length || 0,
      totalSpent: totalSpent.toFixed(2),
    };
  }

  // ════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════════
  return {
    getBeats, getBeat, getMyBeats, getAllBeats, uploadBeat,
    updateBeatStatus, incrementPlays, clearBeatsCache,
    getLicenses,
    createOrder, getMyOrders, getSellerOrders, getAllOrders,
    getCart, addToCart, removeFromCart,
    getProducers, getAllUsers, updateUserStatus,
    getSellerStats, getAdminStats,
    requestPayout, getMyPayouts, cancelPayout, getAllPayouts, reviewPayout,
    getPage, savePage, getAllPages,
    sendEmail,
    toggleLike, getLikedBeats, getLikeStatuses,
    toggleFollow, getFollowedProducers, getFollowStatuses,
    getUserProfileStats,
    isReady, storageUrl,
  };
})();
