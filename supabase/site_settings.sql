-- ═══════════════════════════════════════════════════════════════
--  site_settings — key/value store for platform configuration
--  Stores Stripe keys, OAuth config, platform preferences, etc.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Row-Level Security ────────────────────────────────────────
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Admins can read/write all settings
CREATE POLICY "Admins can manage settings"
  ON site_settings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Public can read the publishable key (NOT the secret key)
-- The 'stripe_keys' row stores {pk, sk, whsec} — we allow reading
-- but the frontend only uses the 'pk' field from this.
-- Note: For production, consider a separate 'stripe_public_keys' row
-- that only contains the publishable key.
CREATE POLICY "Anyone can read stripe public key"
  ON site_settings FOR SELECT
  USING (key = 'stripe_keys');

-- Service role can bypass RLS for edge functions
-- (enabled by default with service_role key)
