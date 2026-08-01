import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { EnvConfig } from "@/config/env.validation";
import { TenancyService } from "@/tenancy/tenancy.service";
import type { AccessTokenPayload, AuthenticatedUser } from "../interfaces/jwt-payload.interface";

/**
 * Runs as part of guard evaluation — BEFORE TenantContextInterceptor fires
 * (interceptors run after guards) — so TenantContext/ALS isn't populated
 * yet here. Resolving the right tenant database therefore goes through
 * TenancyService.getClientForSchool() directly, using schoolId straight off
 * the JWT payload, not through the ALS-reading TenantPrismaService facade.
 */
@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy, "jwt-school-access") {
  constructor(
    config: ConfigService<EnvConfig, true>,
    private readonly tenancy: TenancyService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get("EMS_JWT_ACCESS_SECRET", { infer: true }),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type");
    }

    // Throws ForbiddenException (403) if the school is SUSPENDED/FAILED —
    // deliberately distinct from the 401 below, which means "this session
    // itself is invalid" rather than "this school is not available".
    const tenantClient = await this.tenancy.getClientForSchool(payload.schoolId);

    const user = await tenantClient.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, deletedAt: true },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException("User no longer exists");
    }

    return {
      id: user.id,
      schoolId: payload.schoolId,
      schoolSlug: payload.schoolSlug,
      roles: payload.roles,
    };
  }
}
