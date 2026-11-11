// What a member card's QR can hold. Safe to import in the browser (no Node APIs).
//
// 1. Printed cards (Nov 2026 print run): https://society.prologuebooks.co.uk/m/<Airtable record ID>,
//    e.g. .../m/recPl7QG8mKNSNCFN. Record IDs are case-sensitive.
// 2. Codes issued by this app: PS-XXXXXXXX (e.g. for wallet passes or replacement cards).

export const TOKEN_RE = /^(PS-[0-9A-Z]{8}|rec[A-Za-z0-9]{14})$/;

/** Pull a member code out of whatever the scanner read: a card link, a bare record ID or a PS- code. */
export function extractToken(raw: string): string | null {
  const s = (raw ?? "").trim();
  const rec = /(?:^|\/m\/)(rec[A-Za-z0-9]{14})(?=$|[/?#\s])/.exec(s);
  if (rec) return rec[1];
  const ps = /PS-[0-9A-Z]{8}/i.exec(s);
  return ps ? ps[0].toUpperCase() : null;
}
