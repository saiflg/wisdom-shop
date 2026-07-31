import { SetMetadata } from "@nestjs/common";

export const STRICT_RATE_LIMIT_KEY = "strictRateLimit";

/**
 * Marks a route as credential-adjacent, so the strict `auth` throttler applies
 * to it on top of the ordinary global limit.
 *
 * The alternative — matching URL prefixes inside the throttler — silently
 * stops protecting a route the moment someone renames or re-mounts it. A
 * decorator moves with the handler.
 */
export const StrictRateLimit = () => SetMetadata(STRICT_RATE_LIMIT_KEY, true);
