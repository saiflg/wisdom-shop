/**
 * Reading a list of families: searching it, and describing a household in a
 * line.
 *
 * Pure and free of React, so the rules can be argued with in a test rather
 * than clicked at in a browser.
 */

import type { GuardianEntry } from "./use-guardians";

/**
 * Does this family match what was typed?
 *
 * Searches the parent AND their children, because an office almost never
 * starts from the parent. Somebody rings about Tunde; the person answering
 * types "Tunde" and needs his mother's number. Searching only parent names
 * would make the commonest question the one the directory cannot answer.
 */
export function matchesGuardianQuery(entry: GuardianEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const haystack = [
    entry.firstName,
    entry.lastName,
    `${entry.firstName} ${entry.lastName}`,
    entry.email,
    ...entry.children.map((child) => child.name),
    ...entry.children.map((child) => child.className),
    ...entry.children.map((child) => child.relationship),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  return haystack.some((value) => value.includes(needle));
}

export function filterGuardians(entries: GuardianEntry[], query: string): GuardianEntry[] {
  return entries.filter((entry) => matchesGuardianQuery(entry, query));
}

/** "Mother of Tunde Bello · JSS 2A" — one line for a list row. */
export function householdSummary(entry: GuardianEntry): string {
  // Destructured rather than indexed: under noUncheckedIndexedAccess a
  // length check does not narrow children[0], and the compiler is right to
  // insist — the length and the element are two separate reads.
  const [only] = entry.children;
  if (!only) return "No children linked";

  if (entry.children.length === 1) {
    const where = only.className ? ` · ${only.className}` : "";
    return `${only.relationship} of ${only.name}${where}`;
  }

  // Relationships can differ per child — father to one, guardian to another —
  // so a multi-child row names the children rather than claiming one label.
  return `${entry.children.length} children: ${entry.children.map((child) => child.name).join(", ")}`;
}

/**
 * Families the school cannot reach electronically.
 *
 * Worth surfacing before anybody relies on an email announcement: these are
 * the parents who will not receive it, and who need a phone call or a letter
 * sent home instead.
 */
export function withoutEmail(entries: GuardianEntry[]): GuardianEntry[] {
  return entries.filter((entry) => !entry.email);
}
