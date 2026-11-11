import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireManager, route } from "@/lib/auth";
import { db } from "@/lib/db";

const Body = z.object({ reason: z.string().trim().max(100).default("Revoked") });

export const POST = route(async (req: Request, { params }: { params: Promise<{ token: string }> }) => {
  await requireManager();
  const { token } = await params;
  const { reason } = Body.parse(await req.json().catch(() => ({})));
  const [row] = await db()`update member_tokens set revoked_at = now(), revoked_reason = ${reason}
    where token = ${token} and revoked_at is null returning token`;
  if (!row) throw new HttpError(404, "Token not found or already revoked");
  return NextResponse.json({ ok: true });
});
