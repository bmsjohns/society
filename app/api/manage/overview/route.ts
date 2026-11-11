import { NextResponse } from "next/server";
import { requireManager, route } from "@/lib/auth";
import { db } from "@/lib/db";

/** Everything the manager page shows: counts for the Backstage hub, undo list, scan log, staff, desks, events. */
export const GET = route(async () => {
  await requireManager();
  const sql = db();
  const [counts, redemptions, scans, staff, stations, events, members] = await Promise.all([
    sql`select b.short_name as name,
          count(r.*) filter (where r.redeemed_at >= date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London')::int as month,
          count(r.*) filter (where r.redeemed_at >= now() - interval '7 days')::int as week
        from benefits b left join redemptions r on r.benefit_key = b.key and r.undone_at is null
        where b.redeemable group by b.key, b.short_name, b.sort order by b.sort`,
    sql`select r.id, r.redeemed_at, r.station, r.offline, r.undone_at, r.undo_reason, b.short_name as benefit,
          m.first_name || ' ' || m.last_name as member, s.name as staff, u.name as undone_by
        from redemptions r join benefits b on b.key = r.benefit_key join members m on m.id = r.member_id
        left join staff s on s.id = r.staff_id left join staff u on u.id = r.undone_by
        where r.redeemed_at > now() - interval '7 days' order by r.redeemed_at desc limit 200`,
    sql`select sc.scanned_at, sc.result, sc.station, sc.mode, sc.token, m.first_name || ' ' || m.last_name as member, s.name as staff
        from scans sc left join members m on m.id = sc.member_id left join staff s on s.id = sc.staff_id
        order by sc.scanned_at desc limit 200`,
    sql`select id, name, role, active, locked_until from staff order by active desc, name`,
    sql`select code, name, staff_seen_at, display_seen_at from stations order by name`,
    sql`select e.id, e.name, e.starts_at, e.open_to_all,
          (select count(*)::int from redemptions r where r.event_id = e.id and r.undone_at is null) as checked_in
        from events e where e.starts_at > now() - interval '30 days' order by e.starts_at`,
    sql`select count(*)::int as total,
          count(*) filter (where subscription_status in ('active','in_trial','non_renewing','future'))::int as active,
          count(*) filter (where grace_until > now())::int as grace
        from members`,
  ]);
  return NextResponse.json({ counts, redemptions, scans, staff, stations, events, members: members[0] });
});
