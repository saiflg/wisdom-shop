import { Injectable, ForbiddenException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PlatformRoleName } from "ems-control-client";
import { PLATFORM_ROLES_KEY } from "../decorators/platform-roles.decorator";
import type { RequestWithPlatformUser } from "../interfaces/platform-request.interface";

@Injectable()
export class PlatformRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<PlatformRoleName[] | undefined>(
      PLATFORM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<RequestWithPlatformUser>();
    const hasRole = user?.roles?.some((role) => requiredRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException("You do not have permission to perform this action");
    }

    return true;
  }
}
