import { NextResponse } from "next/server";
import { requireDevice, route } from "@/lib/auth";
import { searchMembers } from "@/lib/repo";

export const GET = route(async (req: Request) => {
  await requireDevice();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ results: await searchMembers(q.slice(0, 100)) });
});
