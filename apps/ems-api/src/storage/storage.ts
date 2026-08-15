import { randomUUID } from "node:crypto";

/**
 * Storage key rules for ems-api, kept as pure functions so the safety
 * properties can be tested without touching a disk.
 *
 * Deliberately a second copy of the shop's `apps/api/src/storage/storage.ts`
 * rather than shared code, for the same reason the edu-handoff token
 * verification is a second copy: the two apps are otherwise independent, and
 * a change made for the shop's product images must not silently alter what a
 * school's uploads are allowed to be.
 *
 * The rule this file exists to enforce, on top of the shop's own: **every key
 * is scoped to one school**. There is one storage root shared by every
 * tenant, so a key built from anything a caller supplied would be the one
 * place in this codebase where school A can reach school B's bytes — the
 * per-school database isolation everything else relies on does not extend to
 * the filesystem.
 */

/** Image types safe to serve back to a browser from our own origin. */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

/**
 * SVG is deliberately absent, exactly as in the shop.
 *
 * An SVG is XML that may contain `<script>`, and a browser executes it when
 * the file is served inline. A school logo is the most natural thing in the
 * world to have as an SVG, which is what makes this the tempting exception —
 * and it would be a stored cross-site-scripting hole reachable from the
 * unauthenticated login page of every school on the platform.
 */
export const REJECTED_IMAGE_TYPES = ["image/svg+xml"];

export const BRANDING_PREFIX = "branding";
export const PHOTO_PREFIX = "photos";
export const ATTACHMENT_PREFIX = "attachments";

/**
 * Extensions storable as a class-chat attachment.
 *
 * A separate list from the image one on purpose. Attachments admit audio and
 * PDF, which must never become storable as a school logo — the logo route is
 * reachable unauthenticated from every school's login page, and widening one
 * list to serve both would quietly widen that.
 */
const ATTACHMENT_EXTENSIONS = [".png", ".jpg", ".webp", ".gif", ".webm", ".ogg", ".m4a", ".mp3", ".pdf"];

const SAFE_ATTACHMENT_NAME = new RegExp(
  `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:${ATTACHMENT_EXTENSIONS.map((extension) =>
    extension.replace(".", "\\."),
  ).join("|")})$`,
);

/**
 * Matches exactly what `buildBrandingKey` produces, and nothing else.
 *
 * The extension is the allowlist itself, not a general "short and
 * alphanumeric" shape. The shop's looser version permits `.php` on a name
 * that is otherwise a UUID; nothing can be *uploaded* under that extension,
 * so it is harmless there — but "harmless because of what another function
 * happens to do" is not a property worth relying on twice. Here the set of
 * addressable extensions is the set of storable ones, by construction.
 */
const SAFE_NAME = new RegExp(
  `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:${Object.values(
    ALLOWED_IMAGE_TYPES,
  )
    .map((extension) => extension.replace(".", "\\."))
    .join("|")})$`,
);

/** Prisma cuids: a leading letter then alphanumerics. No dots, no slashes. */
const SAFE_SCHOOL_ID = /^[a-z0-9]{1,64}$/i;

export function isSafeStoredName(name: string): boolean {
  return SAFE_NAME.test(name);
}

/**
 * `schools/<schoolId>/branding/<uuid>.<ext>`.
 *
 * The school id comes from the resolved tenant context, never from a request
 * body — but it is checked here anyway, because this function is the last
 * place a `../` could enter a path and the check costs one regex.
 */
export function buildBrandingKey(schoolId: string, extension: string): string {
  if (!SAFE_SCHOOL_ID.test(schoolId)) {
    throw new Error(`Refusing to build a storage key for school id: ${schoolId}`);
  }
  const ext = extension.startsWith(".") ? extension.toLowerCase() : "";
  return `schools/${schoolId}/${BRANDING_PREFIX}/${randomUUID()}${ext}`;
}

/**
 * Rebuilds a full key from a school id and the bare filename that appears in
 * a public logo URL.
 *
 * The filename half of that URL is the one attacker-controlled component on
 * the route that serves logos. Rebuilding — rather than accepting a path —
 * means a request for `../../otherschool/branding/x.png` cannot address
 * anything, since it never survives `isSafeStoredName`.
 */
export function brandingKeyFor(schoolId: string, name: string): string | null {
  if (!SAFE_SCHOOL_ID.test(schoolId)) return null;
  if (!isSafeStoredName(name)) return null;
  return `schools/${schoolId}/${BRANDING_PREFIX}/${name}`;
}

/**
 * `schools/<schoolId>/photos/<uuid>.<ext>`.
 *
 * Same construction as a logo, different prefix, and one important
 * difference in how it is *served*: there is no public route for these. A
 * school logo is meant to be seen by strangers on a login page; a child's
 * photograph is not, so the key never appears in a URL and the bytes come
 * back only through an authorised route.
 */
export function buildPhotoKey(schoolId: string, extension: string): string {
  if (!SAFE_SCHOOL_ID.test(schoolId)) {
    throw new Error(`Refusing to build a storage key for school id: ${schoolId}`);
  }
  const ext = extension.startsWith(".") ? extension.toLowerCase() : "";
  return `schools/${schoolId}/${PHOTO_PREFIX}/${randomUUID()}${ext}`;
}

/**
 * True when a stored key really belongs to this school's photographs.
 *
 * Checked before any read. The key comes from our own database rather than
 * from a request, so this is a guard against a bug — a photo key that somehow
 * points at another school's directory should fail to load rather than
 * succeed quietly.
 */
export function isPhotoKeyForSchool(key: string, schoolId: string): boolean {
  if (!SAFE_SCHOOL_ID.test(schoolId)) return false;
  const prefix = `schools/${schoolId}/${PHOTO_PREFIX}/`;
  if (!key.startsWith(prefix)) return false;
  return isSafeStoredName(key.slice(prefix.length));
}

/**
 * `schools/<schoolId>/attachments/<uuid>.<ext>`.
 *
 * Like a photograph and unlike a logo: there is no public route for these.
 * A file one child sent another is never at a guessable address, so the key
 * never appears in a URL and the bytes come back only through an authorised
 * route that re-checks who is asking.
 */
export function buildAttachmentKey(schoolId: string, extension: string): string {
  if (!SAFE_SCHOOL_ID.test(schoolId)) {
    throw new Error(`Refusing to build a storage key for school id: ${schoolId}`);
  }
  const ext = extension.startsWith(".") ? extension.toLowerCase() : "";
  if (!ATTACHMENT_EXTENSIONS.includes(ext)) {
    throw new Error(`Refusing to build an attachment key for extension: ${extension}`);
  }
  return `schools/${schoolId}/${ATTACHMENT_PREFIX}/${randomUUID()}${ext}`;
}

/**
 * True when a stored key really belongs to this school's attachments.
 *
 * Checked before any read. The key comes from our own database, so this
 * guards against a bug rather than an attacker — a key that somehow points
 * at another school's directory must fail to load rather than succeed
 * quietly. It is the only thing standing between two tenants on a shared
 * storage root.
 */
export function isAttachmentKeyForSchool(key: string, schoolId: string): boolean {
  if (!SAFE_SCHOOL_ID.test(schoolId)) return false;
  const prefix = `schools/${schoolId}/${ATTACHMENT_PREFIX}/`;
  if (!key.startsWith(prefix)) return false;
  return SAFE_ATTACHMENT_NAME.test(key.slice(prefix.length));
}

/** The bare filename of a stored key, for building a public URL. */
export function storedNameOf(key: string): string {
  return key.slice(key.lastIndexOf("/") + 1);
}

/** The content type to serve a stored name as, from its extension only. */
export function contentTypeFor(name: string): string {
  const extension = name.slice(name.lastIndexOf("."));
  return (
    Object.entries(ALLOWED_IMAGE_TYPES).find(([, ext]) => ext === extension)?.[0] ??
    "application/octet-stream"
  );
}
