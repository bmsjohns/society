"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { useStaff } from "@/components/StaffContext";
import { LookupPanel } from "@/components/Lists";
import { Icon } from "@/components/Icon";
import { fmtDayMonth, fmtTime, fmtWeekdayDate } from "@/lib/time";

type Overview = {
  counts: { name: string; month: number; week: number }[];
  redemptions: { id: string; redeemed_at: string; station: string; offline: boolean; undone_at: string | null; undo_reason: string | null; benefit: string; member: string; staff: string | null; undone_by: string | null }[];
  scans: { scanned_at: string; result: string; station: string; mode: string; token: string | null; member: string | null; staff: string | null }[];
  staff: { id: string; name: string; role: string; active: boolean; locked_until: string | null }[];
  stations: { code: string; name: string; staff_seen_at: string | null; display_seen_at: string | null }[];
  events: { id: string; name: string; starts_at: string; open_to_all: boolean; checked_in: number }[];
  members: { total: number; active: number; grace: number };
};

const TABS = ["Overview", "Redemptions", "Scan log", "Staff", "Desks", "Events", "Cards"] as const;
type Tab = (typeof TABS)[number];
const when = (s: string) => `${fmtWeekdayDate(new Date(s))}, ${fmtTime(new Date(s))}`;

export default function Manage() {
  const router = useRouter();
  const { staff, loaded, openSwitcher } = useStaff();
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Overview>("/api/manage/overview").then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { if (staff?.role === "manager") load(); }, [staff, load]);

  if (loaded && staff?.role !== "manager") {
    return (
      <div className="page"><div className="page-inner">
        <div className="page-head"><button className="back" onClick={() => router.push("/")} aria-label="Back"><Icon name="arrow-left" size={24} /></button><h1>Manage</h1></div>
        <p>Managers only. {staff ? `You're signed in as ${staff.name}.` : ""}</p>
        <button className="btn btn-primary" onClick={() => openSwitcher()}>Switch to a manager</button>
      </div></div>
    );
  }

  return (
    <div className="page"><div className="page-inner" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <button className="back" onClick={() => router.push("/")} aria-label="Back"><Icon name="arrow-left" size={24} /></button>
        <h1>Manage</h1><small>{staff?.name}</small>
      </div>
      <div className="tabs">
        {TABS.map((t) => <button key={t} className={`btn btn-sm ${t === tab ? "btn-primary" : "btn-outline"}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {error && <p className="error">{error}</p>}
      {data && tab === "Overview" && <OverviewTab d={data} />}
      {data && tab === "Redemptions" && <RedemptionsTab d={data} reload={load} />}
      {data && tab === "Scan log" && <ScanLogTab d={data} />}
      {data && tab === "Staff" && <StaffTab d={data} reload={load} />}
      {data && tab === "Desks" && <DesksTab d={data} reload={load} />}
      {data && tab === "Events" && <EventsTab d={data} reload={load} />}
      {tab === "Cards" && <CardsTab />}
    </div></div>
  );
}

function OverviewTab({ d }: { d: Overview }) {
  return (
    <>
      <div className="stat-row">
        <div className="stat"><b>{d.members.active}</b><span>Active members</span></div>
        <div className="stat"><b>{d.members.grace}</b><span>In grace (payment failed)</span></div>
        <div className="stat"><b>{d.members.total}</b><span>All members</span></div>
      </div>
      <div className="section">
        <h2>Benefit use</h2>
        <table className="log"><thead><tr><th>Benefit</th><th>This month</th><th>Last 7 days</th></tr></thead>
          <tbody>{d.counts.map((c) => <tr key={c.name}><td>{c.name}</td><td>{c.month}</td><td>{c.week}</td></tr>)}</tbody></table>
      </div>
    </>
  );
}

function RedemptionsTab({ d, reload }: { d: Overview; reload: () => void }) {
  const undo = async (id: string) => {
    const reason = prompt("Reason for undoing this?");
    if (!reason) return;
    try { await api(`/api/redemptions/${id}/undo`, { method: "POST", json: { reason } }); reload(); }
    catch (e) { alert((e as Error).message); }
  };
  return (
    <div className="section">
      <h2>Last 7 days</h2>
      <p className="muted">Undo is available for 24 hours after a benefit is marked as used.</p>
      <table className="log"><thead><tr><th>When</th><th>Member</th><th>Benefit</th><th>Where · who</th><th /></tr></thead>
        <tbody>{d.redemptions.map((r) => {
          const canUndo = !r.undone_at && Date.now() - new Date(r.redeemed_at).getTime() < 86400_000;
          return (
            <tr key={r.id} style={r.undone_at ? { opacity: .55 } : undefined}>
              <td>{when(r.redeemed_at)}{r.offline ? " · offline" : ""}</td><td>{r.member}</td><td>{r.benefit}</td>
              <td>{r.station} · {r.staff ?? "?"}{r.undone_at ? <><br />Undone by {r.undone_by}: {r.undo_reason}</> : null}</td>
              <td>{canUndo && <button className="btn btn-outline btn-sm" onClick={() => undo(r.id)}>Undo</button>}</td>
            </tr>
          );
        })}</tbody></table>
    </div>
  );
}

function ScanLogTab({ d }: { d: Overview }) {
  return (
    <div className="section">
      <h2>Scan log</h2>
      <p className="muted">Latest 200. Scans are deleted automatically after 12 months.</p>
      <table className="log"><thead><tr><th>When</th><th>Result</th><th>Member</th><th>Station</th><th>Staff</th></tr></thead>
        <tbody>{d.scans.map((s, i) => (
          <tr key={i}><td>{when(s.scanned_at)}</td><td>{s.result}</td><td>{s.member ?? s.token ?? "-"}</td><td>{s.station} · {s.mode}</td><td>{s.staff ?? "-"}</td></tr>
        ))}</tbody></table>
    </div>
  );
}

function StaffTab({ d, reload }: { d: Overview; reload: () => void }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("staff");
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    try { await api("/api/staff", { method: "POST", json: { name, pin, role } }); setName(""); setPin(""); reload(); }
    catch (e) { setError((e as Error).message); }
  };
  const patch = async (id: string, body: object) => {
    try { await api(`/api/staff/${id}`, { method: "PATCH", json: body }); reload(); }
    catch (e) { alert((e as Error).message); }
  };
  return (
    <div className="section">
      <h2>Staff</h2>
      <table className="log"><thead><tr><th>Name</th><th>Role</th><th /></tr></thead>
        <tbody>{d.staff.map((s) => (
          <tr key={s.id} style={!s.active ? { opacity: .5 } : undefined}>
            <td>{s.name}{s.locked_until && new Date(s.locked_until) > new Date() ? " · locked" : ""}</td>
            <td>{s.role}</td>
            <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="btn btn-outline btn-sm" onClick={() => { const p = prompt(`New 4-digit PIN for ${s.name}`); if (p) patch(s.id, { pin: p }); }}>Reset PIN</button>
              <button className="btn btn-outline btn-sm" onClick={() => patch(s.id, { role: s.role === "manager" ? "staff" : "manager" })}>{s.role === "manager" ? "Make staff" : "Make manager"}</button>
              <button className="btn btn-outline btn-sm" onClick={() => patch(s.id, { active: !s.active })}>{s.active ? "Deactivate" : "Reactivate"}</button>
            </td>
          </tr>
        ))}</tbody></table>
      <div className="form" style={{ marginTop: 18, maxWidth: 420 }}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>4-digit PIN<input value={pin} inputMode="numeric" onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
        <label>Role<select value={role} onChange={(e) => setRole(e.target.value)}><option value="staff">Staff</option><option value="manager">Manager</option></select></label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" onClick={add} disabled={!name || pin.length !== 4}>Add staff member</button>
      </div>
    </div>
  );
}

function DesksTab({ d, reload }: { d: Overview; reload: () => void }) {
  const [name, setName] = useState("Concierge desk");
  const live = (s: string | null) => (s && Date.now() - new Date(s).getTime() < 30_000 ? "connected" : "not connected");
  const add = async () => {
    try { await api("/api/stations", { method: "POST", json: { name } }); reload(); } catch (e) { alert((e as Error).message); }
  };
  return (
    <div className="section">
      <h2>Desks</h2>
      <p className="muted">A desk pairs a staff concierge tablet with a customer screen. Set both devices up with the same desk. A customer screen with no staff view open shows the self-scan splash.</p>
      <table className="log"><thead><tr><th>Desk</th><th>Code</th><th>Staff view</th><th>Customer screen</th></tr></thead>
        <tbody>{d.stations.map((s) => <tr key={s.code}><td>{s.name}</td><td><b>{s.code}</b></td><td>{live(s.staff_seen_at)}</td><td>{live(s.display_seen_at)}</td></tr>)}</tbody></table>
      <div className="form" style={{ marginTop: 18, maxWidth: 420 }}>
        <label>Desk name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button className="btn btn-primary" onClick={add} disabled={!name}>Add desk</button>
      </div>
    </div>
  );
}

function EventsTab({ d, reload }: { d: Overview; reload: () => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const add = async () => {
    // Treat the entered time as UK time.
    const local = new Date(`${date}T${time}:00`);
    try { await api("/api/events", { method: "POST", json: { name, startsAt: local.toISOString() } }); setName(""); reload(); }
    catch (e) { alert((e as Error).message); }
  };
  return (
    <div className="section">
      <h2>Society evenings</h2>
      <p className="muted">On the night, members show &ldquo;Check in&rdquo; at the door and the welcome screen says they&apos;re on the list.</p>
      <table className="log"><thead><tr><th>Event</th><th>When</th><th>Checked in</th></tr></thead>
        <tbody>{d.events.map((e) => <tr key={e.id}><td>{e.name}</td><td>{fmtDayMonth(new Date(e.starts_at))}, {fmtTime(new Date(e.starts_at))}</td><td>{e.checked_in}</td></tr>)}</tbody></table>
      <div className="form" style={{ marginTop: 18, maxWidth: 420 }}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Poetry & Pints" /></label>
        <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Start time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        <button className="btn btn-primary" onClick={add} disabled={!name || !date}>Add event</button>
      </div>
    </div>
  );
}

type Tok = { token: string; kind: string; label: string | null; card_number: number | null; issued_at: string; revoked_at: string | null; revoked_reason: string | null };

function CardsTab() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Tok[]>([]);
  const load = useCallback(async (id: string) => {
    const r = await api<{ tokens: Tok[] }>(`/api/members/${id}/tokens`);
    setTokens(r.tokens);
  }, []);
  useEffect(() => { if (memberId) load(memberId); }, [memberId, load]);
  const issue = async (kind: string) => {
    if (!memberId || !confirm(`Issue a new ${kind} code? Their current ${kind} code stops working.`)) return;
    await api(`/api/members/${memberId}/tokens`, { method: "POST", json: { kind } });
    load(memberId);
  };
  const revoke = async (t: string) => {
    if (!confirm(`Revoke ${t}? It will scan as Not recognised.`)) return;
    await api(`/api/tokens/${t}/revoke`, { method: "POST", json: { reason: "Revoked by manager" } });
    if (memberId) load(memberId);
  };
  if (!memberId) return <div style={{ margin: "0 -16px" }}><LookupPanel onPick={setMemberId} autoFocus={false} /></div>;
  return (
    <div className="section">
      <h2>Member codes</h2>
      <p className="muted">Printed cards hold a link ending in the member&apos;s card ID (rec…). For a lost card, scan a spare card and give it to the member, or issue a PS- code. The old card stops working at once.</p>
      <table className="log"><thead><tr><th>Code</th><th>Type</th><th>Issued</th><th>Status</th><th /></tr></thead>
        <tbody>{tokens.map((t) => (
          <tr key={t.token}><td><b>{t.token}</b>{t.card_number ? <><br /><span className="muted">Card no. {t.card_number}{t.label ? ` · ${t.label}` : ""}</span></> : null}</td><td>{t.token.startsWith("rec") ? "printed card" : t.kind}</td><td>{fmtDayMonth(new Date(t.issued_at))}</td>
            <td>{t.revoked_at ? `Revoked ${fmtDayMonth(new Date(t.revoked_at))}` : "Active"}</td>
            <td>{!t.revoked_at && <button className="btn btn-outline btn-sm" onClick={() => revoke(t.token)}>Revoke</button>}</td></tr>
        ))}</tbody></table>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => issue("card")}>New card code</button>
        <button className="btn btn-outline" onClick={() => issue("wallet")}>New wallet code</button>
        <button className="btn btn-outline" onClick={() => setMemberId(null)}>Another member</button>
      </div>
    </div>
  );
}
