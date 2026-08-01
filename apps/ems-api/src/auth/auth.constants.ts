export const REFRESH_COOKIE_NAME = "wisdom_campus_rt";
export const REFRESH_COOKIE_PATH = "/v1/auth";

/**
 * Lightweight CSRF mitigation on top of SameSite=strict cookies — a header
 * with no secret value, cheap enough that dropping it wouldn't buy anything
 * (same reasoning as the shop's own CsrfHeaderGuard). Not a real
 * double-submit token scheme; that's still deferred per the phase's scope.
 */
export const CSRF_HEADER_NAME = "x-wisdom-campus-csrf";
