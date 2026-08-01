import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import type { Request } from "express";
import { Strategy } from "passport-jwt";
import type { EnvConfig } from "@/config/env.validation";
import type { PlatformRefreshTokenPayload } from "../interfaces/platform-jwt-payload.interface";

export const PLATFORM_REFRESH_COOKIE_NAME = "wisdom_campus_platform_rt";
export const PLATFORM_REFRESH_COOKIE_PATH = "/v1/platform/auth";

export function extractPlatformRefreshToken(req: Request): string | null {
  const fromCookie = req.cookies?.[PLATFORM_REFRESH_COOKIE_NAME];
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
export class PlatformRefreshTokenStrategy extends PassportStrategy(Strategy, "jwt-platform-refresh") {
  constructor(config: ConfigService<EnvConfig, true>) {
    super({
      jwtFromRequest: extractPlatformRefreshToken,
      ignoreExpiration: false,
      secretOrKey: config.get("PLATFORM_JWT_REFRESH_SECRET", { infer: true }),
      passReqToCallback: false,
    });
  }

  validate(payload: PlatformRefreshTokenPayload): PlatformRefreshTokenPayload {
    if (payload.type !== "platform_refresh") {
      throw new UnauthorizedException("Invalid token type");
    }
    return payload;
  }
}
