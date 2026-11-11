import { NextResponse } from "next/server";
import { z } from "zod";
import { currentDevice, currentStaff, requireDevice, route } from "@/lib/auth";
import { conciergeView, displayPayloads, findByToken, loadContext, logScan, staffView } from "@/lib/repo";
import { unrecognisedBand, welcomeDisplayLine } from "@/lib/rules";
import { pushToStation } from "@/lib/stations";
import { extractToken } from "@/lib/tokens";
import type { ScanResponse } from "@/lib/types";

const Body = z.object({ raw: z.string().max(500) });

/** A staff device scanned a QR. Concierge devices also push the welcome to their paired screen. */
export const POST = route(async (req: Request) => {
  await requireDevice();
  const { raw } = Body.parse(await req.json());
  const [device, staff] = await Promise.all([currentDevice(), currentStaff()]);
  const token = extractToken(raw);
  const { member, revokedAt } = token ? await findByToken(token) : { member: null, revokedAt: null };
  const concierge = device.mode === "concierge" && device.code;

  if (!member) {
    await logScan({ token: token ?? raw.slice(0, 40), memberId: null, result: "unrecognised", station: device.station, mode: device.mode, staffId: staff?.id ?? null, deviceId: device.id });
    if (concierge) await pushToStation(device.code!, { payload: { kind: "neutral" }, scan: null });
    const res: ScanResponse = { kind: "unrecognised", token: token ?? "", band: unrecognisedBand(revokedAt) };
    return NextResponse.json(res);
  }

  const ctx = await loadContext(member);
  const sv = staffView(ctx);
  await logScan({ token, memberId: member.id, result: sv.band.state, station: device.station, mode: device.mode, staffId: staff?.id ?? null, deviceId: device.id });

  if (concierge) {
    const { welcome } = displayPayloads(ctx);
    await pushToStation(device.code!, { payload: welcome, scan: null });
    const view = await conciergeView(ctx);
    view.displayLine = welcomeDisplayLine(welcome);
    return NextResponse.json({ kind: "member", token: token!, view } satisfies ScanResponse);
  }
  return NextResponse.json({ kind: "member", token: token!, view: sv } satisfies ScanResponse);
});
