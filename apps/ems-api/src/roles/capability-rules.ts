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
