"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LookupPanel, RecentPanel } from "@/components/Lists";
import { getDevice, homeFor } from "@/lib/client/device";

export default function LookupPage() {
  const router = useRouter();
  const [home, setHome] = useState("/scan");
  const [station, setStation] = useState<string>();
  useEffect(() => {
    const d = getDevice();
    if (d) { setHome(homeFor(d.mode)); setStation(d.station); }
  }, []);
  const pick = (id: string) => router.push(home === "/concierge" ? `/concierge?member=${id}` : `/member/${id}?log=1`);
  return (
    <div className="page">
      <div className="split">
        <div><LookupPanel onPick={pick} backHref={home} /></div>
        <div className="only-wide"><RecentPanel onPick={pick} station={station} /></div>
      </div>
    </div>
  );
}
