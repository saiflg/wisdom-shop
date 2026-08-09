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
import { resolveHost } from "./resolve-host";

const SCHOOL_CACHE_TTL_MS = 60_000;
const HOST_CACHE_TTL_MS = 60_000;
/**
 * Misses expire far sooner than hits.
 *
 * A miss is only ever "no school answers to this name *yet*", and the case
 * that matters is a school still being provisioned while somebody watches
 * its address. ProvisioningService doesn't know this cache exists — wiring
 * it in would make provisioning depend on tenancy for one invalidation —
 * so the window is closed by keeping misses cheap to be wrong about
 * instead. Hits stay at a minute because a school that exists keeps
 * existing.
 */
const HOST_MISS_CACHE_TTL_MS = 5_000;
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

/** `null` is cached too — see resolveSchoolByHost. */
interface CachedHost {
  schoolId: string | null;
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
  private readonly hostCache = new Map<string, CachedHost>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly controlPrisma: ControlPrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    this.sweepTimer = setInterval(() => this.evictIdleClients(), EVICTION_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  /** The school row for an id, through the same TTL cache. */
  async resolveSchoolById(schoolId: string): Promise<School> {
    return this.getSchool(schoolId);
  }

  /**
   * A school by slug, or null if it doesn't exist or isn't ACTIVE.
   *
   * The null-returning sibling of `resolveSchoolBySlug`, for the public
   * branding routes: those are reached by strangers typing URLs, where "no
   * such school" is an ordinary outcome and a thrown 404 with a distinct
   * message would only tell an enumerator which slugs are real.
   */
  async findActiveSchoolBySlug(slug: string): Promise<School | null> {
    const school = await this.controlPrisma.school.findUnique({ where: { slug } });
    if (!school || school.status !== "ACTIVE") return null;
    this.schoolCache.set(school.id, { school, cachedAt: Date.now() });
    return school;
  }

  async resolveSchoolBySlug(slug: string): Promise<School> {
    const school = await this.controlPrisma.school.findUnique({ where: { slug } });
    if (!school) throw new NotFoundException("No school with that identifier");
    this.schoolCache.set(school.id, { school, cachedAt: Date.now() });
    return school;
  }

  /**
   * Works out which school a request's hostname belongs to, or null.
   *
   * **Null is the ordinary answer, not an error.** Health checks, the apex
   * domain, an IP address and a stray Host header all land here, and every
   * one of them should simply fall back to asking which school you mean.
   * Throwing would turn the platform's own front page into a 404.
   *
   * A SUSPENDED or still-PROVISIONING school resolves to null as well: its
   * branding is not public, and its login page must not offer a door that
   * `getClientForSchool` is about to slam. That check happens here rather
   * than being left to the caller, for the same reason it happens inside
   * `getClientForSchool`.
   *
   * Negative results are cached alongside positive ones. This runs on
   * unauthenticated requests, so without it every request bearing a
   * nonsense Host is a control-database query that a stranger chose to make.
   */
  async resolveSchoolByHost(host: string | undefined): Promise<School | null> {
    const resolution = resolveHost(host, this.config.get("EMS_BASE_DOMAIN", { infer: true }));
    if (resolution.kind === "none") return null;

    const cacheKey = resolution.kind === "subdomain" ? `slug:${resolution.slug}` : `host:${resolution.hostname}`;
    const cached = this.hostCache.get(cacheKey);
    if (cached) {
      const ttl = cached.schoolId === null ? HOST_MISS_CACHE_TTL_MS : HOST_CACHE_TTL_MS;
      if (Date.now() - cached.cachedAt < ttl) {
        if (cached.schoolId === null) return null;
        const school = this.schoolCache.get(cached.schoolId);
        if (school && Date.now() - school.cachedAt < SCHOOL_CACHE_TTL_MS) return school.school;
      }
    }

    const school =
      resolution.kind === "subdomain"
        ? await this.controlPrisma.school.findUnique({ where: { slug: resolution.slug } })
        : await this.controlPrisma.school.findUnique({
            where: { customDomain: resolution.hostname },
          });

    if (!school || school.status !== "ACTIVE") {
      this.hostCache.set(cacheKey, { schoolId: null, cachedAt: Date.now() });
      return null;
    }

    this.hostCache.set(cacheKey, { schoolId: school.id, cachedAt: Date.now() });
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
    // The host cache is keyed by hostname, so entries pointing at this
    // school have to be found rather than deleted by key. Suspending a
    // school must take its login page down now, not a minute from now.
    //
    // The negative entries go too, and that is not tidiness: a school
    // reaching ACTIVE is exactly the moment a *cached miss* for its own
    // hostname becomes wrong. Someone who opened the school's address while
    // it was still provisioning would otherwise be told there is no such
    // school for another minute — during onboarding, which is precisely
    // when somebody is watching that page.
    for (const [key, entry] of this.hostCache) {
      if (entry.schoolId === schoolId || entry.schoolId === null) this.hostCache.delete(key);
    }
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
