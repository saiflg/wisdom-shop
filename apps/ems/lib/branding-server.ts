import { headers } from "next/headers";
import type { ResolvedBranding } from "./branding";

/**
 * The server half of branding: the one call that needs the incoming
 * request's headers.
 *
 * Split from branding.ts rather than sitting beside the colour maths. The
 * settings page is a client component and imports `brandRamp` for its live
 * preview; when `next/headers` lived in that same module it was dragged
 * into the client bundle with it and broke the build — while typecheck,
 * lint and every unit test stayed green. Only opening the page found it.
 *
 * The `server-only` package would turn that class of mistake into a clear
 * error naming the offending import, and is worth adding whenever this app
 * next takes a dependency for another reason. It is not pulled in for this
 * alone: the repo root is not bind-mounted into the dev container, so a
 * lockfile written in there would not reach the host's, and CI installs
 * with --frozen-lockfile.
 */

const UNBRANDED: ResolvedBranding = { resolvedFrom: "none", branding: null };

/**
 * Fetches the branding for the school this request is addressed to.
 *
 * **Against EMS_API_URL directly rather than through the same-origin rewrite
 * in next.config.mjs.** That rewrite is a proxy: it replaces the Host header
 * with the destination's own (`ems-api:4001`), so a branding lookup sent
 * through it would ask "which school is ems-api?" on every request and
 * always get "none". The browser's hostname is forwarded explicitly
 * instead, which is what a reverse proxy does in production anyway.
 */
export async function getBranding(explicitSlug?: string): Promise<ResolvedBranding> {
  const apiUrl = process.env.EMS_API_URL ?? "http://localhost:4001";
  const host = headers().get("host") ?? "";

  const url = new URL("/v1/branding/public", apiUrl);
  if (explicitSlug) url.searchParams.set("schoolSlug", explicitSlug);

  try {
    const res = await fetch(url, {
      headers: { "x-forwarded-host": host },
      // A school changing its colours should show up on the next page load,
      // not whenever Next decides to revalidate. This is one small request
      // to a service on the same network.
      cache: "no-store",
    });
    if (!res.ok) return UNBRANDED;
    return (await res.json()) as ResolvedBranding;
  } catch {
    // The console must still render if the API is briefly unreachable —
    // unbranded, but not a crashed page. The login form falls back to
    // asking which school you mean, which is what it always did.
    return UNBRANDED;
  }
}
