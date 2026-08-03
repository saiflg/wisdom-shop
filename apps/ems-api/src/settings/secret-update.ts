/**
 * Decides what to write to a `*Encrypted` column given what the client sent.
 *
 * The settings API only ever shows a masked hint, so a client that loads a
 * form and saves it unchanged sends back either nothing or an empty string
 * for the secret. Treating that as "set it to empty" would silently destroy
 * a working gateway on every unrelated edit — the reason this is a named,
 * tested function rather than an inline ternary.
 *
 *   undefined / "" -> keep whatever is stored
 *   null           -> explicitly clear it
 *   non-empty      -> encrypt and replace
 */
export function resolveSecretUpdate(
  incoming: string | null | undefined,
  encrypt: (plaintext: string) => string,
): { change: false } | { change: true; value: string | null } {
  if (incoming === undefined) return { change: false };
  if (incoming === null) return { change: true, value: null };
  const trimmed = incoming.trim();
  if (trimmed === "") return { change: false };
  return { change: true, value: encrypt(trimmed) };
}

/**
 * Applies `resolveSecretUpdate` into a Prisma update payload, leaving the
 * field absent entirely when nothing should change.
 */
export function secretUpdateField<K extends string>(
  field: K,
  incoming: string | null | undefined,
  encrypt: (plaintext: string) => string,
): Partial<Record<K, string | null>> {
  const resolved = resolveSecretUpdate(incoming, encrypt);
  return resolved.change ? ({ [field]: resolved.value } as Partial<Record<K, string | null>>) : {};
}
