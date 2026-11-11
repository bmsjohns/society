// All "today", "this month" and "membership year" logic runs in shop time, not UTC.
export const SHOP_TZ = "Europe/London";

export type YMD = { y: number; m: number; d: number };

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function londonParts(d: Date): YMD & { hh: number; mm: number } {
  const p: Record<string, string> = {};
  for (const part of partsFmt.formatToParts(d)) p[part.type] = part.value;
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute };
}

export function londonToday(now: Date): YMD {
  const { y, m, d } = londonParts(now);
  return { y, m, d };
}

export function parseYMD(s: string | Date | null | undefined): YMD | null {
  if (!s) return null;
  if (s instanceof Date) return { y: s.getUTCFullYear(), m: s.getUTCMonth() + 1, d: s.getUTCDate() };
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}

export const pad = (n: number) => String(n).padStart(2, "0");
export const ymdKey = (v: YMD) => `${v.y}-${pad(v.m)}-${pad(v.d)}`;
export const cmpYMD = (a: YMD, b: YMD) => a.y - b.y || a.m - b.m || a.d - b.d;

function isLeap(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Anniversary of `join` in year `y` (29 Feb falls back to 28 Feb in non-leap years). */
export function anniversary(join: YMD, y: number): YMD {
  if (join.m === 2 && join.d === 29 && !isLeap(y)) return { y, m: 2, d: 28 };
  return { y, m: join.m, d: join.d };
}

/** Start of the membership year containing `today`, from the join date. */
export function membershipYearStart(join: YMD, today: YMD): YMD {
  const thisYear = anniversary(join, today.y);
  return cmpYMD(thisYear, today) <= 0 ? thisYear : anniversary(join, today.y - 1);
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 7:42pm, 7pm — brand style */
export function fmtTime(d: Date): string {
  const { hh, mm } = londonParts(d);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}${mm ? ":" + pad(mm) : ""}${hh < 12 ? "am" : "pm"}`;
}

/** 7:42 — compact list time */
export function fmtClock(d: Date): string {
  const { hh, mm } = londonParts(d);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${pad(mm)}`;
}

/** 4 Nov */
export function fmtDayMonth(d: Date | YMD): string {
  const v = d instanceof Date ? londonToday(d) : d;
  return `${v.d} ${SHORT_MONTHS[v.m - 1]}`;
}

/** 14 Mar 2027 */
export function fmtDate(d: Date | YMD): string {
  const v = d instanceof Date ? londonToday(d) : d;
  return `${v.d} ${SHORT_MONTHS[v.m - 1]} ${v.y}`;
}

/** Mar 2024 */
export function fmtMonthYearShort(v: YMD): string {
  return `${SHORT_MONTHS[v.m - 1]} ${v.y}`;
}

/** March 2024 */
export function fmtMonthYear(v: YMD): string {
  return `${MONTHS[v.m - 1]} ${v.y}`;
}

/** Thu 18 Sep */
export function fmtWeekdayDate(d: Date): string {
  const v = londonToday(d);
  const wd = new Date(Date.UTC(v.y, v.m - 1, v.d)).getUTCDay();
  return `${SHORT_DAYS[wd]} ${v.d} ${SHORT_MONTHS[v.m - 1]}`;
}

/** "Today, 7:42pm" / "Mon 3 Nov, 11:20am" */
export function fmtWhen(d: Date, now: Date): string {
  const same = ymdKey(londonToday(d)) === ymdKey(londonToday(now));
  return `${same ? "Today" : fmtWeekdayDate(d)}, ${fmtTime(d)}`;
}

export function nextMonthStart(today: YMD): YMD {
  return today.m === 12 ? { y: today.y + 1, m: 1, d: 1 } : { y: today.y, m: today.m + 1, d: 1 };
}
