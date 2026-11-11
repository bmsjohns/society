export const dynamic = "force-static";

export default function NotConfigured() {
  return (
    <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        <img src="/brand/prologue-red.svg" alt="Prologue" style={{ height: 30 }} />
        <h1 className="display" style={{ color: "var(--red-700)", fontSize: 34, margin: 0 }}>Nearly there</h1>
        <p className="muted" style={{ margin: 0 }}>Staff sign-in isn&apos;t set up yet. Add the Clerk keys to the Vercel project and redeploy.</p>
      </div>
    </div>
  );
}
