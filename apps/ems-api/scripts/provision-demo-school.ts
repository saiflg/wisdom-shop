/**
 * Creates the one demo school this phase needs to exercise the
 * school-admin UI, via the running API's own HTTP endpoints — the
 * deliberate stand-in for a platform-admin onboarding UI, which is out of
 * scope for this phase (see PROGRESS.md).
 *
 * Prerequisites: ems-api running, and a platform admin already seeded
 * (`pnpm prisma:seed:control`, reading SEED_PLATFORM_ADMIN_EMAIL/PASSWORD).
 *
 * Usage: pnpm ts-node --transpile-only scripts/provision-demo-school.ts
 */

const API_URL = process.env.EMS_API_URL ?? "http://localhost:4001";
const PLATFORM_ADMIN_EMAIL = process.env.SEED_PLATFORM_ADMIN_EMAIL ?? "platform-admin@wisdomcampus.example";
const PLATFORM_ADMIN_PASSWORD = process.env.SEED_PLATFORM_ADMIN_PASSWORD ?? "ChangeMe123!SuperSecret";

async function main() {
  const loginRes = await fetch(`${API_URL}/v1/platform/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: PLATFORM_ADMIN_EMAIL, password: PLATFORM_ADMIN_PASSWORD }),
  });
  if (!loginRes.ok) {
    throw new Error(`Platform admin login failed: ${loginRes.status} ${await loginRes.text()}`);
  }
  const { accessToken } = (await loginRes.json()) as { accessToken: string };

  const schoolRes = await fetch(`${API_URL}/v1/platform/schools`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      name: "Demo Academy",
      slug: "demo-academy",
      adminEmail: "admin@demo-academy.example",
      adminPassword: "ChangeMe123!SuperSecret",
      adminFirstName: "Demo",
      adminLastName: "Admin",
    }),
  });

  const body = await schoolRes.json();
  if (!schoolRes.ok) {
    throw new Error(`School provisioning failed: ${schoolRes.status} ${JSON.stringify(body)}`);
  }

  console.log("Demo school provisioned:", JSON.stringify(body, null, 2));
  console.log("\nLog in at apps/ems's /login with:");
  console.log("  schoolSlug: demo-academy");
  console.log("  email: admin@demo-academy.example");
  console.log("  password: ChangeMe123!SuperSecret");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
