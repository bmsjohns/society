import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireManager, route } from "@/lib/auth";
import { undoRedemption } from "@/lib/repo";

const Body = z.object({ reason: z.string().trim().min(3, "Give a short reason").max(200) });

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const manager = await requireManager();
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  if (!(await undoRedemption(id, manager.id, parsed.data.reason))) {
    throw new HttpError(409, "Can't undo: already undone or older than 24 hours");
  }
  return NextResponse.json({ ok: true });
});
