import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Uptime check: can the app reach its database? Reveals nothing else. */
export async function GET() {
  const started = Date.now();
  try {
    await db()`select 1`;
    return NextResponse.json({ ok: true, dbMs: Date.now() - started });
  } catch (e) {
    console.error("health: database unreachable", e);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
