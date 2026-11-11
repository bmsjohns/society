import { NextResponse } from "next/server";
import { currentDevice, requireDevice, route } from "@/lib/auth";
import { recentScans } from "@/lib/repo";

export const GET = route(async () => {
  await requireDevice();
  const device = await currentDevice();
  return NextResponse.json({ scans: device.id ? await recentScans(device.id) : [] });
});
