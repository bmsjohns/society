// One-off move of the Prologue Society Airtable base into Supabase.
//   AIRTABLE_TOKEN=pat... DATABASE_URL=... npm run import:airtable          (dry run: counts only)
//   AIRTABLE_TOKEN=pat... DATABASE_URL=... npm run import:airtable -- --write
// Safe to re-run: members match on Airtable record ID, then Chargebee customer ID.
// Every imported member without a code gets one (PS-XXXXXXXX). Placeholder rows such as
// "Unassigned card 11" (no email, no Chargebee ID) are skipped and listed.
import { randomInt } from "node:crypto";
import postgres from "postgres";

const BASE = process.env.AIRTABLE_BASE_ID ?? "appMpK8uzR3jDt68w";
const TOKEN = process.env.AIRTABLE_TOKEN;
const WRITE = process.argv.includes("--write");
if (!TOKEN) throw new Error("Set AIRTABLE_TOKEN (read access to the Prologue Society base)");
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL");

async function all(table) {
  const out = [];
  let offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`);
    u.searchParams.set("pageSize", "100");
    if (offset) u.searchParams.set("offset", offset);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    const j = await res.json();
    out.push(...j.records);
    offset = j.offset;
    await new Promise((r) => setTimeout(r, 220)); // 5 requests/second limit
  } while (offset);
  return out;
}

const STATUS = { Active: "active", "In trial": "in_trial", "Non renewing": "non_renewing", Paused: "paused", Cancelled: "cancelled" };
const BENEFIT = { "Monthly free drink": "monthly_drink", "Birthday book": "birthday_book", "Personal shopping session": "personal_shopping", "Society evening": "society_evening" };
const ALPHA = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const token = () => "PS-" + Array.from({ length: 8 }, () => ALPHA[randomInt(ALPHA.length)]).join("");
const pad = (n) => String(n).padStart(2, "0");

/** Same rule as lib/time.ts membershipYearStart, on YYYY-MM-DD strings. */
function yearKey(join, day) {
  if (!join) return `y:${day.slice(0, 4)}`;
  const [, jm, jd] = join.split("-").map(Number);
  const [y] = day.split("-").map(Number);
  const ann = (yy) => { const leap = (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0; return `${yy}-${pad(jm)}-${pad(jm === 2 && jd === 29 && !leap ? 28 : jd)}`; };
  return `y:${ann(y) <= day ? ann(y) : ann(y - 1)}`;
}

function memberRow(r) {
  const f = r.fields;
  const first = f["First name"] ?? (f["Full name"] ?? "").split(" ")[0] ?? "";
  const last = f["Last name"] ?? (f["Full name"] ?? "").split(" ").slice(1).join(" ");
  return {
    airtable_record_id: r.id,
    first_name: first.trim(), last_name: last.trim(),
    email: f.Email?.trim().toLowerCase() || null, phone: f.Phone ?? null,
    date_of_birth: f["Date of birth"] ?? null,
    tier: f.Tier === "Founding" ? "Founding" : "Standard",
    billing: f.Billing ?? null,
    subscription_status: STATUS[f.Status] ?? null,
    join_date: f["Join date"] ?? null, next_renewal: f["Next renewal"] ?? null,
    chargebee_customer_id: f["Chargebee customer ID"]?.trim() || null,
    chargebee_subscription_id: f["Chargebee subscription ID"] ?? null,
    chargebee_plan: f["Chargebee plan"] ?? null,
    genres_loved: f["Genres loved"] ?? [], genres_avoid: f["Genres to avoid"] ?? [],
    favourite_books: f["Favourite books"] ?? null, favourite_authors: f["Favourite authors"] ?? null,
    reading_now: f["Reading now"] ?? null, books_per_month: f["Books per month"] ?? null,
    reading_notes: f["Reading notes"] ?? null, preferences_submitted: f["Preferences submitted"] ?? null,
    marketing_consent: !!f["Marketing consent"], founders_board_name: f["Name on founders board"] ?? null,
    welcome_pack_sent: !!f["Welcome pack sent"], card_issued: !!f["Membership card issued"],
    _notes: f.Notes ?? null,
  };
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const [members, benefits, redemptions] = await Promise.all([all("Members"), all("Benefits"), all("Redemptions")]);
const benefitName = Object.fromEntries(benefits.map((b) => [b.id, b.fields.Benefit]));

const rows = members.map(memberRow);
const real = rows.filter((m) => m.email || m.chargebee_customer_id);
const skipped = rows.filter((m) => !(m.email || m.chargebee_customer_id));
console.log(`Airtable: ${members.length} member rows, ${real.length} to import, ${skipped.length} placeholders skipped`);
if (skipped.length) console.log("  skipped:", skipped.map((m) => `${m.first_name} ${m.last_name}`.trim()).join(", "));
console.log(`Airtable: ${redemptions.length} redemptions`);
if (!WRITE) {
  console.log("Dry run. Re-run with --write to import.");
  await sql.end();
  process.exit(0);
}

const idByRec = {};
let created = 0, updated = 0, notes = 0, tokens = 0;
for (const m of real) {
  const { _notes, ...row } = m;
  const [hit] = await sql`select id from members where airtable_record_id = ${m.airtable_record_id}
    or (${m.chargebee_customer_id}::text is not null and chargebee_customer_id = ${m.chargebee_customer_id}) limit 1`;
  let id;
  if (hit) {
    await sql`update members set ${sql(row)} where id = ${hit.id}`;
    id = hit.id; updated++;
  } else {
    [{ id }] = await sql`insert into members ${sql(row)} returning id`;
    created++;
    if (_notes) { await sql`insert into member_notes (member_id, body) values (${id}, ${_notes.slice(0, 2000)})`; notes++; }
  }
  idByRec[m.airtable_record_id] = id;
  const [{ n }] = await sql`select count(*)::int as n from member_tokens where member_id = ${id} and revoked_at is null`;
  if (n === 0) { await sql`insert into member_tokens (token, member_id, kind) values (${token()}, ${id}, 'card')`; tokens++; }
}

let red = 0, redSkipped = 0;
for (const r of redemptions) {
  const f = r.fields;
  const memberId = idByRec[f.Member?.[0]];
  const key = BENEFIT[benefitName[f.Benefit?.[0]]];
  if (!memberId || !key || !f.Date) { redSkipped++; continue; }
  const [m] = await sql`select join_date from members where id = ${memberId}`;
  const day = f.Date.slice(0, 10);
  // Old Society evening check-ins were quarterly with no event attached: keep them as history only.
  const period = key === "monthly_drink" ? `m:${day.slice(0, 7)}` : key === "society_evening" ? `legacy:${r.id}` : yearKey(m.join_date, day);
  const res = await sql`insert into redemptions (member_id, benefit_key, period_key, station, redeemed_at, details, client_id)
    values (${memberId}, ${key}, ${period}, 'Airtable', ${day + "T12:00:00Z"}, ${[f["Served by"], f.Details].filter(Boolean).join(" · ") || null},
            md5(${r.id})::uuid)
    on conflict do nothing`;
  res.count ? red++ : redSkipped++;
}
console.log(`Members: ${created} created, ${updated} updated, ${tokens} codes issued, ${notes} notes. Redemptions: ${red} imported, ${redSkipped} skipped.`);
await sql.end();
