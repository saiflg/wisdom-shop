/**
 * The client-safe half of branding: types, and the pure colour maths that
 * turns a school's chosen colour into the CSS the app reads.
 *
 * **Nothing here may import `next/headers`.** The branding settings page is
 * a client component and needs `brandRamp` for its live preview; a
 * server-only import anywhere in this module would be pulled into the client
 * bundle with it and fail the build. That is not hypothetical — it is
 * exactly how this file was first written, and neither typecheck, lint nor
 * the unit tests caught it. The fetch that does need the request's headers
 * lives in branding-server.ts.
 */

export interface Branding {
  schoolSlug: string;
  schoolName: string;
  tagline: string | null;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  onPrimaryColor: string;
  /**
   * The language this school's console opens in. A default, not an
   * instruction — anybody who has chosen for themselves keeps their choice.
   */
  defaultLocale?: string;
}

export interface ResolvedBranding {
  /** How the school was identified — "none" means nobody was. */
  resolvedFrom: "host" | "slug" | "none";
  branding: Branding | null;
}

/** "#1d4ed8" → "29 78 216", the form Tailwind's rgb(... / <alpha>) needs. */
function toTriplet(hex: string): string {
  const full =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex.toLowerCase();
  const r = Number.parseInt(full.slice(1, 3), 16);
  const g = Number.parseInt(full.slice(3, 5), 16);
  const b = Number.parseInt(full.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

function mix(hex: string, towards: 0 | 255, weight: number): string {
  const blend = (value: number) => Math.round(value + (towards - value) * weight);
  return toTriplet(hex)
    .split(" ")
    .map((channel) => blend(Number(channel)))
    .join(" ");
}

/**
 * Builds the ten-stop ramp the app's `brand-*` classes read.
 *
 * The school's chosen colour becomes **600**, not 500: `bg-brand-600` is
 * what the primary buttons and the sidebar already use, so anchoring there
 * is what makes a school's colour appear where they expect it. The rest are
 * mixes towards white and black — a perceptual colour space would space
 * them more evenly, but it would also mean the exact colour a school picked
 * no longer appearing anywhere in its own console.
 */
export type BrandRamp = Record<`--brand-${(typeof BRAND_STOPS)[number]}`, string>;

const BRAND_STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

export function brandRamp(primaryColor: string): BrandRamp {
  return {
    "--brand-50": mix(primaryColor, 255, 0.95),
    "--brand-100": mix(primaryColor, 255, 0.9),
    "--brand-200": mix(primaryColor, 255, 0.78),
    "--brand-300": mix(primaryColor, 255, 0.62),
    "--brand-400": mix(primaryColor, 255, 0.4),
    "--brand-500": mix(primaryColor, 255, 0.18),
    "--brand-600": toTriplet(primaryColor),
    "--brand-700": mix(primaryColor, 0, 0.18),
    "--brand-800": mix(primaryColor, 0, 0.34),
    "--brand-900": mix(primaryColor, 0, 0.48),
  };
}

/**
 * The `:root` override for a branded school, as CSS text.
 *
 * Every value here is a number triplet or a colour this function built from
 * one — nothing from the API is interpolated raw. The API validates colours
 * as hex on the way in, and `toTriplet` would produce `NaN NaN NaN` rather
 * than markup for anything else, so a stylesheet cannot be smuggled through
 * a colour field even if that validation were loosened later.
 */
export function brandingStyle(branding: Branding): string {
  const ramp = brandRamp(branding.primaryColor);
  const declarations = Object.entries(ramp).map(([name, value]) => `${name}: ${value};`);

  declarations.push(`--on-brand: ${toTriplet(branding.onPrimaryColor)};`);
  declarations.push(
    `--brand-gradient: linear-gradient(135deg, rgb(${toTriplet(branding.primaryColor)}) 0%, rgb(${toTriplet(branding.accentColor)}) 100%);`,
  );

  return `:root{${declarations.join("")}}`;
}
