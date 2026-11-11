import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff, route } from "@/lib/auth";
import { db } from "@/lib/db";
import { getNotes } from "@/lib/repo";

const Body = z.object({ memberId: z.string().uuid(), body: z.string().trim().min(1).max(2000) });

export const POST = route(async (req: Request) => {
  const staff = await requireStaff();
  const { memberId, body } = Body.parse(await req.json());
  await db()`insert into member_notes (member_id, staff_id, body) values (${memberId}, ${staff.id}, ${body})`;
  return NextResponse.json({ notes: await getNotes(memberId) });
});
