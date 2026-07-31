import { ConflictException, UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import type { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { hashToken } from "./utils/hash-token";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditLogService } from "../common/audit/audit-log.service";
import type { MailerService } from "../common/mailer/mailer.service";
import type { EncryptionService } from "../common/crypto/encryption.service";

jest.mock("argon2", () => ({
  hash: jest.fn(async (value: string) => `hashed:${value}`),
  verify: jest.fn(async (hash: string, value: string) => hash === `hashed:${value}`),
}));

function buildPrismaMock() {
  const prisma: any = {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    role: { upsert: jest.fn() },
    userRole: { create: jest.fn() },
    cart: { create: jest.fn() },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    emailVerificationToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    twoFactorRecoveryCode: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
  };
  return prisma as PrismaService;
}

function buildService(prisma: PrismaService) {
  const jwt = { signAsync: jest.fn().mockResolvedValue("signed-token") } as unknown as JwtService;
  const configValues: Record<string, unknown> = {
    JWT_ACCESS_SECRET: "access-secret-at-least-32-characters!!",
    JWT_REFRESH_SECRET: "refresh-secret-at-least-32-characters!!",
    JWT_ACCESS_EXPIRES_IN: "15m",
    JWT_REFRESH_EXPIRES_IN: "7d",
    APP_URL: "http://localhost:3000",
    TWO_FACTOR_APP_NAME: "Wisdom Shop",
  };
  const config = { get: jest.fn((key: string) => configValues[key]) } as unknown as ConfigService<any, true>;
  const auditLog = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const mailer = { send: jest.fn().mockResolvedValue(undefined) } as unknown as MailerService;
  const encryption = {
    encrypt: jest.fn((v: string) => `enc:${v}`),
    decrypt: jest.fn((v: string) => v.replace(/^enc:/, "")),
  } as unknown as EncryptionService;

  return {
    service: new AuthService(prisma, jwt, config, auditLog, mailer, encryption),
    jwt,
    mailer,
  };
}

describe("AuthService", () => {
  describe("register", () => {
    it("creates a user, default role/cart, and issues a token pair", async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({ id: "user_1", email: "new@wisdomshop.example" });
      (prisma.role.upsert as jest.Mock).mockResolvedValue({ id: "role_customer" });

      const { service, mailer } = buildService(prisma);

      const result = await service.register({
        email: "New@WisdomShop.example",
        password: "Sup3rSecret!",
        firstName: "Ada",
        lastName: "Lovelace",
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: "new@wisdomshop.example" }) }),
      );
      expect(result.user).toEqual({ id: "user_1", email: "new@wisdomshop.example", roles: ["CUSTOMER"] });
      expect(result.accessToken).toBe("signed-token");
      expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: "new@wisdomshop.example" }));
    });

    it("rejects a duplicate email", async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "existing" });
      const { service } = buildService(prisma);

      await expect(
        service.register({
          email: "taken@wisdomshop.example",
          password: "Sup3rSecret!",
          firstName: "Ada",
          lastName: "Lovelace",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("login", () => {
    it("rejects an unknown email without revealing that it doesn't exist", async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const { service } = buildService(prisma);

      await expect(service.login("nobody@wisdomshop.example", "whatever", {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it("rejects a wrong password", async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user_1",
        email: "user@wisdomshop.example",
        passwordHash: "hashed:correct-password",
        deletedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
      const { service } = buildService(prisma);

      await expect(
        service.login("user@wisdomshop.example", "wrong-password", {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("issues tokens directly when 2FA is disabled", async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user_1",
        email: "user@wisdomshop.example",
        passwordHash: "hashed:correct-password",
        deletedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: "user_1",
        email: "user@wisdomshop.example",
        twoFactorEnabled: false,
        roles: [{ role: { name: "CUSTOMER" } }],
      });
      const { service } = buildService(prisma);

      const result = await service.login("user@wisdomshop.example", "correct-password", {});

      expect(result.twoFactorRequired).toBe(false);
      if (!result.twoFactorRequired) {
        expect(result.accessToken).toBe("signed-token");
      }
    });

    it("returns a challenge token instead of session tokens when 2FA is enabled", async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user_1",
        email: "user@wisdomshop.example",
        passwordHash: "hashed:correct-password",
        deletedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: "user_1",
        email: "user@wisdomshop.example",
        twoFactorEnabled: true,
        roles: [{ role: { name: "CUSTOMER" } }],
      });
      const { service } = buildService(prisma);

      const result = await service.login("user@wisdomshop.example", "correct-password", {});

      expect(result.twoFactorRequired).toBe(true);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    it("rotates the token when the presented refresh token is valid", async () => {
      const prisma = buildPrismaMock();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: "token_1",
        userId: "user_1",
        tokenHash: hashToken("raw-refresh-token"),
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: "user_1",
        email: "user@wisdomshop.example",
        roles: [{ role: { name: "CUSTOMER" } }],
      });
      const { service } = buildService(prisma);

      // Rotation is a compare-and-swap now, so the mock has to report that
      // this request won it.
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await service.refresh({ sub: "user_1", tokenId: "token_1", type: "refresh" }, "raw-refresh-token", {});

      expect(result.accessToken).toBe("signed-token");
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: "token_1", revokedAt: null },
        // Revoked and linked to its successor in one write.
        data: { revokedAt: expect.any(Date), replacedById: expect.any(String) },
      });
    });

    it("burns every session when a revoked (already-rotated) token is reused", async () => {
      const prisma = buildPrismaMock();
      // Revoked long enough ago to be outside any race window, and with no
      // recorded successor — an unambiguous replay.
      const rotated = {
        id: "token_1",
        userId: "user_1",
        tokenHash: hashToken("raw-refresh-token"),
        revokedAt: new Date(Date.now() - 10 * 60_000),
        expiresAt: new Date(Date.now() + 60_000),
        userAgent: null,
        replacedBy: null,
      };
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(rotated);
      (prisma.refreshToken.findUniqueOrThrow as jest.Mock).mockResolvedValue(rotated);
      const { service } = buildService(prisma);

      await expect(
        service.refresh({ sub: "user_1", tokenId: "token_1", type: "refresh" }, "raw-refresh-token", {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user_1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("rejects a token whose hash doesn't match (forged/stale token)", async () => {
      const prisma = buildPrismaMock();
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: "token_1",
        userId: "user_1",
        tokenHash: "does-not-match",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const { service } = buildService(prisma);

      await expect(
        service.refresh({ sub: "user_1", tokenId: "token_1", type: "refresh" }, "raw-refresh-token", {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("verifyEmail", () => {
    it("rejects an expired token", async () => {
      const prisma = buildPrismaMock();
      (prisma.emailVerificationToken.findUnique as jest.Mock).mockResolvedValue({
        id: "evt_1",
        userId: "user_1",
        consumedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      const { service } = buildService(prisma);

      await expect(service.verifyEmail("expired-token")).rejects.toThrow(/invalid or has expired/);
    });
  });

  describe("changePassword", () => {
    it("rejects an incorrect current password", async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: "user_1",
        passwordHash: "hashed:correct-password",
      });
      const { service } = buildService(prisma);

      await expect(service.changePassword("user_1", "wrong", "NewPassword1!")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
