import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { Client as PgClient } from "pg";
import { ControlPrismaService } from "@/control-db/control-prisma.service";
import { PrismaClient as TenantPrismaClient } from "ems-tenant-client";
import type { School } from "ems-control-client";
import type { EnvConfig } from "@/config/env.validation";
import { buildDatabaseNameFromSlug, buildTenantConnectionString } from "@/tenancy/connection-string";
import { isValidSchoolSlug } from "@/schools/dto/create-school.dto";
import { MigrationRunner } from "./migration-runner";

const POSTGRES_DATABASE_ALREADY_EXISTS = "42P04";

export interface ProvisionSchoolInput {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
  /** Set when this school comes from the shop's "Complete Your School Setup" handoff — see onboarding/. */
  licenseKey?: string;
}

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly controlPrisma: ControlPrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly migrationRunner: MigrationRunner,
  ) {}

  async provisionSchool(input: ProvisionSchoolInput): Promise<School> {
    if (!isValidSchoolSlug(input.slug)) {
      throw new BadRequestException("That slug is reserved or invalid");
    }

    const databaseName = buildDatabaseNameFromSlug(input.slug);

    const existing = await this.controlPrisma.school.findFirst({
      where: { OR: [{ slug: input.slug }, { databaseName }] },
    });
    if (existing) {
      throw new ConflictException("A school with that slug already exists");
    }

    const school = await this.controlPrisma.school.create({
      data: {
        name: input.name,
        slug: input.slug,
        databaseName,
        status: "PROVISIONING",
        licenseKey: input.licenseKey,
      },
    });

    return this.runProvisioning(school, input);
  }

  async retryProvisioning(schoolId: string, input: ProvisionSchoolInput): Promise<School> {
    const school = await this.controlPrisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    return this.runProvisioning(school, input);
  }

  /**
   * Steps 3-5 of the onboarding flow. Both CREATE DATABASE (via the
   * already-exists catch below) and `migrate deploy` (which tracks what it
   * has already applied) are naturally idempotent, so this whole sequence
   * is safe to re-run on retry — no bespoke rollback logic needed.
   */
  private async runProvisioning(school: School, input: ProvisionSchoolInput): Promise<School> {
    await this.createDatabase(school);
    const connectionString = buildTenantConnectionString({
      host: this.config.get("TENANT_DB_HOST", { infer: true }),
      port: this.config.get("TENANT_DB_PORT", { infer: true }),
      user: this.config.get("TENANT_DB_USER", { infer: true }),
      password: this.config.get("TENANT_DB_PASSWORD", { infer: true }),
      databaseName: school.databaseName,
    });

    const migrationResult = await this.migrationRunner.deployTenantMigrations(connectionString);
    await this.recordAttempt(school.id, "migrate_deploy", migrationResult.success, migrationResult.output);
    if (!migrationResult.success) {
      await this.markFailed(school.id);
      return this.controlPrisma.school.findUniqueOrThrow({ where: { id: school.id } });
    }

    await this.seedSchoolAdmin(connectionString, input);
    await this.recordAttempt(school.id, "seed_admin", true);

    return this.controlPrisma.school.update({
      where: { id: school.id },
      data: { status: "ACTIVE" },
    });
  }

  /**
   * DDL like CREATE DATABASE runs outside a transaction and outside what a
   * Prisma `datasource` block models — a plain `pg` client with separate
   * admin credentials (CREATEDB privilege) is the only way to do this.
   */
  private async createDatabase(school: School): Promise<void> {
    const admin = new PgClient({ connectionString: this.config.get("POSTGRES_ADMIN_URL", { infer: true }) });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${school.databaseName}"`);
      await this.recordAttempt(school.id, "create_database", true);
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code === POSTGRES_DATABASE_ALREADY_EXISTS) {
        // Benign — a previous attempt got this far. Retries must be safe.
        await this.recordAttempt(school.id, "create_database", true, "already existed");
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      await this.recordAttempt(school.id, "create_database", false, message);
      await this.markFailed(school.id);
      throw error;
    } finally {
      await admin.end();
    }
  }

  private async seedSchoolAdmin(connectionString: string, input: ProvisionSchoolInput): Promise<void> {
    const tenantClient = new TenantPrismaClient({ datasources: { db: { url: connectionString } } });
    try {
      const passwordHash = await argon2.hash(input.adminPassword);
      await tenantClient.user.upsert({
        where: { email: input.adminEmail },
        update: {},
        create: {
          email: input.adminEmail,
          passwordHash,
          firstName: input.adminFirstName,
          lastName: input.adminLastName,
          roles: ["SCHOOL_ADMIN"],
        },
      });
    } finally {
      await tenantClient.$disconnect();
    }
  }

  private async markFailed(schoolId: string): Promise<void> {
    await this.controlPrisma.school.update({ where: { id: schoolId }, data: { status: "FAILED" } });
  }

  private async recordAttempt(
    schoolId: string,
    step: string,
    success: boolean,
    errorMessage?: string,
  ): Promise<void> {
    await this.controlPrisma.provisioningAttempt.create({
      data: { schoolId, step, success, errorMessage },
    });
    if (!success) {
      this.logger.error(`Provisioning step "${step}" failed for school ${schoolId}: ${errorMessage}`);
    }
  }
}
