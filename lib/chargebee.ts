// Turns Chargebee webhook events into member updates. Pure, so it is unit-tested.

export type CbEvent = {
  id: string;
  event_type: string;
  occurred_at?: number;
  content: {
    customer?: { id: string; first_name?: string; last_name?: string; email?: string; phone?: string };
    subscription?: {
      id: string; customer_id: string; status: string; plan_id?: string;
      subscription_items?: { item_price_id: string; item_type?: string }[];
      next_billing_at?: number; current_term_end?: number; started_at?: number; activated_at?: number;
      created_at?: number; cancelled_at?: number; billing_period_unit?: string;
    };
    invoice?: { customer_id?: string; subscription_id?: string; next_retry_at?: number; dunning_status?: string };
  };
};

export type MemberPatch = {
  chargebee_customer_id: string;
  first_name?: string; last_name?: string; email?: string | null; phone?: string | null;
  chargebee_subscription_id?: string; chargebee_plan?: string; tier?: "Founding" | "Standard";
  billing?: "Annual" | "Monthly" | null;
  subscription_status?: string; next_renewal?: string | null; join_date?: string | null;
  cancelled_at?: Date | null; payment_failed_at?: Date | null; grace_until?: Date | null;
};

const toDate = (unix?: number) => (unix ? new Date(unix * 1000) : null);
const toDay = (unix?: number) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : null);

export function planOf(sub: NonNullable<CbEvent["content"]["subscription"]>): string | undefined {
  return sub.plan_id ?? sub.subscription_items?.find((i) => !i.item_type || i.item_type === "plan")?.item_price_id;
}

export function tierForPlan(plan: string | undefined, foundingIds: string[]): "Founding" | "Standard" {
  if (!plan) return "Standard";
  if (foundingIds.includes(plan)) return "Founding";
  return /founding|founder/i.test(plan) ? "Founding" : "Standard";
}

/** Returns null when the event doesn't concern a Society member. */
export function patchFromEvent(
  e: CbEvent,
  opts: { now: Date; graceDays: number; foundingPlanIds: string[]; societyPlanIds: string[] },
): MemberPatch | null {
  const { customer, subscription: sub, invoice } = e.content;
  const customerId = sub?.customer_id ?? customer?.id ?? invoice?.customer_id;
  if (!customerId) return null;
  const plan = sub ? planOf(sub) : undefined;
  if (sub && opts.societyPlanIds.length && plan && !opts.societyPlanIds.includes(plan)) return null;

  const p: MemberPatch = { chargebee_customer_id: customerId };
  if (customer) {
    p.first_name = customer.first_name ?? "";
    p.last_name = customer.last_name ?? "";
    p.email = customer.email ?? null;
    p.phone = customer.phone ?? null;
  }
  if (sub) {
    p.chargebee_subscription_id = sub.id;
    p.chargebee_plan = plan;
    p.tier = tierForPlan(plan, opts.foundingPlanIds);
    p.billing = sub.billing_period_unit === "year" ? "Annual" : sub.billing_period_unit === "month" ? "Monthly" : null;
    p.subscription_status = sub.status;
    p.next_renewal = toDay(sub.next_billing_at ?? sub.current_term_end);
    p.join_date = toDay(sub.started_at ?? sub.activated_at ?? sub.created_at);
    p.cancelled_at = sub.status === "cancelled" ? toDate(sub.cancelled_at) ?? opts.now : null;
  }
  switch (e.event_type) {
    case "payment_failed": {
      const retry = toDate(invoice?.next_retry_at);
      const floor = new Date(opts.now.getTime() + opts.graceDays * 86400_000);
      p.payment_failed_at = opts.now;
      p.grace_until = retry && retry > floor ? retry : floor;
      break;
    }
    case "payment_succeeded":
    case "subscription_renewed":
    case "subscription_reactivated":
    case "subscription_resumed":
    case "subscription_cancelled":
      p.payment_failed_at = null;
      p.grace_until = null;
      break;
  }
  return p;
}
