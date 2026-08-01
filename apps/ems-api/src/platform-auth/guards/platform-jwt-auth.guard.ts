import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * NOT a global APP_GUARD — applied explicitly via @UseGuards() on
 * /v1/platform/* controllers, which are themselves @Public() (opted out of
 * the tenant JwtAuthGuard). Two RBAC universes, not one guard doing double
 * duty.
 */
@Injectable()
export class PlatformJwtAuthGuard extends AuthGuard("jwt-platform-access") {}
