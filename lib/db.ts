import "server-only";
import postgres from "postgres";

// Supabase Postgres, server-side only. On Vercel use the transaction pooler URL
// (port 6543); prepared statements are off so that works.
declare global {
  // eslint-disable-next-line no-var
  var __sql: postgres.Sql | undefined;
}

function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 3 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
    types: { date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x } },
  });
}

/** Lazily created so builds don't need a database. */
export function db(): postgres.Sql {
  return globalThis.__sql ?? (globalThis.__sql = make());
}
