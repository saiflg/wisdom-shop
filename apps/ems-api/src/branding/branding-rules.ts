/**
 * The pure half of per-school branding: what a colour is allowed to be, and
 * what has to be true about text drawn on top of it.
 *
 * Kept free of Nest and Prisma so the rules that decide whether a school's
 * console is *readable* can be tested without a database, in the same spirit
 * as grading-math.ts and exam-window.ts.
 */

/** Three- or six-digit hex, with the hash. Nothing else is accepted. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The blue the console has always used. A school that never opens the
 * branding page must look exactly as it did before this feature existed.
 */
export const DEFAULT_PRIMARY_COLOR = "#1d4ed8";
export const DEFAULT_ACCENT_COLOR = "#0f766e";

export function isValidHexColor(value: string): boolean {
  return HEX.test(value.trim());
}

/**
 * Expands `#abc` to `#aabbcc` and lowercases.
 *
 * Stored normalised so two spellings of the same colour compare equal, and
 * so everything downstream — the contrast check, the CSS variable, the
 * preview — can assume six digits rather than each handling both.
 */
export function normaliseHexColor(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!HEX.test(trimmed)) {
    throw new Error(`Not a hex colour: ${value}`);
  }
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return trimmed;
}

function channels(hex: string): [number, number, number] {
  const full = normaliseHexColor(hex);
  return [
    Number.parseInt(full.slice(1, 3), 16),
    Number.parseInt(full.slice(3, 5), 16),
    Number.parseInt(full.slice(5, 7), 16),
  ];
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(hex: string): number {
  const linear = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The text colour to draw on top of a school's own colour.
 *
 * A school picking its colours is not picking legible ones, and a brand
 * colour is used behind button labels and header text. Choosing the better
 * of black and white — rather than always white, which is what a hardcoded
 * theme does — is what keeps a school with a pale yellow crest from shipping
 * a console nobody can read.
 *
 * **Pure black and pure white, deliberately.** The worst case for this
 * choice is the colour whose contrast against both is equal, which works out
 * at about 4.58:1 — above the 4.5:1 the accessibility phase holds the rest
 * of the app to. Substituting a softer near-black (#111827 and friends) is
 * the obvious tasteful tweak and it silently breaks that guarantee: against
 * that same worst-case colour it lands near 3.5:1. See the test.
 */
export function readableTextOn(background: string): "#ffffff" | "#000000" {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#000000")
    ? "#ffffff"
    : "#000000";
}

/**
 * Mixes a colour towards black (`amount` < 0) or white (`amount` > 0).
 *
 * Used for hover and pressed states, which otherwise need a school to pick
 * three colours instead of one. Straight channel mixing, not a perceptual
 * space — the difference does not show at these small steps and pulling in a
 * colour library for it would not be worth the dependency.
 */
export function shade(hex: string, amount: number): string {
  const target = amount > 0 ? 255 : 0;
  const weight = Math.min(1, Math.abs(amount));
  const mixed = channels(hex).map((value) => Math.round(value + (target - value) * weight));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export interface BrandingLike {
  displayName: string | null;
  tagline: string | null;
  logoKey: string | null;
  primaryColor: string;
  accentColor: string;
}

/** What the login page — and therefore the whole internet — may see. */
export interface PublicBranding {
  schoolName: string;
  tagline: string | null;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  onPrimaryColor: string;
}

/**
 * Builds the unauthenticated view of a school's branding.
 *
 * **Rebuilt field by field, never spread-and-delete** — the same rule the
 * exam paper's `toStudentPaper` follows. This object is served to anyone who
 * can reach the login page, and it sits in a module beside settings that
 * hold SMTP passwords and payment keys. A column added to the branding model
 * later must be invisible here until somebody decides otherwise, and
 * `{ ...branding }` minus a few keys is exactly the shape that fails that
 * test quietly.
 */
export function toPublicBranding(params: {
  schoolName: string;
  branding: BrandingLike | null;
  logoUrl: string | null;
}): PublicBranding {
  const primary = params.branding?.primaryColor ?? DEFAULT_PRIMARY_COLOR;
  const accent = params.branding?.accentColor ?? DEFAULT_ACCENT_COLOR;

  return {
    schoolName: params.branding?.displayName?.trim() || params.schoolName,
    tagline: params.branding?.tagline ?? null,
    logoUrl: params.logoUrl,
    primaryColor: primary,
    accentColor: accent,
    onPrimaryColor: readableTextOn(primary),
  };
}
