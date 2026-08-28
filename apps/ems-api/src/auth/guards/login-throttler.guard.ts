import { ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { loginAttemptKey } from "../login-attempt-key";

/**
 * The rate limiter for the two routes where guessing is worth something.
 *
 * `POST /v1/auth/login` and `POST /v1/platform/auth/login` are the only places
 * in the system where an unauthenticated stranger can test a secret and be
 * told whether they got it right. Until now the only thing in front of them
 * was the global limiter — 100 requests a minute from one address, no account
 * lockout, no end. That is 144,000 password attempts a day against one
 * account from a single machine, and rather more from several.
 *
 * Meanwhile the guardian invitation routes, where the prize is one family's
 * portal rather than a headteacher's password, are held to 5 and 10 a minute.
 * The comment there calls them "the only routes in the system where guessing a
 * value repeatedly would be worth anything". That was not true. This closes
 * the gap the invitation routes had already noticed.
 *
 * Counted per ACCOUNT, not per address — see login-attempt-key.ts for why an
 * IP limit tight enough to matter would lock a whole staffroom out at 08:00.
 *
 * This sits ALONGSIDE the global limiter rather than replacing it: this half
 * stops many guesses at one account, the global half stops one guess at many
 * accounts, and neither covers the other.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  /** Ten attempts on one account per quarter of an hour. */
  static readonly LIMIT = 10;
  static readonly WINDOW_MS = 15 * 60 * 1000;

  /**
   * The limits live here rather than in a `@Throttle()` on the route, and
   * that is deliberate.
   *
   * `@Throttle()` is metadata on the handler, and EVERY ThrottlerGuard in the
   * chain reads it — including the global one registered as an APP_GUARD,
   * which is keyed by IP address. Decorating the login route would therefore
   * hand the whole school a shared allowance of ten sign-ins per quarter hour,
   * which is precisely the staffroom lockout this design exists to avoid. The
   * trap is that it would look right in review and only fail at 08:00 on a
   * Monday in a building the reviewer has never been in.
   *
   * Keeping the numbers in the guard leaves the global limiter untouched and
   * still doing its job on these routes.
   */
  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    this.throttlers = [
      {
        name: "account",
        limit: LoginThrottlerGuard.LIMIT,
        ttl: LoginThrottlerGuard.WINDOW_MS,
      },
    ];
  }

  /**
   * Guards run after the body parser and before the validation pipe, so the
   * body is here but has NOT been validated — every field is still whatever
   * the caller posted. loginAttemptKey treats it accordingly.
   */
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const key = loginAttemptKey(req.body);
    if (key) return key;

    // No email to attribute the attempt to. Falling back to the address is
    // the safe direction: a caller who omits the field does not get a free
    // pass, and cannot exhaust anybody else's allowance either.
    return `addr:${String(req.ip ?? "unknown")}`;
  }

  /**
   * Namespaced away from the global limiter, which is keyed by address and
   * running on the same store. Without the prefix a school's ordinary traffic
   * and its login attempts would share one counter and neither number would
   * mean what it says.
   */
  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    return `login:${name}:${suffix}`;
  }
}
