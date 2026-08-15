import { buildAttachmentKey, isAttachmentKeyForSchool } from "./storage";
import {
  ALLOWED_IMAGE_TYPES,
  REJECTED_IMAGE_TYPES,
  brandingKeyFor,
  buildBrandingKey,
  contentTypeFor,
  isSafeStoredName,
  storedNameOf,
} from "./storage";

const SCHOOL = "clx1school000";
const OTHER_SCHOOL = "clx2other0000";

describe("buildBrandingKey", () => {
  it("scopes the key to the school", () => {
    const key = buildBrandingKey(SCHOOL, ".png");
    expect(key).toMatch(new RegExp(`^schools/${SCHOOL}/branding/[0-9a-f-]{36}\\.png$`));
  });

  it("produces a different key every time, so a new logo never overwrites the old one", () => {
    expect(buildBrandingKey(SCHOOL, ".png")).not.toBe(buildBrandingKey(SCHOOL, ".png"));
  });

  it("refuses a school id that could climb out of its directory", () => {
    expect(() => buildBrandingKey("../../etc", ".png")).toThrow(/refusing/i);
    expect(() => buildBrandingKey("a/b", ".png")).toThrow(/refusing/i);
    expect(() => buildBrandingKey("", ".png")).toThrow(/refusing/i);
  });

  it("drops an extension that does not look like one", () => {
    expect(buildBrandingKey(SCHOOL, "png")).toMatch(/[0-9a-f-]{36}$/);
  });
});

describe("isSafeStoredName", () => {
  it("accepts exactly what buildBrandingKey produces", () => {
    const name = storedNameOf(buildBrandingKey(SCHOOL, ".webp"));
    expect(isSafeStoredName(name)).toBe(true);
  });

  it.each([
    "../secret.png",
    "..%2Fsecret.png",
    "/etc/passwd",
    "logo.png",
    "00000000-0000-0000-0000-000000000000",
    "00000000-0000-0000-0000-000000000000.php",
    "00000000-0000-0000-0000-000000000000.png/../x",
    "",
  ])("rejects %s", (name) => {
    expect(isSafeStoredName(name)).toBe(false);
  });
});

describe("brandingKeyFor", () => {
  it("rebuilds the key a school's own logo lives at", () => {
    const key = buildBrandingKey(SCHOOL, ".png");
    expect(brandingKeyFor(SCHOOL, storedNameOf(key))).toBe(key);
  });

  it("cannot be pointed at another school by way of the filename", () => {
    const victim = buildBrandingKey(OTHER_SCHOOL, ".png");
    const traversal = `../../${OTHER_SCHOOL}/branding/${storedNameOf(victim)}`;
    expect(brandingKeyFor(SCHOOL, traversal)).toBeNull();
  });

  it("returns null rather than a path when the name is not one we generated", () => {
    expect(brandingKeyFor(SCHOOL, "logo.png")).toBeNull();
    expect(brandingKeyFor("../..", "logo.png")).toBeNull();
  });

  it("keys for two schools never collide even for the same filename", () => {
    const name = storedNameOf(buildBrandingKey(SCHOOL, ".png"));
    expect(brandingKeyFor(SCHOOL, name)).not.toBe(brandingKeyFor(OTHER_SCHOOL, name));
  });
});

describe("the image allowlist", () => {
  it("does not accept SVG, which would execute script from our own origin", () => {
    expect(ALLOWED_IMAGE_TYPES["image/svg+xml"]).toBeUndefined();
    expect(REJECTED_IMAGE_TYPES).toContain("image/svg+xml");
  });

  it("maps every allowed type back from its extension", () => {
    for (const [type, extension] of Object.entries(ALLOWED_IMAGE_TYPES)) {
      expect(contentTypeFor(`00000000-0000-0000-0000-000000000000${extension}`)).toBe(type);
    }
  });

  it("falls back to an inert content type for anything unrecognised", () => {
    expect(contentTypeFor("x.html")).toBe("application/octet-stream");
  });
});

describe("attachment keys", () => {
  const school = "cmsn7t1ap000pg16gluo75p0t";

  it("scopes every attachment to one school", () => {
    const key = buildAttachmentKey(school, ".pdf");
    expect(key.startsWith(`schools/${school}/attachments/`)).toBe(true);
    expect(key.endsWith(".pdf")).toBe(true);
  });

  it("never puts an uploaded name in the path", () => {
    // The name is a UUID by construction, so "../../etc/passwd" as a
    // filename cannot reach the key at all.
    const key = buildAttachmentKey(school, ".png");
    expect(key).toMatch(/[0-9a-f-]{36}\.png$/);
  });

  it("refuses an extension that is not storable as an attachment", () => {
    expect(() => buildAttachmentKey(school, ".svg")).toThrow(/Refusing/);
    expect(() => buildAttachmentKey(school, ".exe")).toThrow(/Refusing/);
    expect(() => buildAttachmentKey(school, ".html")).toThrow(/Refusing/);
  });

  it("refuses a school id that could escape the root", () => {
    expect(() => buildAttachmentKey("../other", ".png")).toThrow(/Refusing/);
  });

  it("recognises its own keys and nobody else's", () => {
    const key = buildAttachmentKey(school, ".webm");
    expect(isAttachmentKeyForSchool(key, school)).toBe(true);
    expect(isAttachmentKeyForSchool(key, "cmothertenant0000000000000")).toBe(false);
  });

  it("REFUSES a key pointing into another school's directory", () => {
    // The only thing standing between two tenants on a shared storage root.
    const other = `schools/cmothertenant0000000000000/attachments/${"a".repeat(8)}-aaaa-aaaa-aaaa-${"a".repeat(12)}.png`;
    expect(isAttachmentKeyForSchool(other, school)).toBe(false);
  });

  it("refuses a traversal dressed up as a stored name", () => {
    expect(isAttachmentKeyForSchool(`schools/${school}/attachments/../../../etc/passwd`, school)).toBe(false);
  });

  it("does not accept a photo key as an attachment key", () => {
    expect(isAttachmentKeyForSchool(`schools/${school}/photos/x.png`, school)).toBe(false);
  });
});
