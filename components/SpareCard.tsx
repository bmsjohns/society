"use client";
import { useState } from "react";
import type { StatusBand } from "@/lib/types";
import { api } from "@/lib/client/api";
import { Band } from "./MemberScreen";
import { LookupPanel } from "./Lists";
import { useStaff } from "./StaffContext";

/** A spare printed card that hasn't been given to anyone yet. Managers can link it to a member. */
export function SpareCardScreen(props: {
  token: string; label: string; band: StatusBand; station: string;
  onScanAgain: () => void; onAssigned: (memberId: string) => void;
}) {
  const { staff, openSwitcher } = useStaff();
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manager = staff?.role === "manager";

  const assign = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tokens/${encodeURIComponent(props.token)}/assign`, { method: "POST", json: { memberId: chosen.id } });
      props.onAssigned(chosen.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (picking && !chosen) {
    return (
      <div className="page">
        <LookupPanel
          onPick={async (id) => {
            try {
              const r = await api<{ view: { fullName: string } }>(`/api/members/${id}`);
              setChosen({ id, name: r.view.fullName });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
        <div className="page-inner" style={{ paddingTop: 0 }}>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-outline btn-block" onClick={() => setPicking(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="member">
      <Band band={props.band} station={props.station} />
      <div className="unrec">
        <h2>{props.label}</h2>
        <p className="muted">This card hasn&apos;t been given to anyone yet. Give it to a new member, or to someone replacing a lost card. Their old card stops working.</p>
        {manager ? (
          <button className="btn btn-primary btn-block" onClick={() => setPicking(true)}>Give to a member</button>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>Only a manager can give out cards.</p>
            <button className="btn btn-primary btn-block" onClick={() => openSwitcher()}>Switch to a manager</button>
          </>
        )}
        <button className="btn btn-outline btn-block" onClick={props.onScanAgain}>Scan again</button>
      </div>
      {chosen && (
        <div className="overlay" onClick={() => !busy && setChosen(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="eyebrow">Give card</div>
            <h2>{props.label} for {chosen.name}?</h2>
            <div className="meta">Any card they already have stops working.</div>
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block" onClick={assign} disabled={busy}>{busy ? "Saving…" : "Confirm"}</button>
            <button className="btn btn-outline btn-block" onClick={() => setChosen(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
