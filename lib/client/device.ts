"use client";
import type { DeviceMode } from "../types";

export type DeviceSettings = {
  id: string;
  station: "Concierge" | "Bar" | "Floor" | "Event door";
  mode: DeviceMode;
  code: string | null; // concierge pairing code
  camera: "environment" | "user";
};

const KEY = "ps_device";

function readCookie(): Partial<DeviceSettings> {
  const m = document.cookie.match(/(?:^|; )ps_device=([^;]*)/);
  if (!m) return {};
  try {
    return JSON.parse(decodeURIComponent(m[1]));
  } catch {
    return {};
  }
}

export function getDevice(): DeviceSettings | null {
  let d: Partial<DeviceSettings> = {};
  try {
    d = JSON.parse(localStorage.getItem(KEY) ?? "null") ?? {};
  } catch {}
  if (!d.id) d = { ...readCookie(), ...d };
  if (!d.id || !d.station || !d.mode) return null;
  return { camera: d.mode === "welcome" ? "user" : "environment", code: null, ...d } as DeviceSettings;
}

export function saveDevice(d: DeviceSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {}
  // The server reads station/mode/id from this cookie to label scans and redemptions.
  const v = encodeURIComponent(JSON.stringify({ id: d.id, station: d.station, mode: d.mode, code: d.code }));
  document.cookie = `ps_device=${v}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}

export function newDeviceId() {
  return "dev_" + crypto.randomUUID().slice(0, 12);
}

export function homeFor(mode: DeviceMode) {
  return mode === "concierge" ? "/concierge" : mode === "welcome" ? "/display" : "/scan";
}
