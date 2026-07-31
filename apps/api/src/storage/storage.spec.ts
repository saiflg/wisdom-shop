import {
  ALLOWED_IMAGE_TYPES,
  buildStorageKey,
  displayName,
  isSafeStoredName,
  REJECTED_IMAGE_TYPES,
  safeExtensionFrom,
} from "./storage";

describe("storage keys", () => {
  it("generates keys the safety check accepts", () => {
    const key = buildStorageKey("images", ".png");
    const name = key.slice("images/".length);
    expect(key.startsWith("images/")).toBe(true);
    expect(isSafeStoredName(name)).toBe(true);
  });

  it("never reuses a key", () => {
    const keys = new Set(Array.from({ length: 200 }, () => buildStorageKey("files", ".pdf")));
    expect(keys.size).toBe(200);
  });
});

describe("isSafeStoredName", () => {
  it("accepts only names this service generated", () => {
    expect(isSafeStoredName("3f2504e0-4f89-11d3-9a0c-0305e82c3301.png")).toBe(true);
    expect(isSafeStoredName("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(true);
  });

  it.each([
    "../../etc/passwd",
    "..%2F..%2Fetc%2Fpasswd",
    "/etc/passwd",
    "images/../../secret.png",
    "3f2504e0-4f89-11d3-9a0c-0305e82c3301.png/../../x",
    "....//....//etc/passwd",
    "a".repeat(300),
    "",
    ".env",
    "3f2504e0-4f89-11d3-9a0c-0305e82c3301.PNG",
  ])("rejects %s", (name) => {
    // This runs before the filesystem is touched, so traversal never reaches
    // disk at all rather than relying on a later containment check.
    expect(isSafeStoredName(name)).toBe(false);
  });

  it("rejects a name with a null byte", () => {
    expect(isSafeStoredName("3f2504e0-4f89-11d3-9a0c-0305e82c3301.png\u0000.txt")).toBe(false);
  });
});

describe("image type allowlist", () => {
  it("covers the ordinary raster formats", () => {
    expect(Object.keys(ALLOWED_IMAGE_TYPES).sort()).toEqual([
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("excludes SVG", () => {
    // An SVG is XML that can carry <script>, and serving one from our own
    // origin would be stored XSS available to every approved vendor.
    expect(ALLOWED_IMAGE_TYPES["image/svg+xml"]).toBeUndefined();
    expect(REJECTED_IMAGE_TYPES).toContain("image/svg+xml");
  });
});

describe("safeExtensionFrom", () => {
  it("keeps an ordinary extension", () => {
    expect(safeExtensionFrom("report.pdf")).toBe(".pdf");
    expect(safeExtensionFrom("Archive.ZIP")).toBe(".zip");
  });

  it("returns nothing for names it cannot reduce to a sane extension", () => {
    expect(safeExtensionFrom("noextension")).toBe("");
    expect(safeExtensionFrom("trailing.")).toBe("");
    expect(safeExtensionFrom("weird.tar.gz.".repeat(30))).toBe("");
  });

  it("cannot produce a path separator", () => {
    expect(safeExtensionFrom("evil.pdf/../../x")).not.toContain("/");
    expect(safeExtensionFrom("evil.pdf\\..\\x")).not.toContain("\\");
  });
});

describe("displayName", () => {
  it("keeps a readable name", () => {
    expect(displayName("My Study Guide (2nd ed).pdf")).toBe("My Study Guide (2nd ed).pdf");
  });

  it("strips directory components", () => {
    expect(displayName("../../etc/passwd")).toBe("passwd");
    expect(displayName("C:\\Windows\\system32\\cmd.exe")).toBe("cmd.exe");
  });

  it("cannot break out of a Content-Disposition header", () => {
    // The value is interpolated into `filename="..."`, so a quote or a
    // newline would let a crafted upload inject header content.
    const hostile = 'a".pdf\r\nX-Injected: yes';
    const result = displayName(hostile);
    expect(result).not.toContain('"');
    expect(result).not.toContain("\r");
    expect(result).not.toContain("\n");
  });

  it("always returns something usable", () => {
    expect(displayName("")).toBe("download");
    expect(displayName('"""')).toBe("download");
  });
});
