-- ═══════════════════════════════════════════════════════════════
--  BeatMarket — Likes & Follows tables
-- ═══════════════════════════════════════════════════════════════

-- ── Likes table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.likes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  beat_id     UUID NOT NULL REFERENCES public.beats(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- One like per user per beat
CREATE UNIQUE INDEX IF NOT EXISTS likes_user_beat_idx ON public.likes (user_id, beat_id);

-- Fast lookup: "how many likes does beat X have?"
CREATE INDEX IF NOT EXISTS likes_beat_idx ON public.likes (beat_id);

-- Fast lookup: "what beats has user X liked?"
CREATE INDEX IF NOT EXISTS likes_user_idx ON public.likes (user_id);

-- ── Follows table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.follows (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  producer_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- One follow per user per producer
CREATE UNIQUE INDEX IF NOT EXISTS follows_pair_idx ON public.follows (follower_id, producer_id);

CREATE INDEX IF NOT EXISTS follows_follower_idx ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS follows_producer_idx ON public.follows (producer_id);

-- ── Add likes_count column to beats ────────────────────────────
ALTER TABLE public.beats ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

-- ── RLS Policies ───────────────────────────────────────────────
ALTER TABLE public.likes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Likes: anyone can read; authenticated users can insert/delete own
CREATE POLICY "Likes readable by all"
  ON public.likes FOR SELECT
  USING (true);

CREATE POLICY "Users can like beats"
  ON public.likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike beats"
  ON public.likes FOR DELETE
  USING (auth.uid() = user_id);

-- Follows: anyone can read; authenticated users can insert/delete own
CREATE POLICY "Follows readable by all"
  ON public.follows FOR SELECT
  USING (true);

CREATE POLICY "Users can follow producers"
  ON public.follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow producers"
  ON public.follows FOR DELETE
  USING (auth.uid() = follower_id);

-- ── RPC: Toggle like (atomic insert/delete + counter update) ───
CREATE OR REPLACE FUNCTION public.toggle_like(p_beat_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_exists  BOOLEAN;
  v_count   INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Check if already liked
  SELECT EXISTS(
    SELECT 1 FROM public.likes WHERE user_id = v_user_id AND beat_id = p_beat_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Unlike
    DELETE FROM public.likes WHERE user_id = v_user_id AND beat_id = p_beat_id;
    UPDATE public.beats SET likes_count = GREATEST(0, likes_count - 1) WHERE id = p_beat_id;
  ELSE
    -- Like
    INSERT INTO public.likes (user_id, beat_id) VALUES (v_user_id, p_beat_id);
    UPDATE public.beats SET likes_count = likes_count + 1 WHERE id = p_beat_id;
  END IF;

  -- Return new count
  SELECT likes_count INTO v_count FROM public.beats WHERE id = p_beat_id;

  RETURN jsonb_build_object(
    'liked', NOT v_exists,
    'likes_count', COALESCE(v_count, 0)
  );
END;
$$;

-- ── RPC: Toggle follow ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_follow(p_producer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_exists   BOOLEAN;
  v_count    INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.follows WHERE follower_id = v_user_id AND producer_id = p_producer_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.follows WHERE follower_id = v_user_id AND producer_id = p_producer_id;
  ELSE
    INSERT INTO public.follows (follower_id, producer_id) VALUES (v_user_id, p_producer_id);
  END IF;

  -- Return follower count for this producer
  SELECT COUNT(*) INTO v_count FROM public.follows WHERE producer_id = p_producer_id;

  RETURN jsonb_build_object(
    'following', NOT v_exists,
    'followers_count', v_count
  );
END;
$$;
