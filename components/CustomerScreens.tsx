"use client";
import { useEffect, useState } from "react";
import type { DisplayPayload, Pigeon, SplashItem } from "@/lib/types";
import { Icon, IconName } from "./Icon";

export const DISPLAY_MS = 8_000;

const PIGEON: Record<Pigeon, string> = {
  coffee: "/brand/pigeon-coffee-line.png",
  reading: "/brand/pigeon-reading-stack.png",
  "flying-book": "/brand/pigeon-flying-book-line.png",
  perched: "/brand/pigeon-perched-line.png",
  standing: "/brand/pigeon-standing-line.png",
};
const ITEM_ICON: Record<SplashItem["icon"], IconName> = { drink: "coffee", book: "book-open", event: "ticket", calendar: "calendar" };

function Timer({ runKey }: { runKey: number }) {
  return <div className="cust-timer"><div key={runKey} style={{ animationDuration: `${DISPLAY_MS}ms` }} /></div>;
}

/** First name only, never notes, history, contact or payment details. */
export function CustomerScreen({ payload, runKey }: { payload: DisplayPayload; runKey: number }) {
  if (payload.kind === "neutral" || payload.kind === "neutral-splash") {
    return (
      <div className="cust">
        <div className="neutral">
          <img src="/brand/p-mark-red.svg" alt="" />
          <h1>Welcome to<br />Prologue</h1>
          <p>{payload.kind === "neutral" ? "Make yourself at home." : "Pop over to the concierge desk and we'll help you from there."}</p>
        </div>
      </div>
    );
  }
  if (payload.kind === "welcome") {
    return (
      <div className="cust">
        <img className="logo" src="/brand/prologue-red.svg" alt="Prologue" />
        <div className="welcome-main">
          <span className="eyebrow-chip">{payload.eyebrow}</span>
          <h1><span style={{ whiteSpace: "nowrap" }}>Welcome back,</span><br />{payload.firstName}</h1>
          <p>{payload.line}</p>
        </div>
        <img className="pigeon" src={PIGEON[payload.pigeon]} alt="" />
        <div style={{ maxWidth: "70%" }}><Timer runKey={runKey} /></div>
      </div>
    );
  }
  return (
    <div className="cust">
      <img className="logo" src="/brand/prologue-red.svg" alt="Prologue" />
      <div className="splash">
        <div className="splash-left">
          <div className="chips">
            {!payload.founding && <span className="chip chip-eyebrow">{payload.tier}</span>}
            {payload.founding && <span className="chip chip-eyebrow chip-founding">Founding member</span>}
          </div>
          <p className="hello">Welcome back,</p>
          <p className="name">{payload.firstName}</p>
          <p className="line">{payload.line}</p>
          <span className="since">{payload.memberSince}</span>
        </div>
        <div className="splash-right">
          <img className="pigeon-top" src={PIGEON[payload.pigeon]} alt="" />
          <div className="ready">
            <h2>{payload.readyTitle}</h2>
            {payload.items.map((it) => (
              <div key={it.title} className="ready-item">
                <Icon name={ITEM_ICON[it.icon]} size={20} />
                <div><b>{it.title}</b><span>{it.sub}</span></div>
              </div>
            ))}
            <div className="next-step">{payload.nextStep}</div>
          </div>
          <Timer runKey={runKey} />
        </div>
      </div>
    </div>
  );
}

export function IdleScreen({ joinUrl, camera }: { joinUrl: string | null; camera: React.ReactNode }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!joinUrl) return;
    import("qrcode").then((Q) => Q.toString(joinUrl, { type: "svg", margin: 0, color: { dark: "#262622", light: "#FFFFFF" } })).then(setQr).catch(() => {});
  }, [joinUrl]);
  return (
    <div className="cust idle">
      <img className="logo" src="/brand/prologue-white.svg" alt="Prologue" />
      <div className="idle-main">
        <span className="chip-on-red">Prologue Society</span>
        <h1>Scan your Society card</h1>
        <p>Wallet pass or printed card, held up to the camera</p>
        {camera}
      </div>
      <div className="idle-foot">
        {joinUrl ? (
          <div className="join-card">
            <div className="qr" dangerouslySetInnerHTML={qr ? { __html: qr } : undefined} />
            <div>
              <div className="eyebrow">Not a member yet?</div>
              <h3>Scan to join the Society</h3>
              <span>With your phone camera</span>
            </div>
          </div>
        ) : <span />}
        <img className="pigeon-idle" src="/brand/pigeon-perched-line-white.png" alt="" />
      </div>
    </div>
  );
}
