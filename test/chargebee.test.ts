import { describe, expect, it } from "vitest";
import { patchFromEvent, tierForPlan } from "@/lib/chargebee";
import { extractToken, newToken } from "@/lib/tokens";

const now = new Date("2026-11-11T12:00:00Z");
const opts = { now, graceDays: 14, foundingPlanIds: ["society-founding-annual"], societyPlanIds: [] as string[] };
const sub = (p = {}) => ({
  id: "sub_1", customer_id: "cus_1", status: "active", subscription_items: [{ item_price_id: "society-standard-GBP-Monthly", item_type: "plan" }],
  next_billing_at: 1797000000, started_at: 1760000000, billing_period_unit: "month", ...p,
});

describe("Chargebee webhook mapping", () => {
  it("maps a new subscription", () => {
    const p = patchFromEvent({ id: "ev1", event_type: "subscription_created", content: { customer: { id: "cus_1", first_name: "Sarah", last_name: "Okafor", email: "s@x.com" }, subscription: sub() } }, opts)!;
    expect(p).toMatchObject({ chargebee_customer_id: "cus_1", first_name: "Sarah", tier: "Standard", billing: "Monthly", subscription_status: "active", cancelled_at: null });
    expect(p.next_renewal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("payment failed opens a grace window to the later of next retry and 14 days", () => {
    const retry = Math.floor(now.getTime() / 1000) + 20 * 86400;
    const p = patchFromEvent({ id: "ev2", event_type: "payment_failed", content: { invoice: { customer_id: "cus_1", next_retry_at: retry } } }, opts)!;
    expect(p.grace_until).toEqual(new Date(retry * 1000));
    const q = patchFromEvent({ id: "ev3", event_type: "payment_failed", content: { invoice: { customer_id: "cus_1" } } }, opts)!;
    expect(q.grace_until).toEqual(new Date(now.getTime() + 14 * 86400_000));
  });
  it("payment succeeded and cancellation clear grace", () => {
    expect(patchFromEvent({ id: "e", event_type: "payment_succeeded", content: { invoice: { customer_id: "cus_1" } } }, opts)).toMatchObject({ grace_until: null });
    const c = patchFromEvent({ id: "e", event_type: "subscription_cancelled", content: { subscription: sub({ status: "cancelled", cancelled_at: 1790000000 }) } }, opts)!;
    expect(c).toMatchObject({ subscription_status: "cancelled", grace_until: null });
    expect(c.cancelled_at).toEqual(new Date(1790000000 * 1000));
  });
  it("founding tier from configured plan IDs or the plan name", () => {
    expect(tierForPlan("society-founding-annual", [])).toBe("Founding");
    expect(tierForPlan("abc", ["abc"])).toBe("Founding");
    expect(tierForPlan("society-standard", [])).toBe("Standard");
  });
  it("ignores other plans when a Society plan list is set", () => {
    expect(patchFromEvent({ id: "e", event_type: "subscription_created", content: { subscription: sub() } }, { ...opts, societyPlanIds: ["other"] })).toBeNull();
  });
});

describe("tokens", () => {
  it("are opaque PS- codes without ambiguous characters", () => {
    for (let i = 0; i < 200; i++) expect(newToken()).toMatch(/^PS-[2-9A-HJ-NP-Z]{8}$/);
  });
  it("printed cards: the Airtable record ID from the card link, case kept", () => {
    expect(extractToken("https://society.prologuebooks.co.uk/m/recPl7QG8mKNSNCFN")).toBe("recPl7QG8mKNSNCFN");
    expect(extractToken("https://society.prologuebooks.co.uk/m/recPl7QG8mKNSNCFN?utm=x")).toBe("recPl7QG8mKNSNCFN");
    expect(extractToken("recf3edhQqNoTstJu")).toBe("recf3edhQqNoTstJu");
    expect(extractToken("https://society.prologuebooks.co.uk/m/recTooLongToBeAnId123")).toBeNull();
    expect(extractToken("https://example.com/other/recPl7QG8mKNSNCFNx")).toBeNull();
  });
  it("are found inside whatever the QR holds", () => {
    expect(extractToken("PS-7F3K9Q2M")).toBe("PS-7F3K9Q2M");
    expect(extractToken("https://prologuebooks.co.uk/m/ps-7f3k9q2m")).toBe("PS-7F3K9Q2M");
    expect(extractToken("hello")).toBeNull();
  });
});
