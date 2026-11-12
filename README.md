# Checkout Pulse

A tap-to-rate customer feedback kiosk for one Android tablet at a shop counter, with a small dashboard behind it.

**[Try the demo](https://checkout-pulse.vercel.app/demo)** · [Case study](https://charl.space/checkout-pulse/)

Customers tap one of five faces (or three) on their way out. Each tap is stored with its time, and the owner gets a dashboard showing how satisfaction moves by day, hour and weekday, plus a CSV export for proper analysis.

## Why

A shop wanted a feel for how customers leave the checkout, without QR codes, email surveys or another app. It had one spare Android tablet. The brief was simple: one tap, no typing, and numbers that someone can actually act on.

## Constraints that shaped it

- **One tablet, unattended, all day.** It has to survive the Wi-Fi dropping, the screen sleeping and the browser being closed.
- **Two seconds of attention.** Big targets, no text input, and an obvious "thank you" so the next person sees a fresh screen.
- **No staff logins.** Nobody at the counter should need an account, and a stranger who finds the URL shouldn't be able to flood it.
- **Owner-friendly data.** It must be easy to read at a glance and easy to pull into a spreadsheet.

## How it works

```
 Tablet (installed PWA)                    Vercel                     Neon Postgres
 ┌──────────────────────┐   POST /api/rate  ┌──────────────┐   insert  ┌─────────────┐
 │ tap → local queue ───┼──────────────────▶│ serverless   │──────────▶│ responses   │
 │ (localStorage)       │  X-Kiosk-Key      │ functions    │           │ settings    │
 └──────────────────────┘                   │              │◀──────────┤             │
 Admin page  ── Bearer password ──────────▶ │ /api/results │  SQL aggs └─────────────┘
                                            └──────────────┘
```

- **Offline-first kiosk.** Every tap goes into a queue on the device first and syncs in batches. If the network is down, ratings wait on the tablet and send when it's back. A service worker lets the app open with no connection at all.
- **Idempotent sync.** Each tap gets a client-generated ID and the insert is `ON CONFLICT DO NOTHING`, so retries can never double-count.
- **Device key, not logins.** The tablet is set up once with a link carrying a key. The key is stored on the device and stripped from the URL, and the API rejects anything without it. The admin side uses a separate password.
- **UTC in, local out.** Timestamps are stored in UTC and reported in Cape Town time in SQL, so "busiest hour" is the shop's hour, not the server's.
- **One comparable score.** Ratings map onto 0–100, so switching between 3 and 5 faces doesn't break the trend line.
- **Worst on the left.** Rating scales conventionally run low to high, and people favour the first options they see. Putting "Excellent" on the right keeps that position bias from flattering the numbers.

## Stack

Plain HTML, CSS and JavaScript with no framework, installable as a PWA · Vercel serverless functions (Node) · Neon Postgres via `@neondatabase/serverless`

It started as a single-page prototype that stored ratings in a hosted page, which proved the flow on the tablet in an evening. It moved to Vercel and Neon so the kiosk could run on a public URL without anyone's login.

## Project layout

```
public/index.html      kiosk (installable, offline queue, staff panel)
public/admin.html      password-protected dashboard
public/demo.html       demo: kiosk + dashboard on sample data, nothing saved
public/sw.js           service worker for offline start-up
api/rate.js            kiosk → database (validated, idempotent)
api/results.js         dashboard aggregates; DELETE clears a period (test taps)
api/export.js          CSV export
api/config.js          question text and 3/5-face setting
lib/db.js              connection, schema bootstrap, auth helpers
```

## Run your own

1. Deploy to Vercel and add a Neon database from the Vercel Marketplace (it sets `DATABASE_URL`).
2. Set two environment variables:
   - `KIOSK_KEY`: a long random string
   - `ADMIN_PASSWORD`: the dashboard password
3. Redeploy. Tables are created on first use.
4. On the tablet, open `https://<your-app>/?k=<KIOSK_KEY>` once, then use **Add to Home screen**. Turning on Android app pinning keeps it locked to the kiosk.
5. The dashboard is at `/admin`. On the tablet, holding the bottom-right corner for two seconds opens a staff panel with sync status.

See `.env.example`. Never commit real keys.

## What's next

- Several tablets or locations, compared side by side
- An optional "what went wrong?" follow-up after a low score
- A weekly email digest for the owner

## Licence

MIT
