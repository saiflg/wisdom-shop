/**
 * A row of stars.
 *
 * The visual is decorative — the accessible name carries the actual value, so
 * a screen reader hears "Rated 4.5 out of 5" rather than counting glyphs.
 */
export function StarRating({
  value,
  size = "sm",
  label,
}: {
  value: number;
  size?: "sm" | "lg";
  label?: string;
}) {
  const dimension = size === "lg" ? "h-5 w-5" : "h-4 w-4";

  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={label ?? `Rated ${value} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        // Half-filled stars would need a gradient per star; rounding to the
        // nearest whole star keeps this readable and is accurate enough for
        // a summary that also prints the number.
        const filled = star <= Math.round(value);
        return (
          <svg
            key={star}
            aria-hidden
            viewBox="0 0 20 20"
            className={`${dimension} ${filled ? "text-amber-400" : "text-slate-300 dark:text-slate-700"}`}
            fill="currentColor"
          >
            <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9z" />
          </svg>
        );
      })}
    </span>
  );
}
