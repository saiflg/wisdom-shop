/**
 * An example admission number, for a hint on the new-student form.
 *
 * **Display only.** The real number is issued by the API — see
 * `apps/ems-api/src/students/admission-number.ts`, which owns the format,
 * the noise words and the serial. This exists so an administrator sees their
 * own school's letters in the hint instead of a made-up "ABC/2026/0001", and
 * is deliberately the simple version: if the two ever disagree, the example
 * is slightly off for one form field, and nothing is issued wrongly.
 */
export function admissionNumberExample(schoolName: string | null | undefined): string {
  const words = (schoolName ?? "")
    .replace(/['’]/g, "")
    .split(/[\s-]+/)
    .filter((word) => word && !["of", "the", "and", "for", "de", "la", "at"].includes(word.toLowerCase()));

  const [first] = words;
  const letters =
    !first
      ? "SCH"
      : words.length === 1
        ? first.slice(0, 3).toUpperCase()
        : words
            .map((word) => word.charAt(0))
            .join("")
            .slice(0, 4)
            .toUpperCase();

  return `${letters}/${new Date().getFullYear()}/0001`;
}
