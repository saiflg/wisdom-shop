/**
 * @jest-environment node
 *
 * Node, not jsdom: `NextRequest` extends the platform `Request`, which jsdom
 * does not provide, and middleware runs on the server anyway. Importing
 * `next/server` under jsdom fails at import time with "Request is not
 * defined" — before a single test runs.
 */
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

/**
 * The slug decides which school's name, logo and colours a stranger is shown
 * before anyone has logged in. It is not an identity — credentials are still
 * checked against that school's own database — but it is attacker-controlled
 * text that reaches a lookup, so what it may contain is worth pinning.
 */

const HEADER = "x-school-slug";
const COOKIE = "wisdom-school";

function requestFor(url: string, cookie?: string): NextRequest {
  const request = new NextRequest(new URL(url, "http://localhost:3001"));
  if (cookie) request.cookies.set(COOKIE, cookie);
  return request;
}

/**
 * The slug the layout will actually act on.
 *
 * Empty counts as nothing resolved — the middleware sets the header to ""
 * rather than deleting it, and the layout reads it with `||` for exactly
 * that reason. Asserting on the raw header instead would pass while the
 * layout did something different.
 */
function resolvedSlug(url: string, cookie?: string): string | null {
  const response = middleware(requestFor(url, cookie));
  return response.headers.get("x-middleware-request-" + HEADER) || null;
}

describe("resolving the school for the layout", () => {
  it("takes the slug from the query string", () => {
    expect(resolvedSlug("/login?schoolSlug=demo-academy")).toBe("demo-academy");
  });

  it("falls back to the cookie when the URL says nothing", () => {
    // What keeps the colours after navigating away from the link that
    // named the school.
    expect(resolvedSlug("/dashboard", "demo-academy")).toBe("demo-academy");
  });

  it("lets the query beat the cookie", () => {
    // Following a link for a different school should switch to it, not show
    // the last one because a cookie outranked the URL.
    expect(resolvedSlug("/login?schoolSlug=other-school", "demo-academy")).toBe("other-school");
  });

  it("lowercases and trims what it was given", () => {
    expect(resolvedSlug("/login?schoolSlug=%20Demo-Academy%20")).toBe("demo-academy");
  });

  it("sets nothing at all when there is no slug anywhere", () => {
    expect(resolvedSlug("/login")).toBeNull();
  });
});

describe("an invitation link, which carries its school in the path", () => {
  it("takes the slug from the path", () => {
    // The token is the rest of the path and must not reach a query string,
    // so the slug travels there too — and the layout still has to find it,
    // or the page is painted in some other school's colours.
    expect(resolvedSlug("/invite/demo-academy/sometoken")).toBe("demo-academy");
  });

  it("lets the path beat a stale cookie", () => {
    expect(resolvedSlug("/invite/other-school/sometoken", "demo-academy")).toBe("other-school");
  });

  it("remembers it, so the sign-in page after it still looks like their school", () => {
    const response = middleware(requestFor("/invite/demo-academy/sometoken"));
    expect(response.cookies.get(COOKIE)?.value).toBe("demo-academy");
  });

  it("refuses a slug the path cannot legitimately contain", () => {
    expect(resolvedSlug("/invite/..%2F..%2Fetc/sometoken")).toBeNull();
    expect(resolvedSlug("/invite/Not A Slug/sometoken")).toBeNull();
  });

  it("ignores a token-shaped first segment on some other route", () => {
    // Only /invite/<slug>/… means anything; /students/demo-academy/… does not.
    expect(resolvedSlug("/students/demo-academy/x")).toBeNull();
  });

  it("needs the segment after the slug, so a bare /invite/<slug> resolves nothing", () => {
    expect(resolvedSlug("/invite/demo-academy")).toBeNull();
  });
});

describe("what a slug may contain", () => {
  // Each of these would otherwise be handed to a lookup, or reflected into
  // a page, purely because someone put it in a query string.
  const refused = [
    "../../etc/passwd",
    "demo academy",
    "demo_academy",
    "<script>alert(1)</script>",
    "demo-academy;drop",
    "-leading-hyphen",
    "trailing-hyphen-",
    "a".repeat(80),
    "%2e%2e",
    "school.example.com",
  ];

  it.each(refused)("refuses %j", (slug) => {
    expect(resolvedSlug(`/login?schoolSlug=${encodeURIComponent(slug)}`)).toBeNull();
  });

  it("refuses a bad cookie as firmly as a bad query", () => {
    // A cookie is no more trustworthy than a URL; both are set by the client.
    expect(resolvedSlug("/dashboard", "../other")).toBeNull();
  });

  it("accepts the ordinary shapes a real slug takes", () => {
    for (const slug of ["a", "st-marys", "school123", "demo-academy-2"]) {
      expect(resolvedSlug(`/login?schoolSlug=${slug}`)).toBe(slug);
    }
  });
});

describe("the header a client sent", () => {
  // The middleware must be the only source of this header. Next forwards
  // only the headers it sees *change* — so `headers.delete()` looks right
  // and does nothing: the list comes back empty and the client's own header
  // travels through untouched. Setting it, even to "", overrides it.

  it("is overridden with empty when nothing resolves", () => {
    const request = new NextRequest(new URL("http://localhost:3001/login"), {
      headers: { [HEADER]: "someone-elses-school" },
    });
    const response = middleware(request);

    expect(response.headers.get("x-middleware-override-headers")).toContain(HEADER);
    expect(response.headers.get("x-middleware-request-" + HEADER)).toBe("");
  });

  it("never lets a spoofed header survive alongside a real slug", () => {
    const request = new NextRequest(
      new URL("http://localhost:3001/login?schoolSlug=demo-academy"),
      { headers: { [HEADER]: "someone-elses-school" } },
    );
    expect(middleware(request).headers.get("x-middleware-request-" + HEADER)).toBe("demo-academy");
  });

  it("overrides it even when the client sends a slug that would be valid", () => {
    // Valid-looking is not the same as resolved-by-us.
    const request = new NextRequest(new URL("http://localhost:3001/dashboard"), {
      headers: { [HEADER]: "valid-looking-school" },
    });
    expect(middleware(request).headers.get("x-middleware-request-" + HEADER)).toBe("");
  });
});

describe("remembering the school", () => {
  it("sets the cookie when the slug came from the URL", () => {
    const response = middleware(requestFor("/login?schoolSlug=demo-academy"));
    expect(response.cookies.get(COOKIE)?.value).toBe("demo-academy");
  });

  it("does not re-set it when the slug came from the cookie already", () => {
    const response = middleware(requestFor("/dashboard", "demo-academy"));
    expect(response.cookies.get(COOKIE)).toBeUndefined();
  });

  it("does not remember a slug it refused", () => {
    const response = middleware(requestFor("/login?schoolSlug=../nope"));
    expect(response.cookies.get(COOKIE)).toBeUndefined();
  });
});
