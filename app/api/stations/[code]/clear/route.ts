import { NextResponse } from "next/server";
import { requireDevice, route } from "@/lib/auth";
import { pushToStation } from "@/lib/stations";

/** Staff tapped "Scan next": clear the welcome screen back to idle. */
export const POST = route(async (_req: Request, { params }: { params: Promise<{ code: string }> }) => {
  await requireDevice();
  const { code } = await params;
  await pushToStation(code, { payload: null, scan: null });
  return NextResponse.json({ ok: true });
});
