import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireDevice, requireManager, route } from "@/lib/auth";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await requireDevice();
  const events = await db()`
    select e.id, e.name, e.starts_at, e.open_to_all,
      (select count(*)::int from redemptions r where r.event_id = e.id and r.undone_at is null) as checked_in
    from events e where e.starts_at > now() - interval '60 days' order by e.starts_at`;
  return NextResponse.json({ events });
});

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  startsAt: z.string().datetime({ offset: true }),
  openToAll: z.boolean().default(true),
});

export const POST = route(async (req: Request) => {
  await requireManager();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const b = parsed.data;
  const [row] = await db()`insert into events (name, starts_at, open_to_all) values (${b.name}, ${b.startsAt}, ${b.openToAll}) returning id`;
  return NextResponse.json({ id: row.id });
});
