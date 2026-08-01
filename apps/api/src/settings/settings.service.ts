import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { EncryptionService } from "../common/crypto/encryption.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { findSetting, isSecretKey, SETTING_DEFINITIONS, maskSecret } from "./settings.registry";

/**
 * Runtime configuration, backed by the `settings` table with the environment
 * as a fallback.
 *
 * **Precedence: database over environment.** A value saved in the admin UI
 * must take effect, otherwise the screen is decorative. The environment
 * remains the way to bootstrap a deployment before anyone can log in, and the
 * only source in CI and tests.
 *
 * Values are cached in memory because they are read on nearly every payment
 * and email operation. The cache is per-process: with more than one API
 * replica, a change made on one is not seen by the others until their TTL
 * expires. A short TTL is the deliberate trade — the alternative is a Redis
 * pub/sub invalidation channel, which is not worth it at this size.
 */
const CACHE_TTL_MS = 30_000;

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache = new Map<string, string>();
  private cacheLoadedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly encryption: EncryptionService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async load(): Promise<void> {
    if (Date.now() - this.cacheLoadedAt < CACHE_TTL_MS) return;

    const rows = await this.prisma.setting.findMany();
    const next = new Map<string, string>();
    for (const row of rows) {
      if (row.value === "") continue;
      try {
        next.set(row.key, row.isSecret ? this.encryption.decrypt(row.value) : row.value);
      } catch {
        // A key that cannot be decrypted means TWO_FACTOR_ENCRYPTION_KEY has
        // changed. Skipping it falls back to the environment rather than
        // taking the whole API down, and says so loudly.
        this.logger.error(
          `Setting "${row.key}" could not be decrypted — the encryption key has changed. Falling back to the environment; re-enter this value in Admin → Settings.`,
        );
      }
    }
    this.cache = next;
    this.cacheLoadedAt = Date.now();
  }

  /** Database value if set, otherwise the environment, otherwise undefined. */
  async get(key: string): Promise<string | undefined> {
    await this.load();
    const stored = this.cache.get(key);
    if (stored !== undefined && stored !== "") return stored;

    const fromEnv = this.config.get<string>(key);
    return fromEnv === "" ? undefined : fromEnv;
  }

  async getNumber(key: string): Promise<number | undefined> {
    const raw = await this.get(key);
    if (raw === undefined) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  /** True when a usable value exists from either source. */
  async isConfigured(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  /**
   * Everything the admin screen needs, with secrets reduced to a masked hint.
   * Secret values never leave the server: a UI that can display a key is a UI
   * that leaks it to anyone who reaches the screen or its network log.
   */
  async describeAll(): Promise<
    {
      key: string;
      group: string;
      label: string;
      help?: string;
      type: string;
      secret: boolean;
      placeholder?: string;
      configured: boolean;
      /** Plain value, or a mask for secrets. */
      value: string | null;
      source: "database" | "environment" | "unset";
    }[]
  > {
    await this.load();

    return Promise.all(
      SETTING_DEFINITIONS.map(async (definition) => {
        const stored = this.cache.get(definition.key);
        const effective = await this.get(definition.key);
        const source: "database" | "environment" | "unset" =
          stored !== undefined && stored !== ""
            ? "database"
            : effective !== undefined
              ? "environment"
              : "unset";

        return {
          key: definition.key,
          group: definition.group,
          label: definition.label,
          help: definition.help,
          type: definition.type,
          secret: definition.secret === true,
          placeholder: definition.placeholder,
          configured: effective !== undefined,
          value:
            effective === undefined
              ? null
              : definition.secret
                ? maskSecret(effective)
                : effective,
          source,
        };
      }),
    );
  }

  /**
   * Writes a batch of settings.
   *
   * An empty string clears the stored value, falling back to the environment
   * — that is how a super admin undoes a change without knowing what the
   * environment holds.
   */
  async setMany(entries: Record<string, string>, actorUserId: string): Promise<void> {
    const keys = Object.keys(entries);

    const unknown = keys.filter((key) => !findSetting(key));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown setting(s): ${unknown.join(", ")}`);
    }

    for (const key of keys) {
      const definition = findSetting(key)!;
      const raw = entries[key].trim();

      if (raw === "") {
        await this.prisma.setting.deleteMany({ where: { key } });
        continue;
      }

      if (definition.type === "number" && !Number.isFinite(Number(raw))) {
        throw new BadRequestException(`${definition.label} must be a number`);
      }
      if (definition.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) {
        throw new BadRequestException(`${definition.label} must be a valid email address`);
      }
      if (definition.type === "url" && !/^https:\/\/.+/i.test(raw)) {
        throw new BadRequestException(`${definition.label} must be a full https:// URL`);
      }

      const secret = isSecretKey(key);
      const value = secret ? this.encryption.encrypt(raw) : raw;

      await this.prisma.setting.upsert({
        where: { key },
        create: { key, value, isSecret: secret, updatedById: actorUserId },
        update: { value, isSecret: secret, updatedById: actorUserId },
      });
    }

    // The value is deliberately absent from the audit entry — recording which
    // keys changed is the point; recording a payment credential in a table
    // that admins can read would defeat encrypting it in the first place.
    await this.auditLog.record({
      userId: actorUserId,
      action: "settings.updated",
      entity: "Setting",
      metadata: { keys },
    });

    this.invalidate();
  }

  /** Drops the cache so the next read sees what was just written. */
  invalidate(): void {
    this.cacheLoadedAt = 0;
    this.cache = new Map();
  }
}
