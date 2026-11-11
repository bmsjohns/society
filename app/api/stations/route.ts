import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDevice, requireManager, route } from "@/lib/auth";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await requireDevice();
  const stations = await db()`select code, name, staff_seen_at, display_seen_at from stations order by name`;
  return NextResponse.json({ stations });
});

const Body = z.object({ name: z.string().trim().min(1).max(40) });
const ALPHA = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** A station pairs a staff concierge tablet with a customer-facing screen by a short code. */
export const POST = route(async (req: Request) => {
  await requireManager();
  const { name } = Body.parse(await req.json());
  for (let i = 0; i < 5; i++) {
    const code = Array.from({ length: 5 }, () => ALPHA[randomInt(ALPHA.length)]).join("");
    const [row] = await db()`insert into stations (code, name) values (${code}, ${name}) on conflict do nothing returning code, name`;
    if (row) return NextResponse.json({ station: row });
  }
  return NextResponse.json({ error: "Try again" }, { status: 500 });
});
