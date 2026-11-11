import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "./db";
import type { DeviceMode, StaffSummary } from "./types";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Local development without Clerk keys. Never honoured in production. */
export const devNoAuth = () => process.env.DEV_NO_AUTH === "1" && process.env.NODE_ENV !== "production";

const allowedDomains = () =>
  (process.env.ALLOWED_EMAIL_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);

/** A signed-in Prologue device (Clerk). Throws 401/403. */
export async function requireDevice(): Promise<{ userId: string }> {
  if (devNoAuth()) return { userId: "dev" };
  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const { userId, sessionClaims } = await auth();
  if (!userId) throw new HttpError(401, "Sign in first");
  const domains = allowedDomains();
  if (domains.length) {
    // Add {"email": "{{user.primary_email_address}}"} to the Clerk session token to skip the lookup.
    let email = (sessionClaims as Record<string, unknown> | null)?.email as string | undefined;
    if (!email) email = (await currentUser())?.primaryEmailAddress?.emailAddress;
    const domain = email?.split("@")[1]?.toLowerCase();
    if (!domain || !domains.includes(domain)) throw new HttpError(403, "Prologue staff accounts only");
  }
  return { userId };
}

// ------------------------------------------------------------------ staff session (PIN switch)

const STAFF_COOKIE = "ps_staff";
const STAFF_TTL_S = 14 * 60 * 60;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return s;
}
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url");

export function staffCookieValue(staffId: string) {
  const body = Buffer.from(JSON.stringify({ sid: staffId, exp: Math.floor(Date.now() / 1000) + STAFF_TTL_S })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function setStaffCookie(res: NextResponse, staffId: string | null) {
  if (!staffId) {
    res.cookies.delete(STAFF_COOKIE);
    return;
  }
  res.cookies.set(STAFF_COOKIE, staffCookieValue(staffId), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: STAFF_TTL_S,
  });
}

function readStaffId(raw: string | undefined): string | null {
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const { sid, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    return exp > Date.now() / 1000 ? sid : null;
  } catch {
    return null;
  }
}

export async function currentStaff(): Promise<StaffSummary | null> {
  const sid = readStaffId((await cookies()).get(STAFF_COOKIE)?.value);
  if (!sid) return null;
  const [row] = await db()`select id, name, role from staff where id = ${sid} and active`;
  return row ? { id: row.id, name: row.name, role: row.role } : null;
}

export async function requireStaff(): Promise<StaffSummary> {
  await requireDevice();
  const s = await currentStaff();
  if (!s) throw new HttpError(428, "Choose who you are first");
  return s;
}

export async function requireManager(): Promise<StaffSummary> {
  const s = await requireStaff();
  if (s.role !== "manager") throw new HttpError(403, "Managers only");
  return s;
}

// ------------------------------------------------------------------ device settings

export type Device = { id: string | null; station: string; mode: DeviceMode; code: string | null };
const STATIONS = ["Concierge", "Bar", "Floor", "Event door"];

/** Set once per device on /setup; stored in a plain cookie (nothing secret in it). */
export async function currentDevice(): Promise<Device> {
  const raw = (await cookies()).get("ps_device")?.value;
  let d: Partial<Device> = {};
  try {
    d = raw ? JSON.parse(decodeURIComponent(raw)) : {};
  } catch {}
  return {
    id: typeof d.id === "string" ? d.id.slice(0, 40) : null,
    station: STATIONS.includes(d.station as string) ? (d.station as string) : "Floor",
    mode: d.mode === "concierge" || d.mode === "welcome" ? d.mode : "staff",
    code: typeof d.code === "string" && /^[A-Z0-9]{4,8}$/.test(d.code) ? d.code : null,
  };
}

// ------------------------------------------------------------------ route helper

export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}
