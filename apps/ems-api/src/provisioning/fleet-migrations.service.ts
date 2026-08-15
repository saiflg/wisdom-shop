import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { ControlPrismaService } from "@/control-db/control-prisma.service";
import type { EnvConfig } from "@/config/env.validation";
import { buildTenantConnectionString } from "@/tenancy/connection-string";
import { MigrationRunner } from "./migration-runner";
import {
  driftFor,
  shouldApply,
  summarise,
  type SchoolDrift,
  type SchoolMigrationState,
} from "./migration-drift";

/**
 * Keeping every existing school's database level with the code.
 *
 * `prisma migrate deploy` runs once, at provisioning. Nothing re-runs it, so
 * a migration added today reaches only schools created after today — and the
 * first symptom is a 500 on a screen that works for newer customers. With one
 * school that is a manual job somebody remembers; with fifty it is an
 * outage nobody sees coming.
 *
 * Read-only by default. Reporting what is behind is safe to call whenever;
 * applying is a separate, deliberate action.
 */
@Injectable()
export class FleetMigrationsService {
  private readonly logger = new Logger(FleetMigrationsService.name);

  constructor(
    private readonly controlPrisma: ControlPrismaService,
    private readonly migrationRunner: MigrationRunner,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /** The migrations this build ships, from the folder Prisma itself reads. */
  private async migrationsOnDisk(): Promise<string[]> {
    const entries = await readdir(join(process.cwd(), "prisma", "tenant", "migrations"), {
      withFileTypes: true,
    });
    // Directories only: `migration_lock.toml` sits alongside them.
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  }

  private connectionFor(databaseName: string): string {
    return buildTenantConnectionString({
      host: this.config.get("TENANT_DB_HOST", { infer: true }),
      port: this.config.get("TENANT_DB_PORT", { infer: true }),
      user: this.config.get("TENANT_DB_USER", { infer: true }),
      password: this.config.get("TENANT_DB_PASSWORD", { infer: true }),
      databaseName,
    });
  }

  /**
   * What each school has applied.
   *
   * Read with a plain client rather than a Prisma tenant client: a school
   * whose database is *behind* may be missing tables the generated client
   * expects, and asking Prisma to connect to it can fail for reasons that
   * have nothing to do with the question being asked.
   */
  private async appliedIn(databaseName: string): Promise<{ applied: string[]; unreachable: string | null }> {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: this.connectionFor(databaseName) });

    try {
      await client.connect();
      const result = await client.query<{ migration_name: string }>(
        // Only finished ones. A migration that failed half way is not applied,
        // and reporting it as such would hide the thing that needs fixing.
        `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`,
      );
      return { applied: result.rows.map((row) => row.migration_name), unreachable: null };
    } catch (error) {
      return { applied: [], unreachable: (error as Error).message };
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  /** Every school, and how far behind each one is. Reads nothing else. */
  async status() {
    const [onDisk, schools] = await Promise.all([
      this.migrationsOnDisk(),
      this.controlPrisma.school.findMany({ orderBy: { name: "asc" } }),
    ]);

    const drifts: SchoolDrift[] = [];
    for (const school of schools) {
      const { applied, unreachable } = await this.appliedIn(school.databaseName);
      const state: SchoolMigrationState = {
        schoolId: school.id,
        name: school.name,
        slug: school.slug,
        status: school.status,
        applied,
        unreachable,
      };
      drifts.push(driftFor(state, onDisk));
    }

    return { migrationsInThisBuild: onDisk.length, summary: summarise(drifts), schools: drifts };
  }

  /**
   * Bring schools up to date.
   *
   * One at a time and never in parallel: each `migrate deploy` is a Prisma
   * CLI process holding its own connection, and thirty at once is a
   * connection-limit incident during the exact operation nobody wants to
   * debug. Slow and boring is the correct shape here.
   *
   * A failure on one school does not stop the rest — the alternative leaves
   * the fleet half-migrated with no report of where it got to.
   */
  async apply(options: { schoolId?: string } = {}) {
    const { schools } = await this.status();
    const targets = schools.filter(
      (drift) => shouldApply(drift) && (!options.schoolId || drift.schoolId === options.schoolId),
    );

    const results: { schoolId: string; slug: string; applied: number; success: boolean; output?: string }[] = [];

    for (const drift of targets) {
      const school = await this.controlPrisma.school.findUnique({ where: { id: drift.schoolId } });
      if (!school) continue;

      this.logger.log(`Migrating ${school.slug}: ${drift.pending.length} pending`);
      const result = await this.migrationRunner.deployTenantMigrations(
        this.connectionFor(school.databaseName),
      );

      // Recorded against the school like any other provisioning step, so the
      // history of a database is in one place rather than split between
      // onboarding and whatever this is.
      await this.controlPrisma.provisioningAttempt.create({
        data: {
          schoolId: school.id,
          step: "migrate_deploy",
          success: result.success,
          errorMessage: result.output.slice(0, 4000),
        },
      });

      if (!result.success) {
        this.logger.error(`Migrating ${school.slug} failed: ${result.output.slice(0, 300)}`);
      }

      results.push({
        schoolId: school.id,
        slug: school.slug,
        applied: result.success ? drift.pending.length : 0,
        success: result.success,
        ...(result.success ? {} : { output: result.output.slice(0, 1000) }),
      });
    }

    return {
      attempted: results.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      // The state afterwards, so a caller does not have to ask again to find
      // out whether it worked.
      status: await this.status(),
      results,
    };
  }
}
