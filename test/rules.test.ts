import { describe, expect, it } from "vitest";
import {
  Benefit, MemberRecord, Redemption, SocietyEvent, benefitHistory, memberState, periodKey, sinceLine,
  splashPayload, statusBand, todayRows, welcomePayload,
} from "@/lib/rules";
import { membershipYearStart, fmtTime } from "@/lib/time";

const B = (k: string, allowance: Benefit["allowance"], extra: Partial<Benefit> = {}): Benefit => ({
  key: k, name: k, short_name: { monthly_drink: "Monthly drink", birthday_book: "Birthday book", personal_shopping: "Personal shopping", society_evening: "Society evening" }[k] ?? k,
  description: null, allowance, redeemable: allowance !== "unlimited", birthday_month_only: false, tiers: ["Founding", "Standard"], ...extra,
});
const BENEFITS = [
  B("monthly_drink", "calendar_month"),
  B("birthday_book", "membership_year", { birthday_month_only: true }),
  B("society_evening", "per_event"),
  B("personal_shopping", "membership_year"),
  B("member_hotline", "unlimited"),
];
const now = new Date("2026-11-11T18:30:00Z");
const member = (p: Partial<MemberRecord> = {}): MemberRecord => ({
  id: "m1", first_name: "Sarah", last_name: "Okafor", tier: "Standard", subscription_status: "active", grace_until: null,
  cancelled_at: null, join_date: "2024-03-14", next_renewal: "2027-03-14", date_of_birth: "1988-07-02", photo_url: null, genres_loved: [], ...p,
});
const red = (benefit_key: string, period_key: string, at = "2026-11-04T11:20:00Z", station = "Bar"): Redemption => ({
  id: "r-" + benefit_key, benefit_key, period_key, event_id: null, station, staff_name: "Jo", redeemed_at: new Date(at),
});

describe("status", () => {
  it("active, in trial and non-renewing are Active", () => {
    for (const s of ["active", "in_trial", "non_renewing"]) expect(memberState(member({ subscription_status: s }), now)).toBe("active");
  });
  it("a failed payment inside the retry window is Grace, and still gets benefits", () => {
    const m = member({ grace_until: new Date("2026-11-18T00:00:00Z") });
    expect(memberState(m, now)).toBe("grace");
    expect(statusBand(m, now).detail).toBe("Payment failed · retrying until 18 Nov");
    expect(todayRows(m, BENEFITS, [], [], now)[0].state).toBe("available");
  });
  it("grace ends when the window passes", () => {
    expect(memberState(member({ grace_until: new Date("2026-11-10T00:00:00Z") }), now)).toBe("active");
  });
  it("cancelled, paused and unknown are Lapsed with no benefits", () => {
    for (const s of ["cancelled", "paused", null]) {
      const m = member({ subscription_status: s });
      expect(memberState(m, now)).toBe("lapsed");
      expect(todayRows(m, BENEFITS, [], [], now).every((r) => r.state !== "available")).toBe(true);
    }
  });
});

describe("allowance periods (shop time)", () => {
  it("monthly drink is per calendar month in London time", () => {
    expect(periodKey(BENEFITS[0], null, now)).toBe("m:2026-11");
    // 23:30 UTC on 31 Oct is already 1 Nov? No: GMT in winter, so still October.
    expect(periodKey(BENEFITS[0], null, new Date("2026-10-31T23:30:00Z"))).toBe("m:2026-10");
    // BST: 23:30 UTC on 31 May is 00:30 on 1 June in London.
    expect(periodKey(BENEFITS[0], null, new Date("2026-05-31T23:30:00Z"))).toBe("m:2026-06");
  });
  it("membership year runs from the join anniversary", () => {
    expect(periodKey(BENEFITS[3], "2024-03-14", now)).toBe("y:2026-03-14");
    expect(periodKey(BENEFITS[3], "2024-12-01", now)).toBe("y:2025-12-01");
    expect(periodKey(BENEFITS[3], "2024-11-11", now)).toBe("y:2026-11-11");
  });
  it("29 February joiners renew on 28 February in other years", () => {
    expect(membershipYearStart({ y: 2024, m: 2, d: 29 }, { y: 2026, m: 3, d: 1 })).toEqual({ y: 2026, m: 2, d: 28 });
  });
  it("per-event needs an event; unlimited is never limited", () => {
    expect(periodKey(BENEFITS[2], null, now, "e1")).toBe("e:e1");
    expect(periodKey(BENEFITS[2], null, now)).toBeNull();
    expect(periodKey(BENEFITS[4], null, now)).toBeNull();
  });
});

describe("today list", () => {
  it("shows used benefits with when and where, so the button is disabled", () => {
    const rows = todayRows(member(), BENEFITS, [red("monthly_drink", "m:2026-11")], [], now);
    const drink = rows.find((r) => r.key === "monthly_drink")!;
    expect(drink.state).toBe("used");
    expect(drink.sub).toBe("Used 4 Nov, 11:20am · Bar");
  });
  it("last month's drink doesn't count against this month", () => {
    const rows = todayRows(member(), BENEFITS, [red("monthly_drink", "m:2026-10", "2026-10-20T12:00:00Z")], [], now);
    expect(rows.find((r) => r.key === "monthly_drink")!.state).toBe("available");
  });
  it("birthday book only appears in the birthday month", () => {
    expect(todayRows(member(), BENEFITS, [], [], now).some((r) => r.key === "birthday_book")).toBe(false);
    expect(todayRows(member({ date_of_birth: "1991-11-21" }), BENEFITS, [], [], now).some((r) => r.key === "birthday_book")).toBe(true);
  });
  it("Society evening shows only when there's an event tonight they can attend", () => {
    const ev: SocietyEvent = { id: "e1", name: "Poetry & Pints", starts_at: new Date("2026-11-11T19:00:00Z"), eligible: true };
    const rows = todayRows(member(), BENEFITS, [], [ev], now);
    expect(rows.find((r) => r.key === "society_evening")).toMatchObject({ title: "Poetry & Pints", eventId: "e1", state: "available" });
    expect(todayRows(member(), BENEFITS, [], [{ ...ev, eligible: false }], now).some((r) => r.key === "society_evening")).toBe(false);
  });
  it("tier restrictions are respected", () => {
    const founderOnly = [B("monthly_drink", "calendar_month", { tiers: ["Founding"] })];
    expect(todayRows(member(), founderOnly, [], [], now)).toHaveLength(0);
    expect(todayRows(member({ tier: "Founding" }), founderOnly, [], [], now)).toHaveLength(1);
  });
  it("undo is offered only within 24 hours", () => {
    const fresh = todayRows(member(), BENEFITS, [red("monthly_drink", "m:2026-11", "2026-11-11T10:00:00Z")], [], now).find((r) => r.key === "monthly_drink")!;
    const old = todayRows(member(), BENEFITS, [red("monthly_drink", "m:2026-11", "2026-11-09T10:00:00Z")], [], now).find((r) => r.key === "monthly_drink")!;
    expect(fresh.undoable).toBe(true);
    expect(old.undoable).toBe(false);
  });
});

describe("concierge history", () => {
  it("counts uses this membership year", () => {
    const h = benefitHistory(member(), BENEFITS, [red("personal_shopping", "y:2026-03-14", "2026-09-12T14:10:00Z", "Floor")], now);
    expect(h.find((x) => x.key === "personal_shopping")).toMatchObject({ count: "1 of 1", lines: ["12 Sep · Floor"] });
    expect(h.find((x) => x.key === "birthday_book")!.note).toBe("Available in July");
  });
  it("member since / renews line", () => {
    expect(sinceLine(member(), now)).toBe("Member since Mar 2024 · Renews 14 Mar 2027");
  });
});

describe("customer-facing screens", () => {
  it("welcome: drink waiting, first name only", () => {
    const m = member();
    const p = welcomePayload(m, todayRows(m, BENEFITS, [], [], now), [], now);
    expect(p).toEqual({ kind: "welcome", firstName: "Sarah", eyebrow: "Prologue Society", line: "Your monthly drink is waiting at the bar.", pigeon: "coffee" });
  });
  it("welcome: birthday month wins", () => {
    const m = member({ date_of_birth: "1991-11-21" });
    expect(welcomePayload(m, todayRows(m, BENEFITS, [], [], now), [], now)).toMatchObject({ eyebrow: "Happy birthday month", pigeon: "reading" });
  });
  it("welcome: on tonight's list, or tonight's open evening", () => {
    const m = member();
    const ev: SocietyEvent = { id: "e1", name: "Poetry & Pints", starts_at: new Date("2026-11-11T19:00:00Z"), eligible: true, onList: true };
    expect(welcomePayload(m, todayRows(m, BENEFITS, [], [ev], now), [ev], now)).toMatchObject({ line: `You're on the list for Poetry & Pints at ${fmtTime(ev.starts_at)}.` });
    const open = { ...ev, onList: false };
    expect(welcomePayload(m, todayRows(m, BENEFITS, [], [open], now), [open], now)).toMatchObject({ line: "Poetry & Pints is on tonight at 7pm. Members welcome." });
  });
  it("welcome: founder line when nothing else is waiting", () => {
    const m = member({ tier: "Founding" });
    const rows = todayRows(m, BENEFITS, [red("monthly_drink", "m:2026-11")], [], now);
    expect(welcomePayload(m, rows, [], now)).toMatchObject({ eyebrow: "Founding member", line: "Good to have you back, from the first page." });
  });
  it("lapsed members get the neutral welcome and splash, never a reason", () => {
    const m = member({ subscription_status: "cancelled" });
    expect(welcomePayload(m, [], [], now)).toEqual({ kind: "neutral" });
    expect(splashPayload(m, [], [], now)).toEqual({ kind: "neutral-splash" });
  });
  it("splash: all collected tells them when the next drink is", () => {
    const m = member();
    const p = splashPayload(m, todayRows(m, BENEFITS, [red("monthly_drink", "m:2026-11")], [], now), [], now);
    expect(p).toMatchObject({ readyTitle: "All collected for now", items: [{ title: "Next drink", sub: "Ready from 1 December" }], nextStep: "The shelves are all yours today." });
    expect(JSON.stringify(p)).not.toMatch(/Okafor|@/);
  });
  it("splash: birthday sends them to the till", () => {
    const m = member({ date_of_birth: "1991-11-21" });
    const p = splashPayload(m, todayRows(m, BENEFITS, [], [], now), [], now);
    expect(p).toMatchObject({ nextStep: "Pick a paperback, then show this at the till →", line: "Happy birthday month. Something to read is on us." });
  });
});
