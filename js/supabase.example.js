// ─────────────────────────────────────────────────────
//  BeatMarket — Supabase Client
//
//  Copy this file to js/supabase.js and fill in your keys.
//  js/supabase.js is gitignored so secrets stay off GitHub.
//
//  Find your keys at: https://supabase.com/dashboard → Project Settings → API
// ─────────────────────────────────────────────────────

const SUPABASE_URL    = "YOUR_SUPABASE_URL";          // e.g. https://xxxx.supabase.co
const SUPABASE_ANON   = "YOUR_SUPABASE_ANON_KEY";     // sb_publishable_... (safe to expose)
const SUPABASE_SECRET = "YOUR_SUPABASE_SERVICE_KEY";  // sb_secret_... (NEVER commit this)

// Create client — catches initialisation errors gracefully
let supabase;
try {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  // Quick connectivity smoke-test (doesn't throw, just logs)
  supabase.from("beats").select("id").limit(1).then(({ error }) => {
    if (error) {
      console.error("⚠️ Supabase query test failed:", error.message);
    } else {
      console.log("✅ BeatMarket: Supabase connected →", SUPABASE_URL);
    }
  });

  window._supabaseReady = true;
} catch (err) {
  console.error("❌ Supabase createClient failed:", err.message);
  window._supabaseReady = false;
  // Provide a no-op stub so the rest of the code doesn't crash
  supabase = {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }), insert: () => Promise.resolve({ data: null, error: null }), update: () => Promise.resolve({ data: null, error: null }), delete: () => Promise.resolve({ data: null, error: null }), upsert: () => Promise.resolve({ data: null, error: null }) }),
    auth: { signUp: () => Promise.resolve({ data: null, error: { message: "Not configured" } }), signInWithPassword: () => Promise.resolve({ data: null, error: { message: "Not configured" } }), signOut: () => Promise.resolve({}), getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => {} },
    storage: { from: () => ({ upload: () => Promise.resolve({ data: null, error: { message: "Not configured" } }) }) },
    rpc: () => Promise.resolve({ data: null, error: null }),
    supabaseUrl: SUPABASE_URL,
  };
}
