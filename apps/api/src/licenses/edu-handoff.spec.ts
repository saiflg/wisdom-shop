import { createHandoffToken, verifyHandoffToken, HandoffTokenError } from "./edu-handoff";
import { generateLicenseKey, isValidLicenseKeyFormat } from "./license-key";

const SECRET = "test_edu_setup_secret_at_least_32_chars__";
const PAYLOAD = { k: "WS-4KQ2A-9XM7T-BR3ND-P8WHY", u: "user_1", p: "prod_1", o: "order_1" };

describe("EMS handoff token", () => {
  it("round-trips a payload it signed", () => {
    const token = createHandoffToken(PAYLOAD, SECRET, 300);
    const verified = verifyHandoffToken(token, SECRET);

    expect(verified.k).toBe(PAYLOAD.k);
    expect(verified.u).toBe(PAYLOAD.u);
    expect(verified.p).toBe(PAYLOAD.p);
    expect(verified.o).toBe(PAYLOAD.o);
    expect(verified.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a token signed with a different secret", () => {
    const token = createHandoffToken(PAYLOAD, "some_other_secret_at_least_32_chars___", 300);
    expect(() => verifyHandoffToken(token, SECRET)).toThrow(HandoffTokenError);
  });

  it("rejects a payload tampered with after signing", () => {
    const token = createHandoffToken(PAYLOAD, SECRET, 300);
    const [, signature] = token.split(".");

    // Re-encode a payload claiming a different user, keeping the signature.
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...PAYLOAD, u: "someone_else", exp: Math.floor(Date.now() / 1000) + 300 }),
      "utf8",
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(() => verifyHandoffToken(`${forgedPayload}.${signature}`, SECRET)).toThrow(
      HandoffTokenError,
    );
  });

  it("rejects an expired token", () => {
    // Negative TTL puts expiry in the past.
    const token = createHandoffToken(PAYLOAD, SECRET, -1);
    expect(() => verifyHandoffToken(token, SECRET)).toThrow(/expired/i);
  });

  it("rejects structurally malformed tokens", () => {
    expect(() => verifyHandoffToken("not-a-token", SECRET)).toThrow(HandoffTokenError);
    expect(() => verifyHandoffToken("a.b.c", SECRET)).toThrow(HandoffTokenError);
    expect(() => verifyHandoffToken("", SECRET)).toThrow(HandoffTokenError);
  });

  it("does not accept an unsigned payload with an empty signature", () => {
    const encoded = Buffer.from(JSON.stringify({ ...PAYLOAD, exp: 99999999999 }), "utf8")
      .toString("base64")
      .replace(/=+$/, "");
    expect(() => verifyHandoffToken(`${encoded}.`, SECRET)).toThrow(HandoffTokenError);
  });
});

describe("license keys", () => {
  it("uses the documented WS-XXXXX-XXXXX-XXXXX-XXXXX shape", () => {
    const key = generateLicenseKey();
    expect(key).toMatch(/^WS-[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    expect(isValidLicenseKeyFormat(key)).toBe(true);
  });

  it("omits the ambiguous characters I, L, O and U", () => {
    // 500 keys is ~10,000 characters — ample to catch an alphabet mistake.
    const keys = Array.from({ length: 500 }, () => generateLicenseKey());
    const body = keys.join("").replace(/WS|-/g, "");
    for (const ambiguous of ["I", "L", "O", "U"]) {
      expect(body).not.toContain(ambiguous);
    }
  });

  it("does not collide across many generations", () => {
    const generated = new Set(Array.from({ length: 5000 }, () => generateLicenseKey()));
    expect(generated.size).toBe(5000);
  });

  it("rejects malformed keys", () => {
    expect(isValidLicenseKeyFormat("WS-1234-5678-9012-3456")).toBe(false); // wrong group length
    expect(isValidLicenseKeyFormat("XX-4KQ2A-9XM7T-BR3ND-P8WHY")).toBe(false); // wrong prefix
    expect(isValidLicenseKeyFormat("WS-4KQ2A-9XM7T-BR3ND")).toBe(false); // too few groups
    expect(isValidLicenseKeyFormat("WS-4KQ2I-9XM7T-BR3ND-P8WHY")).toBe(false); // ambiguous char
  });
});
