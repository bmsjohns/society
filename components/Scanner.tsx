"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Continuous QR reading from the device camera (qr-scanner, uses the native BarcodeDetector where
 * available). Also accepts USB/Bluetooth barcode scanners that "type" the code followed by Enter.
 */
export function useScanner(opts: {
  video: React.RefObject<HTMLVideoElement | null>;
  onRead: (raw: string) => void;
  paused?: boolean;
  facing?: "environment" | "user";
  /** Start the camera only once the <video> element is on the page. */
  enabled?: boolean;
}) {
  const { video, paused, facing = "environment", enabled = true } = opts;
  const onRead = useRef(opts.onRead);
  onRead.current = opts.onRead;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const last = useRef<{ raw: string; at: number }>({ raw: "", at: 0 });
  const [error, setError] = useState<string | null>(null);

  const emit = (raw: string) => {
    const now = Date.now();
    if (pausedRef.current) return;
    if (raw === last.current.raw && now - last.current.at < 8000) return; // same card still held in view
    last.current = { raw, at: now };
    onRead.current(raw);
  };

  useEffect(() => {
    let scanner: import("qr-scanner").default | null = null;
    let stopped = false;
    if (!enabled) return;
    (async () => {
      const el = video.current;
      if (!el) return;
      const QrScanner = (await import("qr-scanner")).default;
      if (stopped) return;
      scanner = new QrScanner(el, (r) => emit(r.data), {
        preferredCamera: facing,
        maxScansPerSecond: 12,
        returnDetailedScanResult: true,
        highlightScanRegion: false,
        highlightCodeOutline: false,
      });
      try {
        await scanner.start();
        setError(null);
      } catch (e) {
        setError(String(e).includes("NotAllowed") || String(e).includes("ermission")
          ? "Camera blocked. Allow camera access for this site in the browser settings."
          : "No camera found. Use Look up member, or a plug-in scanner.");
      }
    })();
    return () => {
      stopped = true;
      scanner?.stop();
      scanner?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, enabled]);

  // Keyboard-wedge scanners
  useEffect(() => {
    let buf = "";
    let lastKey = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const now = Date.now();
      if (now - lastKey > 80) buf = "";
      lastKey = now;
      if (e.key === "Enter") {
        if (buf.length >= 6) emit(buf);
        buf = "";
      } else if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { error };
}
