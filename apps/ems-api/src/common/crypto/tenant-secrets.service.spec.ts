import type { ConfigService } from "@nestjs/config";
import { TenantSecretsService, maskSecret, maskStored } from "./tenant-secrets.service";

function serviceWithKey(key: string): TenantSecretsService {
  const config = { get: () => key } as unknown as ConfigService<Record<string, unknown>, true>;
  return new TenantSecretsService(config);
}

describe("TenantSecretsService", () => {
  const service = serviceWithKey("test-key-that-is-at-least-32-characters-long");

  it("round-trips a secret", () => {
    const plaintext = "sk_live_2f8a9c1e4b7d";
    expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
  });

  it("produces different ciphertext each time for the same input", () => {
    // A fresh IV per encrypt; identical ciphertexts would leak that two
    // schools configured the same key.
    expect(service.encrypt("same")).not.toBe(service.encrypt("same"));
  });

  it("round-trips unicode and long values", () => {
    const plaintext = "pâsswörd-✓-" + "x".repeat(500);
    expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
  });

  it("rejects tampered ciphertext rather than returning garbage", () => {
    const [iv, tag, data] = service.encrypt("secret").split(":");
    const flipped = Buffer.from(data as string, "base64");
    flipped[0] = flipped[0] ^ 0xff;
    expect(() => service.decrypt(`${iv}:${tag}:${flipped.toString("base64")}`)).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => service.decrypt("not-a-payload")).toThrow("Malformed encrypted payload");
    expect(() => service.decrypt("only:two")).toThrow("Malformed encrypted payload");
  });

  it("cannot decrypt another key's ciphertext", () => {
    const other = serviceWithKey("a-completely-different-key-also-32-chars-min");
    expect(() => other.decrypt(service.encrypt("secret"))).toThrow();
  });

  describe("tryDecrypt", () => {
    it("returns the plaintext when it can", () => {
      expect(service.tryDecrypt(service.encrypt("value"))).toBe("value");
    });

    it("returns null instead of throwing for unusable input", () => {
      expect(service.tryDecrypt(null)).toBeNull();
      expect(service.tryDecrypt(undefined)).toBeNull();
      expect(service.tryDecrypt("")).toBeNull();
      expect(service.tryDecrypt("garbage")).toBeNull();
      // The realistic case: the encryption key was rotated.
      expect(serviceWithKey("yet-another-key-of-sufficient-length-here").tryDecrypt(service.encrypt("v"))).toBeNull();
    });
  });
});

describe("maskSecret", () => {
  it("masks short secrets completely", () => {
    // Revealing 3 of 6 characters would give away more than it helps.
    expect(maskSecret("short")).toBe("••••••••");
    expect(maskSecret("12345678")).toBe("••••••••");
  });

  it("shows only a head and tail hint for longer secrets", () => {
    const masked = maskSecret("sk_live_2f8a9c1e4b7d");
    expect(masked).toBe("sk_••••4b7d");
    expect(masked).not.toContain("2f8a9c1e");
  });

  it("never returns the original value", () => {
    for (const value of ["short", "sk_live_2f8a9c1e4b7d", "x".repeat(64)]) {
      expect(maskSecret(value)).not.toBe(value);
    }
  });

  it("maskStored passes null through so callers can show 'not configured'", () => {
    expect(maskStored(null)).toBeNull();
    expect(maskStored("sk_live_2f8a9c1e4b7d")).toBe("sk_••••4b7d");
  });
});
