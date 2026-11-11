import { NextResponse } from "next/server";
import { HttpError, currentDevice, currentStaff, requireDevice, route } from "@/lib/auth";
import { conciergeView, displayPayloads, getMember, loadContext, logScan, staffView } from "@/lib/repo";
import { welcomeDisplayLine } from "@/lib/rules";
import { pushToStation } from "@/lib/stations";

/**
 * Open a member from lookup or recent scans.
 * ?view=concierge adds notes, preferences and history (concierge devices only).
 * ?log=1 records it in the scan log as a lookup; ?push=1 sends the welcome to the paired screen.
 */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireDevice();
  const { id } = await params;
  const url = new URL(req.url);
  const member = await getMember(id);
  if (!member) throw new HttpError(404, "Member not found");
  const [device, staff] = await Promise.all([currentDevice(), currentStaff()]);
  const ctx = await loadContext(member);
  const sv = staffView(ctx);
  if (url.searchParams.get("log") === "1") {
    await logScan({ token: null, memberId: member.id, result: "lookup", station: device.station, mode: device.mode, staffId: staff?.id ?? null, deviceId: device.id });
  }
  if (url.searchParams.get("view") === "concierge" && device.mode === "concierge") {
    const view = await conciergeView(ctx);
    if (url.searchParams.get("push") === "1" && device.code) {
      const { welcome } = displayPayloads(ctx);
      await pushToStation(device.code, { payload: welcome, scan: null });
      view.displayLine = welcomeDisplayLine(welcome);
    }
    return NextResponse.json({ view });
  }
  return NextResponse.json({ view: sv });
});
