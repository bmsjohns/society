// Applies supabase/migrations/*.sql in order, once each. Usage: DATABASE_URL=... npm run db:migrate
// (Use the Supabase *session* or direct connection string for migrations, not the 6543 transaction pooler.)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.MIGRATE_DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set MIGRATE_DATABASE_URL (or POSTGRES_URL_NON_POOLING / DATABASE_URL)");
// Supabase's direct/session strings need TLS; local Postgres doesn't.
const sql = postgres(url, { max: 1, onnotice: () => {}, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require" });
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "supabase", "migrations");

await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
await sql`alter table schema_migrations enable row level security`;
const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(f)) continue;
  const body = await readFile(path.join(dir, f), "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(body);
    await tx`insert into schema_migrations (name) values (${f})`;
  });
  console.log("applied", f);
}
console.log("migrations up to date");
await sql.end();
