import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import type { EnvConfig } from "@/config/env.validation";
import { TenancyService } from "@/tenancy/tenancy.service";
import { parseDurationMs } from "@/common/utils/duration";
import { hashToken } from "@/common/utils/hash-token";
import type { AccessTokenPayload, AuthenticatedUser, RefreshTokenPayload } from "./interfaces/jwt-payload.interface";
import type { RequestMeta, TokenPair } from "@/common/auth-types";

export type { RequestMeta, TokenPair };

/**
 * Simple rotate-and-revoke refresh flow — deliberately WITHOUT the shop's
 * compare-and-swap race-tolerance chain (replacedById/REFRESH_REUSE_GRACE_MS).
 * That machinery exists there to survive React StrictMode double-effects and
 * two-tab races, which is real complexity earned by the shop's own bug
 * history — not something to blindly import into a foundation phase. On
 * reuse of an already-revoked token here, every session for that user is
 * revoked; that is a reasonable minimal defense on its own.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly tenancy: TenancyService,
  ) {}

  async login(
    schoolSlug: string,
    email: string,
    password: string,
    meta: RequestMeta,
  ): Promise<TokenPair & { user: AuthenticatedUser }> {
    const school = await this.tenancy.resolveSchoolBySlug(schoolSlug);
    if (school.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid school, email or password");
    }
    const tenantClient = await this.tenancy.getClientForSchool(school.id);

    const user = await tenantClient.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.passwordHash || user.deletedAt) {
      throw new UnauthorizedException("Invalid school, email or password");
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      throw new UnauthorizedException("Invalid school, email or password");
    }

    const tokens = await this.issueTokenPair(school.id, school.slug, user.id, user.roles, meta);
    return {
      ...tokens,
      user: { id: user.id, schoolId: school.id, schoolSlug: school.slug, roles: user.roles },
    };
  }

  async issueTokenPair(
    schoolId: string,
    schoolSlug: string,
    userId: string,
    roles: AuthenticatedUser["roles"],
    meta: RequestMeta,
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, schoolId, schoolSlug, roles, type: "access" } satisfies AccessTokenPayload,
      {
        secret: this.config.get("EMS_JWT_ACCESS_SECRET", { infer: true }),
        expiresIn: this.config.get("JWT_ACCESS_EXPIRES_IN", { infer: true }),
      },
    );

    const tokenId = randomUUID();
    const refreshExpiresIn = this.config.get("JWT_REFRESH_EXPIRES_IN", { infer: true });
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, schoolId, schoolSlug, tokenId, type: "refresh" } satisfies RefreshTokenPayload,
      {
        secret: this.config.get("EMS_JWT_REFRESH_SECRET", { infer: true }),
        expiresIn: refreshExpiresIn,
      },
    );
    const refreshTokenExpiresAt = new Date(Date.now() + parseDurationMs(refreshExpiresIn));

    const tenantClient = await this.tenancy.getClientForSchool(schoolId);
    await tenantClient.refreshToken.create({
      data: {
        id: tokenId,
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    return { accessToken, refreshToken, refreshTokenExpiresAt };
  }

  async refresh(payload: RefreshTokenPayload, rawToken: string, meta: RequestMeta): Promise<TokenPair> {
    const tenantClient = await this.tenancy.getClientForSchool(payload.schoolId);

    const existing = await tenantClient.refreshToken.findUnique({ where: { id: payload.tokenId } });
    if (!existing || existing.tokenHash !== hashToken(rawToken)) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (existing.revokedAt) {
      // Reuse of an already-rotated token: treat as theft, kill every
      // session for this user rather than trying to distinguish a race.
      await tenantClient.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Refresh token has already been used");
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Refresh token has expired");
    }

    const user = await tenantClient.user.findUniqueOrThrow({ where: { id: existing.userId } });

    const claimed = await tenantClient.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new UnauthorizedException("Refresh token has already been used");
    }

    return this.issueTokenPair(payload.schoolId, payload.schoolSlug, user.id, user.roles, meta);
  }

  async logout(schoolId: string, tokenId: string): Promise<void> {
    const tenantClient = await this.tenancy.getClientForSchool(schoolId);
    await tenantClient.refreshToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
