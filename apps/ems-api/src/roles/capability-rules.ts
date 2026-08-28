export type RoleName = "SCHOOL_ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN";

export const ALL_ROLES: RoleName[] = ["SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN"];

export interface RouteCapability {
  method: string;
  path: string;
  /** Null means the route carries no @Roles at all. */
  roles: RoleName[] | null;
  /** The purchasable module this belongs to, if any. */
  module: string | null;
  /**
   * Reachable without signing in at all — a webhook, the login page.
   *
   * A separate fact from having no @Roles, and a louder one. This screen
   * originally reported these as "everyone signed in", which understated
   * them: the people who can reach them have not signed in.
   */
  isPublic: boolean;
  /**
   * Belongs to the super-admin console, which authenticates in its own realm.
   *
   * No school user can reach one whatever role they hold, so counting them
   * among what a teacher can reach — which this screen originally did —
   * inflated every figure on the page.
   */
  isPlatform: boolean;
  /**
   * The guard class names actually attached to this route or its controller.
   *
   * Read at runtime rather than inferred: `@Public()` says which guard is
   * SKIPPED, and says nothing about which ones were added back.
   */
  guards: string[];
  summary: string | null;
}

/**
 * Who can reach a route.
 *
 * The case that matters is `null`. A route with no `@Roles` is not a route
 * nobody can reach — it is one EVERY signed-in person can reach, and reading
 * it the other way round is how a permissions screen ends up reassuring
 * somebody about a route that is open to the whole school. The API's own
 * route-guard test exists for the same reason.
 */
export function audienceOf(roles: RoleName[] | null): RoleName[] {
  return roles === null ? [...ALL_ROLES] : roles;
}

/**
 * Whether a school user can reach this route at all.
 *
 * Platform routes cannot be reached by any school account, whatever role it
 * holds — they belong to the super-admin console and authenticate separately.
 * Counting them as reachable was the bug that made every figure on this
 * screen too large.
 */
export function reachableBySchoolUser(route: RouteCapability): boolean {
  return !route.isPlatform;
}

/** How that audience reads on a screen. */
export function describeAudience(roles: RoleName[] | null, route?: RouteCapability): string {
  if (route?.isPlatform) return "Super Admin console only";
  if (route?.isPublic) return "Anyone, without signing in";
  if (roles === null) return "Everyone signed in";
  if (roles.length === 0) return "Nobody";
  if (roles.length === ALL_ROLES.length) return "Everyone signed in";

  const labels: Record<RoleName, string> = {
    SCHOOL_ADMIN: "Administrators",
    TEACHER: "Teachers",
    STUDENT: "Students",
    GUARDIAN: "Parents",
  };
  return roles.map((role) => labels[role] ?? role).join(", ");
}

/** Can this role reach this route? */
export function roleCanReach(route: RouteCapability, role: RoleName): boolean {
  if (!reachableBySchoolUser(route)) return false;
  return audienceOf(route.roles).includes(role);
}

/**
 * The area a route belongs to, taken from its first path segment.
 *
 * Grouping by the path rather than by the controller class name, because the
 * path is what a school recognises: somebody wondering who can see fees
 * looks for "fees", not for "FeesController".
 */
export function areaOf(path: string): string {
  const cleaned = path.replace(/^\/+/, "");
  const first = cleaned.split("/")[0] ?? "";
  return first || "root";
}

export interface AreaSummary {
  area: string;
  routes: RouteCapability[];
  /** Roles that can reach at least one route in this area. */
  reachedBy: RoleName[];
  /** Routes here that carry no @Roles at all, reachable by any signed-in person. */
  openRoutes: number;
  /** Routes here reachable without signing in at all. */
  publicRoutes: number;
  modules: string[];
}

/**
 * Routes grouped into areas, in a stable order.
 *
 * Sorted by name rather than by size: this is a reference, and somebody
 * looking for "fees" should find it in the same place every time rather than
 * wherever its route count happens to put it today.
 */
export function groupByArea(routes: RouteCapability[]): AreaSummary[] {
  const areas = new Map<string, RouteCapability[]>();
  for (const route of routes) {
    const area = areaOf(route.path);
    areas.set(area, [...(areas.get(area) ?? []), route]);
  }

  return [...areas.entries()]
    .map(([area, list]) => ({
      area,
      routes: [...list].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
      reachedBy: ALL_ROLES.filter((role) => list.some((route) => roleCanReach(route, role))),
      openRoutes: list.filter((route) => route.roles === null && !route.isPublic && !route.isPlatform)
        .length,
      publicRoutes: list.filter((route) => route.isPublic).length,
      modules: [...new Set(list.map((route) => route.module).filter((m): m is string => m !== null))].sort(),
    }))
    .sort((a, b) => a.area.localeCompare(b.area));
}

/** How many routes each role can reach in total. */
export function countsByRole(routes: RouteCapability[]): Record<RoleName, number> {
  const counts = { SCHOOL_ADMIN: 0, TEACHER: 0, STUDENT: 0, GUARDIAN: 0 };
  for (const route of routes) {
    for (const role of ALL_ROLES) {
      if (roleCanReach(route, role)) counts[role] += 1;
    }
  }
  return counts;
}

/**
 * Guards that demand a credential before the handler runs.
 *
 * `@Public()` in this API does NOT mean "anybody may call this". It means
 * "skip the tenant JwtAuthGuard", and it is routinely paired with a guard
 * from another realm — the whole Super Admin console is `@Public()` plus
 * `@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)`, and the refresh and
 * logout routes are `@Public()` plus a guard that requires a refresh token.
 *
 * Counting `@Public()` on its own therefore reports 47 routes as reachable by
 * a stranger when the true figure is 9. That number appeared on this screen,
 * under a heading a headteacher would read as "how exposed are we". It was
 * wrong by a factor of five, and wrong in the frightening direction while
 * individually labelling 38 of those same routes "Super Admin console only"
 * three inches below.
 */
export const AUTHENTICATING_GUARDS = [
  "PlatformJwtAuthGuard",
  "PlatformRolesGuard",
  "PlatformRefreshGuard",
  "JwtRefreshGuard",
  "TwoFactorChallengeGuard",
] as const;

/**
 * Guards that run on a route without asking who is calling.
 *
 * Listed rather than assumed. A rate limiter counts requests and a CSRF check
 * inspects a header; neither establishes an identity, so neither makes a route
 * any harder for a stranger to reach.
 */
export const NON_AUTHENTICATING_GUARDS = ["LoginThrottlerGuard", "ThrottlerGuard", "CsrfHeaderGuard"] as const;

/**
 * Whether a stranger with no credential at all can reach this route.
 *
 * Unrecognised guards are deliberately NOT given a default. A guard nobody has
 * classified is a guard nobody has thought about, and guessing either way
 * writes a number onto a security screen that no one has checked: guess
 * "authenticating" and a genuinely open route disappears from the count;
 * guess "open" and the count inflates again exactly as it did before. The
 * caller is told, and the test below fails until somebody decides.
 */
export function classifyGuards(guards: string[]): { authenticates: boolean; unknown: string[] } {
  const unknown = guards.filter(
    (guard) =>
      !(AUTHENTICATING_GUARDS as readonly string[]).includes(guard) &&
      !(NON_AUTHENTICATING_GUARDS as readonly string[]).includes(guard),
  );

  const authenticates = guards.some((guard) => (AUTHENTICATING_GUARDS as readonly string[]).includes(guard));

  return { authenticates, unknown };
}

/**
 * The honest answer to "could someone who has never signed in call this?".
 *
 * Platform routes are excluded even before their guards are read: they belong
 * to a console with its own login, and a school reading this screen is not
 * asking about it.
 */
export function reachableWithoutSigningIn(route: {
  isPublic: boolean;
  isPlatform: boolean;
  guards: string[];
}): boolean {
  if (!route.isPublic) return false;
  if (route.isPlatform) return false;
  return !classifyGuards(route.guards).authenticates;
}
