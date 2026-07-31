import { createHash } from "node:crypto";

/**
 * Refresh/verification/reset tokens are opaque random or JWT strings handed
 * to the client; only their SHA-256 digest is persisted, so a database leak
 * doesn't hand out usable tokens (unlike passwords, these don't need a slow
 * hash — they're already high-entropy random values, not user-chosen).
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
