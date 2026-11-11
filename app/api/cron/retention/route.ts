import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Daily (vercel.json). Scan log is kept 12 months, then deleted. */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const scans = await db()`delete from scans where scanned_at < now() - interval '12 months'`;
  // Welcome screens never keep a member's name around overnight.
  await db()`update stations set current_payload = null, current_scan = null, current_member_id = null
    where current_at < now() - interval '1 hour'`;
  return NextResponse.json({ deletedScans: scans.count });
}
