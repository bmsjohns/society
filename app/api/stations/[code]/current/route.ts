import { NextResponse } from "next/server";
import { HttpError, requireDevice, route } from "@/lib/auth";
import { db } from "@/lib/db";

/** The staff concierge view polls this. Doubles as its heartbeat, which switches the welcome screen from self-scan splash to welcome. */
export const GET = route(async (_req: Request, { params }: { params: Promise<{ code: string }> }) => {
  await requireDevice();
  const { code } = await params;
  const [row] = await db()`
    update stations set staff_seen_at = now() where code = ${code}
    returning name, current_seq, current_scan, current_at, display_seen_at`;
  if (!row) throw new HttpError(404, "Unknown station code");
  return NextResponse.json({
    name: row.name,
    seq: Number(row.current_seq),
    scan: row.current_scan,
    at: row.current_at,
    displayOnline: !!row.display_seen_at && Date.now() - row.display_seen_at.getTime() < 15_000,
  });
});
