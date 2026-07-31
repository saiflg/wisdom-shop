import { randomBytes } from "node:crypto";

/**
 * Crockford base32 — no I, L, O or U, so a key read aloud over the phone or
 * copied off a screen can't turn 0 into O or 1 into I. Support staff and
 * customers transcribe these by hand, so that matters more than density.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const GROUPS = 4;
const CHARS_PER_GROUP = 5;

/**
 * Generates a license key like `WS-4KQ2A-9XM7T-BR3ND-P8WHY`.
 *
 * 20 characters from a 32-symbol alphabet is 100 bits of entropy, drawn from
 * a CSPRNG — a key is not guessable, and `License.key` is UNIQUE so a
 * collision would fail loudly rather than hand two customers the same key.
 */
export function generateLicenseKey(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    // One random byte per character, rejecting nothing: 256 % 32 === 0, so
    // taking the byte modulo 32 stays uniform across the alphabet.
    const bytes = randomBytes(CHARS_PER_GROUP);
    let group = "";
    for (let i = 0; i < CHARS_PER_GROUP; i += 1) {
      group += ALPHABET[bytes[i]! % ALPHABET.length];
    }
    groups.push(group);
  }
  return `WS-${groups.join("-")}`;
}

const KEY_PATTERN = /^WS-[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/;

export function isValidLicenseKeyFormat(key: string): boolean {
  return KEY_PATTERN.test(key);
}
