import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireDevice, route, setStaffCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyPin } from "@/lib/pin";

const Body = z.object({ staffId: z.string().uuid(), pin: z.string().regex(/^\d{4}$/) });
const MAX_TRIES = 5;

/** Quick PIN switch on a shared tablet, so redemptions are logged against the right person. */
export const POST = route(async (req: Request) => {
  await requireDevice();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, "Enter your 4-digit PIN");
  const { staffId, pin } = parsed.data;
  const [s] = await db()`select id, name, role, pin_hash, failed_pins, locked_until from staff where id = ${staffId} and active`;
  if (!s) throw new HttpError(404, "Staff member not found");
  if (s.locked_until && s.locked_until > new Date()) throw new HttpError(423, "Too many tries. Wait 5 minutes or ask a manager");
  if (!(await verifyPin(pin, s.pin_hash))) {
    const fails = s.failed_pins + 1;
    await db()`update staff set failed_pins = ${fails >= MAX_TRIES ? 0 : fails},
      locked_until = ${fails >= MAX_TRIES ? new Date(Date.now() + 5 * 60_000) : null} where id = ${s.id}`;
    throw new HttpError(401, "That PIN doesn't match");
  }
  await db()`update staff set failed_pins = 0, locked_until = null where id = ${s.id}`;
  const res = NextResponse.json({ staff: { id: s.id, name: s.name, role: s.role } });
  setStaffCookie(res, s.id);
  return res;
});

export const DELETE = route(async () => {
  const res = NextResponse.json({ ok: true });
  setStaffCookie(res, null);
  return res;
});
