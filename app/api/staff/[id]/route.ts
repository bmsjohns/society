import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireManager, route } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/pin";

const Body = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits").optional(),
  role: z.enum(["staff", "manager"]).optional(),
  active: z.boolean().optional(),
});

export const PATCH = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireManager();
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const b = parsed.data;
  if (id === me.id && (b.active === false || b.role === "staff")) throw new HttpError(400, "You can't remove your own manager access");
  const pinHash = b.pin ? await hashPin(b.pin) : null;
  const [row] = await db()`
    update staff set
      pin_hash = coalesce(${pinHash}, pin_hash),
      role = coalesce(${b.role ?? null}, role),
      active = coalesce(${b.active ?? null}, active),
      failed_pins = 0, locked_until = null
    where id = ${id} returning id, name, role, active`;
  if (!row) throw new HttpError(404, "Not found");
  return NextResponse.json({ staff: row });
});
