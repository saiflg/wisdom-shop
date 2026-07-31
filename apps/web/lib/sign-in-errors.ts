import { ApiError } from "@/lib/api";

/**
 * Turns a failed sign-in into something the person reading it can act on.
 *
 * A locked account (403) and a rate-limited device (429) both used to fall
 * into the generic "something went wrong", which invites the one response
 * that makes both worse: trying again immediately. The server's own message
 * for a lock carries the remaining wait, so it is shown rather than
 * paraphrased.
 *
 * Lives outside the form component so the mapping can be tested directly —
 * these are the strings a locked-out user reads, and getting them wrong is
 * not visible from a screenshot.
 */
export function describeSignInError(error: unknown, wrongCredentialsMessage: string): string {
  const generic = "Something went wrong signing you in. Please try again.";
  if (!(error instanceof ApiError)) return generic;

  switch (error.status) {
    case 401:
      return wrongCredentialsMessage;
    case 403:
      return error.message || "Too many failed sign-in attempts. Please wait and try again.";
    case 429:
      return "Too many attempts from this device. Please wait a moment and try again.";
    default:
      return generic;
  }
}
