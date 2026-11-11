"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RecentPanel } from "@/components/Lists";
import { getDevice, homeFor } from "@/lib/client/device";
import { clearFailed, queued, QueuedRedemption } from "@/lib/client/offline";

export default function RecentPage() {
  const router = useRouter();
  const [home, setHome] = useState("/scan");
  const [station, setStation] = useState<string>();
  const [pending, setPending] = useState<QueuedRedemption[]>([]);
  useEffect(() => {
    const d = getDevice();
    if (d) { setHome(homeFor(d.mode)); setStation(d.station); }
    setPending(queued());
  }, []);
  const pick = (id: string) => router.push(home === "/concierge" ? `/concierge?member=${id}` : `/member/${id}`);
  const failed = pending.filter((p) => p.error);
  const waiting = pending.filter((p) => !p.error);
  return (
    <div className="page">
      <RecentPanel onPick={pick} backHref={home} station={station} />
      {(waiting.length > 0 || failed.length > 0) && (
        <div className="page-inner" style={{ paddingTop: 0 }}>
          {waiting.length > 0 && <p className="muted">{waiting.length} marked-as-used waiting to sync. They send automatically when the connection is back.</p>}
          {failed.length > 0 && (
            <div className="card">
              <div className="card-title">Couldn&apos;t sync</div>
              {failed.map((f) => (
                <div key={f.clientId} className="benefit"><div><b>{f.benefitTitle} · {f.memberName}</b><span>{f.error}</span></div></div>
              ))}
              <button className="btn btn-outline btn-sm" onClick={() => { clearFailed(); setPending(queued()); }}>Dismiss</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
