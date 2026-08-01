import { createHash } from "node:crypto";

/**
 * Refresh tokens are opaque JWTs handed to the client; only their SHA-256
 * digest is persisted, so a database leak doesn't hand out usable tokens.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
