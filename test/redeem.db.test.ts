// Runs against a real Postgres with the schema and demo data: DATABASE_URL=... npm test
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const enabled = !!process.env.DATABASE_URL;

describe.skipIf(!enabled)("redemption against Postgres", async () => {
  const { db } = await import("@/lib/db");
  const { redeem, undoRedemption, findByToken, searchMembers } = await import("@/lib/repo");
  const sql = db();
  const [{ id: staffId }] = await sql`select id from staff where name = 'Jo'`;
  const alex = (await findByToken("PS-AB6ALEX7")).member!;

  afterAll(async () => {
    await sql`delete from redemptions where member_id = ${alex.id} and benefit_key = 'monthly_drink' and station = 'Test'`;
    await sql.end();
  });

  it("two tills redeeming the same drink at once: exactly one wins", async () => {
    await sql`delete from redemptions where member_id = ${alex.id} and benefit_key = 'monthly_drink'`;
    const tries = await Promise.all(Array.from({ length: 6 }, () =>
      redeem({ memberId: alex.id, benefitKey: "monthly_drink", station: "Test", staffId, clientId: randomUUID() })));
    expect(tries.filter((t) => t.ok)).toHaveLength(1);
    expect(tries.filter((t) => !t.ok).every((t) => !t.ok && t.reason === "already_used")).toBe(true);
  });

  it("a retried offline request (same clientId) is not a double redemption", async () => {
    await sql`delete from redemptions where member_id = ${alex.id} and benefit_key = 'monthly_drink'`;
    const clientId = randomUUID();
    const a = await redeem({ memberId: alex.id, benefitKey: "monthly_drink", station: "Test", staffId, clientId, offline: true });
    const b = await redeem({ memberId: alex.id, benefitKey: "monthly_drink", station: "Test", staffId, clientId, offline: true });
    expect(a.ok && b.ok && b.duplicate && a.redemptionId === b.redemptionId).toBe(true);
  });

  it("after a manager undo the benefit is available again", async () => {
    const [r] = await sql`select id from redemptions where member_id = ${alex.id} and benefit_key = 'monthly_drink' and undone_at is null`;
    expect(await undoRedemption(r.id, staffId, "Tapped by mistake")).toBe(true);
    expect(await undoRedemption(r.id, staffId, "again")).toBe(false);
    const again = await redeem({ memberId: alex.id, benefitKey: "monthly_drink", station: "Test", staffId, clientId: randomUUID() });
    expect(again.ok).toBe(true);
  });

  it("lapsed members can't redeem", async () => {
    const elena = (await findByToken("PS-EM4LAPSE")).member!;
    const r = await redeem({ memberId: elena.id, benefitKey: "monthly_drink", station: "Test", staffId, clientId: randomUUID() });
    expect(r).toMatchObject({ ok: false, reason: "lapsed" });
  });

  it("revoked tokens don't resolve", async () => {
    const r = await findByToken("PS-OLDCARD2");
    expect(r.member).toBeNull();
    expect(r.revokedAt).toBeInstanceOf(Date);
  });

  it("lookup by name or email, 3 characters minimum", async () => {
    expect(await searchMembers("pr")).toHaveLength(0);
    expect((await searchMembers("pri"))[0].fullName).toBe("Priya Shah");
    expect((await searchMembers("elena.marsh@"))[0]).toMatchObject({ fullName: "Elena Marsh", state: "lapsed" });
  });
});
