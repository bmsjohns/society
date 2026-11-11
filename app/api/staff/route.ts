import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireDevice, requireManager, route, setStaffCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/pin";

/** Names for the "who are you?" switcher. No PINs, no emails. */
export const GET = route(async () => {
  await requireDevice();
  const staff = await db()`select id, name, role from staff where active order by name`;
  return NextResponse.json({ staff });
});

const Create = z.object({
  name: z.string().trim().min(1).max(60),
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
  role: z.enum(["staff", "manager"]).default("staff"),
  email: z.string().email().optional(),
});

/** Managers add staff. The very first person added (empty table) becomes a manager and is signed in. */
export const POST = route(async (req: Request) => {
  await requireDevice();
  const parsed = Create.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const [{ n }] = await db()`select count(*)::int as n from staff`;
  const bootstrap = n === 0;
  if (!bootstrap) await requireManager();
  const b = parsed.data;
  const [row] = await db()`
    insert into staff (name, email, role, pin_hash)
    values (${b.name}, ${b.email ?? null}, ${bootstrap ? "manager" : b.role}, ${await hashPin(b.pin)})
    returning id, name, role`;
  const res = NextResponse.json({ staff: row });
  if (bootstrap) setStaffCookie(res, row.id);
  return res;
});
