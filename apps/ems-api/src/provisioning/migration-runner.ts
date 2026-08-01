import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { Injectable } from "@nestjs/common";

const execFile = promisify(execFileCallback);

export interface MigrationResult {
  success: boolean;
  output: string;
}

/**
 * Thin, mockable wrapper around `prisma migrate deploy`.
 *
 * Prisma has no stable, public, programmatic migration API — `@prisma/migrate`
 * internals are unsupported — so shelling out to the CLI is the only
 * supported way to run migrations from code. This is exactly what the
 * shop's own `prisma:deploy` script does, not a departure from convention.
 *
 * `execFile`, never `exec`: the connection string is passed via env, not
 * shell-interpolated, so it can never be shell-injected regardless of what
 * characters end up in it.
 */
@Injectable()
export class MigrationRunner {
  async deployTenantMigrations(databaseUrl: string): Promise<MigrationResult> {
    try {
      const { stdout, stderr } = await execFile(
        "npx",
        ["prisma", "migrate", "deploy", "--schema=prisma/tenant/schema.prisma"],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: databaseUrl },
          timeout: 60_000,
        },
      );
      return { success: true, output: `${stdout}\n${stderr}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: message };
    }
  }
}
