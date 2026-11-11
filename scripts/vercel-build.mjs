// Vercel build: apply database migrations on production deploys, then build.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
if (process.env.VERCEL_ENV === "production") run("node scripts/migrate.mjs");
else console.log(`Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "local"})`);
run("next build");
