import { Injectable } from "@nestjs/common";
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from "@nestjs/common/constants";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { RequestMethod } from "@nestjs/common";
import { ROLES_KEY } from "@/auth/decorators/roles.decorator";
import { IS_PUBLIC_KEY } from "@/auth/decorators/public.decorator";
import { PLATFORM_ROLES_KEY } from "@/platform-auth/decorators/platform-roles.decorator";
import { REQUIRES_MODULE_KEY } from "@/schools/decorators/requires-module.decorator";
import {
  countsByRole,
  groupByArea,
  reachableWithoutSigningIn,
  type RoleName,
  type RouteCapability,
} from "./capability-rules";

const METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: "GET",
  [RequestMethod.POST]: "POST",
  [RequestMethod.PUT]: "PUT",
  [RequestMethod.DELETE]: "DELETE",
  [RequestMethod.PATCH]: "PATCH",
  [RequestMethod.ALL]: "ALL",
  [RequestMethod.OPTIONS]: "OPTIONS",
  [RequestMethod.HEAD]: "HEAD",
};

@Injectable()
export class RolesService {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  /**
   * What each role can actually reach.
   *
   * Read from the running application's own route metadata — the same
   * `@Roles` and `@RequiresModule` the guards read — rather than from a list
   * somebody maintains alongside them. A hand-written permissions matrix is
   * accurate on the day it is written and wrong by the third release, and the
   * failure is silent: it goes on reassuring an administrator about
   * restrictions that were removed months ago.
   *
   * This cannot drift. If it is wrong, the guards are wrong too.
   */
  capabilities() {
    const routes: RouteCapability[] = [];

    for (const wrapper of this.discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;

      const controllerPath = this.reflector.get<string>(PATH_METADATA, metatype) ?? "";
      const prototype = Object.getPrototypeOf(instance);

      for (const methodName of this.scanner.getAllMethodNames(prototype)) {
        const handler = prototype[methodName];
        const methodPath = this.reflector.get<string>(PATH_METADATA, handler);
        if (methodPath === undefined) continue;

        const verb = this.reflector.get<number>(METHOD_METADATA, handler);

        // getAllAndOverride, not get: a method-level @Roles overrides the
        // controller's, and a controller-level one applies to every method
        // that does not have its own. Reading only the handler would report
        // every route on a class-guarded controller as open to everybody —
        // which is the exact mistake this screen exists to prevent.
        const roles =
          this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [handler, metatype]) ?? null;
        const module =
          this.reflector.getAllAndOverride<string>(REQUIRES_MODULE_KEY, [handler, metatype]) ?? null;

        /*
         * Two realms this screen originally confused with "everyone".
         *
         * @Public means reachable WITHOUT signing in — a webhook, the login
         * page. Reporting one as "everyone signed in" understated it: the
         * people who can reach it have not signed in at all.
         *
         * @PlatformRoles means the super-admin console, which authenticates
         * separately. No school account can reach one whatever role it holds,
         * so counting them inflated every figure on the page.
         */
        const isPublic =
          this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, metatype]) === true;
        const isPlatform =
          this.reflector.getAllAndOverride<string[]>(PLATFORM_ROLES_KEY, [handler, metatype]) !== undefined;

        /*
         * The guards actually attached, read from Nest's own metadata.
         *
         * @Public() records which guard is SKIPPED and says nothing about
         * which were added back, so it cannot answer "can a stranger reach
         * this" on its own. Every /platform route is @Public() plus the
         * console's guard stack; refresh and logout are @Public() plus a
         * guard that demands a refresh token.
         */
        const guards = [
          ...(this.reflector.get<unknown[]>(GUARDS_METADATA, handler) ?? []),
          ...(this.reflector.get<unknown[]>(GUARDS_METADATA, metatype) ?? []),
        ].map((guard) =>
          typeof guard === "function"
            ? guard.name
            : ((guard as { constructor?: { name?: string } })?.constructor?.name ?? ""),
        );

        routes.push({
          method: METHOD_NAMES[verb] ?? "GET",
          path: [controllerPath, methodPath].filter(Boolean).join("/").replace(/\/+/g, "/"),
          roles,
          module,
          isPublic,
          isPlatform,
          guards,
          summary: null,
        });
      }
    }

    const areas = groupByArea(routes);

    return {
      areas,
      counts: countsByRole(routes),
      totalRoutes: routes.length,
      // Counted separately so the headline figures describe what a school
      // account can actually reach.
      platformRoutes: routes.filter((route) => route.isPlatform).length,
      // NOT `isPublic` on its own. That counted the whole Super Admin console
      // and every refresh route as reachable by a stranger — 47 where the
      // true figure is 9 — on a screen a headteacher reads as "how exposed
      // are we", while labelling those same routes "Super Admin console only"
      // in the list underneath.
      publicRoutes: routes.filter((route) => reachableWithoutSigningIn(route)).length,
      // Surfaced at the top rather than left to be counted: routes with no
      // @Roles are reachable by every signed-in person, and an administrator
      // reading this page should not have to add them up themselves.
      openRoutes: routes.filter(
        (route) => route.roles === null && !route.isPublic && !route.isPlatform,
      ).length,
    };
  }
}
