import { NextResponse } from "next/server";
import { z } from "zod";
import { currentDevice, requireStaff, route } from "@/lib/auth";
import { redeem } from "@/lib/repo";

const Body = z.object({
  memberId: z.string().uuid(),
  benefitKey: z.string().max(40),
  eventId: z.string().uuid().nullish(),
  clientId: z.string().uuid(),
  offline: z.boolean().optional(),
  redeemedAt: z.string().datetime().optional(),
  details: z.string().max(200).nullish(),
});

/** Mark a benefit as used. Idempotent on clientId, so the offline queue can retry safely. */
export const POST = route(async (req: Request) => {
  const staff = await requireStaff();
  const device = await currentDevice();
  const b = Body.parse(await req.json());
  const result = await redeem({
    ...b,
    station: device.station,
    staffId: staff.id,
    redeemedAt: b.redeemedAt ? new Date(b.redeemedAt) : undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.message, reason: result.reason }, { status: 409 });
  return NextResponse.json({ redemptionId: result.redemptionId, redeemedAt: result.redeemedAt, staff: staff.name, station: device.station });
});
