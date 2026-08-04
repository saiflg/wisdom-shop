import { execFile as execFileCallback } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { Injectable } from "@nestjs/common";

const execFile = promisify(execFileCallback);

/**
 * The locally installed Prisma CLI, invoked directly rather than via `npx`.
 *
 * A modest win, not a dramatic one: measured idle, `npx prisma --version`
 * takes ~3s against ~2s for the binary. `npx` re-resolves the command on
 * every call and can reach for the registry when it isn't confident about a
 * local hit, so on a path that runs once per school provisioned this is
 * strictly better and removes a network dependency from provisioning. It is
 * not, on its own, why e2e provisioning is slow — that is this machine's
 * Docker VM under load.
 */
const PRISMA_BIN = join(process.cwd(), "node_modules", ".bin", "prisma");

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
 * characters end up in it. Passing an absolute binary path rather than a
 * command name also removes any dependence on `PATH` lookup.
 */
@Injectable()
export class MigrationRunner {
  async deployTenantMigrations(databaseUrl: string): Promise<MigrationResult> {
    try {
      const { stdout, stderr } = await execFile(
        PRISMA_BIN,
        ["migrate", "deploy", "--schema=prisma/tenant/schema.prisma"],
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
