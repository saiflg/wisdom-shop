/**
 * Resets a platform admin's password in the control database.
 *
 * The control seed deliberately uses `update: {}` so re-running it never
 * disturbs an existing account — which is right for a seed, and useless when
 * somebody has simply lost the development password. Hence this: a separate,
 * obviously-named script that does the one thing the seed refuses to.
 *
 * The new password is read from the environment rather than taken as an
 * argument, so it does not end up in shell history:
 *
 *   docker compose exec -T \
 *     -e RESET_EMAIL=platform-admin@wisdomcampus.example \
 *     -e RESET_PASSWORD='...' \
 *     ems-api pnpm ts-node --transpile-only scripts/reset-platform-admin-password.ts
 *
 * Development only. There is no production story here — a real deployment
 * wants an email round-trip, not a script somebody can run against the
 * database.
 */

import * as argon2 from "argon2";
import { PrismaClient } from "ems-control-client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.RESET_EMAIL;
  const password = process.env.RESET_PASSWORD;

  if (!email || !password) {
    throw new Error("RESET_EMAIL and RESET_PASSWORD must both be set");
  }
  // Long enough that a reset can't quietly weaken an account below what the
  // login form itself would accept.
  if (password.length < 12) {
    throw new Error("Choose a password of at least 12 characters");
  }

  const existing = await prisma.platformUser.findUnique({ where: { email } });
  if (!existing) {
    throw new Error(`No platform user with the email ${email}`);
  }

  await prisma.platformUser.update({
    where: { email },
    data: { passwordHash: await argon2.hash(password) },
  });

  // Never echoes the password itself — the person who set it already knows it.
  console.log(`Password reset for ${email}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
