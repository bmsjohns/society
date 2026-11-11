import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { CbEvent, MemberPatch, patchFromEvent } from "@/lib/chargebee";
import { db } from "@/lib/db";

// Chargebee → Settings → Webhooks: URL https://<host>/api/webhooks/chargebee with Basic auth
// set to CHARGEBEE_WEBHOOK_USER / CHARGEBEE_WEBHOOK_PASSWORD. Replaces the Make → Airtable sync,
// and covers cancellations, failed payments and renewals, not just new members.

const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function authorised(req: Request) {
  const user = process.env.CHARGEBEE_WEBHOOK_USER;
  const pass = process.env.CHARGEBEE_WEBHOOK_PASSWORD;
  if (!user || !pass) return false;
  const expected = Buffer.from(`Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`);
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const COLS: (keyof MemberPatch)[] = [
  "first_name", "last_name", "email", "phone", "chargebee_subscription_id", "chargebee_plan", "tier", "billing",
  "subscription_status", "next_renewal", "cancelled_at", "payment_failed_at", "grace_until",
];

export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const event = (await req.json()) as CbEvent;
  const patch = patchFromEvent(event, {
    now: new Date(),
    graceDays: Number(process.env.GRACE_DAYS ?? 14),
    foundingPlanIds: list(process.env.CHARGEBEE_FOUNDING_PLAN_IDS),
    societyPlanIds: list(process.env.CHARGEBEE_SOCIETY_PLAN_IDS),
  });
  if (!patch) return NextResponse.json({ ignored: true });

  const sql = db();
  const set = Object.fromEntries(COLS.filter((c) => patch[c] !== undefined).map((c) => [c, patch[c]]));
  const [existing] = await sql`select id from members where chargebee_customer_id = ${patch.chargebee_customer_id}`;
  if (existing) {
    if (Object.keys(set).length) await sql`update members set ${sql(set as never)} where id = ${existing.id}`;
    return NextResponse.json({ updated: existing.id });
  }
  // Only a subscription event creates a member (a bare customer_created may never subscribe).
  if (!event.content.subscription) return NextResponse.json({ ignored: true });
  const row = { ...set, chargebee_customer_id: patch.chargebee_customer_id, join_date: patch.join_date ?? null };
  const [created] = await sql`insert into members ${sql(row as never)}
    on conflict (chargebee_customer_id) do nothing returning id`;
  // No code is issued here: new members are handed a spare printed card, which a manager links to them.
  return NextResponse.json({ created: created?.id ?? null });
}
