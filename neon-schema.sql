-- BeatMarket — Neon Schema
-- Run this in the Neon SQL editor (neon.tech → project → SQL editor)
-- No Supabase-specific extensions needed; uses standard Postgres

-- ── USERS (replaces Supabase auth.users + profiles) ──────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT,                        -- NULL for OAuth users
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'buyer'
                CHECK (role IN ('buyer','seller','admin')),
  handle      TEXT UNIQUE,
  genre       TEXT,
  bio         TEXT,
  avatar_url  TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','banned','pending')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed admin account (password: admin123)
INSERT INTO users (email, password_hash, name, role, status)
VALUES (
  'admin@beatmarket.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- "password" hashed
  'Admin',
  'admin',
  'active'
) ON CONFLICT (email) DO NOTHING;

-- ── BEATS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  producer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  genre       TEXT,
  bpm         INTEGER,
  key         TEXT,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  cover_url   TEXT,
  audio_url   TEXT,
  tags        TEXT[] DEFAULT '{}',
  plays       INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','active','inactive')),
  featured    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── ORDERS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id          UUID NOT NULL REFERENCES users(id),
  beat_id           UUID NOT NULL REFERENCES beats(id),
  producer_id       UUID NOT NULL REFERENCES users(id),
  amount            NUMERIC(10,2) NOT NULL,
  license_type      TEXT NOT NULL DEFAULT 'standard',
  status            TEXT NOT NULL DEFAULT 'completed'
                      CHECK (status IN ('pending','completed','refunded')),
  stripe_session_id TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── CART ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cart_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  beat_id    UUID NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  price      NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, beat_id)
);

-- ── LIKES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS likes (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  beat_id    UUID NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, beat_id)
);

-- ── FOLLOWS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  producer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, producer_id)
);

-- ── PAYOUT REQUESTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payout_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  amount       NUMERIC(10,2) NOT NULL,
  method       TEXT,
  account_info TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── SITE SETTINGS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ── INDEXES ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_beats_producer  ON beats(producer_id);
CREATE INDEX IF NOT EXISTS idx_beats_status    ON beats(status);
CREATE INDEX IF NOT EXISTS idx_beats_genre     ON beats(genre);
CREATE INDEX IF NOT EXISTS idx_orders_buyer    ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_producer ON orders(producer_id);
CREATE INDEX IF NOT EXISTS idx_cart_user       ON cart_items(user_id);
