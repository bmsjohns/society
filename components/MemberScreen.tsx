"use client";
import { useEffect, useRef, useState } from "react";
import type { BenefitRow, StaffMemberView, StatusBand } from "@/lib/types";
import { api, isNetworkError } from "@/lib/client/api";
import { enqueue } from "@/lib/client/offline";
import { Icon, STATE_ICON } from "./Icon";
import { useStaff } from "./StaffContext";
import { MONTHS, fmtTime } from "@/lib/time";

export const AUTO_RETURN_MS = 20_000;

export function Band({ band, station, seconds, onBack }: { band: StatusBand; station: string; seconds?: number; onBack?: () => void }) {
  return (
    <div className={`band st-${band.state}`} onClick={onBack}>
      <div className="top"><span>{station.toUpperCase()}</span>{seconds !== undefined && <span>Back to scan in {seconds}s</span>}</div>
      <div className="label"><Icon name={STATE_ICON[band.state]} size={34} stroke={1.75} />{band.label}</div>
      <div className="detail">{band.detail}</div>
      <div className="instruction">{band.instruction}</div>
    </div>
  );
}

export function TimerBar({ ms, runKey, paused }: { ms: number; runKey: string | number; paused?: boolean }) {
  return (
    <div className="timer run">
      <div key={runKey} style={{ animationDuration: `${ms}ms`, animationPlayState: paused ? "paused" : "running" }} />
    </div>
  );
}

function useCountdown(ms: number, paused: boolean, runKey: unknown, onEnd: () => void) {
  const [left, setLeft] = useState(ms);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => setLeft(ms), [runKey, ms]);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setLeft((l) => {
      if (l <= 1000) { clearInterval(t); setTimeout(() => end.current(), 0); return 0; }
      return l - 1000;
    }), 1000);
    return () => clearInterval(t);
  }, [paused, runKey]);
  return Math.ceil(left / 1000);
}

function confirmTitle(row: BenefitRow, first: string) {
  const month = MONTHS[new Date().getMonth()];
  switch (row.key) {
    case "monthly_drink": return `${month}'s drink for ${first}?`;
    case "society_evening": return `Check ${first} in to ${row.title}?`;
    default: return `${row.title} for ${first}?`;
  }
}

type Done = { row: BenefitRow; at: Date; staff: string; offline: boolean };

export function MemberScreen(props: {
  view: StaffMemberView;
  station: string;
  offlineSavedAt?: number | null; // set when showing a cached result
  onDone: () => void; // back to scan
  onChanged?: () => Promise<void> | void; // re-fetch after a redemption
  autoReturn?: boolean;
}) {
  const { view, station, onDone } = props;
  const { staff, openSwitcher } = useStaff();
  const [confirm, setConfirm] = useState<BenefitRow | null>(null);
  const [undo, setUndo] = useState<BenefitRow | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runKey, setRunKey] = useState(0);
  const offline = props.offlineSavedAt != null;
  const paused = !!confirm || !!undo || !!done || props.autoReturn === false;
  const seconds = useCountdown(AUTO_RETURN_MS, paused, `${view.memberId}-${runKey}`, onDone);

  const band: StatusBand = offline
    ? {
        state: "offline", label: "Offline",
        detail: `Saved ${Math.max(1, Math.round((Date.now() - props.offlineSavedAt!) / 60000))} min ago · not verified`,
        instruction: `Serve as shown${view.band.state !== "active" ? ` (was ${view.band.label})` : ""}. Uses sync when back online`,
      }
    : view.band;

  const startRedeem = (row: BenefitRow) => {
    setError(null);
    if (!staff) openSwitcher(() => setConfirm(row));
    else setConfirm(row);
  };

  const doRedeem = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    setError(null);
    const clientId = crypto.randomUUID();
    const redeemedAt = new Date().toISOString();
    const body = { memberId: view.memberId, benefitKey: confirm.key, eventId: confirm.eventId ?? null, clientId, redeemedAt };
    try {
      if (offline) throw new Error("offline");
      const r = await api<{ redeemedAt: string; staff: string }>("/api/redeem", { method: "POST", json: body });
      setDone({ row: confirm, at: new Date(r.redeemedAt), staff: r.staff, offline: false });
      setConfirm(null);
    } catch (e) {
      if (offline || isNetworkError(e)) {
        enqueue({ ...body, memberName: view.fullName, benefitTitle: confirm.title });
        setDone({ row: confirm, at: new Date(), staff: staff?.name ?? "", offline: true });
        setConfirm(null);
      } else if ((e as { status?: number }).status === 428) {
        setConfirm(null);
        openSwitcher();
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  const backToMember = async () => {
    setDone(null);
    await props.onChanged?.();
    setRunKey((k) => k + 1);
  };

  if (done) {
    return (
      <div className="success" role="status">
        <div className="tick-circle"><Icon name="check" size={44} stroke={2} /></div>
        <img src={done.row.key === "monthly_drink" ? "/brand/pigeon-coffee-line.png" : done.row.key === "birthday_book" ? "/brand/pigeon-reading-stack.png" : "/brand/pigeon-flying-book-line.png"} alt="" />
        <h1>{done.row.key === "society_evening" ? "Checked in" : "Marked as used"}</h1>
        <div className="line">{done.row.title} · {view.fullName}</div>
        <div className="meta">Today, {fmtTime(done.at)} · {station}{done.staff ? ` · ${done.staff}` : ""}</div>
        <div className="small">{done.offline ? "Saved on this device. It syncs when the connection is back." : "A manager can undo this within 24 hours."}</div>
        <button className="btn btn-outline" style={{ minWidth: 260 }} onClick={backToMember}>Back to {view.firstName}</button>
      </div>
    );
  }

  const onBackgroundTap = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, textarea, .overlay")) return;
    onDone();
  };

  return (
    <div className="member" onClick={onBackgroundTap}>
      <Band band={band} station={station} seconds={paused ? undefined : seconds} />
      <div className="member-body">
        <div className="who">
          <div className="avatar">{view.photoUrl ? <img src={view.photoUrl} alt="" /> : view.initials}</div>
          <div>
            <h1 className="member-name">{view.fullName}</h1>
            <div className="chips">
              {!view.founding && <span className="chip">{view.tier}</span>}
              {view.founding && <span className="chip chip-founding">Founding Member</span>}
              {view.birthdayMonth && <span className="chip chip-birthday">Birthday month</span>}
            </div>
          </div>
        </div>
        <div className="since">{view.sinceLine}</div>
        <TodayCard view={view} offline={offline} onRedeem={startRedeem} onUndo={staff?.role === "manager" ? setUndo : undefined} />
        {view.extras.length > 0 && view.canRedeem && (
          <div className="extras">{view.extras.map((x) => <span key={x}>{x}</span>)}</div>
        )}
      </div>
      <div className="member-foot">
        <TimerBar ms={AUTO_RETURN_MS} runKey={`${view.memberId}-${runKey}`} paused={paused} />
        <button className="foot-hint" onClick={onDone}><img src="/brand/p-mark-red.svg" alt="" />Tap anywhere to scan the next member</button>
      </div>

      {confirm && (
        <div className="overlay" onClick={() => !busy && setConfirm(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Confirm">
            <div className="eyebrow">{confirm.key === "society_evening" ? "Check in" : "Mark as used"}</div>
            <h2>{confirmTitle(confirm, view.firstName)}</h2>
            <div className="meta">{confirm.title} · {station} · logged as {staff?.name ?? "…"}</div>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-block" onClick={doRedeem} disabled={busy}>{busy ? "Saving…" : "Confirm"}</button>
            <button className="btn btn-outline btn-block" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
      {undo && <UndoSheet row={undo} first={view.firstName} onClose={() => setUndo(null)} onUndone={async () => { setUndo(null); await props.onChanged?.(); }} />}
    </div>
  );
}

export function TodayCard({ view, offline, onRedeem, onUndo, className = "card", title = "Today" }: {
  view: StaffMemberView; offline?: boolean; onRedeem: (r: BenefitRow) => void; onUndo?: (r: BenefitRow) => void;
  className?: string; title?: string;
}) {
  if (!view.canRedeem && !offline) {
    return (
      <div className={className}>
        <div className="card-title">{title}</div>
        <div className="notice">
          <Icon name="ban" size={20} />
          <div><b>No benefits available</b><span>Let them know they can rejoin at the concierge desk or online.</span></div>
        </div>
      </div>
    );
  }
  return (
    <div className={className}>
      <div className="card-title">{title}</div>
      {view.today.length === 0 && <div className="notice"><div><span>Nothing to mark today. All collected for this period.</span></div></div>}
      {view.today.map((r) => (
        <div key={`${r.key}-${r.eventId ?? ""}`} className={`benefit ${r.state === "used" ? "used" : ""}`}>
          <div><b>{r.title}</b><span>{r.sub}</span></div>
          <div className="benefit-actions">
            {r.state === "available" && <button className="btn btn-primary btn-sm" onClick={() => onRedeem(r)}>{r.key === "society_evening" ? "Check in" : "Mark as used"}</button>}
            {r.state === "used" && onUndo && r.undoable && r.redemptionId && !offline && (
              <button className="btn btn-outline btn-sm" onClick={() => onUndo(r)} aria-label={`Undo ${r.title}`}><Icon name="rotate-ccw" size={14} />Undo</button>
            )}
            {r.state === "used" && <button className="btn btn-used btn-sm" disabled>Used</button>}
          </div>
        </div>
      ))}
      {offline && (
        <div className="notice"><Icon name="wifi-off" size={20} /><div><b>Working offline</b><span>Anything marked as used now is queued and synced later.</span></div></div>
      )}
    </div>
  );
}

export function UndoSheet({ row, first, onClose, onUndone }: { row: BenefitRow; first: string; onClose: () => void; onUndone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/redemptions/${row.redemptionId}/undo`, { method: "POST", json: { reason } });
      onUndone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Undo">
        <div className="eyebrow">Manager · undo</div>
        <h2>Undo {row.title.toLowerCase()} for {first}?</h2>
        <div className="meta">{row.sub}</div>
        <input autoFocus placeholder="Reason, e.g. tapped by mistake" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" onClick={submit} disabled={busy || reason.trim().length < 3}>Undo</button>
        <button className="btn btn-outline btn-block" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

export function UnrecognisedScreen({ band, station, onScanAgain, onLookup }: { band: StatusBand; station: string; onScanAgain: () => void; onLookup: () => void }) {
  const seconds = useCountdown(AUTO_RETURN_MS, false, band.detail, onScanAgain);
  return (
    <div className="member">
      <Band band={band} station={station} seconds={seconds} />
      <div className="unrec">
        <h2>We couldn&apos;t match this code</h2>
        <p className="muted">It may be an old or replaced card. Find them by name instead, or scan again.</p>
        <button className="btn btn-primary btn-block" onClick={onLookup}>Look up member</button>
        <button className="btn btn-outline btn-block" onClick={onScanAgain}>Scan again</button>
      </div>
    </div>
  );
}
