import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies the signed handoff token minted by the shop
 * (apps/api/src/licenses/edu-handoff.ts) when a customer clicks "Complete
 * Your School Setup". This is a byte-for-byte port of that file's
 * verification half — the two services share no code, only the secret
 * (EDU_SETUP_SIGNING_SECRET, identical in both apps' .env — the one
 * deliberate exception to "every cross-app secret must be distinct": this
 * secret's whole purpose is that both sides compute the same HMAC).
 *
 * Never ported the *creation* half — this service only ever verifies
 * tokens the shop minted, never mints its own.
 */
export interface EduHandoffPayload {
  /** License key being activated. */
  k: string;
  /** Purchasing user id (in the shop's own database — meaningless here beyond audit). */
  u: string;
  /** Product the license is for. */
  p: string;
  /** Order it came from. */
  o: string;
  /** Expiry, seconds since epoch. */
  exp: number;
}

function fromBase64url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export class HandoffTokenError extends Error {}

/**
 * Verifies signature *before* parsing, so a malformed or hostile payload is
 * never interpreted, then rejects expired tokens.
 */
export function verifyHandoffToken(token: string, secret: string): EduHandoffPayload {
  const parts = token.split(".");
  if (parts.length !== 2) throw new HandoffTokenError("Malformed handoff token");

  const [encoded, providedSignature] = parts as [string, string];
  const expected = sign(encoded, secret);

  const a = Buffer.from(providedSignature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HandoffTokenError("Invalid handoff token signature");
  }

  let payload: EduHandoffPayload;
  try {
    payload = JSON.parse(fromBase64url(encoded).toString("utf8")) as EduHandoffPayload;
  } catch {
    throw new HandoffTokenError("Malformed handoff token payload");
  }

  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
    throw new HandoffTokenError("Handoff token has expired");
  }

  return payload;
}
