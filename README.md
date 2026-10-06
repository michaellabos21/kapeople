# Kapeople — POS + Customer App MVP

One backend, three front ends. A customer orders on their phone → the POS receives it → staff process it →
inventory is deducted → the customer earns points and sees live status.

```
Customer app (/app)   POS (/pos)   Admin (/admin)
        └──────────────┼──────────────┘
              Next.js route handlers  (src/app/api)
                       │
              Service layer (src/lib/services)  ← all business rules live here
                       │
                  PostgreSQL  (db/schema.sql)
```

## Run it

```bash
npm install
npm run dev -- -p 3100
```

The first request creates a local embedded PostgreSQL database in `.data/` ([PGlite](https://pglite.dev)),
applies `db/schema.sql` and seeds the menu, recipes, stock and demo accounts. No Docker or external services needed.
Reset it with `npm run db:reset`.

| Open | Who | Sign in |
| --- | --- | --- |
| http://localhost:3100/app | Customer | `valerie@example.test` (starts with 80 points) or sign up |
| http://localhost:3100/pos | Staff (barista) | `staff@kapeople.test` |
| http://localhost:3100/admin | Admin | `admin@kapeople.test` |

Demo password for all seeded accounts: `kapeople123` (local development only — see `src/lib/seed.ts`).

Tip: cookies are per host, so you can stay signed in as a customer on `localhost:3100` and as staff on
`127.0.0.1:3100` in two tabs and watch an order travel between them.

## What's built (maps to the plan)

**Customer app** — sign up / login, home, menu, product page with size + add-ons + notes, cart, checkout
(promo code, reward redemption, pay now or at pickup), live order tracking, order history, digital receipt,
points balance + history, in-app notifications, browser notifications when permitted.

**POS** — sales screen (customize, discount, attach customer for points, cash/GCash/card, change calculation,
receipt, "hand over now"), order board (New → Accepted → Preparing → Ready → Completed) with a chime on new app
orders, collect-payment-on-pickup, cancel, refund, transaction history, ingredient inventory (stock-in, stock-out,
waste, recount, low-stock flags, movement log), reports (today / week / month: sales, orders, average order,
payment breakdown, best sellers, low stock), offline banner.

**Admin** — everything in Reports plus customer and loyalty stats, menu on/off + price editing, a **Customers** database (search, sort, spend/orders/points per customer, order and points history, internal notes, manual points adjustments with an audit trail, block/restore, CSV export), and **staff & admin account management** (add accounts, deactivate/reactivate, reset passwords with a one-time generated password). Everyone can change their own password.

**Security** — passwords are scrypt-hashed; sign-in locks for 15 minutes after 5 failed attempts per email (an admin password reset lifts it); deactivated accounts are signed out immediately; versioned migrations in `db/migrations/` upgrade existing databases on start (each runs once; nothing pending = one read-only query). Failed logins are limited to 20 per 15 minutes per IP and 5 per email; sign-ups are not rate limited; guessing the mobile number of an imported account to 5 tries per email per network (50/hour per email overall); unknown-email and wrong-password logins take the same time.

## Push notifications

Web Push (no Firebase): customers get an alert when their order is accepted, being prepared, ready and completed; staff
devices get "New order #…" alerts. Customers turn it on from **Profile → Order alerts** or the prompt on an active order;
staff from **Alerts** in the POS header. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (see
`.env.example`); without them the feature stays off. **iPhone/iPad only deliver push to an app added to the Home Screen
(iOS 16.4+)**; Android and desktop browsers work directly. Dead subscriptions are removed automatically, push endpoints are restricted to the real browser push services, alerts are
sent after the response so a slow push service never delays an order, and a push failure never affects an order.

## Importing customers

`scripts/import-customers.ts` loads a tab-separated sign-up sheet (timestamp, name, email, phone, social handle,
consent, id). It does a dry run unless you pass `--apply`, never touches an email that already exists, and lists rows
it can't import (no/invalid email). Imported customers have no password: they activate their account by signing up with
the **same email and mobile number** (shown as "NOT ACTIVATED" in the admin). Keep the data file out of git.

## Front-end quality

Pages that fail to load show an error with **Try again** (not an endless spinner); an expired session sends you
to the right sign-in page; dialogs are keyboard-accessible (focus trap, Escape, scroll lock, focus restored) and
replace the browser's `confirm()`/`prompt()`; colours meet WCAG AA contrast (4.5:1); keyboard focus is visible;
touch targets are 44px; each page has its own tab title; POS/admin are `noindex`. Out-of-stock add-ons are
disabled, and the public menu no longer exposes recipe quantities.

## Install on a phone (full-screen home-screen app)

The customer app is installable: on iPhone open https://YOUR-SITE/app in **Safari → Share → Add to Home Screen**; it then
opens full screen without Safari's bars (the POS installs the same way from `/pos`). Notes: the installed app keeps its
own cookies, so sign in again inside it; after changing manifest/icon settings, delete the old icon and add it again.
First-time visitors in iPhone/iPad Safari see a one-time "Add to Home Screen" hint (`InstallPrompt`); it is never shown in
the installed app, other browsers, or twice. To preview it anywhere, open `/app/login?install-preview=iphone` (or `ipad`).

## Business rules

- **Prices are computed on the server** from the database; the client's totals are display-only.
- **Loyalty:** ₱10 spent = 1 point, awarded when an order is *completed*, on the amount actually paid.
  100 points = ₱50 off. Redeemed points are deducted at order time and returned if the order is cancelled or
  refunded. A refund reverses earned points. Every change is a row in `loyalty_transactions` (audit trail).
- **Inventory:** each product has a recipe (per Grande; sizes scale it; cups don't scale; oat milk *replaces* fresh
  milk). Ingredients are deducted when an order is **completed**. Open orders *reserve* stock so the same milk can't
  be sold twice, and products whose ingredients run out show as sold out and are rejected at checkout.
- **Payments:** POS records cash (with change), GCash and card. In the customer app, GCash/card are **simulated**
  (a `SIMULATED-…` reference, no real charge) and cash is paid at pickup. An unpaid order can't be completed.
- **Duplicates:** checkout sends an idempotency key (scoped to the signed-in user), so double-taps and retries create one order.
- **Promos:** `WELCOME10` is once per customer (cancelled orders free it up); `PASTRY30` is unlimited. Set `promotions.max_uses_per_customer` to change a limit.
- **Order numbers** are gapless, starting at #1001.
- Cancelling: customers can cancel while the order is still *New*; staff can cancel any open order.
  Paid orders get a refund record. Refunding a completed order optionally returns ingredients to stock.

## Tests

```bash
npm test          # 86 tests against a real in-memory Postgres
npm run typecheck
```

Covers the Week-8 list from the plan: cash purchase, online order, cancelled order, refund, out-of-stock item,
duplicate / concurrent submission, incorrect payment, loyalty calculation, inventory deductions, order status
synchronisation.

## Deploy (Netlify + hosted Postgres)

`netlify.toml` is included. Netlify has no persistent disk, so a hosted Postgres is required.

1. Create a Postgres database (e.g. a Supabase project) and copy its **pooled** connection string.
2. In Netlify: *Add new site → Import from Git*, pick this repo and branch.
3. Under *Site configuration → Environment variables* set:
   - `DATABASE_URL` — the connection string
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12+ chars) — creates the first admin on first start
   - optional `ADMIN_NAME`
4. Deploy. In production the app **refuses to start without `DATABASE_URL`** (it won't fall back to the embedded database). On first start the app creates the schema and the demo menu in an empty database.

In production the well-known demo accounts (`*@kapeople.test`) are **not** created (set `SEED_DEMO_USERS=true`
only for a throwaway demo). Live updates fall back to polling (`DISABLE_SSE=true` in `netlify.toml`), so status
changes show up within ~8–15 seconds instead of instantly.

### Vercel

`vercel.json` pins functions to `bom1` (Mumbai) next to the Supabase `ap-south-1` database; change it if your database is elsewhere.
1. *Add New → Project*, import this repo. Vercel deploys the **Production Branch** (default `main`) — merge the branch first or
   change it under *Settings → Environments → Production → Branch Tracking*.
2. Add `DATABASE_URL` (mark it Sensitive) under *Settings → Environment Variables*. `ADMIN_EMAIL`/`ADMIN_PASSWORD` are only
   needed on an empty database. Live updates fall back to polling automatically on Vercel and Netlify.
3. Both hosts can share one database. Cookies are per domain, so sign in separately on each.

**Not yet verified:** a first Vercel deploy has not been run. Anyone can sign up as a
customer on a public deployment, and login has no rate limiting — put the site behind Netlify password protection
until that is added.

## Deliberate differences from the plan, and what's not done

- **Stack:** the plan suggests Flutter + Supabase + Firebase. This build is a TypeScript/Next.js web app (the customer
  app is a mobile-first web app, the POS is tablet-first) on plain PostgreSQL, because it can be run and tested
  end-to-end without extra tooling. The schema and SQL are standard Postgres, and `src/lib/db.ts` has a node-postgres adapter that is used when
  `DATABASE_URL` is set (it creates the schema and seed on first start). **That hosted-Postgres/Supabase path has not been
  run yet** — everything above was verified on the embedded PGlite database only.
  Moving the UI to Flutter later means reusing the same HTTP API.
- **Auth** is a simple email/password + session-cookie implementation, not Supabase Auth. There is no self-service
  "forgot password" or email verification (staff resets go through an admin); lockouts are per email, so someone could
  deliberately lock a known email out for 15 minutes.
- **Push notifications:** in-app notifications and browser notifications work; Firebase Cloud Messaging is not
  wired up. `src/lib/services/notifications.ts` is the single place to add it.
- **Real payments (GCash / Maya / cards)** are deferred, as the plan says.
- **Realtime** uses server-sent events from a single Node process, with polling as a fallback. A multi-instance
  deployment needs a shared channel (Postgres `LISTEN/NOTIFY` or Supabase Realtime) in `src/lib/bus.ts`.
- **POS offline mode:** the POS shows a connection-lost banner but doesn't queue sales offline yet.
- Single branch only; the schema has `branches` for later. Delivery, gift cards, tiers, recommendations: not built.
- Product/add-on/recipe editing is limited to price and on/off in the admin; the rest is changed via `db/seed.sql`.

## Layout

```
db/schema.sql, db/seed.sql        schema + demo catalogue
db/migrations/                    versioned upgrades, applied once each on start
src/lib/services/                 orders, inventory, loyalty, reports, catalog, auth, notifications
src/lib/db.ts                     PGlite (default) or node-postgres (DATABASE_URL)
src/app/api/                      HTTP API
src/app/app/                      customer app      src/app/pos/   POS      src/app/admin/   admin
tests/flow.test.ts                scenario tests
```
