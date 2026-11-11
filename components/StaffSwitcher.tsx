"use client";
import { useEffect, useState } from "react";
import type { StaffSummary } from "@/lib/types";
import { api } from "@/lib/client/api";

/** "Who's serving?" — pick your name, enter your 4-digit PIN. */
export function StaffSwitcher({ onClose, onDone }: { onClose: () => void; onDone: (s: StaffSummary) => void }) {
  const [list, setList] = useState<StaffSummary[] | null>(null);
  const [who, setWho] = useState<StaffSummary | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ staff: StaffSummary[] }>("/api/staff").then((r) => setList(r.staff)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!who || pin.length !== 4 || busy) return;
    setBusy(true);
    api<{ staff: StaffSummary }>("/api/staff/switch", { method: "POST", json: { staffId: who.id, pin } })
      .then((r) => onDone(r.staff))
      .catch((e) => {
        setError(e.message);
        setPin("");
      })
      .finally(() => setBusy(false));
  }, [pin, who, busy, onDone]);

  const press = (d: string) => {
    setError(null);
    setPin((p) => (d === "del" ? p.slice(0, -1) : p.length < 4 ? p + d : p));
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Switch staff">
        <div className="eyebrow">{who ? "Enter your PIN" : "Who's serving?"}</div>
        {!who ? (
          <>
            <h2>Switch to</h2>
            {!list && !error && <p className="muted">Loading…</p>}
            <div className="staff-list">
              {list?.map((s) => (
                <button key={s.id} onClick={() => setWho(s)}>{s.name}</button>
              ))}
            </div>
            {list?.length === 0 && <p className="muted">No staff yet. A manager adds people under Manage.</p>}
          </>
        ) : (
          <>
            <h2>{who.name}</h2>
            <div className="pindots" aria-label={`${pin.length} of 4 digits`}>
              {[0, 1, 2, 3].map((i) => <i key={i} className={i < pin.length ? "on" : ""} />)}
            </div>
            <div className="pinpad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} onClick={() => press(d)} disabled={busy}>{d}</button>
              ))}
              <button onClick={() => { setWho(null); setPin(""); }} style={{ fontSize: 15 }}>Back</button>
              <button onClick={() => press("0")} disabled={busy}>0</button>
              <button onClick={() => press("del")} style={{ fontSize: 15 }}>Delete</button>
            </div>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-outline btn-block" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
