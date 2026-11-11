"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { StaffSummary } from "@/lib/types";
import { api } from "@/lib/client/api";
import { StaffSwitcher } from "./StaffSwitcher";

type Ctx = {
  staff: StaffSummary | null;
  loaded: boolean;
  needsFirstManager: boolean;
  openSwitcher: (then?: () => void) => void;
  refresh: () => Promise<void>;
};

const StaffCtx = createContext<Ctx>({
  staff: null, loaded: false, needsFirstManager: false, openSwitcher: () => {}, refresh: async () => {},
});

export function StaffProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = useState<StaffSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [needsFirstManager, setNeeds] = useState(false);
  const [switching, setSwitching] = useState<null | { then?: () => void }>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api<{ staff: StaffSummary | null; needsFirstManager: boolean }>("/api/me");
      setStaff(me.staff);
      setNeeds(me.needsFirstManager);
    } catch {
      /* offline: keep whoever was last signed in */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <StaffCtx.Provider value={{ staff, loaded, needsFirstManager, openSwitcher: (then) => setSwitching({ then }), refresh }}>
      {children}
      {switching && (
        <StaffSwitcher
          onClose={() => setSwitching(null)}
          onDone={(s) => {
            setStaff(s);
            const then = switching.then;
            setSwitching(null);
            then?.();
          }}
        />
      )}
    </StaffCtx.Provider>
  );
}

export const useStaff = () => useContext(StaffCtx);
