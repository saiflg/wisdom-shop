import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import type { Request } from "express";
import { Strategy } from "passport-jwt";
import type { EnvConfig } from "@/config/env.validation";
import type { RefreshTokenPayload } from "../interfaces/jwt-payload.interface";
import { REFRESH_COOKIE_NAME } from "../auth.constants";

export function extractRefreshToken(req: Request): string | null {
  const fromCookie = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof fromCookie === "string" && fromCookie.length > 0) {
    return fromCookie;
  }
  const body = req.body as { refreshToken?: unknown } | undefined;
  if (typeof body?.refreshToken === "string" && body.refreshToken.length > 0) {
    return body.refreshToken;
  }
  return null;
}

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, "jwt-school-refresh") {
  constructor(config: ConfigService<EnvConfig, true>) {
    super({
      jwtFromRequest: extractRefreshToken,
      ignoreExpiration: false,
      secretOrKey: config.get("EMS_JWT_REFRESH_SECRET", { infer: true }),
      passReqToCallback: false,
    });
  }

  validate(payload: RefreshTokenPayload): RefreshTokenPayload {
    if (payload.type !== "refresh") {
      throw new UnauthorizedException("Invalid token type");
    }
    return payload;
  }
}
