import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { EnvConfig } from "@/config/env.validation";
import { ControlPrismaService } from "@/control-db/control-prisma.service";
import type { AuthenticatedPlatformUser, PlatformAccessTokenPayload } from "../interfaces/platform-jwt-payload.interface";

/** Entirely separate secret from the school-user tokens — a leaked platform token must be structurally invalid on tenant routes and vice versa. */
@Injectable()
export class PlatformAccessTokenStrategy extends PassportStrategy(Strategy, "jwt-platform-access") {
  constructor(
    config: ConfigService<EnvConfig, true>,
    private readonly controlPrisma: ControlPrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get("PLATFORM_JWT_ACCESS_SECRET", { infer: true }),
    });
  }

  async validate(payload: PlatformAccessTokenPayload): Promise<AuthenticatedPlatformUser> {
    if (payload.type !== "platform_access") {
      throw new UnauthorizedException("Invalid token type");
    }

    const user = await this.controlPrisma.platformUser.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException("User no longer exists");
    }

    return { id: user.id, roles: payload.roles };
  }
}
