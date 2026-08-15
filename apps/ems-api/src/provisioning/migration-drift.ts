/**
 * Which schools are running behind the code, and by how much.
 *
 * `prisma migrate deploy` runs once, when a school is provisioned. Nothing
 * re-runs it afterwards — so every migration added after a school was created
 * is a table that school does not have, and the only symptom is a 500 on a
 * screen that works for everybody onboarded later. The gap widens silently
 * with every release.
 *
 * Pure, so the arithmetic can be argued with in a test rather than discovered
 * on a customer's database.
 */

export interface SchoolMigrationState {
  schoolId: string;
  name: string;
  slug: string;
  status: string;
  /** Migration names present in that school's `_prisma_migrations`. */
  applied: string[];
  /** Set when the school's database could not be read at all. */
  unreachable?: string | null;
}

export type DriftLevel = "UP_TO_DATE" | "BEHIND" | "UNREACHABLE" | "AHEAD";

export interface SchoolDrift {
  schoolId: string;
  name: string;
  slug: string;
  status: string;
  level: DriftLevel;
  /** On disk but not applied there, in the order they must be applied. */
  pending: string[];
  /** Applied there but absent from this build — a downgrade, not a gap. */
  unknown: string[];
  summary: string;
  unreachable: string | null;
}

/**
 * Migration names are timestamp-prefixed, so lexical order is chronological.
 * Sorted rather than trusted: a directory listing's order is the filesystem's
 * business, and applying migrations out of order is how a foreign key lands
 * before the table it points at.
 */
export function sortMigrations(names: readonly string[]): string[] {
  return [...names].sort();
}

/**
 * What a school still needs.
 *
 * Set difference rather than "everything after the last one it has": a
 * database that skipped one migration in the middle — which happens when
 * somebody applies a fix by hand — must be told about that one, not just
 * about the tail.
 */
export function pendingFor(applied: readonly string[], onDisk: readonly string[]): string[] {
  const have = new Set(applied);
  return sortMigrations(onDisk).filter((name) => !have.has(name));
}

/**
 * Migrations a school has that this build does not.
 *
 * Means the code is older than the database — a rollback, or a deploy from
 * the wrong branch. Running `migrate deploy` will not fix it and the honest
 * thing is to say so rather than report the school as up to date.
 */
export function unknownIn(applied: readonly string[], onDisk: readonly string[]): string[] {
  const known = new Set(onDisk);
  return sortMigrations(applied).filter((name) => !known.has(name));
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function driftFor(state: SchoolMigrationState, onDisk: readonly string[]): SchoolDrift {
  const base = {
    schoolId: state.schoolId,
    name: state.name,
    slug: state.slug,
    status: state.status,
    unreachable: state.unreachable ?? null,
  };

  // Named first: a database nobody can open is a different problem from one
  // that is merely out of date, and reporting it as "up to date" because it
  // returned no rows would be a lie.
  if (state.unreachable) {
    return {
      ...base,
      level: "UNREACHABLE",
      pending: [],
      unknown: [],
      summary: `Could not be read: ${state.unreachable}`,
    };
  }

  const pending = pendingFor(state.applied, onDisk);
  const unknown = unknownIn(state.applied, onDisk);

  if (unknown.length > 0) {
    return {
      ...base,
      level: "AHEAD",
      pending,
      unknown,
      summary: `Ahead of this build by ${plural(unknown.length, "migration", "migrations")}. Deploying will not fix this.`,
    };
  }

  if (pending.length === 0) {
    return { ...base, level: "UP_TO_DATE", pending: [], unknown: [], summary: "Up to date" };
  }

  return {
    ...base,
    level: "BEHIND",
    pending,
    unknown: [],
    summary: `Behind by ${plural(pending.length, "migration", "migrations")}`,
  };
}

/**
 * Whether it is worth running anything at all.
 *
 * A suspended school still gets migrated: suspension is a billing state, and
 * a school that comes back to a database three releases old is worse than one
 * that was quietly kept current. Only unreachable and ahead are skipped,
 * because for those `migrate deploy` cannot help.
 */
export function shouldApply(drift: SchoolDrift): boolean {
  return drift.level === "BEHIND";
}

export interface FleetSummary {
  total: number;
  upToDate: number;
  behind: number;
  unreachable: number;
  ahead: number;
  /** The worst case across the fleet, for a one-line answer. */
  headline: string;
}

export function summarise(drifts: readonly SchoolDrift[]): FleetSummary {
  const count = (level: DriftLevel) => drifts.filter((d) => d.level === level).length;

  const behind = count("BEHIND");
  const unreachable = count("UNREACHABLE");
  const ahead = count("AHEAD");

  // Ordered by what somebody should do about it, not by severity in the
  // abstract: a database nobody can open needs a person before a database
  // that is merely a release behind.
  let headline: string;
  if (drifts.length === 0) headline = "No schools yet";
  else if (unreachable > 0) headline = `${plural(unreachable, "school", "schools")} could not be read`;
  else if (ahead > 0) headline = `${plural(ahead, "school", "schools")} ahead of this build`;
  else if (behind > 0) headline = `${plural(behind, "school needs", "schools need")} migrating`;
  else headline = "Every school is up to date";

  return {
    total: drifts.length,
    upToDate: count("UP_TO_DATE"),
    behind,
    unreachable,
    ahead,
    headline,
  };
}
