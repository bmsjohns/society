// Vercel build. Migrations run here only if an admin connection string is configured
// (MIGRATE_DATABASE_URL or POSTGRES_URL_NON_POOLING) on a production deploy. Otherwise apply
// supabase/migrations/* another way (Supabase SQL editor, or `npm run db:migrate` locally):
// the app itself connects as the least-privilege `scan_app` login, which can't change schema.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const adminUrl = process.env.MIGRATE_DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING;
if (process.env.VERCEL_ENV === "production" && adminUrl) run("node scripts/migrate.mjs");
else console.log("Skipping migrations in build (no admin database URL, or not production).");
run("next build");
