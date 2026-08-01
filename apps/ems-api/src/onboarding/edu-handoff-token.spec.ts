import { createHmac } from "node:crypto";
import { HandoffTokenError, verifyHandoffToken, type EduHandoffPayload } from "./edu-handoff-token";

const SECRET = "test_edu_setup_secret_at_least_32_chars__";
const PAYLOAD = { k: "WS-4KQ2A-9XM7T-BR3ND-P8WHY", u: "user_1", p: "prod_1", o: "order_1" };

/**
 * Local test-only stand-in for the shop's createHandoffToken (never ported
 * into this service — see edu-handoff-token.ts's own comment for why).
 * Deliberately reimplemented independently of the production sign() rather
 * than importing it, so this test can't pass by construction if sign()
 * itself is broken.
 */
function mintToken(payload: typeof PAYLOAD, secret: string, ttlSeconds: number): string {
  const full: EduHandoffPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = Buffer.from(JSON.stringify(full), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${encoded}.${signature}`;
}

describe("verifyHandoffToken", () => {
  it("accepts a token signed with the matching secret", () => {
    const token = mintToken(PAYLOAD, SECRET, 300);
    const verified = verifyHandoffToken(token, SECRET);

    expect(verified.k).toBe(PAYLOAD.k);
    expect(verified.u).toBe(PAYLOAD.u);
    expect(verified.p).toBe(PAYLOAD.p);
    expect(verified.o).toBe(PAYLOAD.o);
  });

  it("rejects a token signed with a different secret", () => {
    const token = mintToken(PAYLOAD, "some_other_secret_at_least_32_chars___", 300);
    expect(() => verifyHandoffToken(token, SECRET)).toThrow(HandoffTokenError);
  });

  it("rejects a payload tampered with after signing", () => {
    const token = mintToken(PAYLOAD, SECRET, 300);
    const [, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...PAYLOAD, u: "someone_else", exp: Math.floor(Date.now() / 1000) + 300 }),
      "utf8",
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(() => verifyHandoffToken(`${forgedPayload}.${signature}`, SECRET)).toThrow(HandoffTokenError);
  });

  it("rejects an expired token", () => {
    const token = mintToken(PAYLOAD, SECRET, -1);
    expect(() => verifyHandoffToken(token, SECRET)).toThrow(/expired/i);
  });

  it("rejects structurally malformed tokens", () => {
    expect(() => verifyHandoffToken("not-a-token", SECRET)).toThrow(HandoffTokenError);
    expect(() => verifyHandoffToken("a.b.c", SECRET)).toThrow(HandoffTokenError);
    expect(() => verifyHandoffToken("", SECRET)).toThrow(HandoffTokenError);
  });
});
