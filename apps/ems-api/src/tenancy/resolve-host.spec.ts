import { normaliseHostname, resolveHost } from "./resolve-host";

const BASE = "campus.example.com";

describe("normaliseHostname", () => {
  it("strips the port and lowercases", () => {
    expect(normaliseHostname("St-Marys.Campus.Example.com:3001")).toBe("st-marys.campus.example.com");
  });

  it("strips the trailing dot of a fully qualified name", () => {
    expect(normaliseHostname("campus.example.com.")).toBe("campus.example.com");
  });

  it("keeps an IPv6 literal intact rather than splitting it on its colons", () => {
    expect(normaliseHostname("[::1]:4001")).toBe("[::1]");
  });
});

describe("resolveHost", () => {
  it("reads the school slug from a subdomain of the base domain", () => {
    expect(resolveHost("st-marys.campus.example.com", BASE)).toEqual({
      kind: "subdomain",
      slug: "st-marys",
    });
  });

  it("ignores the port, casing and a trailing dot when matching", () => {
    expect(resolveHost("ST-MARYS.Campus.Example.com.:3001", BASE)).toEqual({
      kind: "subdomain",
      slug: "st-marys",
    });
  });

  it("treats the apex itself as no school", () => {
    expect(resolveHost("campus.example.com", BASE)).toEqual({ kind: "none" });
  });

  it("refuses a nested label rather than guessing which part is the school", () => {
    expect(resolveHost("a.b.campus.example.com", BASE)).toEqual({ kind: "none" });
  });

  it.each([...["www", "api", "app", "admin", "platform", "super", "cdn"]])(
    "refuses the reserved label %s",
    (label) => {
      expect(resolveHost(`${label}.campus.example.com`, BASE)).toEqual({ kind: "none" });
    },
  );

  it("refuses a label that is not slug-shaped", () => {
    expect(resolveHost("-nope.campus.example.com", BASE)).toEqual({ kind: "none" });
    expect(resolveHost("also_nope.campus.example.com", BASE)).toEqual({ kind: "none" });
    expect(resolveHost("trailing-.campus.example.com", BASE)).toEqual({ kind: "none" });
  });

  it("does not mistake a domain that merely ends in the base domain's letters", () => {
    // "evilcampus.example.com" ends with "campus.example.com" as a *string*
    // but is not under it; a naive endsWith without the dot hands an attacker
    // any school they like.
    expect(resolveHost("evilcampus.example.com", BASE)).toEqual({
      kind: "custom",
      hostname: "evilcampus.example.com",
    });
  });

  it("offers anything else as a custom-domain candidate", () => {
    expect(resolveHost("portal.stmarys.sch.ng", BASE)).toEqual({
      kind: "custom",
      hostname: "portal.stmarys.sch.ng",
    });
  });

  it("never resolves an IP address to a school", () => {
    expect(resolveHost("127.0.0.1:4001", BASE)).toEqual({ kind: "none" });
    expect(resolveHost("[::1]:4001", BASE)).toEqual({ kind: "none" });
  });

  it("returns none for a missing or empty host", () => {
    expect(resolveHost(undefined, BASE)).toEqual({ kind: "none" });
    expect(resolveHost("", BASE)).toEqual({ kind: "none" });
    expect(resolveHost("   ", BASE)).toEqual({ kind: "none" });
  });

  describe("with no base domain configured", () => {
    it("resolves nothing to a subdomain, so the login form keeps asking", () => {
      expect(resolveHost("st-marys.campus.example.com", "")).toEqual({
        kind: "custom",
        hostname: "st-marys.campus.example.com",
      });
    });

    it("still refuses an IP", () => {
      expect(resolveHost("10.0.0.5", "")).toEqual({ kind: "none" });
    });
  });

  describe("on localhost, where dev actually runs", () => {
    it("reads a slug from <slug>.localhost", () => {
      expect(resolveHost("st-marys.localhost:3001", "localhost")).toEqual({
        kind: "subdomain",
        slug: "st-marys",
      });
    });

    it("treats plain localhost as no school", () => {
      expect(resolveHost("localhost:3001", "localhost")).toEqual({ kind: "none" });
    });
  });
});
