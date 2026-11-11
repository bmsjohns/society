"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RecentScan, ScanResponse, StaffMemberView, StatusBand } from "@/lib/types";
import { api, isNetworkError } from "@/lib/client/api";
import { DeviceSettings, getDevice } from "@/lib/client/device";
import { cacheView, cachedByToken } from "@/lib/client/offline";
import { badRead, goodRead } from "@/lib/client/feedback";
import { useScanner } from "@/components/Scanner";
import { ScanHeader } from "@/components/ScanHeader";
import { MemberScreen, UnrecognisedScreen } from "@/components/MemberScreen";
import { Icon } from "@/components/Icon";
import { fmtClock } from "@/lib/time";

type Shown =
  | { kind: "member"; view: StaffMemberView; offlineSavedAt: number | null }
  | { kind: "unrecognised"; band: StatusBand };

const LABEL: Record<string, string> = { active: "Active", grace: "Grace", lapsed: "Lapsed", unrecognised: "Not recognised", offline: "Offline" };
const TOKEN_RE = /PS-[0-9A-Z]{8}/i;

export default function ScanPage() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [device, setDevice] = useState<DeviceSettings | null>(null);
  const [reading, setReading] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);

  useEffect(() => {
    const d = getDevice();
    if (!d) router.replace("/setup");
    else setDevice(d);
  }, [router]);

  const loadRecent = useCallback(() => {
    api<{ scans: RecentScan[] }>("/api/recent").then((r) => setRecent(r.scans)).catch(() => {});
  }, []);
  useEffect(loadRecent, [loadRecent]);

  const onRead = useCallback(async (raw: string) => {
    if (reading) return;
    setReading(true);
    goodRead();
    const started = Date.now();
    let next: Shown;
    try {
      const r = await api<ScanResponse>("/api/scan", { method: "POST", json: { raw } });
      if (r.kind === "member") {
        cacheView(r.view, r.token);
        next = { kind: "member", view: r.view, offlineSavedAt: null };
      } else {
        badRead();
        next = { kind: "unrecognised", band: r.band };
      }
    } catch (e) {
      const token = TOKEN_RE.exec(raw)?.[0]?.toUpperCase();
      const hit = token ? cachedByToken(token) : null;
      if (isNetworkError(e) && hit) next = { kind: "member", view: hit.view, offlineSavedAt: hit.savedAt };
      else next = {
        kind: "unrecognised",
        band: isNetworkError(e)
          ? { state: "offline", label: "Offline", detail: "No connection, and this card isn't saved on this device", instruction: "Check the Wi-Fi, then scan again" }
          : { state: "unrecognised", label: "Not recognised", detail: (e as Error).message, instruction: "Try manual lookup" },
      };
    }
    // Hold the green "good read" frame briefly so staff see it lock.
    setTimeout(() => {
      setShown(next);
      setReading(false);
    }, Math.max(0, 450 - (Date.now() - started)));
  }, [reading]);

  const { error } = useScanner({ video, onRead, paused: !!shown || reading, facing: device?.camera, enabled: !!device });

  const refresh = async () => {
    if (shown?.kind !== "member" || shown.offlineSavedAt) return;
    try {
      const r = await api<{ view: StaffMemberView }>(`/api/members/${shown.view.memberId}`);
      cacheView(r.view);
      setShown({ kind: "member", view: r.view, offlineSavedAt: null });
    } catch {}
  };

  const back = () => {
    setShown(null);
    loadRecent();
  };

  if (!device) return null;
  const station = device.station;

  return (
    <>
      <div className="scan" style={{ display: shown ? "none" : undefined }}>
        <ScanHeader station={station} />
        <div className="viewfinder">
          <video ref={video} muted playsInline />
          <div className="shade" />
          <div className="label">Live camera</div>
          <div className={`frame ${reading ? "read" : ""}`}>
            <i /><i /><i /><i />
            {reading && <div className="tick"><div className="tick-circle"><Icon name="check" size={44} stroke={2} /></div></div>}
          </div>
          <div className={`caption ${reading ? "ok" : ""}`}>
            {reading ? "Read. Opening member…" : error ?? "Point at a Society card or wallet pass"}
          </div>
        </div>
        <div className="scan-actions">
          <button className="btn btn-on-red" onClick={() => router.push("/lookup")}>Look up member</button>
          <button className="btn btn-on-red" onClick={() => router.push("/recent")}>Recent scans</button>
        </div>
        <aside className="scan-side">
          <ScanHeader station={station} />
          <button className="btn btn-on-red btn-block" onClick={() => router.push("/lookup")}>Look up member</button>
          <button className="btn btn-on-red btn-block" onClick={() => router.push("/recent")}>Recent scans</button>
          <div className="side-list">
            <span className="eyebrow">Last scans</span>
            {recent.slice(0, 8).map((s, i) => (
              <button key={i} className="side-row" onClick={() => s.memberId && router.push(`/member/${s.memberId}`)}>
                <span className={`dot dot-${s.state}`} />
                <span className="who"><b>{s.name}</b><span>{LABEL[s.state]}</span></span>
                <time>{fmtClock(new Date(s.at))}</time>
              </button>
            ))}
            {recent.length === 0 && <p style={{ color: "var(--paper-70)", fontSize: 14 }}>Scans on this device show here.</p>}
          </div>
        </aside>
      </div>
      {shown?.kind === "member" && (
        <MemberScreen view={shown.view} station={station} offlineSavedAt={shown.offlineSavedAt} onDone={back} onChanged={refresh} />
      )}
      {shown?.kind === "unrecognised" && (
        <UnrecognisedScreen band={shown.band} station={station} onScanAgain={back} onLookup={() => router.push("/lookup")} />
      )}
    </>
  );
}
