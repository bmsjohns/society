import "server-only";
import { db } from "./db";
import {
  Benefit, MemberRecord, Redemption, SocietyEvent, UNDO_WINDOW_MS, benefitHistory, initials, isBirthdayMonth,
  memberState, periodKey, sinceLine, splashPayload, statusBand, todayRows, welcomePayload,
} from "./rules";
import { MONTHS, fmtWhen, londonToday, parseYMD, ymdKey } from "./time";
import type { ConciergeView, LookupResult, Note, RecentScan, ScanState, StaffMemberView, Visit } from "./types";

export type FullMember = MemberRecord & {
  member_number: number;
  favourite_books: string | null;
  favourite_authors: string | null;
  reading_now: string | null;
  genres_avoid: string[];
  reading_notes: string | null;
};

const MEMBER_COLS = `id, member_number, first_name, last_name, tier, subscription_status, grace_until, cancelled_at,
  join_date, next_renewal, date_of_birth, photo_url, genres_loved, genres_avoid, favourite_books,
  favourite_authors, reading_now, reading_notes`;

export async function getMember(id: string): Promise<FullMember | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await db().unsafe<FullMember[]>(`select ${MEMBER_COLS} from members where id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findByToken(token: string): Promise<{ member: FullMember | null; revokedAt: Date | null }> {
  const t = token.trim().toUpperCase();
  if (!/^PS-[0-9A-Z]{8}$/.test(t)) return { member: null, revokedAt: null };
  const [row] = await db()`select member_id, revoked_at from member_tokens where token = ${t}`;
  if (!row) return { member: null, revokedAt: null };
  if (row.revoked_at) return { member: null, revokedAt: row.revoked_at };
  return { member: await getMember(row.member_id), revokedAt: null };
}

let benefitCache: { at: number; rows: Benefit[] } | null = null;
export async function getBenefits(): Promise<Benefit[]> {
  if (benefitCache && Date.now() - benefitCache.at < 5 * 60_000) return benefitCache.rows;
  const rows = await db()<Benefit[]>`
    select key, name, short_name, description, allowance, redeemable, birthday_month_only, tiers
    from benefits where active order by sort`;
  benefitCache = { at: Date.now(), rows };
  return rows;
}

export async function getRedemptions(memberId: string): Promise<Redemption[]> {
  return db()<Redemption[]>`
    select r.id, r.benefit_key, r.period_key, r.event_id, r.station, s.name as staff_name, r.redeemed_at
    from redemptions r left join staff s on s.id = r.staff_id
    where r.member_id = ${memberId} and r.undone_at is null
      and r.redeemed_at > now() - interval '400 days'
    order by r.redeemed_at desc`;
}

/** Society events starting today (shop time), flagged with whether this member may attend. */
export async function getEventsToday(memberId: string | null, now: Date): Promise<SocietyEvent[]> {
  const day = ymdKey(londonToday(now));
  const rows = await db()`
    select e.id, e.name, e.starts_at, e.open_to_all,
      exists(select 1 from event_guests g where g.event_id = e.id and g.member_id = ${memberId}) as guest
    from events e
    where e.society_only and (e.starts_at at time zone 'Europe/London')::date = ${day}::date
    order by e.starts_at`;
  return rows.map((r) => ({ id: r.id, name: r.name, starts_at: r.starts_at, eligible: r.open_to_all || r.guest, onList: r.guest }));
}

type Ctx = { member: FullMember; benefits: Benefit[]; redemptions: Redemption[]; events: SocietyEvent[]; now: Date };

export async function loadContext(member: FullMember, now = new Date()): Promise<Ctx> {
  const [benefits, redemptions, events] = await Promise.all([
    getBenefits(), getRedemptions(member.id), getEventsToday(member.id, now),
  ]);
  return { member, benefits, redemptions, events, now };
}

export function staffView(c: Ctx): StaffMemberView {
  const m = c.member;
  const band = statusBand(m, c.now);
  const extras: string[] = [];
  if (isBirthdayMonth(m.date_of_birth, c.now)) extras.push("Birthday this month");
  if (m.genres_loved.length) extras.push(`Loves ${m.genres_loved.slice(0, 3).join(", ").toLowerCase()}`);
  if (m.reading_now) extras.push(`Reading ${m.reading_now}`);
  return {
    memberId: m.id,
    firstName: m.first_name,
    fullName: `${m.first_name} ${m.last_name}`.trim(),
    initials: initials(m.first_name, m.last_name),
    photoUrl: m.photo_url,
    tier: m.tier,
    founding: m.tier === "Founding",
    birthdayMonth: isBirthdayMonth(m.date_of_birth, c.now),
    band,
    sinceLine: sinceLine(m, c.now),
    today: todayRows(m, c.benefits, c.redemptions, c.events, c.now),
    canRedeem: band.state === "active" || band.state === "grace",
    extras,
  };
}

export async function conciergeView(c: Ctx): Promise<ConciergeView> {
  const m = c.member;
  const base = staffView(c);
  const [notes, visits] = await Promise.all([getNotes(m.id), getVisits(m.id, c.now)]);
  const dob = parseYMD(m.date_of_birth);
  const join = parseYMD(m.join_date);
  const known: { label: string; value: string }[] = [
    { label: "Member since", value: join ? `${MONTHS[join.m - 1]} ${join.y}` : "Unknown" },
    { label: "Tier", value: m.tier },
    { label: "Founding", value: m.tier === "Founding" ? "Yes" : "No" },
    { label: "Birthday", value: dob ? `${dob.d} ${MONTHS[dob.m - 1]}` : "Not on file" },
  ];
  if (m.favourite_books) known.push({ label: "Books", value: m.favourite_books.replace(/\s*\n\s*/g, " · ") });
  if (m.favourite_authors) known.push({ label: "Authors", value: m.favourite_authors.replace(/\s*\n\s*/g, " · ") });
  if (m.genres_loved.length) known.push({ label: "Genres", value: m.genres_loved.join(", ") });
  if (m.genres_avoid.length) known.push({ label: "Avoids", value: m.genres_avoid.join(", ") });
  if (m.reading_now) known.push({ label: "Reading now", value: m.reading_now });
  if (m.reading_notes) known.push({ label: "Notes", value: m.reading_notes });
  return {
    ...base,
    benefits: benefitHistory(m, c.benefits, c.redemptions, c.now),
    known,
    notes,
    visits: visits.list,
    visitsThisYear: visits.count,
    displayLine: null,
  };
}

export function displayPayloads(c: Ctx) {
  const rows = todayRows(c.member, c.benefits, c.redemptions, c.events, c.now);
  return {
    welcome: welcomePayload(c.member, rows, c.events, c.now),
    splash: splashPayload(c.member, rows, c.events, c.now),
  };
}

export async function getNotes(memberId: string): Promise<Note[]> {
  const rows = await db()`
    select n.id, n.body, n.created_at, coalesce(s.name, 'Staff') as by
    from member_notes n left join staff s on s.id = n.staff_id
    where n.member_id = ${memberId} and n.deleted_at is null
    order by n.created_at desc limit 30`;
  return rows.map((r) => ({
    id: r.id, body: r.body, by: r.by,
    date: `${londonToday(r.created_at).d} ${MONTHS[londonToday(r.created_at).m - 1].slice(0, 3)}`,
  }));
}

async function getVisits(memberId: string, now: Date): Promise<{ list: Visit[]; count: number }> {
  const [rows, [cnt]] = await Promise.all([
    db()`select scanned_at, station from scans where member_id = ${memberId} order by scanned_at desc limit 5`,
    db()`select count(*)::int as n from scans where member_id = ${memberId}
          and scanned_at >= date_trunc('year', now() at time zone 'Europe/London') at time zone 'Europe/London'`,
  ]);
  const today = ymdKey(londonToday(now));
  return {
    list: rows.map((r) => ({ when: fmtWhen(r.scanned_at, now), station: r.station, today: ymdKey(londonToday(r.scanned_at)) === today })),
    count: cnt.n,
  };
}

export async function logScan(p: {
  token: string | null; memberId: string | null; result: ScanState | "lookup"; station: string;
  mode: string; staffId: string | null; deviceId: string | null;
}) {
  await db()`insert into scans (token, member_id, result, station, mode, staff_id, device_id)
    values (${p.token}, ${p.memberId}, ${p.result === "offline" ? "unrecognised" : p.result}, ${p.station},
            ${p.mode}, ${p.staffId}, ${p.deviceId})`;
}

export async function recentScans(deviceId: string, now = new Date()): Promise<RecentScan[]> {
  const rows = await db()`
    select s.scanned_at, s.result, s.member_id, m.first_name, m.last_name, m.subscription_status, m.grace_until
    from scans s left join members m on m.id = s.member_id
    where s.device_id = ${deviceId} order by s.scanned_at desc limit 20`;
  return rows.map((r) => ({
    at: r.scanned_at.toISOString(),
    memberId: r.member_id,
    name: r.member_id ? `${r.first_name} ${r.last_name}`.trim() : "Unknown card",
    state: r.member_id ? memberState(r as never, now) : "unrecognised",
  }));
}

export async function searchMembers(q: string, now = new Date()): Promise<LookupResult[]> {
  const term = q.trim().toLowerCase();
  if (term.length < 3) return [];
  const like = `%${term.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
  const rows = await db()`
    select id, first_name, last_name, tier, subscription_status, grace_until
    from members
    where lower(full_name) like ${like} or lower(email) like ${like}
    order by (lower(full_name) like ${term + "%"}) desc, extensions.similarity(lower(full_name), ${term}) desc, full_name
    limit 20`;
  return rows.map((r) => ({
    memberId: r.id,
    fullName: `${r.first_name} ${r.last_name}`.trim(),
    tierLine: r.tier === "Founding" ? "Founding" : "Standard",
    state: memberState(r as never, now),
  }));
}

// ------------------------------------------------------------------ redemption

export type RedeemResult =
  | { ok: true; redemptionId: string; redeemedAt: Date; duplicate: boolean }
  | { ok: false; reason: "lapsed" | "not_found" | "not_redeemable" | "already_used" | "not_today"; message: string };

export async function redeem(p: {
  memberId: string; benefitKey: string; eventId?: string | null; station: string; staffId: string;
  clientId: string; offline?: boolean; redeemedAt?: Date; details?: string | null;
}): Promise<RedeemResult> {
  const now = new Date();
  // Offline redemptions keep the time they were made, within reason.
  const at = p.redeemedAt && p.redeemedAt < now && now.getTime() - p.redeemedAt.getTime() < 3 * 86400_000 ? p.redeemedAt : now;
  const member = await getMember(p.memberId);
  if (!member) return { ok: false, reason: "not_found", message: "Member not found" };
  const benefits = await getBenefits();
  const b = benefits.find((x) => x.key === p.benefitKey);
  if (!b || !b.redeemable || !b.tiers.includes(member.tier)) return { ok: false, reason: "not_redeemable", message: "This benefit can't be marked as used" };
  if (memberState(member, at) === "lapsed") return { ok: false, reason: "lapsed", message: "Lapsed members can't use benefits" };
  if (b.birthday_month_only && !isBirthdayMonth(member.date_of_birth, at)) return { ok: false, reason: "not_today", message: "Only in their birthday month" };
  if (b.allowance === "per_event") {
    const events = await getEventsToday(member.id, at);
    if (!events.some((e) => e.id === p.eventId && e.eligible)) return { ok: false, reason: "not_today", message: "Not on tonight's list" };
  }
  const period = periodKey(b, member.join_date, at, p.eventId);
  if (!period) return { ok: false, reason: "not_redeemable", message: "This benefit can't be marked as used" };

  // Same client_id twice = a retried request: return the original.
  const [existing] = await db()`select id, redeemed_at from redemptions where client_id = ${p.clientId}`;
  if (existing) return { ok: true, redemptionId: existing.id, redeemedAt: existing.redeemed_at, duplicate: true };

  // The partial unique index makes this atomic across devices.
  const [row] = await db()`
    insert into redemptions (member_id, benefit_key, period_key, event_id, station, staff_id, redeemed_at, details, client_id, offline)
    values (${member.id}, ${b.key}, ${period}, ${p.eventId ?? null}, ${p.station}, ${p.staffId}, ${at},
            ${p.details ?? null}, ${p.clientId}, ${!!p.offline})
    on conflict do nothing
    returning id, redeemed_at`;
  if (!row) {
    const [used] = await db()`
      select r.redeemed_at, r.station from redemptions r
      where member_id = ${member.id} and benefit_key = ${b.key} and period_key = ${period} and undone_at is null`;
    const when = used ? ` on ${londonToday(used.redeemed_at).d} ${MONTHS[londonToday(used.redeemed_at).m - 1].slice(0, 3)} at the ${used.station}` : "";
    return { ok: false, reason: "already_used", message: `Already used${when}` };
  }
  return { ok: true, redemptionId: row.id, redeemedAt: row.redeemed_at, duplicate: false };
}

export async function undoRedemption(id: string, managerId: string, reason: string) {
  const [row] = await db()`
    update redemptions set undone_at = now(), undone_by = ${managerId}, undo_reason = ${reason}
    where id = ${id} and undone_at is null and redeemed_at > now() - (${UNDO_WINDOW_MS / 1000} * interval '1 second')
    returning id`;
  return !!row;
}
