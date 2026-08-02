import type { NavIcon } from "@/lib/navigation";

/**
 * Inline SVGs rather than an icon package: this app's container has already
 * shown that adding dependencies is the most fragile operation in this
 * environment, and nine icons don't justify it. All drawn on a 24x24 grid
 * with currentColor so they inherit text colour in both themes.
 */
const PATHS: Record<NavIcon, string> = {
  dashboard: "M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h8v8H3v-8zm10-3h8v11h-8V10z",
  students: "M12 3 1 8l11 5 9-4.09V17h2V8L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z",
  parents: "M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  staff: "M20 6h-4V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm-6 0h-4V4h4v2z",
  academics: "M4 6h7v12H4V6zm9 0h7v12h-7V6zM2 4h20v2H2V4zm0 14h20v2H2v-2z",
  examination: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 13h8v2H8v-2zm0 4h8v2H8v-2z",
  finance: "M12 1v3.07A8 8 0 0 0 4.07 12H1v2h3.07A8 8 0 0 0 12 21.93V25h2v-3.07A8 8 0 0 0 21.93 14H25v-2h-3.07A8 8 0 0 0 14 4.07V1h-2zm1 5.5c2.48 0 4.5 2.02 4.5 4.5S15.48 15.5 13 15.5 8.5 13.48 8.5 11 10.52 6.5 13 6.5z",
  messaging: "M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM7 9h10v2H7V9zm0-3h10v2H7V6zm0 6h7v2H7v-2z",
  settings:
    "M19.14 12.94a7.6 7.6 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.62l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.65 8.86a.5.5 0 0 0 .12.62l2.03 1.58a7.6 7.6 0 0 0 0 1.88L2.77 14.5a.5.5 0 0 0-.12.62l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.62l-2.03-1.56zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z",
};

export function NavIconGlyph({ name, className }: { name: NavIcon; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StarIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        d="m12 3 2.76 5.6 6.18.9-4.47 4.36 1.05 6.14L12 17.1l-5.52 2.9 1.05-6.14L3.06 9.5l6.18-.9z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
