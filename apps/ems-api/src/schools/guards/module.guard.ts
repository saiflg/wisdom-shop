import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { REQUIRES_MODULE_KEY } from "../decorators/requires-module.decorator";
import { SchoolModulesService } from "../school-modules.service";
import { moduleLabel, type ModuleKey } from "../school-modules";

/**
 * Refuses routes belonging to a module the school has not got.
 *
 * Registered globally and inert without `@RequiresModule`, so adding a module
 * to a controller is one line and forgetting to register a guard is not a
 * thing that can happen.
 *
 * This is the half that makes the switches in the Super Admin console mean
 * something. Hiding a navigation item is a courtesy to the user; it is not a
 * control, because the URL is still there and so is the API behind it.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly modules: SchoolModulesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ModuleKey | undefined>(REQUIRES_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const schoolId = request.user?.schoolId;
    // No school on the request means either an unauthenticated route or a
    // platform-side one. Neither is a tenant asking for a tenant feature, and
    // the guards that do own those cases have already run.
    if (!schoolId) return true;

    const enabled = await this.modules.modulesFor(schoolId);
    if (enabled.includes(required)) return true;

    // Names the module rather than saying "forbidden". A school administrator
    // hitting this has done nothing wrong and needs to know what to ask for;
    // an operator reading the log needs to know which switch to flick.
    throw new ForbiddenException(`${moduleLabel(required)} is not included in this school's plan`);
  }
}
