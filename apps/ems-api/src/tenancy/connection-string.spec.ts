import { buildDatabaseNameFromSlug, buildTenantConnectionString } from "./connection-string";

describe("buildTenantConnectionString", () => {
  it("builds a postgres URL scoped to the given database with a bounded pool", () => {
    const url = buildTenantConnectionString({
      host: "postgres",
      port: 5432,
      user: "wisdom",
      password: "wisdom",
      databaseName: "wisdom_ems_school_demo",
    });

    expect(url).toBe(
      "postgresql://wisdom:wisdom@postgres:5432/wisdom_ems_school_demo?schema=public&connection_limit=3&pool_timeout=10",
    );
  });

  it("percent-encodes credentials so special characters can't break the URL", () => {
    const url = buildTenantConnectionString({
      host: "postgres",
      port: 5432,
      user: "us:er",
      password: "p@ss/word",
      databaseName: "db",
    });

    expect(url).toContain("us%3Aer:p%40ss%2Fword@");
  });
});

describe("buildDatabaseNameFromSlug", () => {
  it("prefixes and converts hyphens to underscores for a valid Postgres identifier", () => {
    expect(buildDatabaseNameFromSlug("demo-academy")).toBe("wisdom_ems_school_demo_academy");
  });

  it("is stable for a slug with no hyphens", () => {
    expect(buildDatabaseNameFromSlug("demoacademy")).toBe("wisdom_ems_school_demoacademy");
  });
});
