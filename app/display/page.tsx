"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DisplayPayload } from "@/lib/types";
import { api } from "@/lib/client/api";
import { DeviceSettings, getDevice } from "@/lib/client/device";
import { goodRead } from "@/lib/client/feedback";
import { useScanner } from "@/components/Scanner";
import { CustomerScreen, DISPLAY_MS, IdleScreen } from "@/components/CustomerScreens";

type Showing = { payload: DisplayPayload; key: number };

/**
 * Customer-facing screen at the concierge desk (or a stand-alone self-scan point).
 * Scans with its own camera; also shows welcomes the staff side pushes after a lookup.
 */
export default function Display() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [device, setDevice] = useState<DeviceSettings | null>(null);
  const [showing, setShowing] = useState<Showing | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef<number | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const d = getDevice();
    if (!d || d.mode !== "welcome" || !d.code) router.replace("/setup");
    else setDevice(d);
  }, [router]);

  const show = useCallback((payload: DisplayPayload) => {
    setShowing({ payload, key: Date.now() });
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setShowing(null), DISPLAY_MS);
  }, []);

  const onRead = useCallback(async (raw: string) => {
    if (!device?.code || busy) return;
    setBusy(true);
    goodRead();
    try {
      const r = await api<{ payload: DisplayPayload; seq: number }>(`/api/stations/${device.code}/scan`, { method: "POST", json: { raw } });
      seq.current = r.seq;
      show(r.payload);
    } catch {
      show({ kind: "neutral" }); // never show an error or a reason to the member
    } finally {
      setBusy(false);
    }
  }, [device, busy, show]);

  const { error } = useScanner({ video, onRead, paused: busy || !!showing, facing: device?.camera ?? "user", enabled: !!device });

  // Pushes from the staff side (lookup at the desk, "Scan next"). Also this screen's heartbeat.
  useEffect(() => {
    if (!device?.code) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await api<{ seq: number; payload: DisplayPayload | null; at: string | null }>(`/api/stations/${device.code}/display`, { timeoutMs: 4000 });
        if (!alive) return;
        if (seq.current === null) seq.current = r.seq;
        else if (r.seq !== seq.current) {
          seq.current = r.seq;
          if (r.payload && r.at && Date.now() - new Date(r.at).getTime() < DISPLAY_MS) show(r.payload);
          else setShowing(null);
        }
      } catch {}
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [device, show]);

  if (!device) return null;
  const camera = (
    <div className="cam-mini">
      <video ref={video} muted playsInline />
      <span>{error ? "Camera unavailable" : "Hold your card here"}</span>
    </div>
  );
  return (
    <>
      <div style={{ display: showing ? "none" : undefined }}>
        <IdleScreen joinUrl={process.env.NEXT_PUBLIC_JOIN_URL || null} camera={camera} />
      </div>
      {showing && <div onClick={() => setShowing(null)}><CustomerScreen payload={showing.payload} runKey={showing.key} /></div>}
    </>
  );
}
