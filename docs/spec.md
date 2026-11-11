# Prologue Society: Member Scan App Spec

Nov 11, 2026 · @Ben Johns

## Purpose and scope

A small staff-facing app that scans a Prologue Society member's pass or card and, within about a second, shows who they are, whether their membership is valid, and which benefits they can use right now.

**In scope (v1)**

- Scan a member QR code from an Apple Wallet pass, Google Wallet pass or printed card, using the device camera
- Show a member screen: name, photo (if held), tier, founding status, membership status and renewal date
- Show benefit availability, starting with the monthly complimentary drink
- Let staff log a benefit redemption with one tap
- Manual lookup by name or email when a member has no pass on them

**Out of scope (v1)**

- Issuing or designing wallet passes (handled by the membership app)
- Taking payment, changing a membership or editing member details
- Square integration (discount or redemption applied at the till)
- Anything at Simply Books: Society benefits are Prologue only

## Users and devices

Any floor team member can scan; managers get a few extra controls. The app runs in a phone or tablet browser so it works on whatever is at each station.

| Station | Typical device | Main use |
| --- | --- | --- |
| Concierge desk | Staff tablet plus a customer-facing welcome screen with the scanner | Full member profile for staff, welcome message for the member, event check-in, manual lookup |
| Bar / coffee counter | Tablet or staff phone | Monthly drink redemption |
| Floor (handhelds) | Staff phone | Personal shopping sessions, ad hoc checks |
| Society events | Staff phone or tablet at the door | Entry check for Society-only evenings |

**Roles**

- **Staff:** scan, look up, log a redemption
- **Manager:** everything above, plus undo a redemption and see the scan log

## Data sources

The app reads members from the Prologue Society Airtable base and writes redemptions back to it. Chargebee stays the billing source of truth; Make already syncs new members from Chargebee into Airtable.

| Data | Source | App access |
| --- | --- | --- |
| Member identity (name, email, photo) | Airtable: Members | Read |
| Tier, founding flag | Airtable: Members (from Chargebee) | Read |
| Subscription status, renewal date | Chargebee, synced to Airtable by Make | Read |
| Birthday, reading preferences | Airtable (from Typeform) | Read, shown lightly |
| Benefit redemptions | Airtable: Benefit Use | Read and write |
| Scan log | Airtable: Scans (or app database) | Write |

**What the QR code holds**

The QR encodes an opaque member token (for example `PS-7F3K9Q2M`), never a name, email or Chargebee ID. The token maps to one Airtable record. A lost card is handled by issuing a new token and revoking the old one.

**Status freshness**

The Make sync must also push cancellations, failed payments and renewals, not just new members. Otherwise a lapsed member will scan as valid.

## Screens

Four screens cover v1. The member screen must be readable at arm's length in a busy bar, so status is shown as a full-width colour band, not small text.

**1. Scan screen (home)**

- Live camera viewfinder filling most of the screen, scanning continuously
- Station name at the top (Concierge, Bar, Floor, Event door), set once per device
- Buttons: Look up member, Recent scans
- Haptic and sound feedback on a successful read

**2. Member screen (after a scan)**

- Status band across the top (see states below)
- Name in large type, photo if held, tier and a Founding Member badge where relevant
- Member since, renews on
- Benefits panel: each benefit with its availability, e.g. "Monthly drink: available" or "Used 4 Nov at the Bar"
- One-tap Redeem button next to any redeemable benefit
- Small extras: birthday this month, favourite genres (a conversation prompt for booksellers)
- Auto-returns to the scan screen after 20 seconds, or on tap

**3. Manual lookup**

- Search by name or email, minimum 3 characters
- Results show name, tier and status only; tap through to the member screen

**4. Recent scans**

- Last 20 scans on this device, with time and result, so staff can reopen a member they just served

**5. Concierge mode (two screens)**

At the concierge desk a scan drives two screens at once: a full profile for staff, and a personal welcome for the member.

- **Member-facing welcome screen:** "Welcome back, Sarah" in brand type, with a short line that changes by context, e.g. "Your monthly drink is waiting at the bar", "Happy birthday month, your birthday book is ready" or "You're on the list for tonight". Founding members get a founder line. Shows first name only, clears after 8 seconds, then returns to an idle Society screen.
- **Staff concierge view:** the full picture for greeting and serving the member, in four panels:
  - **Today:** everything they can use today, each with a one-tap Mark as used (e.g. this month's drink, birthday book in their birthday month, tonight's Society evening, a booked personal shopping session)
  - **Benefits:** every benefit with what has been used this membership year, when and at which station
  - **What we know:** member since, tier, founding status, birthday, reading preferences, favourite books and genres
  - **Notes:** staff notes on the member, newest first, with Add note
- **Pairing:** the welcome screen is a second device (tablet or small display) paired to the staff tablet by a station code, so either can be replaced independently.
- **Lapsed or unrecognised:** the welcome screen shows a neutral "Welcome to Prologue" only; the reason is shown to staff, never to the member.

**6. Self-scan splash (member scans on their own)**

When a member scans at a customer-facing screen with no staff view open, they get a branded splash about them, never the staff profile.

- **Shows:** first name, tier, Founding Member badge, member since, and what is ready for them today (e.g. monthly drink, birthday book, tonight's Society evening)
- **Never shows:** notes, preferences history, benefit usage log, contact or payment details, or any Mark as used buttons
- **Next step line:** tells them where to go, e.g. "Show this at the bar for your drink"
- **Clears** after 8 seconds back to the idle Society screen
- **Lapsed or unrecognised:** neutral "Welcome to Prologue" with "Pop over to the concierge desk", no reason given

**Scan result states**

| State | Band colour | When | Staff action |
| --- | --- | --- | --- |
| Active | Green | Paid and in date | Welcome, offer benefits |
| Grace | Amber | Payment failed, within retry window | Serve benefits, mention their payment politely |
| Lapsed | Red | Cancelled or expired | No benefits; offer to rejoin |
| Not recognised | Grey | Token unknown or revoked | Try manual lookup |
| Offline | Grey, striped | No connection to the data | Show last cached result, flag it as unverified |

## Benefit redemption

Only benefits with a usage limit are redeemable in the app; the rest are shown for information. Every redemption writes one row to Airtable: member, benefit, station, staff member, timestamp.

| Benefit | Limit | In app |
| --- | --- | --- |
| Monthly complimentary drink | 1 per calendar month | Redeem button |
| Personal shopping session | 1 x 20 min per membership year | Redeem button (marks session used) |
| Birthday book | 1 per membership year, birthday month | Redeem button, shown only in birthday month |
| Society-only evenings | Per event | Check-in at the door |
| Priority / presale booking | n/a | Info only |
| Member hotline | n/a | Info only |

**Rules**

- Redeem asks for one confirm tap, to stop accidental double taps
- A benefit already used shows when and where, and the Redeem button is disabled
- Managers can undo a redemption within 24 hours, with a reason
- Lapsed and unrecognised members cannot redeem anything

## Access, security and privacy

Staff sign in once per device and stay signed in; a quick PIN switches who is logged against redemptions. The app shows the minimum member data needed to serve someone.

- **Sign-in:** Clerk, staff accounts only, restricted to Prologue email addresses
- **Staff switching:** 4-digit PIN per staff member on shared tablets, so redemptions are attributed correctly
- **Data shown:** no email, phone, address or payment details on the standard member screen; the staff concierge view adds notes and preferences but still no contact or payment details, and faces away from the queue
- **Airtable keys:** held server-side only, never in the browser
- **Tokens:** opaque and revocable, so a photographed card cannot reveal anything or be reused after revocation
- **Scan log:** kept 12 months, then deleted (GDPR data minimisation)

## Tech approach and build phases

Build it as a Next.js web app on Vercel with Clerk, matching the Society app stack, installed to home screens as a PWA. No app store release is needed, and any device with a camera works.

- **Scanning:** browser camera with a lightweight QR library (e.g. ZXing or html5-qrcode)
- **Data:** Next.js API routes call Airtable server-side; cache member lookups for 60 seconds to stay within Airtable rate limits (5 requests a second per base)
- **Offline:** cache the last scans per device; redemptions made offline are queued and synced when back online
- **Hosting:** a subdomain such as `scan.prologuebooks.co.uk`

**Phases**

1. **Scan and show:** scan screen, member screen with status, manual lookup. Usable at the door and desk on its own.
2. **Redeem:** monthly drink, personal shopping and birthday book redemptions, staff PIN switching, manager undo.
3. **Events and reporting:** Society evening check-in, scan log view, simple counts of benefit use for the Backstage Society hub.

## Open questions

- [ ] Do wallet passes already exist with a QR on them? If so, what does the QR currently encode?
- [ ] Should printed cards carry the same QR as the wallet pass, or a separate token?
- [ ] Is there a grace period for failed payments, and should it allow benefits?
- [ ] Is the monthly drink per calendar month or per 30 days from last use, and is there a value cap?
- [ ] Do we hold member photos, and do we want them on screen?
- [ ] Should Society events check-in live here in phase 3, or in Events Centre?
- [ ] Does Square need to know a drink was redeemed (e.g. a £0 item rung through for stock), or is the Airtable log enough?
