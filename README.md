# 🎧 BeatMarket

A modern beat marketplace where producers sell beats and artists buy them. Built with vanilla HTML/CSS/JS, Supabase (auth + database + storage), and Stripe (payments).

**Live site →** [beat-mu.vercel.app](https://beat-mu.vercel.app)

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | HTML · CSS · Vanilla JS |
| Auth & DB | Supabase (Postgres + RLS) |
| Payments | Stripe Checkout |
| Storage | Supabase Storage |
| Hosting | Vercel |

---

## Local Development

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/beat.git
cd beat

# 2. Add your Supabase credentials
cp js/supabase.example.js js/supabase.js
# Edit js/supabase.js with your keys from supabase.com/dashboard

# 3. Serve locally
npx http-server . -p 8080 --cors -c-1

# 4. Open http://localhost:8080
```

---

## Project Structure

```
beat/
├── index.html          # Homepage / storefront
├── store.html          # Beat browser
├── discover.html       # TikTok-style beat discovery
├── login.html          # Auth (buyer + seller)
├── buyer.html          # Buyer dashboard
├── seller.html         # Seller / producer dashboard
├── admin.html          # Admin panel
├── css/style.css       # Global styles
├── js/
│   ├── app.js          # Homepage logic
│   ├── api.js          # All Supabase data calls
│   ├── auth.js         # Authentication
│   ├── cart.js         # Cart & checkout
│   ├── stripe.js       # Stripe Checkout integration
│   ├── supabase.js     # 🔒 gitignored — add your keys
│   └── supabase.example.js  # ← copy this
└── supabase/
    ├── schema.sql      # Full DB schema
    └── functions/      # Edge Functions (create-checkout, stripe-webhook)
```

---

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL editor
3. Copy your **Project URL** and **Anon key** into `js/supabase.js`
4. Deploy Edge Functions:
   ```bash
   supabase functions deploy create-checkout
   supabase functions deploy stripe-webhook
   ```
5. Set `STRIPE_SECRET_KEY` in Supabase Edge Function secrets

---

## Deploy to Vercel

```bash
npx vercel --prod
```

> **Note:** Since `js/supabase.js` is gitignored, deploy via Vercel CLI (not GitHub auto-deploy) so your local credentials are included.

---

## Features

- 🎵 Beat upload with cover art & audio preview
- 🛒 Single-price cart & Stripe checkout
- 📱 Fully mobile responsive
- 🎬 TikTok-style Discover feed with 30s previews
- 👤 Buyer & Seller dashboards
- 🔐 Email/password + Google OAuth
- 💰 Seller payout requests
- 🛡️ Admin panel (approve beats, manage users, process payouts)
