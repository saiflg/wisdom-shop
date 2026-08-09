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
/**
 * How long the CLI gets.
 *
 * Was 60 seconds, which was ample when a new school meant eight migrations.
 * It is now twenty-odd, each opening its own connection, on a server that is
 * also serving every other school — and `execFile` does not fail politely
 * when it expires: it kills the process and throws an error whose entire
 * message is "Command failed: …prisma migrate deploy". No stderr, because
 * Prisma never got to complain. A school onboarding at a busy moment was
 * marked FAILED with a note that explained nothing.
 *
 * Five minutes is far more than a healthy run needs (ten to twenty seconds).
 * It is a guard against a genuinely stuck process, not a performance budget,
 * and the cost of it being too generous is a slow failure rather than a
 * mysterious one.
 */
export const MIGRATE_TIMEOUT_MS = 300_000;

/** `execFile` attaches these to its error; `.message` alone throws them away. */
interface ExecFileError extends Error {
  stdout?: string;
  stderr?: string;
  killed?: boolean;
  signal?: string;
  code?: number | string;
}

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
          timeout: MIGRATE_TIMEOUT_MS,
        },
      );
      return { success: true, output: `${stdout}\n${stderr}` };
    } catch (error) {
      return { success: false, output: describeFailure(error) };
    }
  }
}

/**
 * What actually went wrong, rather than that something did.
 *
 * The recorded message is the only trace left once the process is gone — the
 * e2e fixtures purge their attempts on teardown, and in production nobody is
 * watching the log at the moment a school is created. "Command failed" sent
 * this investigation down a resource-exhaustion path for the better part of
 * an hour when the answer was a timeout the code itself had set.
 */
export function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const failure = error as ExecFileError;
  const parts: string[] = [];

  // Named first, because it changes what to do about it: a timeout means
  // raise the limit or find out what is slow, not read Prisma's output —
  // there isn't any.
  if (failure.killed || failure.signal === "SIGTERM") {
    parts.push(`Timed out after ${MIGRATE_TIMEOUT_MS / 1000}s and was killed.`);
  }

  parts.push(failure.message);

  const stderr = failure.stderr?.trim();
  const stdout = failure.stdout?.trim();
  if (stderr) parts.push(`stderr: ${stderr}`);
  // Prisma writes its migration errors to stdout as often as to stderr.
  if (stdout) parts.push(`stdout: ${stdout}`);

  return parts.join("\n");
}
