import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { EnvConfig } from "@/config/env.validation";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Symmetric encryption for per-school gateway credentials (SMTP passwords,
 * provider API secrets). These have to be readable in plaintext at send
 * time, so unlike user passwords they can't be one-way hashed.
 *
 * Deliberately a byte-for-byte reimplementation of the shop's own
 * EncryptionService rather than shared code — the two apps are otherwise
 * independent — but with its own key (`EMS_SETTINGS_ENCRYPTION_KEY`), so a
 * leak of one app's key can't decrypt the other's data. GCM is chosen over
 * CBC because it authenticates: tampered ciphertext fails loudly on
 * decrypt instead of yielding garbage plaintext.
 */
@Injectable()
export class TenantSecretsService {
  private readonly key: Buffer;

  constructor(config: ConfigService<EnvConfig, true>) {
    // sha256 gives a 32-byte key whatever length the configured secret is.
    this.key = createHash("sha256")
      .update(config.get("EMS_SETTINGS_ENCRYPTION_KEY", { infer: true }))
      .digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(":");
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error("Malformed encrypted payload");
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
    return decrypted.toString("utf8");
  }

  /**
   * Decrypts without throwing. A stored value that won't decrypt almost
   * always means EMS_SETTINGS_ENCRYPTION_KEY changed; callers surface that
   * as "not configured, re-enter it" rather than crashing a settings page.
   */
  tryDecrypt(payload: string | null | undefined): string | null {
    if (!payload) return null;
    try {
      return this.decrypt(payload);
    } catch {
      return null;
    }
  }
}

/**
 * The only representation of a stored secret that may leave the server.
 * Short values are masked entirely — showing 3 of 6 characters of a weak
 * key would give away more than it helps.
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 3)}••••${value.slice(-4)}`;
}

/** Masked hint for a stored secret, or null when nothing is stored. */
export function maskStored(plaintext: string | null): string | null {
  return plaintext === null ? null : maskSecret(plaintext);
}
