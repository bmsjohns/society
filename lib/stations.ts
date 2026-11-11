import "server-only";
import { db } from "./db";
import type { DisplayPayload } from "./types";

/** A staff concierge view that has polled in the last 20s counts as "open". */
export const STAFF_LIVE_MS = 20_000;

export async function getStation(code: string) {
  if (!/^[A-Z0-9]{4,8}$/.test(code)) return null;
  const [row] = await db()<{ code: string; name: string; staff_seen_at: Date | null; display_seen_at: Date | null }[]>`
    select code, name, staff_seen_at, display_seen_at from stations where code = ${code}`;
  return row ?? null;
}

export function staffLive(station: { staff_seen_at: Date | null }) {
  return !!station.staff_seen_at && Date.now() - station.staff_seen_at.getTime() < STAFF_LIVE_MS;
}

/** Show something on the welcome screen and/or open a member on the staff view. */
export async function pushToStation(
  code: string,
  p: { payload: DisplayPayload | null; scan: { token: string | null; memberId: string | null; revokedAt: string | null } | null },
) {
  const [row] = await db()`
    update stations set
      current_payload = ${p.payload ? db().json(p.payload as never) : null},
      current_scan = ${p.scan ? db().json(p.scan as never) : null},
      current_member_id = ${p.scan?.memberId ?? null},
      current_seq = current_seq + 1,
      current_at = now()
    where code = ${code}
    returning current_seq`;
  return row ? Number(row.current_seq) : null;
}
