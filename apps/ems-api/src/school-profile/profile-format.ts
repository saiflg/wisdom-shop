export interface SchoolProfileLike {
  motto?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  town?: string | null;
  state?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  registrationNumber?: string | null;
}

/** Blank, whitespace-only and absent all mean the same thing: not set. */
function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The school's address on one line.
 *
 * Joined from the parts that are actually filled in. The failure this exists
 * to prevent is the one every address formatter has: a school that has typed
 * a town and a country but no state gets "Ikeja, , Nigeria" printed on every
 * report card it hands out, and nobody notices until a parent does.
 */
export function formatAddress(profile: SchoolProfileLike): string | null {
  const parts = [
    present(profile.addressLine1),
    present(profile.addressLine2),
    present(profile.town),
    present(profile.state),
    present(profile.country),
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * How the school can be reached, on one line.
 *
 * Separated from the address because they are wanted in different places: a
 * receipt wants a phone number, a transcript wants a postal address, and a
 * report card wants both.
 */
export function formatContact(profile: SchoolProfileLike): string | null {
  const parts = [present(profile.phone), present(profile.email), present(profile.website)].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * The lines that head a printed document, in order.
 *
 * Always begins with the school's name, which is the one thing that must
 * never be missing — everything after it is included only when a school has
 * actually filled it in. A school that has entered nothing gets exactly what
 * it gets today, one line with its name on it, rather than a header padded
 * out with blank rows.
 */
export function documentHeaderLines(schoolName: string, profile: SchoolProfileLike | null): string[] {
  const lines = [schoolName];
  if (!profile) return lines;

  const address = formatAddress(profile);
  if (address) lines.push(address);

  const contact = formatContact(profile);
  if (contact) lines.push(contact);

  const motto = present(profile.motto);
  // Quoted, because a motto printed bare beneath a phone number reads as
  // another piece of contact detail.
  if (motto) lines.push(`"${motto}"`);

  return lines;
}

/**
 * Why this year cannot be the year the school was founded, or null.
 *
 * Loose on purpose at the bottom end — some schools here genuinely predate
 * the country — and firm at the top, because a founding year in the future
 * is always a typo.
 */
export function validateEstablishedYear(year: number, thisYear: number): string | null {
  if (!Number.isInteger(year)) return "The year founded must be a whole number";
  if (year < 1800) return "That is earlier than this field is meant for";
  if (year > thisYear) return "A school cannot have been founded in the future";
  return null;
}
