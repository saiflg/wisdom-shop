import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import type { EnvConfig } from "@/config/env.validation";
import { ControlPrismaService } from "@/control-db/control-prisma.service";
import { parseDurationMs } from "@/common/utils/duration";
import { hashToken } from "@/common/utils/hash-token";
import type {
  AuthenticatedPlatformUser,
  PlatformAccessTokenPayload,
  PlatformRefreshTokenPayload,
} from "./interfaces/platform-jwt-payload.interface";
import type { RequestMeta, TokenPair } from "@/common/auth-types";

@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly controlPrisma: ControlPrismaService,
  ) {}

  async login(email: string, password: string, meta: RequestMeta): Promise<TokenPair & { user: AuthenticatedPlatformUser }> {
    const user = await this.controlPrisma.platformUser.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const tokens = await this.issueTokenPair(user.id, user.roles, meta);
    return { ...tokens, user: { id: user.id, roles: user.roles } };
  }

  async issueTokenPair(
    userId: string,
    roles: AuthenticatedPlatformUser["roles"],
    meta: RequestMeta,
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, roles, type: "platform_access" } satisfies PlatformAccessTokenPayload,
      {
        secret: this.config.get("PLATFORM_JWT_ACCESS_SECRET", { infer: true }),
        expiresIn: this.config.get("PLATFORM_JWT_ACCESS_EXPIRES_IN", { infer: true }),
      },
    );

    const tokenId = randomUUID();
    const refreshExpiresIn = this.config.get("PLATFORM_JWT_REFRESH_EXPIRES_IN", { infer: true });
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, tokenId, type: "platform_refresh" } satisfies PlatformRefreshTokenPayload,
      {
        secret: this.config.get("PLATFORM_JWT_REFRESH_SECRET", { infer: true }),
        expiresIn: refreshExpiresIn,
      },
    );
    const refreshTokenExpiresAt = new Date(Date.now() + parseDurationMs(refreshExpiresIn));

    await this.controlPrisma.platformRefreshToken.create({
      data: {
        id: tokenId,
        platformUserId: userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    return { accessToken, refreshToken, refreshTokenExpiresAt };
  }

  async refresh(payload: PlatformRefreshTokenPayload, rawToken: string, meta: RequestMeta): Promise<TokenPair> {
    const existing = await this.controlPrisma.platformRefreshToken.findUnique({ where: { id: payload.tokenId } });
    if (!existing || existing.tokenHash !== hashToken(rawToken)) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (existing.revokedAt) {
      await this.controlPrisma.platformRefreshToken.updateMany({
        where: { platformUserId: existing.platformUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Refresh token has already been used");
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Refresh token has expired");
    }

    const user = await this.controlPrisma.platformUser.findUniqueOrThrow({ where: { id: existing.platformUserId } });

    const claimed = await this.controlPrisma.platformRefreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new UnauthorizedException("Refresh token has already been used");
    }

    return this.issueTokenPair(user.id, user.roles, meta);
  }

  async logout(tokenId: string): Promise<void> {
    await this.controlPrisma.platformRefreshToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
