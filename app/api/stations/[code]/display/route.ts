import { NextResponse } from "next/server";
import { HttpError, requireDevice, route } from "@/lib/auth";
import { db } from "@/lib/db";

/** The welcome screen polls this (about once a second). Doubles as its heartbeat. */
export const GET = route(async (_req: Request, { params }: { params: Promise<{ code: string }> }) => {
  await requireDevice();
  const { code } = await params;
  const [row] = await db()`
    update stations set display_seen_at = now() where code = ${code}
    returning name, current_seq, current_payload, current_at`;
  if (!row) throw new HttpError(404, "Unknown station code");
  return NextResponse.json({ name: row.name, seq: Number(row.current_seq), payload: row.current_payload, at: row.current_at });
});
