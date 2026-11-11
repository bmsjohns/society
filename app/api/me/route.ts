import { NextResponse } from "next/server";
import { currentDevice, currentStaff, requireDevice, route } from "@/lib/auth";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await requireDevice();
  const [device, staff, [{ n }]] = await Promise.all([
    currentDevice(), currentStaff(), db()`select count(*)::int as n from staff where active`,
  ]);
  return NextResponse.json({ device, staff, needsFirstManager: n === 0 });
});
