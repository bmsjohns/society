import { randomInt } from "node:crypto";

export { extractToken, TOKEN_RE } from "./token-format";

// No 0/O or 1/I, so a token read aloud or typed from a printed card is unambiguous.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newToken(): string {
  let s = "PS-";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}
