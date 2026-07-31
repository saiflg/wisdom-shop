import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { RoleName } from "@prisma/client";
import * as argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";
import { authenticator } from "otplib";
import * as qrcode from "qrcode";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { MailerService } from "../common/mailer/mailer.service";
import { EncryptionService } from "../common/crypto/encryption.service";
import { parseDurationMs } from "../common/utils/duration";
import type { EnvConfig } from "../config/env.validation";
import type {
  AccessTokenPayload,
  AuthenticatedUser,
  RefreshTokenPayload,
  TwoFactorChallengePayload,
} from "./interfaces/jwt-payload.interface";
import { hashToken } from "./utils/hash-token";
import {
  clearedState,
  isLockedOut,
  lockRemainingSeconds,
  registerFailure,
} from "./login-lockout";

export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export type LoginResult =
  | ({ twoFactorRequired: false } & TokenPair & { user: AuthenticatedUser })
  | { twoFactorRequired: true; challengeToken: string };

const RECOVERY_CODE_COUNT = 8;

/**
 * Raised when an account is inside a lock window. It carries the remaining
 * time so the controller can say when to come back; it is translated to an
 * HTTP error at the boundary rather than thrown as one, so the credential
 * check stays free of transport concerns.
 */
export class LockedOutError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Account temporarily locked");
    this.name = "LockedOutError";
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly auditLog: AuditLogService,
    private readonly mailer: MailerService,
    private readonly encryption: EncryptionService,
  ) {}

  async register(input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }): Promise<TokenPair & { user: AuthenticatedUser }> {
    const email = input.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const passwordHash = await argon2.hash(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          phone: input.phone,
        },
      });

      const customerRole = await tx.role.upsert({
        where: { name: "CUSTOMER" },
        update: {},
        create: { name: "CUSTOMER", description: "Default role for registered shoppers" },
      });

      await tx.userRole.create({ data: { userId: created.id, roleId: customerRole.id } });
      await tx.cart.create({ data: { userId: created.id } });

      return created;
    });

    await this.auditLog.record({ userId: user.id, action: "user.registered", entity: "User", entityId: user.id });
    await this.sendVerificationEmail(user.id, email);

    const roles: RoleName[] = ["CUSTOMER"];
    const tokens = await this.issueTokenPair(user.id, email, roles, {});
    return { ...tokens, user: { id: user.id, email, roles } };
  }

  async validateCredentials(email: string, password: string): Promise<{ id: string; email: string } | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        deletedAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    if (!user || user.deletedAt) {
      // Run a dummy hash to keep timing consistent whether or not the account exists.
      await argon2.hash(password).catch(() => undefined);
      return null;
    }

    // Checked before the password is verified, so a locked account costs an
    // attacker a database read rather than an argon2 hash — and so no amount
    // of guessing during the lock window can succeed.
    if (isLockedOut(user)) {
      throw new LockedOutError(lockRemainingSeconds(user));
    }

    const valid = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!valid) {
      const next = registerFailure(user);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: next.failedLoginAttempts, lockedUntil: next.lockedUntil },
      });
      if (isLockedOut(next)) {
        await this.auditLog.record({
          userId: user.id,
          action: "user.login_locked",
          entity: "User",
          entityId: user.id,
          metadata: { failedAttempts: next.failedLoginAttempts },
        });
      }
      return null;
    }

    if (user.failedLoginAttempts !== 0 || user.lockedUntil !== null) {
      await this.prisma.user.update({ where: { id: user.id }, data: clearedState() });
    }

    return { id: user.id, email: user.email };
  }

  async login(email: string, password: string, meta: RequestMeta): Promise<LoginResult> {
    let credentials: { id: string; email: string } | null;
    try {
      credentials = await this.validateCredentials(email, password);
    } catch (error) {
      if (error instanceof LockedOutError) {
        await this.auditLog.record({
          action: "user.login_blocked",
          entity: "User",
          metadata: { email },
        });
        // 403 rather than 401: the credentials were never assessed, so
        // "unauthorized" would tell the caller the wrong thing.
        throw new ForbiddenException(
          `Too many failed sign-in attempts. Try again in ${error.retryAfterSeconds} seconds.`,
        );
      }
      throw error;
    }

    if (!credentials) {
      await this.auditLog.record({ action: "user.login_failed", entity: "User", metadata: { email } });
      throw new UnauthorizedException("Invalid email or password");
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: credentials.id },
      include: { roles: { include: { role: true } } },
    });

    const roles = user.roles.map((r) => r.role.name);

    if (user.twoFactorEnabled) {
      const challengeToken = await this.jwt.signAsync(
        { sub: user.id, type: "2fa_challenge" } satisfies TwoFactorChallengePayload,
        {
          secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
          expiresIn: "5m",
        },
      );
      return { twoFactorRequired: true, challengeToken };
    }

    const tokens = await this.issueTokenPair(user.id, user.email, roles, meta);
    await this.auditLog.record({ userId: user.id, action: "user.login", entity: "User", entityId: user.id });
    return { twoFactorRequired: false, ...tokens, user: { id: user.id, email: user.email, roles } };
  }

  async completeTwoFactorLogin(
    challenge: TwoFactorChallengePayload,
    code: string,
    meta: RequestMeta,
  ): Promise<TokenPair & { user: AuthenticatedUser }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: challenge.sub },
      include: { roles: { include: { role: true } } },
    });

    // The second factor is counted by the same policy as the first. Without
    // this, an attacker who already has the password gets unlimited guesses at
    // a six-digit code, which is the whole of the remaining protection.
    if (isLockedOut(user)) {
      await this.auditLog.record({
        userId: user.id,
        action: "user.login_blocked",
        entity: "User",
        entityId: user.id,
        metadata: { stage: "2fa" },
      });
      throw new ForbiddenException(
        `Too many failed sign-in attempts. Try again in ${lockRemainingSeconds(user)} seconds.`,
      );
    }

    const codeIsValid = await this.verifyTwoFactorCode(user.id, code);
    if (!codeIsValid) {
      const next = registerFailure(user);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: next.failedLoginAttempts, lockedUntil: next.lockedUntil },
      });
      await this.auditLog.record({ userId: user.id, action: "user.2fa_login_failed", entity: "User", entityId: user.id });
      throw new UnauthorizedException("Invalid two-factor code");
    }

    if (user.failedLoginAttempts !== 0 || user.lockedUntil !== null) {
      await this.prisma.user.update({ where: { id: user.id }, data: clearedState() });
    }

    const roles = user.roles.map((r) => r.role.name);
    const tokens = await this.issueTokenPair(user.id, user.email, roles, meta);
    await this.auditLog.record({ userId: user.id, action: "user.login", entity: "User", entityId: user.id, metadata: { via: "2fa" } });
    return { ...tokens, user: { id: user.id, email: user.email, roles } };
  }

  /** Verifies a TOTP code, falling back to single-use recovery codes. */
  private async verifyTwoFactorCode(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.twoFactorSecret) {
      const secret = this.encryption.decrypt(user.twoFactorSecret);
      if (authenticator.verify({ token: code, secret })) {
        return true;
      }
    }

    const recoveryCodes = await this.prisma.twoFactorRecoveryCode.findMany({
      where: { userId, usedAt: null },
    });
    for (const recoveryCode of recoveryCodes) {
      if (await argon2.verify(recoveryCode.codeHash, code).catch(() => false)) {
        await this.prisma.twoFactorRecoveryCode.update({
          where: { id: recoveryCode.id },
          data: { usedAt: new Date() },
        });
        return true;
      }
    }

    return false;
  }

  async issueTokenPair(userId: string, email: string, roles: RoleName[], meta: RequestMeta): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, roles, type: "access" } satisfies AccessTokenPayload,
      {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
        expiresIn: this.config.get("JWT_ACCESS_EXPIRES_IN", { infer: true }),
      },
    );

    const tokenId = randomUUID();
    const refreshExpiresIn = this.config.get("JWT_REFRESH_EXPIRES_IN", { infer: true });
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, tokenId, type: "refresh" } satisfies RefreshTokenPayload,
      {
        secret: this.config.get("JWT_REFRESH_SECRET", { infer: true }),
        expiresIn: refreshExpiresIn,
      },
    );

    const refreshTokenExpiresAt = new Date(Date.now() + parseDurationMs(refreshExpiresIn));

    await this.prisma.refreshToken.create({
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
    const existing = await this.prisma.refreshToken.findUnique({ where: { id: payload.tokenId } });

    if (!existing || existing.tokenHash !== hashToken(rawToken)) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (existing.revokedAt) {
      // Reuse of a rotated-out token indicates the token was stolen — burn
      // every session for this user as a containment measure.
      await this.prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.auditLog.record({
        userId: existing.userId,
        action: "auth.refresh_token_reuse_detected",
        entity: "User",
        entityId: existing.userId,
      });
      throw new UnauthorizedException("Refresh token has already been used");
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Refresh token has expired");
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: existing.userId },
      include: { roles: { include: { role: true } } },
    });

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const roles = user.roles.map((r) => r.role.name);
    return this.issueTokenPair(user.id, user.email, roles, meta);
  }

  async logout(payload: RefreshTokenPayload): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id: payload.tokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async generateTwoFactorSetup(userId: string): Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.twoFactorEnabled) {
      throw new BadRequestException("Two-factor authentication is already enabled");
    }

    const secret = authenticator.generateSecret();
    const appName = this.config.get("TWO_FACTOR_APP_NAME", { infer: true });
    const otpauthUrl = authenticator.keyuri(user.email, appName, secret);
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    // Stored immediately but twoFactorEnabled stays false until the user
    // proves possession by submitting a valid code in enableTwoFactor().
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: this.encryption.encrypt(secret) },
    });

    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  async enableTwoFactor(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.twoFactorSecret) {
      throw new BadRequestException("Call the setup endpoint before enabling two-factor authentication");
    }

    const secret = this.encryption.decrypt(user.twoFactorSecret);
    if (!authenticator.verify({ token: code, secret })) {
      throw new UnauthorizedException("Invalid two-factor code");
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      randomBytes(5).toString("hex"),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
      await tx.twoFactorRecoveryCode.deleteMany({ where: { userId } });
      await tx.twoFactorRecoveryCode.createMany({
        data: await Promise.all(
          recoveryCodes.map(async (code) => ({ userId, codeHash: await argon2.hash(code) })),
        ),
      });
    });

    await this.auditLog.record({ userId, action: "user.2fa_enabled", entity: "User", entityId: userId });
    return { recoveryCodes };
  }

  async disableTwoFactor(userId: string, code: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const passwordValid = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!passwordValid) {
      throw new UnauthorizedException("Invalid password");
    }

    const codeValid = await this.verifyTwoFactorCode(userId, code);
    if (!codeValid) {
      throw new UnauthorizedException("Invalid two-factor code");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });
      await tx.twoFactorRecoveryCode.deleteMany({ where: { userId } });
    });

    await this.auditLog.record({ userId, action: "user.2fa_disabled", entity: "User", entityId: userId });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const valid = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!valid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });

    await this.auditLog.record({ userId, action: "user.password_changed", entity: "User", entityId: userId });
  }

  async sendVerificationEmail(userId: string, email: string): Promise<void> {
    const rawToken = randomBytes(32).toString("hex");
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + parseDurationMs("1d")),
      },
    });

    const verifyUrl = `${this.config.get("APP_URL", { infer: true })}/verify-email?token=${rawToken}`;
    await this.mailer.send({
      to: email,
      subject: "Verify your Wisdom Shop email address",
      html: `<p>Welcome to Wisdom Shop! Please verify your email by clicking the link below:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
    });
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

    if (!record || record.consumedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("This verification link is invalid or has expired");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
      await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
    });

    await this.auditLog.record({ userId: record.userId, action: "user.email_verified", entity: "User", entityId: record.userId });
  }

  async requestPasswordReset(email: string, requestIp?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    // Always return success to the caller regardless of whether the account
    // exists, to avoid leaking which emails are registered.
    if (!user) {
      return;
    }

    const rawToken = randomBytes(32).toString("hex");
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + parseDurationMs("1h")),
        requestIp,
      },
    });

    const resetUrl = `${this.config.get("APP_URL", { infer: true })}/reset-password?token=${rawToken}`;
    await this.mailer.send({
      to: user.email,
      subject: "Reset your Wisdom Shop password",
      html: `<p>We received a request to reset your password. This link expires in 1 hour:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
    });

    await this.auditLog.record({ userId: user.id, action: "user.password_reset_requested", entity: "User", entityId: user.id });
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.consumedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("This password reset link is invalid or has expired");
    }

    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });

    await this.auditLog.record({ userId: record.userId, action: "user.password_reset_completed", entity: "User", entityId: record.userId });
  }
}
