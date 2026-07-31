export const REFRESH_COOKIE_NAME = "wisdom_shop_rt";

/** Scopes the refresh cookie to only the routes that read it. */
export const REFRESH_COOKIE_PATH = "/v1/auth";

/**
 * State-changing routes that accept the refresh cookie (login, refresh,
 * logout) require this header. It has no secret value — a cross-site form
 * POST cannot set custom headers without triggering a CORS preflight that
 * our CORS policy (single allowed origin) rejects, so this is a lightweight
 * CSRF mitigation on top of SameSite=strict cookies, not the sole defense.
 */
export const CSRF_HEADER_NAME = "x-wisdom-shop-csrf";
