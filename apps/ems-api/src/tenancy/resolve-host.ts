/**
 * Works out which school a request is addressed to from its hostname.
 *
 * Until now the school was named explicitly — a `schoolSlug` field on the
 * login form, and nothing else in the app ever had to ask. A school on its
 * own subdomain (`st-marys.campus.example.com`) or its own domain
 * (`portal.stmarys.sch.ng`) has to be recognised before anyone has logged
 * in, because the login page itself is the first thing that must wear the
 * school's name and colours.
 *
 * **A hostname is not authority.** Everything here decides *which* school's
 * public face to show, and nothing more. The Host header is set by whoever
 * made the request, so treating it as proof of identity would let anyone
 * name any tenant. Credentials are still checked against that school's own
 * database, and every authenticated request still derives its tenant from
 * the JWT (see tenant-context.interceptor.ts) rather than from the URL it
 * arrived on. The worst a forged Host can do is show an attacker a login
 * page with somebody else's logo on it.
 */

export type HostResolution =
  /** A `<slug>.<baseDomain>` subdomain. The slug still has to exist. */
  | { kind: "subdomain"; slug: string }
  /** Some other hostname — a candidate for a custom-domain lookup. */
  | { kind: "custom"; hostname: string }
  /** The apex, an IP, a reserved label, or nonsense. Fall back to asking. */
  | { kind: "none" };

/**
 * Labels that must never resolve to a school even if one claims the slug.
 *
 * `www` and `app` are the marketing and platform surfaces; `api` is this
 * service; `platform`/`admin`/`super` front the Super Admin console. A
 * school that managed to register the slug `api` would otherwise quietly
 * take over a hostname the platform depends on — cheaper to refuse the
 * handful of names than to discover which one mattered.
 */
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "platform",
  "super",
  "mail",
  "smtp",
  "static",
  "assets",
  "cdn",
  "status",
]);

/**
 * The same shape a school slug takes everywhere else: lowercase, digits and
 * inner hyphens. Deliberately re-derived here rather than imported from the
 * onboarding DTO — this one is guarding what a *stranger* can put in a Host
 * header, and it should not loosen because a validation rule elsewhere did.
 */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** Bare IPv4, and anything wrapped in brackets, which is IPv6. */
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Strips the port, lowercases, and removes the trailing dot of a fully
 * qualified name.
 *
 * `EXAMPLE.com.` and `example.com:443` are the same host as `example.com`,
 * and a comparison that misses that is a comparison an attacker can dodge.
 * IPv6 literals arrive bracketed (`[::1]:4001`); they can never be a school
 * host, but they must not be mangled into something that looks like one.
 */
export function normaliseHostname(rawHost: string): string {
  const trimmed = rawHost.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const close = trimmed.indexOf("]");
    return close === -1 ? trimmed : trimmed.slice(0, close + 1);
  }
  const withoutPort = trimmed.split(":")[0] ?? "";
  return withoutPort.endsWith(".") ? withoutPort.slice(0, -1) : withoutPort;
}

/**
 * Classifies a hostname against the platform's base domain.
 *
 * `baseDomain` empty (the default) turns subdomain routing off entirely:
 * every host is then a custom-domain candidate, and a deployment that has
 * not configured a base domain behaves exactly as it did before this
 * existed. That is the point — the slug field on the login form is the
 * fallback, not a legacy path to be removed.
 */
export function resolveHost(rawHost: string | undefined, baseDomain: string): HostResolution {
  if (!rawHost) return { kind: "none" };

  const hostname = normaliseHostname(rawHost);
  if (!hostname) return { kind: "none" };

  // An IP address addresses a server, never a school. Someone reaching the
  // API by IP gets the fallback, not a guess.
  if (IPV4.test(hostname) || hostname.startsWith("[")) return { kind: "none" };

  const base = normaliseHostname(baseDomain);
  if (base) {
    if (hostname === base) return { kind: "none" };

    const suffix = `.${base}`;
    if (hostname.endsWith(suffix)) {
      const label = hostname.slice(0, -suffix.length);

      // `a.b.campus.example.com` is not a school — it is either a mistake or
      // someone probing for one. Only a single label directly under the base
      // domain counts, because that is the only shape we issue.
      if (label.includes(".")) return { kind: "none" };
      if (RESERVED_SUBDOMAINS.has(label)) return { kind: "none" };
      if (!SLUG.test(label)) return { kind: "none" };

      return { kind: "subdomain", slug: label };
    }
  }

  // Not under the base domain. It may be a school's own domain, which only
  // the control database can confirm.
  return { kind: "custom", hostname };
}
