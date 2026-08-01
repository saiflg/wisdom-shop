/**
 * Builds a school's own Postgres connection string from the shared tenant
 * DB host/credentials plus that school's database name.
 *
 * `connection_limit`/`pool_timeout` are set explicitly rather than left to
 * Prisma's default (`num_cpus*2+1`): with N schools resident in
 * TenancyService's client cache, total connections approach
 * `N × pool size` fast, and the shared Postgres server's `max_connections`
 * (default 100) is a hard ceiling shared with the shop's own database too.
 * A small bound per tenant is "good enough for foundation, revisit with a
 * bounded LRU before onboarding tens of schools" (see tenancy.service.ts).
 */
export function buildTenantConnectionString(params: {
  host: string;
  port: number;
  user: string;
  password: string;
  databaseName: string;
}): string {
  const { host, port, user, password, databaseName } = params;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${databaseName}?schema=public&connection_limit=3&pool_timeout=10`;
}

/**
 * Turns a school's chosen slug into a valid, safe Postgres database
 * identifier. Called once at onboarding time and the result stored on the
 * School row — never recomputed from a possibly-since-changed slug.
 */
export function buildDatabaseNameFromSlug(slug: string): string {
  return `wisdom_ems_school_${slug.replace(/-/g, "_")}`;
}
