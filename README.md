# Prologue Society Scan

Staff-facing web app (PWA) that scans a Prologue Society member's card or wallet pass and, in about a second, shows who they are, whether their membership is valid and which benefits they can use now. See [`docs/spec.md`](docs/spec.md) for the brief and [`docs/design/`](docs/design) for the screen designs.

**Stack:** Next.js 15 on Vercel · Clerk (staff sign-in) · Supabase Postgres (server-side only) · qr-scanner (device camera) · Chargebee and Typeform webhooks.

## What's in v1

| Screen | Route | Device |
| --- | --- | --- |
| Scan (phone, or tablet landscape with last scans) | `/scan` | Bar, floor handhelds, event door |
| Member screen: status band, Today, Mark as used, manager undo | after a scan, `/member/[id]` | all staff |
| Look up (name or email, 3+ characters) and Recent scans | `/lookup`, `/recent` | all staff |
| Concierge staff view: Today, Benefits, Notes, What we know, Visits | `/concierge` | staff tablet at the desk |
| Customer screen: idle, "Welcome back", self-scan splash, neutral welcome | `/display` | member-facing screen at the desk |
| Manage: benefit counts, undo, scan log, staff and PINs, desks, events, member codes | `/manage` | managers |
| Device setup (once per device) | `/setup` | |

**Rules enforced in the database.** One use per allowance period (`redemptions_one_per_period` unique index), so two tills can't pour the same drink. Offline redemptions carry a `client_id`, so a retry never double-counts. Undo is managers only, within 24 hours, with a reason.

**Status.** `Active` (Chargebee active / in trial / non-renewing), `Grace` (payment failed, until Chargebee's next retry or `GRACE_DAYS`, still gets benefits), `Lapsed` (cancelled / paused: no benefits), `Not recognised` (unknown or revoked code), `Offline` (cached result on this device, flagged unverified).

**Privacy.** No email, phone, address or payment details on any member screen. Customer screens show first name only and never give a lapsed member a reason. Supabase is reached only from the server; RLS is on with no policies, so the public Supabase API exposes nothing. The scan log is deleted after 12 months by a daily Vercel cron.

## Data

All Society data lives in Supabase (`supabase/migrations`). Airtable is no longer used by the app.

- **Chargebee → app** (`/api/webhooks/chargebee`) creates and updates members, including cancellations, failed payments and renewals. New members get a QR code (`PS-XXXXXXXX`) automatically.
- **Typeform → app** (`/api/webhooks/typeform`) stores reading preferences and birthday.
- **Airtable → app**, once: `npm run import:airtable` (dry run) then `-- --write`. It imports members, notes and past redemptions, issues codes, and skips the "Unassigned card" placeholder rows.

## Set up

1. **Supabase.** Create a project in the EU (London) region. From *Connect*, copy the **Transaction pooler** string (port 6543) for `DATABASE_URL` and the **Session pooler** string (port 5432) for `MIGRATE_DATABASE_URL`. Then run:
   ```bash
   npm install
   MIGRATE_DATABASE_URL=... npm run db:migrate
   ```
2. **Clerk.** Create an application and turn on email sign-in only. Under *Restrictions*, allowlist `prologuebooks.co.uk`. Optionally add `{"email": "{{user.primary_email_address}}"}` to the session token (saves a lookup per request). Set `ALLOWED_EMAIL_DOMAINS` as well; the server checks it too.
3. **Vercel.** Import the repo and add every variable in `.env.example`. Add the domain `scan.prologuebooks.co.uk`. The cron in `vercel.json` needs `CRON_SECRET`.
4. **Chargebee.** Settings → Webhooks → add `https://scan.prologuebooks.co.uk/api/webhooks/chargebee` with Basic auth, then point the old Make scenario's member sync at nothing.
5. **Typeform.** On the Reading Preferences form, set question *Refs* to `email`, `date_of_birth`, `genres_loved`, `genres_avoid`, `favourite_books`, `favourite_authors`, `reading_now`, `books_per_month`, `reading_notes`. Then add the webhook with a secret.
6. **Import from Airtable.** Run `npm run import:airtable` with an Airtable token (read-only on the Prologue Society base).
7. **First use.** Open the app on any device and sign in. The first person adds themselves as a manager with a PIN. Under **Manage**, add staff, add a *Desk* for the concierge pair, and add tonight's Society evenings. Then set up each device under `/setup`.

## Develop

```bash
cp .env.example .env.local      # set DATABASE_URL, SESSION_SECRET, DEV_NO_AUTH=1
npm run db:migrate
npm run db:seed-demo -- --yes   # invented members matching the designs; Jo's PIN is 1234
npm run dev
npm test                        # with DATABASE_URL set, includes the concurrency tests
```

Demo codes for testing with a keyboard or a QR generator: `PS-7F3K9Q2M` (Sarah, founding), `PS-TW8GRACE` (grace), `PS-EM4LAPSE` (lapsed), `PS-PS2BDAY9` (birthday month), `PS-AB6ALEX7`, `PS-MH3DONE4` (drink used), `PS-OLDCARD2` (revoked). USB and Bluetooth barcode scanners that type the code and press Enter also work on every scan screen.
