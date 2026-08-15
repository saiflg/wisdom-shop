/**
 * Choosing the email address a payment gateway is given.
 *
 * Every provider validates this field and refuses the whole checkout if it
 * does not like it. Paystack answers "Invalid Email Address Passed", which
 * reaches the person paying as a refusal with no hint of what to do — and the
 * thing to do is always the same: put a real address on the family's record.
 *
 * The trap this exists to close: RFC 2606 reserves `.invalid`, `.example`,
 * `.test` and `.localhost` precisely so they can never resolve. They are the
 * natural things to type in seed data and in a "we have nothing better"
 * fallback, and they are guaranteed to be rejected by a real gateway. An
 * address can therefore be perfectly well-formed and still unusable.
 *
 * Pure, so the rules can be argued with in a test rather than discovered by a
 * parent at a payment page.
 */

/** Reserved by RFC 2606 and RFC 6761. None of these can ever receive mail. */
export const UNDELIVERABLE_TLDS: readonly string[] = ["invalid", "example", "test", "localhost"];

/** Reserved second-level names: example.com, example.net, example.org. */
const RESERVED_DOMAINS: readonly string[] = ["example.com", "example.net", "example.org"];

export function looksWellFormed(email: string): boolean {
  // Deliberately loose. The gateway is the real judge of deliverability; this
  // only catches what is obviously not an address at all.
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
}

export function hasUndeliverableDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return true;

  if (RESERVED_DOMAINS.includes(domain)) return true;

  const tld = domain.split(".").pop() ?? "";
  return UNDELIVERABLE_TLDS.includes(tld);
}

/**
 * Why this address cannot be sent to a gateway, or null.
 *
 * The messages name the address and say who fixes it. "Invalid email" tells
 * a bursar nothing about which of four hundred families to correct.
 */
export function payerEmailProblem(email: string | null | undefined): string | null {
  const trimmed = email?.trim();
  // Phrased as whole clauses rather than fragments, so they read correctly
  // wherever they are dropped in. A fragment that only works after one
  // particular prefix produces "has "x" uses a reserved domain".
  if (!trimmed) return "there is no email address on file";
  if (!looksWellFormed(trimmed)) return `the email address on file ("${trimmed}") is not valid`;
  if (hasUndeliverableDomain(trimmed)) {
    return `the email address on file ("${trimmed}") uses a reserved domain that payment providers always reject`;
  }
  return null;
}

export function isUsablePayerEmail(email: string | null | undefined): boolean {
  return payerEmailProblem(email) === null;
}

export interface PayerEmailChoice {
  email: string | null;
  /** Which candidate was taken, for the audit line and for support. */
  source: "GUARDIAN" | "STUDENT" | "SCHOOL" | null;
  /** Set only when nothing usable was found. Written for a bursar to act on. */
  problem: string | null;
}

export interface PayerCandidates {
  guardianEmails: (string | null)[];
  studentEmail: string | null;
  /** The school's own billing address, used only when the family has none. */
  schoolEmail: string | null;
}

/**
 * The first address a gateway will actually accept.
 *
 * A guardian first, because they are the one paying and the receipt should
 * reach them. Then the student. The school's own address last — a receipt in
 * the bursar's inbox is worth more than a checkout that cannot open, and the
 * office is who chases the family anyway.
 *
 * When nothing works the answer is an explanation, never a made-up address:
 * inventing one only moves the failure to the gateway, where the message
 * stops being actionable.
 */
export function choosePayerEmail(candidates: PayerCandidates): PayerEmailChoice {
  for (const email of candidates.guardianEmails) {
    if (isUsablePayerEmail(email)) return { email: email!.trim(), source: "GUARDIAN", problem: null };
  }

  if (isUsablePayerEmail(candidates.studentEmail)) {
    return { email: candidates.studentEmail!.trim(), source: "STUDENT", problem: null };
  }

  if (isUsablePayerEmail(candidates.schoolEmail)) {
    return { email: candidates.schoolEmail!.trim(), source: "SCHOOL", problem: null };
  }

  // Report the most useful of the failures: what is wrong with the address
  // somebody actually put on the record beats "no email address on file"
  // when there is one and it is simply unusable.
  const attempted = [...candidates.guardianEmails, candidates.studentEmail].find((value) => value?.trim());
  return {
    email: null,
    source: null,
    problem: attempted
      ? payerEmailProblem(attempted)
      : "there is no email address on file for this family",
  };
}

/**
 * What a bursar sees.
 *
 * Names the child, says what is wrong, and points at the two places that fix
 * it — both of which exist and are reachable by a school administrator.
 */
export function explainRefusal(choice: PayerEmailChoice, studentName: string): string {
  return (
    `This payment cannot be started for ${studentName}: ${choice.problem}. ` +
    `Add a working email address on the parent's record under Parents, ` +
    `or set the school's sender address under Settings → Communication.`
  );
}
