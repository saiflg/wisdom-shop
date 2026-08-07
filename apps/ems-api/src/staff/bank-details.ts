/**
 * Bank detail handling for staff records.
 *
 * A staff member's account number is the one field in this system that can be
 * used to defraud a person directly, so the default everywhere is the masked
 * form. The full value exists only where payroll genuinely needs it, and
 * getting hold of it is a deliberate act rather than a side effect of listing
 * staff.
 *
 * Pure and synchronous: the rules about what may be shown should be readable
 * and testable without a database or an encryption key in the way.
 */

export interface BankDetailsInput {
  bankName?: string | null;
  bankCode?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
}

/** What a staff record looks like once it is safe to serialise. */
export interface MaskedBankDetails {
  bankName: string | null;
  bankCode: string | null;
  accountName: string | null;
  /** Last four digits only, e.g. "••••6789". Null when nothing is on file. */
  accountNumberMasked: string | null;
  hasAccountNumber: boolean;
}

const DIGITS_ONLY = /^\d+$/;

/**
 * Masks an account number to its last four digits.
 *
 * A fixed-width mask, not one bullet per hidden digit: the length of an
 * account number is itself a clue to which country and bank it belongs to,
 * and there is no reason to give that away for free. Anything with four or
 * fewer digits is masked completely — showing "the last four" of a
 * four-digit number would show all of it.
 */
export function maskAccountNumber(accountNumber: string | null | undefined): string | null {
  const trimmed = accountNumber?.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}

/**
 * Checks an account number is plausible before it is stored.
 *
 * Deliberately permissive about length — account numbers run from 8 digits in
 * some countries to 18 in others, and rejecting a valid one means a staff
 * member does not get paid. Digits only, though: a number with a stray letter
 * is a typo, and a typo here pays a stranger.
 */
export function validateAccountNumber(accountNumber: string): string | null {
  const trimmed = accountNumber.trim();
  if (!trimmed) return "An account number is needed";
  if (!DIGITS_ONLY.test(trimmed)) return "An account number should be digits only";
  if (trimmed.length < 6) return "That account number looks too short";
  if (trimmed.length > 20) return "That account number looks too long";
  return null;
}

/**
 * Checks a bank/sort code. Not a secret — it identifies a bank, not an
 * account — so this only guards against obvious nonsense.
 */
export function validateBankCode(bankCode: string): string | null {
  const trimmed = bankCode.trim();
  if (!trimmed) return null;
  if (!/^[A-Za-z0-9-]{2,20}$/.test(trimmed)) return "That bank code contains unexpected characters";
  return null;
}

export function validateBankDetails(input: BankDetailsInput): string | null {
  if (input.accountNumber !== undefined && input.accountNumber !== null && input.accountNumber.trim() !== "") {
    const problem = validateAccountNumber(input.accountNumber);
    if (problem) return problem;
    // An account number with no name against it cannot be reconciled when a
    // payment bounces, which is precisely when someone needs to know whose
    // it was.
    if (!input.accountName?.trim()) return "An account number needs the name on the account";
  }
  if (input.bankCode) {
    const problem = validateBankCode(input.bankCode);
    if (problem) return problem;
  }
  return null;
}

/**
 * The safe projection of a staff member's bank details.
 *
 * Takes the already-decrypted account number and returns a shape that has no
 * field capable of carrying the full value — so a route that forgets to mask
 * cannot leak, because there is nowhere for the plaintext to go.
 */
export function toMaskedBankDetails(
  record: {
    bankName?: string | null;
    bankCode?: string | null;
    accountName?: string | null;
  },
  accountNumber: string | null,
): MaskedBankDetails {
  return {
    bankName: record.bankName ?? null,
    bankCode: record.bankCode ?? null,
    accountName: record.accountName ?? null,
    accountNumberMasked: maskAccountNumber(accountNumber),
    hasAccountNumber: Boolean(accountNumber?.trim()),
  };
}
