"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LookupResult, RecentScan, ScanState } from "@/lib/types";
import { api } from "@/lib/client/api";
import { Icon, STATE_ICON } from "./Icon";
import { fmtClock } from "@/lib/time";

const LABEL: Record<ScanState, string> = { active: "Active", grace: "Grace", lapsed: "Lapsed", unrecognised: "Not recognised", offline: "Offline" };

export function StatePill({ state }: { state: ScanState }) {
  return <span className={`state-pill st-${state}`}><Icon name={STATE_ICON[state]} size={14} stroke={2} />{LABEL[state]}</span>;
}

export function LookupPanel({ onPick, backHref, autoFocus = true }: { onPick: (id: string) => void; backHref?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LookupResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 3) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      api<{ results: LookupResult[] }>(`/api/members/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => { setResults(r.results); setError(null); })
        .catch((e) => setError(e.status === 0 ? "No connection. Lookup needs the internet." : e.message));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="page-inner">
      <div className="page-head">
        {backHref && <button className="back" onClick={() => router.push(backHref)} aria-label="Back"><Icon name="arrow-left" size={24} /></button>}
        <h1>Look up</h1>
      </div>
      <label className="search">
        <Icon name="search" size={20} />
        <span className="sr-only">Name or email</span>
        <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" autoComplete="off" autoCorrect="off" spellCheck={false} />
      </label>
      <div className="helper">
        Name or email{results ? ` · ${results.length} result${results.length === 1 ? "" : "s"}` : ", 3 characters minimum"}
      </div>
      {error && <p className="error">{error}</p>}
      {results?.map((r) => (
        <button key={r.memberId} className="row" onClick={() => onPick(r.memberId)}>
          <span className="main"><b>{r.fullName}</b><span>{r.tierLine}</span></span>
          <StatePill state={r.state} />
        </button>
      ))}
      {results?.length === 0 && <div className="empty">No members match &ldquo;{q.trim()}&rdquo;.</div>}
    </div>
  );
}

export function RecentPanel({ onPick, backHref, station }: { onPick: (id: string) => void; backHref?: string; station?: string }) {
  const router = useRouter();
  const [scans, setScans] = useState<RecentScan[] | null>(null);
  useEffect(() => {
    api<{ scans: RecentScan[] }>("/api/recent").then((r) => setScans(r.scans)).catch(() => setScans([]));
  }, []);
  return (
    <div className="page-inner">
      <div className="page-head">
        {backHref && <button className="back" onClick={() => router.push(backHref)} aria-label="Back"><Icon name="arrow-left" size={24} /></button>}
        <h1>Recent</h1>
        <small>Last 20 · {station ?? "this device"}</small>
      </div>
      {scans?.map((s, i) => (
        <button key={i} className="row" onClick={() => s.memberId && onPick(s.memberId)} disabled={!s.memberId}>
          <time>{fmtClock(new Date(s.at))}</time>
          <span className="main"><b>{s.name}</b></span>
          <StatePill state={s.state} />
        </button>
      ))}
      {scans?.length === 0 && <div className="empty">Nothing scanned on this device yet.</div>}
    </div>
  );
}
