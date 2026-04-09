# BeatMarket Copilot Instructions

## Architecture Overview
BeatMarket is a web-based beat marketplace built with vanilla JavaScript, HTML/CSS, and Supabase backend. The Flutter app in `greeting_app/` is unrelated (separate "Daily Greetings" project).

**Key Components:**
- **Frontend:** Static HTML pages (`index.html`, `buyer.html`, `seller.html`, `admin.html`) with shared CSS (`css/style.css`, `css/auth.css`) and modular JS (`js/app.js`, `js/auth.js`, etc.)
- **Backend:** Supabase (PostgreSQL database, Auth, Storage, Edge Functions in `supabase/functions/`)
- **Payments:** Stripe integration via Supabase Edge Functions (`create-checkout`, `stripe-webhook`)
- **Data Flow:** JS modules fetch from Supabase API, render dynamically; falls back to localStorage mocks when Supabase unconfigured

**User Roles & Pages:**
- Buyers: `buyer.html` (purchase beats)
- Sellers: `seller.html` (upload/manage beats)
- Admins: `admin.html` (moderate content)
- Auth: `login.html`, `oauth-callback.html`, `reset-password.html`

## Development Workflow
- **Local Development:** Open HTML files directly in browser (no build step). JS loads from `js/` directory.
- **Supabase Setup:** Run `supabase start` for local instance. Schema in `supabase/schema.sql`, functions deploy with `supabase functions deploy`.
- **Testing:** No automated tests; manual browser testing. Use browser dev tools for debugging.
- **Deployment:** Static files to web host, Supabase schema/functions via CLI.

## Code Patterns
- **JS Modules:** Use IIFE pattern (e.g., `const Auth = (() => { ... })();`) for encapsulation. Global `supabase` client from `js/supabase.js`.
- **Data Access:** All API calls through `js/api.js`. Maps Supabase rows to app objects (e.g., `mapBeat()` function).
- **Auth Handling:** Supabase Auth with localStorage fallback. Check `window._supabaseReady` for Supabase status.
- **UI Rendering:** Dynamic HTML injection (e.g., `renderBeatCard()` in `js/app.js`). Use CSS variables for theming.
- **Error Handling:** Graceful degradation - show empty states or mock data when Supabase fails.
- **File Storage:** Supabase Storage for covers/audio. Use `storageUrl()` helper for public URLs.

## Key Files to Reference
- `js/supabase.js`: Client setup with hardcoded keys (update for production)
- `supabase/schema.sql`: Database schema (profiles, beats, orders, cart_items)
- `js/api.js`: Data fetching logic with Supabase queries
- `js/auth.js`: Authentication with Supabase/localStorage dual mode
- `index.html`: Main marketplace page structure

## Conventions
- Genres: Trap, Drill, Lo-Fi, R&B, Afrobeats (from `js/data.js`)
- Licenses: Basic MP3, Premium WAV, Unlimited (multipliers: 1x, 2x, 4x base price)
- Beat status: pending/active/rejected/inactive
- User status: active/banned
- Use `uuid_generate_v4()` for IDs, `timestamptz` for timestamps

## Common Tasks
- Adding features: Update HTML, add JS logic in relevant module, extend Supabase schema if needed
- Styling: Use CSS variables (`--bg-primary`, `--text`, etc.) in `css/style.css`
- Database changes: Modify `supabase/schema.sql`, run in Supabase dashboard
- New pages: Copy structure from existing HTML, include shared nav/auth elements</content>
<parameter name="filePath">/Users/olastrch/beat/.github/copilot-instructions.md