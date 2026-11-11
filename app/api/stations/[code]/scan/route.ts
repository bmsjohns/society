import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, currentDevice, requireDevice, route } from "@/lib/auth";
import { displayPayloads, findByToken, loadContext, logScan, staffView } from "@/lib/repo";
import { getStation, pushToStation, staffLive } from "@/lib/stations";
import { extractToken } from "@/lib/tokens";
import type { DisplayPayload } from "@/lib/types";

const Body = z.object({ raw: z.string().max(500) });

/**
 * A member scanned at the customer-facing screen.
 * Staff view open → "Welcome back" here, full profile on the staff tablet.
 * No staff view → self-scan splash. Lapsed/unknown → neutral, never a reason.
 */
export const POST = route(async (req: Request, { params }: { params: Promise<{ code: string }> }) => {
  await requireDevice();
  const { code } = await params;
  const station = await getStation(code);
  if (!station) throw new HttpError(404, "Unknown station code");
  const { raw } = Body.parse(await req.json());
  const device = await currentDevice();
  const token = extractToken(raw);
  const { member, revokedAt, spare } = token ? await findByToken(token) : { member: null, revokedAt: null, spare: null };
  const live = staffLive(station);
  const stationName = station.name as string;

  let payload: DisplayPayload;
  if (!member) {
    payload = live ? { kind: "neutral" } : { kind: "neutral-splash" };
    await logScan({ token: token ?? raw.slice(0, 40), memberId: null, result: "unrecognised", station: stationName, mode: live ? "welcome" : "kiosk", staffId: null, deviceId: device.id });
  } else {
    const ctx = await loadContext(member);
    const p = displayPayloads(ctx);
    payload = live ? p.welcome : p.splash;
    await logScan({ token, memberId: member.id, result: staffView(ctx).band.state, station: stationName, mode: live ? "welcome" : "kiosk", staffId: null, deviceId: device.id });
  }
  const seq = await pushToStation(code, {
    payload,
    scan: { token, memberId: member?.id ?? null, revokedAt: revokedAt ? revokedAt.toISOString() : null, spare: spare?.label ?? null },
  });
  return NextResponse.json({ payload, seq });
});
