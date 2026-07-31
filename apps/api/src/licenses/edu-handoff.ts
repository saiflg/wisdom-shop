import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed handoff token for "Complete Your School Setup".
 *
 * After buying a management system the customer is sent to a *separate* EMS
 * onboarding portal. That portal has no access to this database, so it needs
 * a self-contained proof of purchase it can verify on its own — hence a
 * short-lived HMAC-signed token rather than an opaque id it would have to
 * call back about.
 *
 * Deliberately modelled on the payment webhook verifiers: sign a compact
 * payload, compare in constant time, and treat expiry as part of validation
 * rather than something the receiver is trusted to check.
 */
export interface EduHandoffPayload {
  /** License key being activated. */
  k: string;
  /** Purchasing user id. */
  u: string;
  /** Product the license is for. */
  p: string;
  /** Order it came from, for the portal's own audit trail. */
  o: string;
  /** Expiry, seconds since epoch. */
  exp: number;
}

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

function sign(encodedPayload: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(encodedPayload).digest());
}

/** Produces `<base64url(payload)>.<base64url(hmac)>`. */
export function createHandoffToken(
  payload: Omit<EduHandoffPayload, "exp">,
  secret: string,
  ttlSeconds: number,
): string {
  const full: EduHandoffPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = base64url(Buffer.from(JSON.stringify(full), "utf8"));
  return `${encoded}.${sign(encoded, secret)}`;
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
