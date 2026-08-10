// Creates the first platform operator, so a freshly deployed control database
// has somebody who can sign in and onboard the first school.
//
// Plain JavaScript, not TypeScript, on purpose. The production image installs
// with `--prod`, which leaves ts-node behind — and this script matters most
// on exactly that image, where it is the only way to get a first login. The
// generated clients are plain JS in node_modules regardless, so there is
// nothing here that TypeScript was buying.
//
// Idempotent by upsert: `deploy.sh` runs it on every deploy, and re-running it
// must never disturb an operator who has since changed their password.

const argon2 = require("argon2");
const { PrismaClient } = require("ems-control-client");

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_PLATFORM_ADMIN_EMAIL;
  const password = process.env.SEED_PLATFORM_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      "SEED_PLATFORM_ADMIN_EMAIL / SEED_PLATFORM_ADMIN_PASSWORD not set — skipping platform admin creation.",
    );
    return;
  }

  console.log(`Seeding platform admin (${email})...`);
  const passwordHash = await argon2.hash(password);

  await prisma.platformUser.upsert({
    where: { email },
    // Empty on purpose. `update: { passwordHash }` would mean leaving the
    // seed password in the deploy environment silently resets the operator's
    // password on every deploy, undoing a rotation without anybody noticing.
    update: {},
    create: {
      email,
      passwordHash,
      firstName: "Platform",
      lastName: "Admin",
      roles: ["PLATFORM_ADMIN"],
    },
  });

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
