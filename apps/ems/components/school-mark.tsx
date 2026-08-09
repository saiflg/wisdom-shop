import clsx from "clsx";
import type { Branding } from "@/lib/branding";

const SIZES = {
  sm: { box: "h-8 w-8 text-sm", img: "h-8 w-8" },
  lg: { box: "h-16 w-16 text-2xl", img: "h-16 w-16" },
} as const;

/**
 * A school's logo, or its initial on a brand-coloured tile.
 *
 * Plain `<img>` rather than `next/image`: the source is a school's own
 * uploaded file served from this origin's `/v1/branding/logo/...`, and
 * routing it through the image optimiser would mean configuring a remote
 * pattern for a URL that is already same-origin and already small.
 *
 * The fallback is not decoration. A school that has set its colours but not
 * uploaded a logo — which is most of them on day one — still needs
 * something in the corner that is recognisably theirs, and an empty box
 * reads as a broken image.
 */
export function SchoolMark({
  branding,
  size = "sm",
  className,
}: {
  branding: Branding;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const sizes = SIZES[size];

  if (branding.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={branding.logoUrl}
        alt={`${branding.schoolName} logo`}
        className={clsx(sizes.img, "rounded-lg object-contain", className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={clsx(
        sizes.box,
        "flex items-center justify-center rounded-lg bg-brand-600 font-bold text-on-brand",
        className,
      )}
    >
      {branding.schoolName.trim().charAt(0).toUpperCase()}
    </span>
  );
}
