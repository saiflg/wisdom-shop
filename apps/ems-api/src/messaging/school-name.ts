/**
 * What a school should be called in a message to a family.
 *
 * This was signing receipts "demo-academy" — the URL slug, which is an
 * internal identifier and never something a school calls itself. A parent
 * reading "demo-academy" at the bottom of a receipt for their child's fees
 * is being shown plumbing.
 *
 * Three sources, in the order a school would expect:
 *
 *   1. The display name an administrator typed under Branding. If somebody
 *      has said what the school is called, that is the answer.
 *   2. The name the school was registered under. Always present, but it is
 *      the legal name — "Demo Academy Ltd" rather than "Demo Academy" — so
 *      it yields to an explicit choice.
 *   3. The slug, only if the two above are somehow blank. Ugly, but a
 *      recognisable ugly beats an empty signature.
 *
 * Blank and whitespace-only are treated as absent throughout: an admin who
 * clears the display-name box means "use the registered name", not "sign
 * with nothing".
 */
export function schoolNameFor(sources: {
  displayName?: string | null;
  registeredName?: string | null;
  slug?: string | null;
}): string {
  const candidates = [sources.displayName, sources.registeredName, sources.slug];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }

  // Reached only if a school has no display name, no registered name and no
  // slug, which the database does not allow. Still better than the string
  // "undefined" appearing in a parent's inbox.
  return "Your school";
}
