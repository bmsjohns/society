import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireManager, route } from "@/lib/auth";
import { db } from "@/lib/db";
import { newToken } from "@/lib/tokens";

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireManager();
  const { id } = await params;
  const tokens = await db()`select token, kind, label, card_number, issued_at, revoked_at, revoked_reason from member_tokens where member_id = ${id} order by issued_at desc`;
  return NextResponse.json({ tokens });
});

const Body = z.object({ kind: z.enum(["card", "wallet"]).default("card"), revokeOthers: z.boolean().default(true) });

/** Lost card: issue a new token and (by default) revoke the old ones. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireManager();
  const { id } = await params;
  const b = Body.parse(await req.json().catch(() => ({})));
  const [m] = await db()`select id from members where id = ${id}`;
  if (!m) throw new HttpError(404, "Member not found");
  const token = newToken();
  await db().begin(async (tx) => {
    if (b.revokeOthers) {
      await tx`update member_tokens set revoked_at = now(), revoked_reason = 'Replaced'
        where member_id = ${id} and revoked_at is null and kind = ${b.kind}`;
    }
    await tx`insert into member_tokens (token, member_id, kind) values (${token}, ${id}, ${b.kind})`;
  });
  return NextResponse.json({ token });
});
