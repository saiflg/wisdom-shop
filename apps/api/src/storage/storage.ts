import { randomUUID } from "node:crypto";
import { extname } from "node:path";

/**
 * Storage key rules, kept as pure functions so the safety properties can be
 * tested without touching a disk.
 *
 * The central rule: **keys are generated here, never taken from the client.**
 * An uploaded filename is attacker-controlled and can contain `../`, a null
 * byte, or an extension that changes how the file is later served. Recording
 * the original name for display is fine; using it to address the file is not.
 */

/** Image types safe to serve back to a browser from our own origin. */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/**
 * SVG is deliberately absent from the allowlist.
 *
 * An SVG is XML that may contain `<script>`, and a browser executes it when
 * the file is served inline. Serving one from the API's own origin would be a
 * stored cross-site-scripting hole handed to anyone who can upload a product
 * image — which includes every approved vendor.
 */
export const REJECTED_IMAGE_TYPES = ["image/svg+xml"];

export const IMAGE_PREFIX = "images";
export const FILE_PREFIX = "files";

/** Matches exactly what `buildStorageKey` produces, and nothing else. */
const SAFE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,8})?$/;

export function buildStorageKey(prefix: string, extension: string): string {
  const ext = extension.startsWith(".") ? extension.toLowerCase() : "";
  return `${prefix}/${randomUUID()}${ext}`;
}

/**
 * True when a name is one this service generated.
 *
 * Used on the public image route before touching the filesystem: it rejects
 * `../`, absolute paths, encoded traversal and everything else, because the
 * only strings that pass are a UUID with a short lowercase extension.
 */
export function isSafeStoredName(name: string): boolean {
  return SAFE_NAME.test(name);
}

/**
 * The extension to store a downloadable file under.
 *
 * Taken from the original name but reduced to lowercase alphanumerics and
 * capped, so `report.pdf` keeps `.pdf` while `evil.php.` or a 200-character
 * extension does not survive. The stored extension has no effect on how the
 * file is served — downloads always go out as an attachment — but keeping it
 * sane makes the storage directory readable by a human.
 */
export function safeExtensionFrom(originalName: string): string {
  const raw = extname(originalName).toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9.]/g, "");
  if (!/^\.[a-z0-9]{1,8}$/.test(cleaned)) return "";
  return cleaned;
}

/**
 * Strips directory components from a client-supplied filename for display.
 *
 * Quotes, backslashes and control characters are removed because this value
 * ends up inside `Content-Disposition: attachment; filename="..."`, where any
 * of them would break out of the quoted string and inject header content.
 * Ordinary spaces and punctuation are kept — the point is a readable name,
 * not a mangled one.
 */
export function displayName(originalName: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? "download";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"\\]/g, "").trim();
  return cleaned.slice(0, 200) || "download";
}
