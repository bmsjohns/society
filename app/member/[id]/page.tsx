"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { StaffMemberView } from "@/lib/types";
import { api, isNetworkError } from "@/lib/client/api";
import { getDevice } from "@/lib/client/device";
import { cacheView, cachedById } from "@/lib/client/offline";
import { MemberScreen } from "@/components/MemberScreen";

/** A member opened from lookup or recent scans. */
export default function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const [view, setView] = useState<StaffMemberView | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [station, setStation] = useState("Floor");

  const load = useCallback(async (log: boolean) => {
    try {
      const r = await api<{ view: StaffMemberView }>(`/api/members/${id}${log ? "?log=1" : ""}`);
      cacheView(r.view);
      setView(r.view);
      setSavedAt(null);
    } catch (e) {
      const hit = cachedById(id);
      if (isNetworkError(e) && hit) { setView(hit.view); setSavedAt(hit.savedAt); }
      else setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    setStation(getDevice()?.station ?? "Floor");
    load(search.get("log") === "1");
  }, [load, search]);

  if (error) return <div className="page"><div className="page-inner"><p className="error">{error}</p><button className="btn btn-outline" onClick={() => router.push("/scan")}>Back to scan</button></div></div>;
  if (!view) return <div className="page" />;
  return <MemberScreen view={view} station={station} offlineSavedAt={savedAt} onDone={() => router.push("/scan")} onChanged={() => load(false)} />;
}
