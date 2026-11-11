import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Typeform → Connect → Webhooks, with a secret (TYPEFORM_WEBHOOK_SECRET).
// The Reading Preferences form's questions must use these "ref" values (Question → Settings → Ref):
//   email, date_of_birth, genres_loved, genres_avoid, favourite_books, favourite_authors,
//   reading_now, books_per_month, reading_notes
// A hidden field named "email" works too.

type Answer = {
  type: string; field: { ref: string };
  text?: string; email?: string; date?: string;
  choice?: { label: string }; choices?: { labels: string[] };
};

function verify(raw: string, sig: string | null) {
  const secret = process.env.TYPEFORM_WEBHOOK_SECRET;
  if (!secret || !sig) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(raw).digest("base64")}`);
  const got = Buffer.from(sig);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const valueOf = (a: Answer): string | string[] | null =>
  a.type === "choices" ? a.choices?.labels ?? [] :
  a.type === "choice" ? a.choice?.label ?? null :
  a.email ?? a.text ?? a.date ?? null;

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verify(raw, req.headers.get("typeform-signature"))) return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  const body = JSON.parse(raw);
  const fr = body.form_response ?? {};
  const answers: Record<string, string | string[] | null> = {};
  for (const a of (fr.answers ?? []) as Answer[]) answers[a.field.ref] = valueOf(a);
  const email = String(answers.email ?? fr.hidden?.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ ignored: "no email" });

  const arr = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : null);
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 2000) : null);
  const dob = typeof answers.date_of_birth === "string" && /^\d{4}-\d{2}-\d{2}/.test(answers.date_of_birth) ? answers.date_of_birth.slice(0, 10) : null;

  const [row] = await db()`
    update members set
      genres_loved = coalesce(${arr(answers.genres_loved)}, genres_loved),
      genres_avoid = coalesce(${arr(answers.genres_avoid)}, genres_avoid),
      favourite_books = coalesce(${str(answers.favourite_books)}, favourite_books),
      favourite_authors = coalesce(${str(answers.favourite_authors)}, favourite_authors),
      reading_now = coalesce(${str(answers.reading_now)}, reading_now),
      books_per_month = coalesce(${str(answers.books_per_month)}, books_per_month),
      reading_notes = coalesce(${str(answers.reading_notes)}, reading_notes),
      date_of_birth = coalesce(${dob}::date, date_of_birth),
      preferences_submitted = current_date
    where lower(email) = ${email} returning id`;
  return NextResponse.json(row ? { updated: row.id } : { ignored: "no member with that email" });
}
