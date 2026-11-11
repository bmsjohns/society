import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireManager, route } from "@/lib/auth";
import { db } from "@/lib/db";

const Body = z.object({ memberId: z.string().uuid() });

/**
 * Give a spare printed card to a member (new member, or a replacement for a lost card).
 * Their other cards stop working, and they take the member number printed on the spare.
 */
export const POST = route(async (req: Request, { params }: { params: Promise<{ token: string }> }) => {
  await requireManager();
  const { token } = await params;
  const { memberId } = Body.parse(await req.json());
  const result = await db().begin(async (tx) => {
    const [card] = await tx`select token, member_id, revoked_at, card_number, label from member_tokens where token = ${token} for update`;
    if (!card || card.revoked_at) throw new HttpError(404, "Card not found");
    if (card.member_id) throw new HttpError(409, "This card already belongs to a member");
    const [m] = await tx`select id, first_name, member_number from members where id = ${memberId} for update`;
    if (!m) throw new HttpError(404, "Member not found");
    const replaced = await tx`update member_tokens set revoked_at = now(), revoked_reason = ${`Replaced by ${card.label ?? "spare card"}`}
      where member_id = ${memberId} and kind = 'card' and revoked_at is null returning token`;
    await tx`update member_tokens set member_id = ${memberId} where token = ${token}`;
    let memberNumber = m.member_number;
    if (card.card_number && card.card_number !== m.member_number) {
      const [taken] = await tx`select 1 from members where member_number = ${card.card_number}`;
      if (!taken) {
        await tx`update members set member_number = ${card.card_number} where id = ${memberId}`;
        memberNumber = card.card_number;
      }
    }
    return { firstName: m.first_name, memberNumber, replaced: replaced.length };
  });
  return NextResponse.json(result);
});
