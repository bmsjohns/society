import { randomInt } from "node:crypto";

// No 0/O or 1/I, so a token read aloud or typed from a printed card is unambiguous.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newToken(): string {
  let s = "PS-";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** Pull a member token out of whatever the QR holds: a bare token or a URL containing one. */
export function extractToken(raw: string): string | null {
  const m = /PS-[0-9A-Z]{8}/i.exec(raw ?? "");
  return m ? m[0].toUpperCase() : null;
}
