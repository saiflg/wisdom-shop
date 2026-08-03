import { resolveSecretUpdate, secretUpdateField } from "./secret-update";

const encrypt = (plaintext: string) => `enc(${plaintext})`;

describe("resolveSecretUpdate", () => {
  it("keeps the stored secret when the field is omitted", () => {
    expect(resolveSecretUpdate(undefined, encrypt)).toEqual({ change: false });
  });

  it("keeps the stored secret when the client sends back an empty value", () => {
    // This is the important one: the form only ever showed a mask, so an
    // unchanged save must not wipe a working gateway.
    expect(resolveSecretUpdate("", encrypt)).toEqual({ change: false });
    expect(resolveSecretUpdate("   ", encrypt)).toEqual({ change: false });
  });

  it("clears the secret only on an explicit null", () => {
    expect(resolveSecretUpdate(null, encrypt)).toEqual({ change: true, value: null });
  });

  it("encrypts a new secret and trims surrounding whitespace", () => {
    expect(resolveSecretUpdate("  sk_live_123  ", encrypt)).toEqual({ change: true, value: "enc(sk_live_123)" });
  });

  it("never stores plaintext", () => {
    const result = resolveSecretUpdate("sk_live_123", encrypt);
    expect(result).toEqual({ change: true, value: "enc(sk_live_123)" });
    if (result.change) expect(result.value).not.toBe("sk_live_123");
  });
});

describe("secretUpdateField", () => {
  it("omits the column entirely when nothing should change", () => {
    expect(secretUpdateField("passwordEncrypted", undefined, encrypt)).toEqual({});
    expect(secretUpdateField("passwordEncrypted", "", encrypt)).toEqual({});
  });

  it("sets the column when a new secret is supplied", () => {
    expect(secretUpdateField("passwordEncrypted", "hunter2", encrypt)).toEqual({
      passwordEncrypted: "enc(hunter2)",
    });
  });

  it("nulls the column on an explicit clear", () => {
    expect(secretUpdateField("passwordEncrypted", null, encrypt)).toEqual({ passwordEncrypted: null });
  });
});
