import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// TEMPORARY one-off Airtable import (Nov 2026). Removed straight after use.
// Requires IMPORT_SECRET (32+ chars) in the x-import-secret header; otherwise behaves as if absent.

const MEMBERS_SQL = `with d as (select * from json_to_recordset($1::text::json) as d(airtable_record_id text, first_name text, last_name text, email text, phone text, date_of_birth date, tier text, billing text, subscription_status text, join_date date, next_renewal date, chargebee_customer_id text, chargebee_subscription_id text, chargebee_plan text, genres_loved json, genres_avoid json, favourite_books text, favourite_authors text, reading_now text, books_per_month text, reading_notes text, preferences_submitted date, marketing_consent boolean, founders_board_name text, welcome_pack_sent boolean, card_issued boolean, token text)),
ins as (insert into members (airtable_record_id, first_name, last_name, email, phone, date_of_birth, tier, billing, subscription_status, join_date, next_renewal, chargebee_customer_id, chargebee_subscription_id, chargebee_plan, genres_loved, genres_avoid, favourite_books, favourite_authors, reading_now, books_per_month, reading_notes, preferences_submitted, marketing_consent, founders_board_name, welcome_pack_sent, card_issued)
  select d.airtable_record_id, d.first_name, d.last_name, d.email, d.phone, d.date_of_birth, d.tier, d.billing, d.subscription_status, d.join_date, d.next_renewal, d.chargebee_customer_id, d.chargebee_subscription_id, d.chargebee_plan, coalesce(array(select json_array_elements_text(d.genres_loved)), '{}'), coalesce(array(select json_array_elements_text(d.genres_avoid)), '{}'), d.favourite_books, d.favourite_authors, d.reading_now, d.books_per_month, d.reading_notes, d.preferences_submitted, coalesce(d.marketing_consent, false), d.founders_board_name, coalesce(d.welcome_pack_sent, false), coalesce(d.card_issued, false) from d
  on conflict (airtable_record_id) do nothing returning id, airtable_record_id)
insert into member_tokens (token, member_id, kind)
select d.token, ins.id, 'card' from ins join d using (airtable_record_id);`;

const REDEMPTIONS_SQL = `insert into redemptions (member_id, benefit_key, period_key, station, redeemed_at, details, client_id)
select m.id, 'monthly_drink', 'm:' || to_char(r.day, 'YYYY-MM'), 'Airtable', (r.day + time '12:00') at time zone 'Europe/London',
  'Served by ' || r.served_by || ' (imported from Airtable)', md5(r.airtable_id)::uuid
from json_to_recordset($1::text::json) as r(airtable_id text, airtable_member text, day date, served_by text)
join members m on m.airtable_record_id = r.airtable_member
order by r.day
on conflict do nothing;`;

function ok(req: Request) {
  const s = process.env.IMPORT_SECRET ?? "";
  const got = Buffer.from(req.headers.get("x-import-secret") ?? "");
  return s.length >= 32 && got.length === Buffer.byteLength(s) && timingSafeEqual(got, Buffer.from(s));
}

export async function POST(req: Request) {
  if (!ok(req)) return new NextResponse(null, { status: 404 });
  const { members, redemptions } = await req.json();
  const sql = db();
  const before = (await sql`select (select count(*) from members)::int as m, (select count(*) from redemptions)::int as r`)[0];
  await sql.begin(async (tx) => {
    if (Array.isArray(members)) await tx.unsafe(MEMBERS_SQL, [JSON.stringify(members)]);
    if (Array.isArray(redemptions)) await tx.unsafe(REDEMPTIONS_SQL, [JSON.stringify(redemptions)]);
  });
  const after = (await sql`select (select count(*) from members)::int as m, (select count(*) from redemptions)::int as r,
    (select count(*) from member_tokens)::int as t`)[0];
  return NextResponse.json({ before, after });
}
