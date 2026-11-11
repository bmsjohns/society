"use client";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: Record<string, unknown>) { super(message); }
}

/** True when the request never reached the server (no signal, server down). */
export const isNetworkError = (e: unknown) => !(e instanceof ApiError) || e.status === 0;

export async function api<T>(url: string, init?: RequestInit & { json?: unknown; timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 8000);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...init?.headers },
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "No connection");
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Error ${res.status}`, body);
  return body as T;
}
