import { ApiError } from "@/lib/api";

/** Same reasoning as apps/web's copy — a locked/suspended school and a rate-limited device both deserve better than a generic error. */
export function describeSignInError(error: unknown, wrongCredentialsMessage: string): string {
  const generic = "Something went wrong signing you in. Please try again.";
  if (!(error instanceof ApiError)) return generic;

  switch (error.status) {
    case 401:
      return wrongCredentialsMessage;
    case 403:
      return error.message || "This school is not currently active.";
    case 429:
      return "Too many attempts from this device. Please wait a moment and try again.";
    default:
      return generic;
  }
}
