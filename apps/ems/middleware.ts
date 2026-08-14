import { NextResponse, type NextRequest } from "next/server";

/**
 * Carries the school's slug from the URL into the root layout, and remembers
 * it for the rest of the session.
 *
 * The layout resolves branding from the *hostname*, which is right when a
 * school has its own subdomain or domain. Where it has neither — a
 * deployment with no base domain, or the shop's handoff links — the slug
 * arrives as `?schoolSlug=`, and a layout cannot read search parameters.
 * The result was a login page wearing the school's name, tagline and logo
 * in the platform's default colours: half-branded, and worse than not
 * branded at all, because it looks like the school's own page is broken.
 *
 * Middleware is the only place that sees both the query string and the
 * cookies before the layout renders, which is why this exists rather than
 * the page passing the slug down.
 *
 * **The slug selects a public face, never an identity.** It is the same
 * value already accepted from the login form and from anyone's query
 * string, and it can only cause a different school's name and colours to be
 * shown. Authentication is unchanged: credentials are checked against that
 * school's own database, and every authenticated request takes its tenant
 * from the JWT. See resolve-host.ts in the API for the same reasoning about
 * the Host header.
 */

/** One year. The cookie only remembers which login page to paint. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const COOKIE = "wisdom-school";
const HEADER = "x-school-slug";

/**
 * The same shape a slug takes everywhere else.
 *
 * Re-derived here rather than imported, for the reason resolve-host.ts gives
 * for its own copy: this one guards what a stranger may put in a query
 * string, and it must not loosen because a validation rule elsewhere did.
 */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * An invitation link carries its school in the path, not the query.
 *
 * Deliberately, because a query string is the part of a URL that reaches
 * server logs, proxy logs and Referer headers, and the rest of that path is
 * a one-time credential. Without this the layout would fall back to a stale
 * cookie and paint the page in some other school's colours — the exact
 * half-branded failure this file already exists to prevent.
 */
function slugFromPath(pathname: string): string | undefined {
  return /^\/invite\/([^/]+)\//.exec(pathname)?.[1]?.trim().toLowerCase();
}

export function middleware(request: NextRequest) {
  const fromQuery = request.nextUrl.searchParams.get("schoolSlug")?.trim().toLowerCase();
  const fromPath = slugFromPath(request.nextUrl.pathname);
  const fromCookie = request.cookies.get(COOKIE)?.value;

  // The URL wins over the cookie: following a link for a different school
  // should switch to it, not show the last one because a cookie outranked
  // the URL. Path and query are both "the URL"; neither can outrank the
  // other because no route carries both.
  const slug = [fromQuery, fromPath, fromCookie].find((value) => value && SLUG.test(value));

  const headers = new Headers(request.headers);
  // Always set, never deleted — set to empty when nothing resolved.
  //
  // `delete` looks like it should work and does nothing. Next forwards only
  // the headers it sees *change*, listed in `x-middleware-override-headers`;
  // deleting one leaves that list empty, so a header the client sent under
  // this name travels straight through to the layout, which would then trust
  // it. Setting it — even to "" — puts it in the override list and replaces
  // whatever arrived.
  //
  // The exposure was small, since branding is public and the worst case is a
  // login page wearing the wrong school's name. It was still a surface this
  // file created, and the comment that used to sit here claimed a protection
  // it did not provide. Its own test caught that.
  headers.set(HEADER, slug ?? "");

  const response = NextResponse.next({ request: { headers } });

  // Remembered from either form of URL, so a parent who finishes setting up
  // and lands on the sign-in page still sees their own school's colours.
  if (slug && (slug === fromQuery || slug === fromPath)) {
    response.cookies.set(COOKIE, slug, {
      maxAge: COOKIE_MAX_AGE,
      sameSite: "lax",
      path: "/",
      // Readable by script on purpose: it holds no secret, and being able to
      // clear it from the console is useful. httpOnly would imply otherwise.
      httpOnly: false,
    });
  }

  return response;
}

export const config = {
  // Static assets and the API proxy never render the layout, so resolving a
  // slug for them is pure overhead on every image request.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|v1/).*)"],
};
