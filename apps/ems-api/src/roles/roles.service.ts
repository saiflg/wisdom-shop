import { Injectable } from "@nestjs/common";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { RequestMethod } from "@nestjs/common";
import { ROLES_KEY } from "@/auth/decorators/roles.decorator";
import { REQUIRES_MODULE_KEY } from "@/schools/decorators/requires-module.decorator";
import {
  countsByRole,
  groupByArea,
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

        routes.push({
          method: METHOD_NAMES[verb] ?? "GET",
          path: [controllerPath, methodPath].filter(Boolean).join("/").replace(/\/+/g, "/"),
          roles,
          module,
          summary: null,
        });
      }
    }

    const areas = groupByArea(routes);

    return {
      areas,
      counts: countsByRole(routes),
      totalRoutes: routes.length,
      // Surfaced at the top rather than left to be counted: routes with no
      // @Roles are reachable by every signed-in person, and an administrator
      // reading this page should not have to add them up themselves.
      openRoutes: routes.filter((route) => route.roles === null).length,
    };
  }
}
