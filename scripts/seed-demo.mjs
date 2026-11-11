// Demo data matching the design screens, for a local or preview database only.
//   DATABASE_URL=... npm run db:seed-demo -- --yes
// Staff PINs: Jo 1234 (manager), Sam 2222, Mina 3333. Desk code DESK1.
import { randomBytes, scryptSync } from "node:crypto";
import postgres from "postgres";

if (!process.argv.includes("--yes")) throw new Error("This adds invented members. Pass --yes, and never run it against production.");
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const pin = (p) => { const s = randomBytes(16); return `scrypt$${s.toString("base64")}$${scryptSync(p, s, 32).toString("base64")}`; };

const now = new Date();
const ymd = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => new Date(now.getTime() - n * 86400_000);
const month = now.getUTCMonth() + 1;
const pad = (n) => String(n).padStart(2, "0");

await sql.begin(async (tx) => {
  await tx`delete from stations where code = 'DESK1'`;
  await tx`delete from members where email like '%@example.com'`;
  await tx`delete from staff where name in ('Jo', 'Sam', 'Mina')`;
  await tx`delete from events where name in ('Poetry & Pints')`;

  const [jo] = await tx`insert into staff (name, role, pin_hash) values ('Jo', 'manager', ${pin("1234")}) returning id`;
  const [sam] = await tx`insert into staff (name, role, pin_hash) values ('Sam', 'staff', ${pin("2222")}) returning id`;
  const [mina] = await tx`insert into staff (name, role, pin_hash) values ('Mina', 'staff', ${pin("3333")}) returning id`;
  await tx`insert into stations (code, name) values ('DESK1', 'Concierge desk')`;

  const tonight = new Date(now); tonight.setUTCHours(19, 0, 0, 0);
  const [ev] = await tx`insert into events (name, starts_at) values ('Poetry & Pints', ${tonight}) returning id`;

  const people = [
    { t: "PS-7F3K9Q2M", first_name: "Sarah", last_name: "Okafor", tier: "Founding", st: "active", join: "2024-03-14", renew: "2027-03-14", dob: "1988-07-02",
      genres_loved: ["Literary fiction", "Poetry"], favourite_books: "Pachinko\nThe Remains of the Day" },
    { t: "PS-TW8GRACE", first_name: "Tom", last_name: "Whitley", tier: "Standard", st: "active", grace: 7, join: "2025-09-04", renew: ymd(daysAgo(7)), dob: "1979-01-20" },
    { t: "PS-EM4LAPSE", first_name: "Elena", last_name: "Marsh", tier: "Standard", st: "cancelled", join: "2025-01-10", cancelled: "2026-10-02", dob: "1990-05-05" },
    { t: "PS-PS2BDAY9", first_name: "Priya", last_name: "Shah", tier: "Standard", st: "active", join: "2024-06-21", renew: "2027-06-21", dob: `1991-${pad(month)}-21`,
      genres_loved: ["Translated fiction", "Nature writing"], favourite_books: "Piranesi\nThe Remains of the Day", reading_now: "Kairos" },
    { t: "PS-AB6ALEX7", first_name: "Alex", last_name: "Brennan", tier: "Standard", st: "active", join: "2025-01-08", renew: "2027-01-08", dob: "1985-02-11" },
    { t: "PS-MH3DONE4", first_name: "Marcus", last_name: "Hale", tier: "Standard", st: "active", join: "2025-08-30", renew: "2027-08-30", dob: "1993-04-09" },
  ];
  const ids = {};
  for (const p of people) {
    const [m] = await tx`insert into members ${tx({
      first_name: p.first_name, last_name: p.last_name, email: `${p.first_name.toLowerCase()}.${p.last_name.toLowerCase()}@example.com`,
      tier: p.tier, subscription_status: p.st, join_date: p.join, next_renewal: p.renew ?? null, date_of_birth: p.dob,
      grace_until: p.grace ? new Date(now.getTime() + p.grace * 86400_000) : null,
      payment_failed_at: p.grace ? daysAgo(2) : null,
      cancelled_at: p.cancelled ? new Date(p.cancelled) : null,
      genres_loved: p.genres_loved ?? [], favourite_books: p.favourite_books ?? null, reading_now: p.reading_now ?? null,
    })} returning id`;
    ids[p.first_name] = m.id;
    await tx`insert into member_tokens (token, member_id) values (${p.t}, ${m.id})`;
  }
  await tx`insert into member_tokens (token, member_id, revoked_at, revoked_reason) values ('PS-OLDCARD2', ${ids.Alex}, now() - interval '20 days', 'Replaced')`;

  const thisMonth = `m:${now.getUTCFullYear()}-${pad(month)}`;
  await tx`insert into redemptions (member_id, benefit_key, period_key, station, staff_id, redeemed_at) values
    (${ids.Priya}, 'monthly_drink', ${thisMonth}, 'Bar', ${sam.id}, ${daysAgo(1)}),
    (${ids.Marcus}, 'monthly_drink', ${thisMonth}, 'Bar', ${mina.id}, ${daysAgo(3)}),
    (${ids.Sarah}, 'personal_shopping', 'y:2026-03-14', 'Floor', ${mina.id}, '2026-09-12T14:10:00Z'),
    (${ids.Tom}, 'personal_shopping', 'y:2025-09-04', 'Floor', ${sam.id}, '2026-10-02T10:30:00Z'),
    (${ids.Sarah}, 'monthly_drink', 'm:2026-10', 'Bar', ${sam.id}, '2026-10-03T18:00:00Z')`;
  await tx`insert into event_guests (event_id, member_id) values (${ev.id}, ${ids.Sarah})`;
  await tx`insert into member_notes (member_id, staff_id, body, created_at) values
    (${ids.Priya}, ${jo.id}, 'Asked us to hold the next translated fiction prize shortlist for her.', ${daysAgo(9)}),
    (${ids.Priya}, ${sam.id}, 'Birthday on the 21st. Mentioned she might bring friends to Poetry & Pints.', ${daysAgo(17)}),
    (${ids.Priya}, ${mina.id}, 'Oat milk. Usually sits at the window table.', ${daysAgo(58)})`;
  for (const [name, d, st] of [["Priya", 1, "Bar"], ["Priya", 17, "Floor"], ["Priya", 39, "Bar"], ["Sarah", 2, "Concierge"], ["Tom", 4, "Bar"]]) {
    await tx`insert into scans (member_id, result, station, scanned_at, device_id) values (${ids[name]}, 'active', ${st}, ${daysAgo(d)}, 'seed')`;
  }
});
console.log("Demo data in place. Tokens: PS-7F3K9Q2M (Sarah, founding), PS-TW8GRACE (Tom, grace), PS-EM4LAPSE (Elena, lapsed), PS-PS2BDAY9 (Priya, birthday month), PS-AB6ALEX7 (Alex), PS-MH3DONE4 (Marcus, drink used), PS-OLDCARD2 (revoked).");
await sql.end();
