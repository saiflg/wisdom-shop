import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ControlPrismaService } from "@/control-db/control-prisma.service";
import { PrismaClient as TenantPrismaClient } from "ems-tenant-client";
import type { School } from "ems-control-client";
import type { EnvConfig } from "@/config/env.validation";
import { buildTenantConnectionString } from "./connection-string";

const SCHOOL_CACHE_TTL_MS = 60_000;
const CLIENT_IDLE_EVICT_MS = 30 * 60_000;
const EVICTION_SWEEP_INTERVAL_MS = 5 * 60_000;

interface CachedClient {
  client: TenantPrismaClient;
  lastUsedAt: number;
}

interface CachedSchool {
  school: School;
  cachedAt: number;
}

/**
 * Resolves and caches a PrismaClient per school database.
 *
 * A `Map<schoolId, PrismaClient>` rather than one client per request: each
 * client opens its own connection pool, and creating one per request would
 * both be slow and exhaust Postgres's max_connections far sooner. The
 * school-row cache has a short TTL (not "forever") so a school flipped to
 * SUSPENDED is locked out within a bounded time without hitting the
 * control DB on every single request.
 *
 * The idle-eviction sweep below is a "good enough for foundation" bound,
 * not a real LRU — revisit before onboarding tens of schools, same spirit
 * as the shop's own "single-node story" comments in storage.service.ts.
 */
@Injectable()
export class TenancyService implements OnModuleDestroy {
  private readonly logger = new Logger(TenancyService.name);
  private readonly clients = new Map<string, CachedClient>();
  private readonly schoolCache = new Map<string, CachedSchool>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly controlPrisma: ControlPrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    this.sweepTimer = setInterval(() => this.evictIdleClients(), EVICTION_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  async resolveSchoolBySlug(slug: string): Promise<School> {
    const school = await this.controlPrisma.school.findUnique({ where: { slug } });
    if (!school) throw new NotFoundException("No school with that identifier");
    this.schoolCache.set(school.id, { school, cachedAt: Date.now() });
    return school;
  }

  /** Throws if the school doesn't exist or isn't ACTIVE — callers don't need to check status themselves. */
  async getClientForSchool(schoolId: string): Promise<TenantPrismaClient> {
    const school = await this.getSchool(schoolId);
    if (school.status !== "ACTIVE") {
      throw new ForbiddenException(`This school is ${school.status.toLowerCase()}`);
    }

    const cached = this.clients.get(schoolId);
    if (cached) {
      cached.lastUsedAt = Date.now();
      return cached.client;
    }

    const url = buildTenantConnectionString({
      host: this.config.get("TENANT_DB_HOST", { infer: true }),
      port: this.config.get("TENANT_DB_PORT", { infer: true }),
      user: this.config.get("TENANT_DB_USER", { infer: true }),
      password: this.config.get("TENANT_DB_PASSWORD", { infer: true }),
      databaseName: school.databaseName,
    });
    const client = new TenantPrismaClient({ datasources: { db: { url } } });
    this.clients.set(schoolId, { client, lastUsedAt: Date.now() });
    return client;
  }

  async getCurrentTenantClient(schoolId: string): Promise<TenantPrismaClient> {
    return this.getClientForSchool(schoolId);
  }

  /** Drops the TTL cache for one school — called right after a status change so it takes effect immediately rather than waiting out the TTL. */
  invalidateSchool(schoolId: string): void {
    this.schoolCache.delete(schoolId);
  }

  private async getSchool(schoolId: string): Promise<School> {
    const cached = this.schoolCache.get(schoolId);
    if (cached && Date.now() - cached.cachedAt < SCHOOL_CACHE_TTL_MS) {
      return cached.school;
    }

    const school = await this.controlPrisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new NotFoundException("No school with that id");
    this.schoolCache.set(schoolId, { school, cachedAt: Date.now() });
    return school;
  }

  private evictIdleClients(): void {
    const now = Date.now();
    for (const [schoolId, entry] of this.clients) {
      if (now - entry.lastUsedAt > CLIENT_IDLE_EVICT_MS) {
        this.clients.delete(schoolId);
        entry.client.$disconnect().catch((error) => {
          this.logger.error(`Failed to disconnect idle client for school ${schoolId}: ${error}`);
        });
      }
    }
  }

  async onModuleDestroy() {
    clearInterval(this.sweepTimer);
    await Promise.all([...this.clients.values()].map((entry) => entry.client.$disconnect()));
    this.clients.clear();
  }
}
