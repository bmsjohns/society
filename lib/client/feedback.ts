"use client";

let ctx: AudioContext | null = null;

// Browsers block vibrate() (and log an error) until the page has had a tap.
const canBuzz = () => (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true;

/** Haptic + chime on a good read (spec: "Haptic and sound feedback on a successful read"). */
export function goodRead() {
  try {
    if (canBuzz()) navigator.vibrate?.(60);
  } catch {}
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    for (const [i, f] of [880, 1320].entries()) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 0.18);
    }
  } catch {}
}

export function badRead() {
  try {
    if (canBuzz()) navigator.vibrate?.([40, 60, 40]);
  } catch {}
}
