"use client";
import { useEffect } from "react";
import { flushQueue } from "@/lib/client/offline";

/** Registers the PWA service worker and syncs queued offline redemptions when back online. */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const sync = () => navigator.onLine && flushQueue().catch(() => {});
    sync();
    window.addEventListener("online", sync);
    const t = setInterval(sync, 30_000);
    return () => {
      window.removeEventListener("online", sync);
      clearInterval(t);
    };
  }, []);
  return null;
}
