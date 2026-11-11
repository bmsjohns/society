"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DeviceSettings, getDevice, homeFor, newDeviceId, saveDevice } from "@/lib/client/device";
import { api } from "@/lib/client/api";
import { useStaff } from "@/components/StaffContext";
import type { DeviceMode } from "@/lib/types";

const MODES: { mode: DeviceMode; title: string; sub: string }[] = [
  { mode: "staff", title: "Staff scanner", sub: "Bar, floor handhelds and the event door. Scan, see the member, mark as used." },
  { mode: "concierge", title: "Concierge staff view", sub: "The tablet facing staff at the desk. Full profile, notes, today's benefits." },
  { mode: "welcome", title: "Customer screen", sub: "Faces the member, who scans their own card. Works alone as a self-scan screen, or alongside the staff view." },
];
const STATIONS: DeviceSettings["station"][] = ["Bar", "Concierge", "Floor", "Event door"];

/** Set once per device: what it's for and where it lives. */
export default function Setup() {
  const router = useRouter();
  const { needsFirstManager, refresh, loaded } = useStaff();
  const [d, setD] = useState<DeviceSettings>({ id: "", station: "Bar", mode: "staff", code: null, camera: "environment" });
  const [stations, setStations] = useState<{ code: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cur = getDevice();
    setD(cur ?? { id: newDeviceId(), station: "Bar", mode: "staff", code: null, camera: "environment" });
    api<{ stations: { code: string; name: string }[] }>("/api/stations").then((r) => setStations(r.stations)).catch(() => {});
  }, []);

  const set = (p: Partial<DeviceSettings>) => setD((x) => ({ ...x, ...p }));
  const paired = d.mode === "concierge" || d.mode === "welcome";

  // One desk: use it. None: create "Concierge desk" on save. Only ask when there are several.
  const deskCode = d.code && stations.some((s) => s.code === d.code) ? d.code : stations.length === 1 ? stations[0].code : null;
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    let code = paired ? deskCode : null;
    if (paired && !code) {
      if (stations.length > 1) return setError("Choose which desk this device is at.");
      setSaving(true);
      try {
        const r = await api<{ station: { code: string } }>("/api/stations", { method: "POST", json: { name: "Concierge desk" } });
        code = r.station.code;
      } catch (e) {
        setSaving(false);
        return setError((e as Error).message);
      }
    }
    saveDevice({ ...d, code, station: paired ? "Concierge" : d.station });
    router.replace(homeFor(d.mode));
  };

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <h1>Set up this device</h1>
          <img src="/brand/prologue-red.svg" alt="Prologue" style={{ height: 22 }} />
        </div>
        {loaded && needsFirstManager && <FirstManager onDone={refresh} />}

        <div className="form">
          <div className="eyebrow muted">What is it for?</div>
          <div className="choice-grid">
            {MODES.map((m) => (
              <button key={m.mode} className={`choice ${d.mode === m.mode ? "on" : ""}`}
                onClick={() => set({ mode: m.mode, camera: m.mode === "welcome" ? "user" : "environment" })}>
                <b>{m.title}</b><span>{m.sub}</span>
              </button>
            ))}
          </div>

          {!paired && (
            <label>Station
              <select value={d.station} onChange={(e) => set({ station: e.target.value as DeviceSettings["station"] })}>
                {STATIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          )}
          {paired && stations.length > 1 && (
            <label>Desk
              <select value={deskCode ?? ""} onChange={(e) => set({ code: e.target.value || null })}>
                <option value="">Choose…</option>
                {stations.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </label>
          )}
          {paired && stations.length <= 1 && (
            <p className="muted" style={{ margin: 0, fontSize: 15 }}>
              {stations.length === 1 ? `Linked to the ${stations[0].name}. ` : "This creates the concierge desk. "}
              {d.mode === "concierge"
                ? "Set up the customer screen the same way and the two link up automatically. It works on its own too."
                : "Works on its own as a self-scan screen. When the concierge staff view is open, it shows a welcome instead."}
            </p>
          )}
          <label>Camera
            <select value={d.camera} onChange={(e) => set({ camera: e.target.value as DeviceSettings["camera"] })}>
              <option value="environment">Back camera (staff point the device at the card)</option>
              <option value="user">Front camera (member holds the card up to the screen)</option>
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save and start"}</button>
          <p className="muted" style={{ fontSize: 14 }}>
            Device {d.id}. Managers: <a href="/manage">staff, desks, events and the scan log</a>.
          </p>
        </div>
      </div>
    </div>
  );
}

function FirstManager({ onDone }: { onDone: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    try {
      await api("/api/staff", { method: "POST", json: { name, pin } });
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-title">First, add yourself</div>
      <div className="form" style={{ paddingTop: 12 }}>
        <p className="muted" style={{ margin: 0 }}>No staff yet. The first person added becomes a manager and can add everyone else.</p>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jo" /></label>
        <label>4-digit PIN<input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" type="password" /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" onClick={submit} disabled={!name || pin.length !== 4}>Add me as manager</button>
      </div>
    </div>
  );
}
