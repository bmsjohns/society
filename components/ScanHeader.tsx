"use client";
import Link from "next/link";
import { useStaff } from "./StaffContext";

export function ScanHeader({ station }: { station: string }) {
  const { staff, openSwitcher } = useStaff();
  return (
    <div className="scan-head">
      <div className="left">
        <img src="/brand/prologue-white.svg" alt="Prologue" />
        <Link href="/setup" className="pill-station" style={{ textDecoration: "none" }} aria-label={`Station ${station}. Change device settings`}>{station}</Link>
      </div>
      <button className="staff-switch" onClick={() => openSwitcher()}>
        {staff ? <><strong>{staff.name}</strong> · Switch</> : <strong>Who&apos;s serving?</strong>}
      </button>
    </div>
  );
}
