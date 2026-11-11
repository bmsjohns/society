"use client";
import { Fragment, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BenefitRow, ConciergeView, StatusBand } from "@/lib/types";
import { api } from "@/lib/client/api";
import { DeviceSettings, getDevice } from "@/lib/client/device";
import { useStaff } from "@/components/StaffContext";
import { Icon, STATE_ICON } from "@/components/Icon";
import { TodayCard, UndoSheet } from "@/components/MemberScreen";
import { MONTHS } from "@/lib/time";

type Current = { seq: number; scan: { token: string | null; memberId: string | null; revokedAt: string | null } | null; displayOnline: boolean; name: string };

export default function Page() {
  return <Suspense><Concierge /></Suspense>;
}

/** Staff side of the concierge desk: follows scans at the paired customer screen. */
function Concierge() {
  const router = useRouter();
  const search = useSearchParams();
  const { staff, openSwitcher } = useStaff();
  const [device, setDevice] = useState<DeviceSettings | null>(null);
  const [view, setView] = useState<ConciergeView | null>(null);
  const [unknown, setUnknown] = useState<StatusBand | null>(null);
  const [displayOnline, setDisplayOnline] = useState(false);
  const [deskName, setDeskName] = useState("");
  const [confirm, setConfirm] = useState<BenefitRow | null>(null);
  const [undo, setUndo] = useState<BenefitRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef<number | null>(null);

  useEffect(() => {
    const d = getDevice();
    if (!d || d.mode !== "concierge" || !d.code) router.replace("/setup");
    else setDevice(d);
  }, [router]);

  const open = useCallback(async (memberId: string, opts: { push?: boolean; log?: boolean } = {}) => {
    const q = new URLSearchParams({ view: "concierge" });
    if (opts.push) q.set("push", "1");
    if (opts.log) q.set("log", "1");
    try {
      const r = await api<{ view: ConciergeView }>(`/api/members/${memberId}?${q}`);
      setView((prev) => ({ ...r.view, displayLine: r.view.displayLine ?? (prev?.memberId === memberId ? prev.displayLine : null) }));
      setUnknown(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Opened from lookup: show them and greet them on the customer screen.
  useEffect(() => {
    const id = search.get("member");
    if (id && device) {
      open(id, { push: true, log: true });
      router.replace("/concierge");
    }
  }, [search, device, open, router]);

  // Follow the customer screen. This poll is also the heartbeat that tells it a staff view is open.
  useEffect(() => {
    if (!device?.code) return;
    let alive = true;
    const tick = async () => {
      try {
        const c = await api<Current>(`/api/stations/${device.code}/current`, { timeoutMs: 4000 });
        if (!alive) return;
        setDisplayOnline(c.displayOnline);
        setDeskName(c.name);
        if (seq.current === null) seq.current = c.seq;
        else if (c.seq !== seq.current) {
          seq.current = c.seq;
          if (c.scan?.memberId) open(c.scan.memberId);
          else if (c.scan) {
            setView(null);
            setUnknown({
              state: "unrecognised", label: "Not recognised",
              detail: c.scan.revokedAt ? "This card has been replaced" : "This code isn't valid",
              instruction: "Try manual lookup. The member sees a neutral welcome",
            });
          }
        }
      } catch {}
    };
    tick();
    const t = setInterval(tick, 1200);
    return () => { alive = false; clearInterval(t); };
  }, [device, open]);

  const scanNext = async () => {
    setView(null);
    setUnknown(null);
    if (device?.code) await api(`/api/stations/${device.code}/clear`, { method: "POST" }).catch(() => {});
  };

  const doRedeem = async () => {
    if (!confirm || !view) return;
    try {
      await api("/api/redeem", { method: "POST", json: { memberId: view.memberId, benefitKey: confirm.key, eventId: confirm.eventId ?? null, clientId: crypto.randomUUID() } });
      setToast(`${confirm.title} marked as used`);
      setConfirm(null);
      await open(view.memberId);
    } catch (e) {
      if ((e as { status?: number }).status === 428) { setConfirm(null); openSwitcher(); }
      else setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  if (!device) return null;
  const header = (
    <div className="right">
      <img src="/brand/prologue-red.svg" alt="Prologue" />
      <button className="pill-ink" onClick={() => openSwitcher()}>Concierge · {staff?.name ?? "who?"}</button>
      <button className="btn btn-outline" onClick={() => router.push("/lookup")}><Icon name="search" size={16} />Look up</button>
      {(view || unknown) && <button className="btn btn-outline" onClick={scanNext}>Scan next</button>}
    </div>
  );

  if (!view) {
    return (
      <div className="concierge">
        {unknown && (
          <div className={`cband st-${unknown.state}`}>
            <b><Icon name={STATE_ICON[unknown.state]} size={22} />{unknown.label}</b>
            <span className="detail">{unknown.detail}</span>
            <span className="display-line">{unknown.instruction}</span>
          </div>
        )}
        <div className="chead"><div className="eyebrow muted">{deskName || "Concierge desk"}</div>{header}</div>
        <div className="waiting">
          <img src="/brand/pigeon-perched-line.png" alt="" />
          <h2 className="display" style={{ fontSize: 34, color: "var(--red-700)", margin: 0 }}>{unknown ? "We couldn't match that card" : "Waiting for the next scan"}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {displayOnline ? "The customer screen is connected." : "The customer screen isn't connected. Open Society Scan on it and choose this desk."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="concierge">
      <div className={`cband st-${view.band.state}`}>
        <b><Icon name={STATE_ICON[view.band.state]} size={22} />{view.band.label}</b>
        <span className="detail">{view.band.detail} · {view.band.instruction}</span>
        {view.displayLine && <span className="display-line">{view.displayLine}</span>}
      </div>
      <div className="chead">
        <div className="avatar">{view.photoUrl ? <img src={view.photoUrl} alt="" /> : view.initials}</div>
        <div>
          <h1 className="member-name">{view.fullName}</h1>
          <div className="chips">
            {!view.founding && <span className="chip">{view.tier}</span>}
            {view.founding && <span className="chip chip-founding">Founding Member</span>}
            {view.birthdayMonth && <span className="chip chip-birthday">Birthday month</span>}
            <span className="since" style={{ alignSelf: "center" }}>{view.sinceLine}</span>
          </div>
        </div>
        {header}
      </div>
      {error && <p className="error" style={{ padding: "8px 22px 0" }}>{error}</p>}
      <div className="cgrid">
        <div className="ccol">
          <TodayCard view={view} className="card today" onRedeem={(r) => (staff ? setConfirm(r) : openSwitcher(() => setConfirm(r)))} onUndo={staff?.role === "manager" ? setUndo : undefined} />
          <div className="card">
            <div className="card-title">Benefits <small>This membership year</small></div>
            {view.benefits.map((b) => (
              <div key={b.key} className="hist">
                <div className="t">{b.name}<span>{b.count}</span></div>
                <div className="l">{b.lines.length ? b.lines.join(" · ") : b.note ?? "Not used yet"}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="ccol">
          <Notes view={view} onSaved={(notes) => setView({ ...view, notes })} />
        </div>
        <div className="ccol">
          <div className="card">
            <div className="card-title">What we know</div>
            <dl className="kv">
              {view.known.map((k) => (<Fragment key={k.label}><dt>{k.label}</dt><dd>{k.value}</dd></Fragment>))}
            </dl>
          </div>
          <div className="card">
            <div className="card-title">Visits <small>{view.visitsThisYear} this year</small></div>
            {view.visits.map((v, i) => (
              <div key={i} className={`visit ${v.today ? "today" : ""}`}><span className="dot" /><span>{v.when}</span><span>{v.station}</span></div>
            ))}
          </div>
        </div>
      </div>

      {confirm && (
        <div className="overlay" onClick={() => setConfirm(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="eyebrow">Mark as used</div>
            <h2>{confirm.key === "monthly_drink" ? `${MONTHS[new Date().getMonth()]}'s drink for ${view.firstName}?` : `${confirm.title} for ${view.firstName}?`}</h2>
            <div className="meta">{confirm.title} · Concierge · logged as {staff?.name}</div>
            <button className="btn btn-primary btn-block" onClick={doRedeem}>Confirm</button>
            <button className="btn btn-outline btn-block" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}
      {undo && <UndoSheet row={undo} first={view.firstName} onClose={() => setUndo(null)} onUndone={() => { setUndo(null); open(view.memberId); }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Notes({ view, onSaved }: { view: ConciergeView; onSaved: (n: ConciergeView["notes"]) => void }) {
  const { staff, openSwitcher } = useStaff();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!body.trim()) return;
    if (!staff) return openSwitcher();
    setBusy(true);
    try {
      const r = await api<{ notes: ConciergeView["notes"] }>("/api/notes", { method: "POST", json: { memberId: view.memberId, body } });
      onSaved(r.notes);
      setBody("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card" style={{ flex: 1 }}>
      <div className="card-title">Notes <small>Newest first</small></div>
      <form className="note-form" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Add a note for ${view.firstName}…`} maxLength={2000} />
        <button className="btn btn-primary btn-sm" disabled={busy || !body.trim()}>Add note</button>
      </form>
      {view.notes.map((n) => (
        <div key={n.id} className="note"><p>{n.body}</p><small>{n.by} · {n.date}</small></div>
      ))}
      {view.notes.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No notes yet. Anything that helps the next person serve {view.firstName}.</p>}
    </div>
  );
}
