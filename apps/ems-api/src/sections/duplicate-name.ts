/**
 * Whether a write failed because the section name is already taken.
 *
 * Prisma reports a unique-constraint violation as P2002, but the partial
 * index here is on `lower("name")` and an expression index has no field name
 * to report — `meta.target` comes back as the index name instead of a column
 * list. Matching on the code plus the index name covers both shapes, and
 * matching on nothing else means a genuinely different constraint failure is
 * still allowed to surface rather than being reported as a duplicate name.
 */
export function isDuplicateName(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code !== "P2002") return false;

  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (typeof target === "string") return target.includes("sections_name");
  if (Array.isArray(target)) return target.some((t) => typeof t === "string" && t.includes("name"));
  // P2002 raised against the sections table with no usable target: the only
  // unique constraint it has beyond the primary key is the name.
  return true;
}
