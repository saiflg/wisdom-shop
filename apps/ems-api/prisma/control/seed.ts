import * as argon2 from "argon2";
import { PrismaClient } from "ems-control-client";

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
