-- ═══════════════════════════════════════════════════════════════
--  BeatMarket — Supabase Database Schema
--  Run this entire file in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── PROFILES ─────────────────────────────────────────────────────
-- Extends Supabase's built-in auth.users table
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'buyer' check (role in ('buyer', 'seller', 'admin')),
  name        text not null default '',
  handle      text unique,                 -- @username for sellers
  avatar_url  text,
  bio         text,
  genre       text,                        -- main genre for sellers
  status      text not null default 'active' check (status in ('active', 'banned')),
  created_at  timestamptz default now()
);

-- Auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'buyer')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── BEATS ─────────────────────────────────────────────────────────
create table if not exists public.beats (
  id          uuid primary key default uuid_generate_v4(),
  producer_id uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  genre       text not null default 'Trap',
  bpm         integer check (bpm between 40 and 300),
  key         text,
  price       numeric(10,2) not null default 0,
  cover_url   text,
  audio_url   text,
  tags        text[],
  plays       integer default 0,
  status      text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'inactive')),
  featured    boolean default false,
  description text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Track play count
create or replace function public.increment_plays(beat_id uuid)
returns void language sql security definer as $$
  update public.beats set plays = plays + 1 where id = beat_id;
$$;

-- ── LICENSES ─────────────────────────────────────────────────────
create table if not exists public.licenses (
  id          uuid primary key default uuid_generate_v4(),
  beat_id     uuid not null references public.beats(id) on delete cascade,
  type        text not null check (type in ('mp3', 'wav', 'unlimited', 'exclusive')),
  label       text not null,
  price       numeric(10,2) not null,
  description text,
  features    text[],
  created_at  timestamptz default now()
);

-- ── ORDERS ───────────────────────────────────────────────────────
create table if not exists public.orders (
  id          uuid primary key default uuid_generate_v4(),
  buyer_id    uuid not null references public.profiles(id),
  beat_id     uuid not null references public.beats(id),
  license_id  uuid references public.licenses(id),
  producer_id uuid not null references public.profiles(id),
  amount      numeric(10,2) not null,
  license_type text not null,
  status      text not null default 'completed' check (status in ('pending', 'completed', 'refunded')),
  created_at  timestamptz default now()
);

-- ── CART ITEMS ────────────────────────────────────────────────────
create table if not exists public.cart_items (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  beat_id     uuid not null references public.beats(id) on delete cascade,
  license_id  uuid references public.licenses(id),
  license_type text,
  price       numeric(10, 2),
  added_at    timestamptz default now(),
  unique(user_id, beat_id)
);

-- ── FOLLOWS ───────────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id uuid references public.profiles(id) on delete cascade,
  producer_id uuid references public.profiles(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (follower_id, producer_id)
);

-- ═══════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════

-- profiles: public read, owner write
alter table public.profiles enable row level security;
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- beats: public read active beats; sellers manage own beats; admins manage all
alter table public.beats enable row level security;
create policy "Active beats are public" on public.beats for select using (status = 'active' or auth.uid() = producer_id);
create policy "Sellers can insert beats" on public.beats for insert with check (auth.uid() = producer_id);
create policy "Sellers can update own beats" on public.beats for update using (auth.uid() = producer_id);
create policy "Sellers can delete own beats" on public.beats for delete using (auth.uid() = producer_id);

-- Admin policies: full visibility and control over all beats
create policy "Admins can view all beats" on public.beats for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "Admins can update all beats" on public.beats for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "Admins can delete all beats" on public.beats for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- licenses: public read
alter table public.licenses enable row level security;
create policy "Licenses are public" on public.licenses for select using (true);
create policy "Sellers manage own beat licenses" on public.licenses for all using (
  auth.uid() = (select producer_id from public.beats where id = beat_id)
);

-- orders: buyer sees own, seller sees their beat orders
alter table public.orders enable row level security;
create policy "Buyers see own orders" on public.orders for select using (auth.uid() = buyer_id);
create policy "Sellers see orders for their beats" on public.orders for select using (auth.uid() = producer_id);
create policy "Buyers can create orders" on public.orders for insert with check (auth.uid() = buyer_id);

-- cart_items: users see/manage own cart only
alter table public.cart_items enable row level security;
create policy "Users manage own cart" on public.cart_items for all using (auth.uid() = user_id);

-- follows
alter table public.follows enable row level security;
create policy "Follows are public" on public.follows for select using (true);
create policy "Users manage own follows" on public.follows for all using (auth.uid() = follower_id);

-- ═══════════════════════════════════════════════════════════════
--  STORAGE BUCKETS
--  Run separately in Supabase Dashboard → Storage
-- ═══════════════════════════════════════════════════════════════
-- insert into storage.buckets (id, name, public) values ('covers', 'covers', true);
-- insert into storage.buckets (id, name, public) values ('audio',  'audio',  true);
--
-- Storage RLS — run these after creating the buckets:
-- create policy "Cover images are public" on storage.objects for select using (bucket_id = 'covers');
-- create policy "Sellers upload covers" on storage.objects for insert with check (bucket_id = 'covers' and auth.role() = 'authenticated');
-- create policy "Audio files are public" on storage.objects for select using (bucket_id = 'audio');
-- create policy "Sellers upload audio" on storage.objects for insert with check (bucket_id = 'audio' and auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════
--  SEED: Default licenses for each beat
--  (call after inserting beats)
-- ═══════════════════════════════════════════════════════════════
-- Example: run this after uploading your first beat
-- insert into public.licenses (beat_id, type, label, price, description, features) values
--   ('<beat-uuid>', 'mp3',       'Basic MP3',       29.99, 'For demos and non-profit use',         array['MP3 Lease', '50K streams', '10K downloads', 'Non-exclusive']),
--   ('<beat-uuid>', 'wav',       'Premium WAV',     59.99, 'For releases up to 500K streams',       array['WAV + MP3 Files', '500K streams', '100K downloads', 'Non-exclusive']),
--   ('<beat-uuid>', 'unlimited', 'Unlimited Use',   99.99, 'Unlimited commercial releases',         array['WAV + MP3 Files', 'Unlimited streams', 'Unlimited sales', 'Non-exclusive']),
--   ('<beat-uuid>', 'exclusive', 'Exclusive Rights',299.99,'Full exclusive rights — beat removed', array['Exclusive Rights', 'WAV + Stems', 'Unlimited everything', 'Beat removed from store']);

-- ── PAYOUT REQUESTS ──────────────────────────────────────────────────
create table if not exists public.payout_requests (
  id              uuid primary key default gen_random_uuid(),
  seller_id       uuid not null references public.profiles(id) on delete cascade,
  amount          numeric(10,2) not null check (amount >= 50),
  method          text default 'paypal' check (method in ('paypal','bank','stripe','crypto')),
  payment_details text default '',
  status          text default 'pending' check (status in ('pending','approved','rejected','paid','cancelled')),
  note            text,                    -- admin review note
  requested_at    timestamptz default now(),
  reviewed_at     timestamptz,
  reviewed_by     uuid references public.profiles(id) on delete set null
);

create index if not exists payout_requests_seller_idx on public.payout_requests(seller_id);
create index if not exists payout_requests_status_idx on public.payout_requests(status);

-- RLS: sellers see own, admins see all
alter table public.payout_requests enable row level security;

create policy "payout_requests: seller read own"
  on public.payout_requests for select
  using (seller_id = auth.uid() or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));

create policy "payout_requests: seller insert"
  on public.payout_requests for insert
  with check (seller_id = auth.uid());

create policy "payout_requests: seller cancel own pending"
  on public.payout_requests for update
  using (seller_id = auth.uid() and status = 'pending')
  with check (status = 'cancelled');

create policy "payout_requests: admin update"
  on public.payout_requests for update
  using (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));

-- ── SITE PAGES (admin-editable content pages) ─────────────────────────
create table if not exists public.site_pages (
  slug        text primary key,           -- 'about' | 'blog' | 'pricing' | 'faq' | 'terms' | 'privacy'
  title       text not null default '',
  tag         text default '',            -- badge text shown on page hero
  subtitle    text default '',
  content     text default '',            -- HTML content
  copyright   text default '© 2026 BeatMarket. All rights reserved.',
  updated_at  timestamptz default now()
);

-- RLS: anyone can read, only admins can write
alter table public.site_pages enable row level security;

-- Public read
create policy "site_pages: public read"
  on public.site_pages for select
  using (true);

-- Admin insert
create policy "site_pages: admin insert"
  on public.site_pages for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Admin update
create policy "site_pages: admin update"
  on public.site_pages for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Seed default page slugs (content will be filled by admin dashboard)
insert into public.site_pages (slug, title, tag, subtitle) values
  ('about',   'About BeatMarket',           'Our Story',    'The premier marketplace connecting producers and artists worldwide.'),
  ('blog',    'BeatMarket Blog',             'Latest News',  'Tips, news, and insights for producers and artists.'),
  ('pricing', 'Pricing & Licenses',          'License Types','Flexible licensing for every artist and every budget.'),
  ('faq',     'Frequently Asked Questions',  'Help Center',  'Everything you need to know about BeatMarket.'),
  ('terms',   'Terms of Service',            'Legal',        'Please read these terms carefully before using BeatMarket.'),
  ('privacy', 'Privacy Policy',              'Privacy',      'How BeatMarket collects, uses, and protects your data.')
on conflict (slug) do nothing;

