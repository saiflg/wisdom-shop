import { Injectable } from "@nestjs/common";
import { ControlPrismaService } from "@/control-db/control-prisma.service";
import { resolveModules, type ModuleKey } from "./school-modules";

/**
 * How long an entitlement decision is trusted before it is looked up again.
 *
 * The same minute as the school-row cache in TenancyService, and for the same
 * reason: a per-request query to the control database on every gated route
 * would put the busiest table in the system on the hot path of every other
 * one. Turning a module off takes effect at once anyway — `invalidate` is
 * called by the write that changed it.
 */
const CACHE_TTL_MS = 60_000;

interface CachedEntry {
  modules: ModuleKey[];
  cachedAt: number;
}

/**
 * Resolves which modules a school may use, from its plan and its own
 * exceptions.
 *
 * Lives beside the pure `school-modules.ts` rather than inside it because
 * this half needs a database and that half must not.
 */
@Injectable()
export class SchoolModulesService {
  private readonly cache = new Map<string, CachedEntry>();

  constructor(private readonly controlPrisma: ControlPrismaService) {}

  async modulesFor(schoolId: string): Promise<ModuleKey[]> {
    const cached = this.cache.get(schoolId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.modules;

    const school = await this.controlPrisma.school.findUnique({
      where: { id: schoolId },
      select: {
        moduleOverrides: true,
        subscription: { select: { plan: { select: { modules: true } } } },
      },
    });

    // A school that does not exist gets the default set rather than an empty
    // one. It cannot reach anything anyway — the tenant client is what
    // refuses it, with a message about the school rather than about modules,
    // which is the more useful of the two.
    const modules = resolveModules({
      planModules: school?.subscription?.plan.modules ?? null,
      overrides: school?.moduleOverrides,
    });

    this.cache.set(schoolId, { modules, cachedAt: Date.now() });
    return modules;
  }

  /** Called by the write that changed entitlements, so the change is immediate. */
  invalidate(schoolId: string): void {
    this.cache.delete(schoolId);
  }

  /**
   * Every school's entitlements are stale after a *plan* changes, because a
   * plan is shared. Cheaper and more obviously correct than working out which
   * schools subscribe to it.
   */
  invalidateAll(): void {
    this.cache.clear();
  }
}
