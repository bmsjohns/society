"use client";
import type { StaffMemberView } from "../types";
import { api, isNetworkError } from "./api";

// When the connection drops, the scan screen shows the last result cached on this device
// (flagged "not verified"), and Mark as used is queued and synced once back online.

const CACHE = "ps_cache_v1";
const QUEUE = "ps_queue_v1";
const MAX_CACHED = 60;
const MAX_AGE_MS = 7 * 86400_000;

type Cached = { view: StaffMemberView; savedAt: number; tokens: string[] };

function read<T>(k: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

export function cacheView(view: StaffMemberView, token?: string) {
  const all = read<Record<string, Cached>>(CACHE, {});
  const prev = all[view.memberId];
  const tokens = Array.from(new Set([...(prev?.tokens ?? []), ...(token ? [token] : [])]));
  all[view.memberId] = { view, savedAt: Date.now(), tokens };
  const entries = Object.entries(all).filter(([, c]) => Date.now() - c.savedAt < MAX_AGE_MS)
    .sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, MAX_CACHED);
  write(CACHE, Object.fromEntries(entries));
}

export function cachedByToken(token: string): Cached | null {
  const all = read<Record<string, Cached>>(CACHE, {});
  return Object.values(all).find((c) => c.tokens.includes(token)) ?? null;
}

export function cachedById(id: string): Cached | null {
  return read<Record<string, Cached>>(CACHE, {})[id] ?? null;
}

export type QueuedRedemption = {
  clientId: string; memberId: string; benefitKey: string; eventId?: string | null;
  redeemedAt: string; memberName: string; benefitTitle: string; error?: string;
};

export function queued(): QueuedRedemption[] {
  return read<QueuedRedemption[]>(QUEUE, []);
}

export function enqueue(r: QueuedRedemption) {
  write(QUEUE, [...queued(), r]);
}

let flushing = false;
/** Send queued redemptions. Ones the server refuses (e.g. already used) are kept with the reason for a manager to see. */
export async function flushQueue(): Promise<{ sent: number; failed: QueuedRedemption[] }> {
  if (flushing) return { sent: 0, failed: [] };
  flushing = true;
  let sent = 0;
  try {
    const keep: QueuedRedemption[] = [];
    for (const r of queued()) {
      if (r.error) { keep.push(r); continue; }
      try {
        await api("/api/redeem", { method: "POST", json: { ...r, offline: true } });
        sent++;
      } catch (e) {
        if (isNetworkError(e)) keep.push(r);
        else keep.push({ ...r, error: (e as Error).message });
      }
    }
    write(QUEUE, keep);
    return { sent, failed: keep.filter((r) => r.error) };
  } finally {
    flushing = false;
  }
}

export function clearFailed() {
  write(QUEUE, queued().filter((r) => !r.error));
}
