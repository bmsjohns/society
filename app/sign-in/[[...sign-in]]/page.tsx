import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24, padding: 24 }}>
      <img src="/brand/prologue-red.svg" alt="Prologue" style={{ height: 32 }} />
      <SignIn />
      <p className="muted" style={{ fontSize: 14 }}>Prologue staff accounts only. Each device signs in once and stays signed in.</p>
    </div>
  );
}
