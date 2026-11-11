// Pure membership rules. No database access here, so everything is unit-tested.
import {
  MONTHS, YMD, cmpYMD, fmtDate, fmtDayMonth, fmtMonthYear, fmtMonthYearShort, fmtTime, fmtWhen,
  londonToday, membershipYearStart, nextMonthStart, pad, parseYMD, ymdKey,
} from "./time";
import type {
  BenefitHistory, BenefitRow, Pigeon, ScanState, SplashItem, SplashPayload, StatusBand, Tier, WelcomePayload,
} from "./types";

export type MemberRecord = {
  id: string;
  first_name: string;
  last_name: string;
  tier: Tier;
  subscription_status: string | null;
  grace_until: Date | null;
  cancelled_at: Date | null;
  join_date: string | null; // YYYY-MM-DD
  next_renewal: string | null;
  date_of_birth: string | null;
  photo_url: string | null;
  genres_loved: string[];
};

export type Benefit = {
  key: string;
  name: string;
  short_name: string;
  description: string | null;
  allowance: "calendar_month" | "calendar_quarter" | "membership_year" | "membership" | "per_event" | "unlimited";
  redeemable: boolean;
  birthday_month_only: boolean;
  tiers: string[];
};

export type Redemption = {
  id: string;
  benefit_key: string;
  period_key: string;
  event_id: string | null;
  station: string;
  staff_name: string | null;
  redeemed_at: Date;
};

/** eligible: may attend tonight. onList: named on the guest list (vs an event open to all members). */
export type SocietyEvent = { id: string; name: string; starts_at: Date; eligible: boolean; onList?: boolean };

// ------------------------------------------------------------------ status

export const GRACE_ACTIVE_STATUSES = new Set(["active", "in_trial", "non_renewing", "future"]);

export function memberState(m: Pick<MemberRecord, "subscription_status" | "grace_until">, now: Date): Exclude<ScanState, "offline" | "unrecognised"> {
  const s = (m.subscription_status ?? "").toLowerCase();
  if (!GRACE_ACTIVE_STATUSES.has(s)) return "lapsed";
  if (m.grace_until && m.grace_until.getTime() > now.getTime()) return "grace";
  return "active";
}

export function statusBand(m: MemberRecord, now: Date): StatusBand {
  const state = memberState(m, now);
  if (state === "grace") {
    return {
      state, label: "Grace",
      detail: `Payment failed · retrying until ${fmtDayMonth(m.grace_until!)}`,
      instruction: "Serve benefits. Mention payment politely",
    };
  }
  if (state === "lapsed") {
    const ended = m.cancelled_at ? fmtDayMonth(m.cancelled_at) : null;
    const paused = (m.subscription_status ?? "").toLowerCase() === "paused";
    return {
      state, label: "Lapsed",
      detail: paused ? "Membership paused" : ended ? `Membership ended ${ended}` : "Membership not active",
      instruction: "No benefits. Offer to rejoin",
    };
  }
  return { state, label: "Active", detail: "Paid and in date", instruction: "Welcome them and offer benefits" };
}

export function unrecognisedBand(revokedAt?: Date | null): StatusBand {
  return {
    state: "unrecognised", label: "Not recognised",
    detail: revokedAt ? `This card was replaced on ${fmtDayMonth(revokedAt)}` : "This code isn't valid",
    instruction: "Try manual lookup",
  };
}

export function spareBand(label: string): StatusBand {
  return {
    state: "unrecognised", label: "Spare card",
    detail: `${label} · not yet given to a member`,
    instruction: "A manager can give it to a member now",
  };
}

// ------------------------------------------------------------------ periods

/** Which allowance window a use made `now` counts against. null = not limited. */
export function periodKey(b: Pick<Benefit, "allowance">, joinDate: string | null, now: Date, eventId?: string | null): string | null {
  const today = londonToday(now);
  switch (b.allowance) {
    case "calendar_month": return `m:${today.y}-${pad(today.m)}`;
    case "calendar_quarter": return `q:${today.y}-Q${Math.ceil(today.m / 3)}`;
    case "membership_year": {
      const join = parseYMD(joinDate);
      return join ? `y:${ymdKey(membershipYearStart(join, today))}` : `y:${today.y}`;
    }
    case "membership": return "all";
    case "per_event": return eventId ? `e:${eventId}` : null;
    case "unlimited": return null;
  }
}

export function isBirthdayMonth(dob: string | null, now: Date) {
  const d = parseYMD(dob);
  return !!d && d.m === londonToday(now).m;
}

export function initials(first: string, last: string) {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || "?";
}

function usedLine(r: Redemption, now: Date) {
  return `Used ${fmtDayMonth(r.redeemed_at)}, ${fmtTime(r.redeemed_at)} · ${r.station}`;
}

export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The "Today" list: every redeemable benefit that applies right now, available or already used.
 * Benefits that can't apply today (birthday book outside the birthday month, no event tonight)
 * are left out, so the list stays short at a busy bar.
 */
export function todayRows(
  m: MemberRecord, benefits: Benefit[], redemptions: Redemption[], events: SocietyEvent[], now: Date,
): BenefitRow[] {
  const state = memberState(m, now);
  const today = londonToday(now);
  const rows: BenefitRow[] = [];
  for (const b of benefits) {
    if (!b.redeemable || !b.tiers.includes(m.tier)) continue;
    if (b.birthday_month_only && !isBirthdayMonth(m.date_of_birth, now)) continue;
    const targets: { title: string; sub: string; eventId?: string }[] = [];
    if (b.allowance === "per_event") {
      for (const e of events) {
        if (!e.eligible) continue;
        targets.push({ title: e.name, sub: `Society evening · tonight, ${fmtTime(e.starts_at)}`, eventId: e.id });
      }
    } else {
      let sub = b.description ?? "";
      if (b.key === "monthly_drink") sub = `${MONTHS[today.m - 1]}'s drink`;
      if (b.key === "birthday_book") sub = "Any paperback, birthday month";
      if (b.key === "personal_shopping") sub = "20 minutes with a bookseller";
      targets.push({ title: b.short_name, sub });
    }
    for (const t of targets) {
      const key = periodKey(b, m.join_date, now, t.eventId);
      const used = redemptions.find((r) => r.benefit_key === b.key && r.period_key === key);
      if (used) {
        rows.push({
          key: b.key, title: t.title, sub: usedLine(used, now), state: "used", eventId: t.eventId,
          usedAt: used.redeemed_at.toISOString(), redemptionId: used.id,
          undoable: now.getTime() - used.redeemed_at.getTime() < UNDO_WINDOW_MS,
        });
      } else {
        rows.push({ key: b.key, title: t.title, sub: t.sub, state: state === "lapsed" ? "unavailable" : "available", eventId: t.eventId });
      }
    }
  }
  // Available first, then used, keeping catalogue order within each.
  return rows.sort((a, b) => Number(a.state !== "available") - Number(b.state !== "available"));
}

/** Concierge "Benefits" panel: what has been used this membership year. */
export function benefitHistory(m: MemberRecord, benefits: Benefit[], redemptions: Redemption[], now: Date): BenefitHistory[] {
  const today = londonToday(now);
  const join = parseYMD(m.join_date);
  const yearStart: YMD = join ? membershipYearStart(join, today) : { y: today.y, m: 1, d: 1 };
  const inYear = redemptions.filter((r) => cmpYMD(londonToday(r.redeemed_at), yearStart) >= 0);
  const out: BenefitHistory[] = [];
  for (const b of benefits) {
    if (!b.tiers.includes(m.tier)) continue;
    if (!b.redeemable) continue;
    const used = inYear.filter((r) => r.benefit_key === b.key);
    const lines = used.slice(0, 4).map((r) => `${fmtDayMonth(r.redeemed_at)} · ${r.station}`);
    let count = `${used.length} this year`;
    let note: string | undefined;
    if (b.allowance === "membership_year") count = `${Math.min(used.length, 1)} of 1`;
    if (b.allowance === "per_event") count = `${used.length} attended`;
    if (b.key === "birthday_book" && used.length === 0) {
      const dob = parseYMD(m.date_of_birth);
      note = dob ? (dob.m === today.m ? "Available this month" : `Available in ${MONTHS[dob.m - 1]}`) : "No birthday on file";
    }
    if (b.key === "personal_shopping" && used.length === 0) note = "Not used yet this year";
    out.push({ key: b.key, name: b.short_name, count, lines, note });
  }
  return out;
}

export function sinceLine(m: MemberRecord, now: Date): string {
  const join = parseYMD(m.join_date);
  const since = join ? `Member since ${fmtMonthYearShort(join)}` : "Member";
  const state = memberState(m, now);
  const renew = parseYMD(m.next_renewal);
  if (state === "lapsed") return m.cancelled_at && join ? `Member ${fmtMonthYearShort(join)} - ${fmtMonthYearShort(londonToday(m.cancelled_at))} · Cancelled` : since;
  if (state === "grace" && renew) return `${since} · Renewal due ${fmtDayMonth(renew)}`;
  if (renew && (m.subscription_status ?? "") === "non_renewing") return `${since} · Ends ${fmtDate(renew)}`;
  return renew ? `${since} · Renews ${fmtDate(renew)}` : since;
}

// ------------------------------------------------------------------ customer-facing copy

type Context = { birthdayBook: boolean; event: SocietyEvent | null; drink: boolean };

function context(rows: BenefitRow[], events: SocietyEvent[]): Context {
  const avail = (k: string) => rows.some((r) => r.key === k && r.state === "available");
  const eventRow = rows.find((r) => r.key === "society_evening" && r.state === "available");
  return {
    birthdayBook: avail("birthday_book"),
    drink: avail("monthly_drink"),
    event: eventRow ? events.find((e) => e.id === eventRow.eventId) ?? null : null,
  };
}

/** Concierge welcome screen. First name only; lapsed members get the neutral welcome, no reason. */
export function welcomePayload(m: MemberRecord, rows: BenefitRow[], events: SocietyEvent[], now: Date): WelcomePayload {
  if (memberState(m, now) === "lapsed") return { kind: "neutral" };
  const firstName = m.first_name || "friend";
  const c = context(rows, events);
  if (c.birthdayBook) return { kind: "welcome", firstName, eyebrow: "Happy birthday month", line: "Your birthday book is ready. Pick any paperback on us.", pigeon: "reading" };
  if (c.event) return {
    kind: "welcome", firstName, eyebrow: "Society evening", pigeon: "flying-book",
    line: c.event.onList ? `You're on the list for ${c.event.name} at ${fmtTime(c.event.starts_at)}.` : `${c.event.name} is on tonight at ${fmtTime(c.event.starts_at)}. Members welcome.`,
  };
  if (c.drink) return { kind: "welcome", firstName, eyebrow: m.tier === "Founding" ? "Founding member" : "Prologue Society", line: "Your monthly drink is waiting at the bar.", pigeon: "coffee" };
  if (m.tier === "Founding") return { kind: "welcome", firstName, eyebrow: "Founding member", line: "Good to have you back, from the first page.", pigeon: "perched" };
  return { kind: "welcome", firstName, eyebrow: "Prologue Society", line: "Lovely to see you. Make yourself at home.", pigeon: "standing" };
}

/** Self-scan splash: what's ready today and where to go. Never notes, history or contact details. */
export function splashPayload(m: MemberRecord, rows: BenefitRow[], events: SocietyEvent[], now: Date): SplashPayload {
  if (memberState(m, now) === "lapsed") return { kind: "neutral-splash" };
  const c = context(rows, events);
  const join = parseYMD(m.join_date);
  const items: SplashItem[] = [];
  if (c.birthdayBook) items.push({ icon: "book", title: "Birthday book", sub: "Any paperback, on us" });
  if (c.event) items.push({ icon: "event", title: c.event.name, sub: `${c.event.onList ? "You're on the list" : "Society evening"} · tonight, ${fmtTime(c.event.starts_at)}` });
  if (c.drink) items.push({ icon: "drink", title: "Monthly drink", sub: "Any drink from the bar menu" });

  let line = m.tier === "Founding" ? "Here from the first page, and every one since." : "Good to see you again.";
  let pigeon: Pigeon = m.tier === "Founding" ? "perched" : "coffee";
  if (c.birthdayBook) { line = "Happy birthday month. Something to read is on us."; pigeon = "reading"; }
  else if (c.event && !c.drink) pigeon = "flying-book";

  let nextStep = "Show this at the bar for your drink →";
  if (c.birthdayBook) nextStep = "Pick a paperback, then show this at the till →";
  else if (!c.drink && c.event) nextStep = "Show this at the door tonight →";

  let readyTitle = "Ready for you today";
  if (items.length === 0) {
    readyTitle = "All collected for now";
    const next = nextMonthStart(londonToday(now));
    items.push({ icon: "calendar", title: "Next drink", sub: `Ready from 1 ${MONTHS[next.m - 1]}` });
    nextStep = "The shelves are all yours today.";
    line = "Lovely to see you. Make yourself at home.";
    pigeon = "standing";
  }
  return {
    kind: "splash", firstName: m.first_name || "friend", tier: m.tier, founding: m.tier === "Founding", line,
    memberSince: join ? `Member since ${fmtMonthYear(join)}` : "Prologue Society member",
    readyTitle, items, nextStep, pigeon,
  };
}

export function welcomeDisplayLine(p: WelcomePayload): string {
  return p.kind === "welcome" ? `Member screen: showing "Welcome back, ${p.firstName}"` : `Member screen: showing "Welcome to Prologue"`;
}

export { fmtWhen };
