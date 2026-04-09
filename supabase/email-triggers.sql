-- ═══════════════════════════════════════════════════════════════
--  BeatMarket — Email Notification Triggers
--  Run this in: Supabase Dashboard → SQL Editor
--
--  Prerequisites:
--  1. Deploy the send-email Edge Function first
--  2. Set RESEND_API_KEY and FROM_EMAIL in Edge Function env vars
--  3. Set FROM_EMAIL in Resend dashboard (verify your domain)
--  4. Set ADMIN_EMAIL below to your real admin email address
-- ═══════════════════════════════════════════════════════════════

-- Enable the pg_net extension for HTTP requests from PostgreSQL
create extension if not exists pg_net;

-- ── CONFIGURATION ─────────────────────────────────────────────────────
-- Change this to your real admin email address:
-- (You can also store this in a settings table instead)

do $$ begin
  perform set_config('app.admin_email', 'admin@yourdomain.com', false);
exception when others then null;
end $$;

-- ── HELPER: call edge function ────────────────────────────────────────
-- This calls the send-email edge function via HTTP using pg_net.
-- Replace YOUR_PROJECT_REF with your actual Supabase project reference.
-- Get it from: Supabase Dashboard → Settings → General → Project ref

create or replace function private.send_email_notification(
  email_to    text,
  email_type  text,
  email_data  jsonb
) returns void
language plpgsql security definer as $$
declare
  v_project_ref text := current_setting('app.supabase_project_ref', true);
  v_service_key text := current_setting('app.supabase_service_key', true);
  v_url         text;
begin
  -- Build edge function URL
  v_url := 'https://' || coalesce(v_project_ref, 'YOUR_PROJECT_REF')
         || '.supabase.co/functions/v1/send-email';

  -- Non-blocking HTTP POST via pg_net
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, '')
    ),
    body    := jsonb_build_object(
      'type', email_type,
      'to',   email_to,
      'data', email_data
    )
  );
exception when others then
  -- Never crash the main transaction if email fails
  raise warning 'send_email_notification failed: %', sqlerrm;
end;
$$;

-- ── SET RUNTIME CONFIGS ───────────────────────────────────────────────
-- Run these ALTER DATABASE commands with your real values:
--
--   alter database postgres set app.supabase_project_ref = 'zddsiwltiovntwlawjtd';
--   alter database postgres set app.supabase_service_key = 'your-service-role-key-here';
--   alter database postgres set app.admin_email          = 'admin@yourdomain.com';
--
-- service_role key: Supabase Dashboard → Settings → API → service_role key

-- ── TRIGGER 1: New Order → email buyer + seller ───────────────────────
create or replace function private.on_new_order()
returns trigger language plpgsql security definer as $$
declare
  v_beat       record;
  v_buyer      record;
  v_seller     record;
  v_admin_email text;
  v_platform_cut numeric := 0.20;  -- 20% platform fee
  v_seller_cut  numeric;
begin
  v_admin_email := current_setting('app.admin_email', true);

  -- Fetch related records
  select title, genre, price into v_beat  from public.beats    where id = new.beat_id;
  select name, email          into v_buyer  from public.profiles join auth.users on auth.users.id = profiles.id where profiles.id = new.buyer_id;
  select name, email          into v_seller from public.profiles join auth.users on auth.users.id = profiles.id where profiles.id = new.producer_id;

  v_seller_cut := round(new.amount * (1 - v_platform_cut), 2);

  -- Email buyer: order confirmation
  if v_buyer.email is not null then
    perform private.send_email_notification(
      v_buyer.email, 'order_confirmation',
      jsonb_build_object(
        'buyerName',    v_buyer.name,
        'beatTitle',    v_beat.title,
        'producerName', v_seller.name,
        'licenseType',  new.license_type,
        'amount',       new.amount::text
      )
    );
  end if;

  -- Email seller: new sale
  if v_seller.email is not null then
    perform private.send_email_notification(
      v_seller.email, 'new_sale',
      jsonb_build_object(
        'sellerName',     v_seller.name,
        'beatTitle',      v_beat.title,
        'licenseType',    new.license_type,
        'amount',         new.amount::text,
        'sellerEarnings', v_seller_cut::text
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_on_new_order on public.orders;
create trigger trg_on_new_order
  after insert on public.orders
  for each row execute procedure private.on_new_order();

-- ── TRIGGER 2: Beat status change → email seller + admin ─────────────
create or replace function private.on_beat_status_change()
returns trigger language plpgsql security definer as $$
declare
  v_seller     record;
  v_admin_email text;
begin
  -- Only fire when status changes
  if old.status = new.status then return new; end if;

  v_admin_email := current_setting('app.admin_email', true);

  select name, email into v_seller
    from public.profiles
    join auth.users on auth.users.id = profiles.id
    where profiles.id = new.producer_id;

  -- Beat approved → email seller
  if new.status = 'active' and old.status = 'pending' then
    if v_seller.email is not null then
      perform private.send_email_notification(
        v_seller.email, 'beat_approved',
        jsonb_build_object(
          'sellerName', v_seller.name,
          'beatTitle',  new.title
        )
      );
    end if;
  end if;

  -- Beat rejected → email seller
  if new.status = 'rejected' then
    if v_seller.email is not null then
      perform private.send_email_notification(
        v_seller.email, 'beat_rejected',
        jsonb_build_object(
          'sellerName', v_seller.name,
          'beatTitle',  new.title,
          'note',       coalesce(new.description, '')
        )
      );
    end if;
  end if;

  -- New beat uploaded (pending) → email admin
  if new.status = 'pending' and old.status is distinct from 'pending' then
    if v_admin_email is not null then
      perform private.send_email_notification(
        v_admin_email, 'admin_beat_pending',
        jsonb_build_object(
          'sellerName', v_seller.name,
          'beatTitle',  new.title,
          'genre',      new.genre,
          'price',      new.price::text
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_on_beat_status_change on public.beats;
create trigger trg_on_beat_status_change
  after update on public.beats
  for each row execute procedure private.on_beat_status_change();

-- Also trigger for new beat INSERT (status starts as 'pending')
create or replace function private.on_new_beat()
returns trigger language plpgsql security definer as $$
declare
  v_seller     record;
  v_admin_email text;
begin
  v_admin_email := current_setting('app.admin_email', true);

  select name, email into v_seller
    from public.profiles
    join auth.users on auth.users.id = profiles.id
    where profiles.id = new.producer_id;

  -- Alert admin of new beat pending review
  if v_admin_email is not null and new.status = 'pending' then
    perform private.send_email_notification(
      v_admin_email, 'admin_beat_pending',
      jsonb_build_object(
        'sellerName', v_seller.name,
        'beatTitle',  new.title,
        'genre',      new.genre,
        'price',      new.price::text
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_on_new_beat on public.beats;
create trigger trg_on_new_beat
  after insert on public.beats
  for each row execute procedure private.on_new_beat();

-- ── TRIGGER 3: Payout status change → email seller + admin ───────────
create or replace function private.on_payout_status_change()
returns trigger language plpgsql security definer as $$
declare
  v_seller     record;
  v_admin_email text;
begin
  v_admin_email := current_setting('app.admin_email', true);

  select name, email into v_seller
    from public.profiles
    join auth.users on auth.users.id = profiles.id
    where profiles.id = new.seller_id;

  -- New payout request → email admin
  if old.status is null or (old.status = 'pending' and tg_op = 'INSERT') then
    if v_admin_email is not null then
      perform private.send_email_notification(
        v_admin_email, 'admin_payout_request',
        jsonb_build_object(
          'sellerName',     v_seller.name,
          'amount',         new.amount::text,
          'method',         new.method,
          'paymentDetails', coalesce(new.payment_details, '')
        )
      );
    end if;
  end if;

  -- Payout status changed (approved / rejected / paid) → email seller
  if tg_op = 'UPDATE' and old.status != new.status
     and new.status in ('approved', 'rejected', 'paid') then
    if v_seller.email is not null then
      perform private.send_email_notification(
        v_seller.email, 'payout_status',
        jsonb_build_object(
          'sellerName', v_seller.name,
          'amount',     new.amount::text,
          'method',     new.method,
          'status',     new.status,
          'note',       coalesce(new.note, '')
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_on_payout_insert on public.payout_requests;
create trigger trg_on_payout_insert
  after insert on public.payout_requests
  for each row execute procedure private.on_payout_status_change();

drop trigger if exists trg_on_payout_update on public.payout_requests;
create trigger trg_on_payout_update
  after update on public.payout_requests
  for each row execute procedure private.on_payout_status_change();
