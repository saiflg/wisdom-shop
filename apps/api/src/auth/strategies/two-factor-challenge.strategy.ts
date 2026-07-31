import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { EnvConfig } from "../../config/env.validation";
import type { TwoFactorChallengePayload } from "../interfaces/jwt-payload.interface";

@Injectable()
export class TwoFactorChallengeStrategy extends PassportStrategy(Strategy, "jwt-2fa-challenge") {
  constructor(config: ConfigService<EnvConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get("JWT_ACCESS_SECRET", { infer: true }),
    });
  }

  validate(payload: TwoFactorChallengePayload): TwoFactorChallengePayload {
    if (payload.type !== "2fa_challenge") {
      throw new UnauthorizedException("Invalid token type");
    }
    return payload;
  }
}
